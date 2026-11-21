import { STOPWORDS, analyze, containsSequence, rawTokens } from './tokenizer.js';

/**
 * Decides how a question is answered (README 15.2 to 15.4).
 *
 *   university  strong retrieval: the model answers from the retrieved passages and cites them.
 *   general     a general educational question: the model answers WITHOUT university claims, labelled as general.
 *   refuse      a university question with no verified source: a fixed, honest "could not verify" message.
 *               No model call, so nothing can be invented.
 *   chat        greetings and thanks: a short conversational reply.
 */

export const GENERAL_LABEL = 'General information, not from university documents';

const CONCEPT_LEAD = /^(?:what\s+(?:is|are)|what'?s|define|meaning\s+of|explain|ano\s+ang)\s+(.+)$/i;
const CONCEPT_MEAN = /^what\s+does\s+(.+?)\s+mean$/i;
const SPECIFIC_DETERMINER = /^(?:the|our|my|your|this|that|these|those)\b/i;
const CONTEXT_PREPOSITION = new Set(['for', 'in', 'at', 'of', 'to', 'from', 'on', 'about', 'during', 'within', 'when', 'where', 'how']);
const EXPLICIT_CAMPUS_REFERENCE =
  /\b(?:the\s+(?:university|campus)|this\s+(?:university|campus|school|college)|our\s+(?:university|campus|school|college)|your\s+(?:university|campus|school|college)|you\s+(?:offer|have|provide|allow|accept))\b/i;

const SMALL_TALK = new Set(
  `hi hello hey good morning afternoon evening night kumusta kamusta magandang umaga hapon gabi salamat thanks thank ok okay po opo
bye goodbye sige sir maam there yes yeah yep cool great nice noted got it`.split(/\s+/)
);

/** Greetings, thanks and acknowledgements: answered conversationally, never refused and never labelled "general information". */
export function isSmallTalk(question) {
  const words = rawTokens(question);
  return words.length > 0 && words.every((w) => SMALL_TALK.has(w) || STOPWORDS.has(w)) && words.some((w) => SMALL_TALK.has(w));
}

/**
 * "What is a thesis?" is a request for a general definition. "What is the enrollment deadline?" is not, and neither is
 * "What are requirements for enrollment?". The test is deliberately narrow: no determiner such as "the" or "my",
 * no context words ("for", "in", "at"...) and only a few content words.
 */
export function isConceptQuestion(question) {
  const text = String(question ?? '').trim().replace(/[?!.\s]+$/, '');
  const match = CONCEPT_LEAD.exec(text) ?? CONCEPT_MEAN.exec(text);
  if (!match) return false;
  const rest = match[1].trim();
  if (SPECIFIC_DETERMINER.test(rest)) return false;
  const words = rawTokens(rest);
  if (words.some((w) => CONTEXT_PREPOSITION.has(w))) return false;
  return words.filter((w) => !STOPWORDS.has(w)).length <= 3;
}

/**
 * Does the question look like it is about this university?
 *   explicit  it names the campus ("Sample University", "ISU") or says "the university", "our campus"...
 *   terms     it uses words from the lexicon's campusTerms or from office names ("registrar", "scholarship")
 */
export function campusSignals(question, lexicon = {}, officeTerms = new Set()) {
  const content = analyze(question);
  const find = (phrases) => (phrases ?? []).filter((phrase) => containsSequence(content, analyze(phrase)));
  const names = find(lexicon.campusNames);
  const terms = find(lexicon.campusTerms);
  const offices = content.filter((t) => officeTerms.has(t));
  return {
    explicit: names.length > 0 || EXPLICIT_CAMPUS_REFERENCE.test(String(question ?? '')),
    terms: terms.length > 0 || offices.length > 0,
    matched: [...names, ...terms, ...offices],
  };
}

/**
 * @param {{retrieval: object, question: string, lexicon?: object, officeTerms?: Set<string>, packLoaded?: boolean}} input
 * @returns {{route: 'university'|'general'|'refuse'|'chat', reason: string, signals?: object}}
 */
export function decideRoute({ retrieval, question, lexicon = {}, officeTerms = new Set(), packLoaded = true }) {
  if (isSmallTalk(question)) return { route: 'chat', reason: 'small-talk' };
  if (!packLoaded) return { route: 'general', reason: 'no-pack' };
  if (!retrieval || retrieval.originals.length === 0) return { route: 'chat', reason: 'no-content' };
  if (retrieval.strong) return { route: 'university', reason: 'strong-match' };

  const signals = campusSignals(question, lexicon, officeTerms);
  if (isConceptQuestion(question) && !signals.explicit) return { route: 'general', reason: 'concept-question', signals };
  // The university has a document on this, but it cannot be used (expired, replaced, unverified). That is a university
  // question whatever words it uses, and the refusal names the document instead of staying vague.
  if (retrieval.excluded) return { route: 'refuse', reason: 'only-unusable-document', signals };
  if (signals.explicit || signals.terms) return { route: 'refuse', reason: 'campus-question-without-source', signals };
  return { route: 'general', reason: 'no-campus-signal', signals };
}

/* ---------- refusal message ---------- */

const CONTACT_LINE = /^(location|hours|email|phone|telephone|contact|website|address)\s*:/i;

function describeUnusable(excluded) {
  const { document: doc, validity, replacement } = excluded;
  switch (validity) {
    case 'superseded':
      return `The only document I have on this, "${doc.title}", has been replaced${replacement ? ` by "${replacement.title}"` : ''}, so I cannot rely on it.`;
    case 'expired':
      return `The only document I have on this, "${doc.title}", ${doc.expiresAt ? `expired on ${doc.expiresAt}` : 'has expired'}, so I cannot rely on it for current information.`;
    case 'not-yet-effective':
      return `The only document I have on this, "${doc.title}", does not take effect until ${doc.effectiveAt}.`;
    case 'archived':
      return `The only document I have on this, "${doc.title}", has been archived and is no longer in use.`;
    default:
      return `The only document I have on this, "${doc.title}", has not been verified yet, so I cannot rely on it.`;
  }
}

/**
 * The fixed reply when a university question has no verified source.
 * @param {{retrieval: object, retriever: object, packLoaded?: boolean}} input
 * @returns {{text: string, sources: object[]}} sources are hits to show as cards (closest document, office contact)
 */
export function buildRefusal({ retrieval, retriever, packLoaded = true }) {
  if (!packLoaded) {
    return {
      text: 'No campus knowledge pack is loaded on this device, so I cannot look up university information. Please ask the responsible office directly.',
      sources: [],
    };
  }

  const lines = [];
  const sources = [];
  let office = null;
  let referral;

  if (retrieval?.excluded) {
    lines.push(describeUnusable(retrieval.excluded));
    office = retrieval.excluded.document.office;
    // That office wrote the document that does cover this, so it is the right one to ask.
    referral = `For an official answer, please ask ${office}.`;
  } else {
    lines.push('I could not verify that in the university documents on this device, so I will not guess.');
    const closest = retrieval?.hits?.[0];
    if (closest && closest.coverage >= (retriever?.options.weakCoverage ?? 0.25)) {
      lines.push(`The closest document I have is "${closest.document.title}" (${closest.document.office}), but it does not clearly cover this.`);
      sources.push(closest);
      office = closest.document.office;
      // A loose match is only a hint, not proof that this office is responsible.
      referral = `Please ask the responsible university office for an official answer. ${office} wrote the closest document and may be able to point you to the right office.`;
    }
  }

  const contact = office && retriever ? retriever.officeContact(office) : null;
  lines.push(referral ?? 'Please ask the responsible university office for an official answer.');
  if (contact) {
    const details = contact.chunk.text.split('\n').filter((line) => CONTACT_LINE.test(line));
    if (details.length) lines.push(`From the office directory:\n${details.join('\n')}`);
    sources.push({ chunk: contact.chunk, document: contact.document, score: 0, coverage: 0, specificity: 0, matched: [], rank: sources.length });
  }
  return { text: lines.join('\n\n'), sources };
}
