import { BM25Index } from './BM25.js';
import { documentValidity, toLocalIsoDate } from './packFormat.js';
import { STOPWORDS, analyze, analyzeQuery, rawTokens, stem } from './tokenizer.js';

/**
 * Local retrieval over a knowledge pack (README 14.5 and 14.6).
 *
 * How a question becomes sources:
 *   1. Analyse the question (stopwords, stemming, alias expansion, spelling correction).
 *   2. BM25-rank the passages of documents that are valid today (verified, in effect, not expired or superseded).
 *   3. Measure CONFIDENCE for the best passage:
 *        coverage     the share of the question's content words (weighted by rarity) that the passage contains;
 *        specificity  how rare the rarest matched word is (generic campus words and bare numbers do not count).
 *                     Matching only "student" or "office" proves nothing.
 *      Both must be high for the retrieval to count as "strong". Strong retrieval is what lets the assistant
 *      answer as the university; otherwise it must say it could not verify the answer.
 *
 * The thresholds are PROVISIONAL. They were chosen on the synthetic sample corpus (tools/eval-retrieval.mjs) and must
 * be re-tuned on real ISU documents and real student questions before the assistant is trusted (README 8.10, 20.2).
 *
 * A document the pack contains but we may not use (expired, superseded, unverified...) is never a source. If such a
 * document answers the question clearly better than anything current, the assistant says so instead of answering
 * from a weaker passage that merely shares a few words.
 */
export const RETRIEVAL_DEFAULTS = Object.freeze({
  limit: 4, // most sources handed to the model
  candidates: 12, // BM25 candidates examined
  minCoverage: 0.6,
  // The best matched word must not be ubiquitous. 0.15 of the maximum idf is a word found in about 45% of all passages
  // (a word in half the corpus, such as "student", says nothing about topic). Chosen by that reasoning, not fitted:
  // the dev questions cannot constrain it from below because none of their wrong answers is stopped by it.
  minSpecificity: 0.15,
  staleMargin: 0.1, // an unusable document must cover this much MORE of the question to override a current passage
  cueWeight: 0.4, // weight of the words an "amount" question expects in its answer (they never count as coverage)
  relatedScoreRatio: 0.4, // extra sources must score at least this fraction of the best one...
  relatedCoverage: 0.4, // ...and cover at least this share of the question
  weakCoverage: 0.25, // below this a passage is not even reported as "the closest document"
  aliasWeight: 0.6,
  typoWeight: 0.8,
  sectionBoost: 2, // section headings are repeated this many times in the index
  k1: 1.2,
  b: 0.75,
});

const GENERIC_OFFICE_TERMS = new Set(analyze('office university center centre campus unit'));

// Words that name the campus's own setting instead of a topic: "office" is in the name of every office and "student" is
// in most sentences. Matching only these proves nothing about what the question is for, whatever their frequency.
// (The campus's own names, from the lexicon, are added per pack.)
const GENERIC_TOPIC_TERMS = new Set(analyze('office offices university campus school college student students center centre'));

// "How much is X?" tells us what the answer looks like: an amount. Several passages may mention X, but only one has
// the fee. The words such an answer contains rank it higher; they are not part of the question, so they never count
// as coverage and can never make a question look answerable.
const AMOUNT_QUESTION = /\b(?:how\s+much|magkano)\b/i;
const AMOUNT_TERMS = analyze('fee pesos php cost price');

const FOLLOW_UP_CONNECTOR = /^\s*(?:and|also|then|so|but|what\s+about|how\s+about|what\s+if|paano\s+naman|e\s+yung)\b/i;
const ANAPHORA = new Set(['it', 'its', 'that', 'this', 'those', 'these', 'they', 'them', 'there', 'one', 'ones']);

/** "And the fees?", "What about transferees?", "How long does it take?": a short question that leans on the previous one. */
export function isFollowUp(question) {
  const text = String(question ?? '');
  return FOLLOW_UP_CONNECTOR.test(text) || rawTokens(text).some((w) => ANAPHORA.has(w));
}

/** Optimal-string-alignment distance: insert, delete, substitute, or swap two neighbouring letters. */
export function editDistance(a, b) {
  if (a === b) return 0;
  const rows = Array.from({ length: a.length + 1 }, (_, i) => {
    const row = new Array(b.length + 1).fill(0);
    row[0] = i;
    return row;
  });
  for (let j = 0; j <= b.length; j++) rows[0][j] = j;
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      let value = Math.min(rows[i - 1][j] + 1, rows[i][j - 1] + 1, rows[i - 1][j - 1] + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) value = Math.min(value, rows[i - 2][j - 2] + 1);
      rows[i][j] = value;
    }
  }
  return rows[a.length][b.length];
}

export class Retriever {
  /**
   * @param {{documents: object[], chunks: object[], lexicon?: object}} pack parsed pack contents
   * @param {object} [options] RETRIEVAL_DEFAULTS overrides, plus:
   *   allowUnverified  true for sample and draft packs (the UI labels them)
   *   now              () => Date, for tests
   */
  constructor(pack, options = {}) {
    this.options = { ...RETRIEVAL_DEFAULTS, ...options };
    this.allowUnverified = Boolean(options.allowUnverified);
    this.now = options.now ?? (() => new Date());
    this.documents = pack.documents;
    this.docs = new Map(pack.documents.map((d) => [d.id, d]));
    this.lexicon = { aliases: [], campusNames: [], campusTerms: [], starterQuestions: [], ...(pack.lexicon ?? {}) };
    this.genericTerms = new Set([...GENERIC_TOPIC_TERMS, ...this.lexicon.campusNames.flatMap((name) => analyze(name))]);

    this.entries = [];
    for (const chunk of pack.chunks) {
      const doc = this.docs.get(chunk.documentId);
      if (!doc) continue;
      const sectionTerms = analyze(chunk.section ?? '');
      const terms = [
        ...Array.from({ length: this.options.sectionBoost }, () => sectionTerms).flat(),
        ...analyze(doc.title),
        ...(Array.isArray(doc.tags) ? doc.tags.flatMap((tag) => analyze(tag)) : []),
        ...analyze(chunk.text),
      ];
      this.entries.push({ chunk, doc, terms, set: new Set(terms) });
    }
    this.index = new BM25Index(
      this.entries.map((e) => ({ id: e.chunk.id, terms: e.terms })),
      { k1: this.options.k1, b: this.options.b }
    );

    // Words as written in the documents, mapped to their stems. Spelling is corrected against these real words,
    // not against stems (a typo of "scholarship" is one edit from "scholarship" but three from its stem "scholar").
    this.rawVocabulary = new Map();
    for (const { chunk, doc } of this.entries) {
      for (const text of [chunk.section, doc.title, chunk.text]) {
        for (const word of rawTokens(text ?? '')) {
          if (word.length >= 4 && !/\d/.test(word) && !STOPWORDS.has(word) && !this.rawVocabulary.has(word)) {
            this.rawVocabulary.set(word, stem(word));
          }
        }
      }
    }
    this._validity = { date: null, byDoc: new Map() };

    // Words from office names ("registrar", "scholarship") also signal a campus question (see routing.js).
    this.officeTerms = new Set(pack.documents.flatMap((d) => analyze(d.office ?? '')));
  }

  /** Validity of every document on the given calendar date (YYYY-MM-DD), cached per date. */
  validity(today = toLocalIsoDate(this.now())) {
    if (this._validity.date !== today) {
      const byDoc = new Map();
      for (const doc of this.documents) byDoc.set(doc.id, documentValidity(doc, today, { allowUnverified: this.allowUnverified }));
      this._validity = { date: today, byDoc };
    }
    return this._validity.byDoc;
  }

  /** Documents that cannot be used as sources today, with the reason (for pack status screens). */
  unusableDocuments(today) {
    const validity = this.validity(today);
    return this.documents.filter((d) => validity.get(d.id) !== 'current').map((d) => ({ document: d, validity: validity.get(d.id) }));
  }

  /**
   * @param {string} question
   * @param {{previousQuestion?: string|null}} [context] the student's previous question, to resolve short follow-ups
   */
  retrieve(question, { previousQuestion = null } = {}) {
    const today = toLocalIsoDate(this.now());
    const own = this._retrieve(question, today);
    // A short question that leans on the previous one ("how much does it cost?") is searched together with that
    // question. A short question that fails on its own gets the same second chance.
    if (previousQuestion && own.originals.length > 0 && own.originals.length <= 4 && (isFollowUp(question) || !own.strong)) {
      const combined = this._retrieve(`${previousQuestion} ${question}`, today);
      if (combined.strong) return { ...combined, question, rewrittenFrom: previousQuestion };
    }
    return own;
  }

  _retrieve(text, today) {
    const query = analyzeQuery(text, this.lexicon.aliases, { aliasWeight: this.options.aliasWeight });
    const corrections = this._correctSpelling(query);
    if (AMOUNT_QUESTION.test(text)) {
      for (const term of AMOUNT_TERMS) if (!query.terms.has(term)) query.terms.set(term, this.options.cueWeight);
    }
    const result = {
      question: text,
      originals: query.originals,
      corrections,
      hits: [],
      sources: [],
      strong: false,
      coverage: 0,
      specificity: 0,
      excluded: null,
      rewrittenFrom: null,
      today,
    };
    if (query.originals.length === 0) return result;

    const validity = this.validity(today);
    const usable = (i) => validity.get(this.entries[i].doc.id) === 'current';
    const passes = (hit) => hit.coverage >= this.options.minCoverage && hit.specificity >= this.options.minSpecificity;
    result.hits = this.index
      .search(query.terms, { limit: this.options.candidates, filter: usable })
      .map((hit, rank) => this._describe(hit, query, rank));

    // The best passage among documents we are NOT allowed to use, if it is a real match.
    const [candidate] = this.index
      .search(query.terms, { limit: 3, filter: (i) => !usable(i) })
      .map((hit, rank) => this._describe(hit, query, rank));
    const unusable = candidate && passes(candidate) ? candidate : null;

    const top = result.hits[0];
    if (top) {
      result.coverage = top.coverage;
      result.specificity = top.specificity;
    }
    const supported = Boolean(top) && passes(top);
    // An expired or superseded document that covers the question clearly better than the best current passage is the
    // real answer. Answering from the weaker passage would present a loose match as the university's word.
    const outranked = supported && unusable !== null && unusable.coverage > top.coverage + this.options.staleMargin;
    result.strong = supported && !outranked;

    if (result.strong) {
      result.sources = result.hits
        .filter((h, i) => i === 0 || (h.score >= top.score * this.options.relatedScoreRatio && h.coverage >= this.options.relatedCoverage))
        .slice(0, this.options.limit);
    } else if (unusable) {
      result.excluded = {
        ...unusable,
        validity: validity.get(unusable.document.id),
        replacement: unusable.document.supersededBy ? (this.docs.get(unusable.document.supersededBy) ?? null) : null,
      };
    }
    return result;
  }

  /** Add the closest known word for each unknown word of the question (typos such as "scholarhip"). */
  _correctSpelling(query) {
    const corrections = [];
    const seen = new Set();
    for (const word of query.raw) {
      if (STOPWORDS.has(word) || word.length < 5 || /\d/.test(word)) continue;
      const wordStem = stem(word);
      if (seen.has(wordStem)) continue;
      seen.add(wordStem);
      if (this.index.has(wordStem) || query.alternatives.has(wordStem)) continue;

      const maxDistance = word.length <= 8 ? 1 : 2;
      let best = null;
      for (const [candidate, candidateStem] of this.rawVocabulary) {
        if (candidate[0] !== word[0] || Math.abs(candidate.length - word.length) > maxDistance) continue;
        const distance = editDistance(word, candidate);
        if (distance === 0 || distance > maxDistance) continue;
        const freq = this.index.docFreq(candidateStem);
        const better =
          !best ||
          distance < best.distance ||
          (distance === best.distance && (freq > best.freq || (freq === best.freq && candidate < best.candidate)));
        if (better) best = { candidate, stem: candidateStem, distance, freq };
      }
      if (!best) continue;
      if (!query.terms.has(best.stem)) query.terms.set(best.stem, this.options.typoWeight);
      query.alternatives.set(wordStem, [...(query.alternatives.get(wordStem) ?? []), [best.stem]]);
      corrections.push({ from: word, to: best.candidate });
    }
    return corrections;
  }

  /** Rarity of a question word. A word the corpus has never seen is as rare as a word can be. */
  _idf(term, query) {
    if (this.index.has(term)) return this.index.idf(term);
    let best = null;
    for (const alternative of query.alternatives.get(term) ?? []) {
      if (!alternative.every((t) => this.index.has(t))) continue;
      const mean = alternative.reduce((sum, t) => sum + this.index.idf(t), 0) / alternative.length;
      if (best === null || mean > best) best = mean;
    }
    return best ?? this.index.maxIdf;
  }

  _contains(entry, term, query) {
    if (entry.set.has(term)) return true;
    return (query.alternatives.get(term) ?? []).some((alternative) => alternative.every((t) => entry.set.has(t)));
  }

  _describe(hit, query, rank) {
    const entry = this.entries[hit.index];
    let total = 0;
    let covered = 0;
    let rarest = 0;
    const matched = [];
    for (const term of query.originals) {
      const idf = this._idf(term, query);
      total += idf;
      if (this._contains(entry, term, query)) {
        covered += idf;
        matched.push(term);
        // Bare numbers ("15", "2025") show up in dates and amounts everywhere, and generic campus words ("office",
        // "student") are in everything: neither proves that a passage is on topic.
        if (!/^\d+$/.test(term) && !this.genericTerms.has(term)) rarest = Math.max(rarest, idf);
      }
    }
    return {
      chunk: entry.chunk,
      document: entry.doc,
      score: hit.score,
      coverage: total > 0 ? covered / total : 0,
      specificity: this.index.maxIdf > 0 ? rarest / this.index.maxIdf : 0,
      matched,
      rank,
    };
  }

  /**
   * The office directory entry for an office name, if the pack has one (README 15.3: suggest the office and
   * give its official contact "if known and verified"). Returns null rather than guessing.
   */
  officeContact(officeName) {
    const wanted = new Set(analyze(officeName ?? ''));
    if (wanted.size === 0) return null;
    const validity = this.validity();
    let best = null;
    for (const entry of this.entries) {
      if (entry.doc.category !== 'campus_offices' || !entry.chunk.section) continue;
      if (validity.get(entry.doc.id) !== 'current') continue;
      const core = analyze(entry.chunk.section).filter((t) => !GENERIC_OFFICE_TERMS.has(t));
      if (core.length === 0 || !core.every((t) => wanted.has(t))) continue;
      if (!best || core.length > best.size) best = { entry, size: core.length };
    }
    return best ? { office: best.entry.chunk.section, chunk: best.entry.chunk, document: best.entry.doc } : null;
  }
}
