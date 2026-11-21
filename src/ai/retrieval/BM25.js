/**
 * Okapi BM25 over pre-analyzed documents.
 *
 * - IDF uses the always-positive Lucene form: ln(1 + (N - n + 0.5) / (n + 0.5)).
 * - Query terms carry weights (aliases count less than the user's own words).
 * - A filter can hide documents (expired, unverified) without changing IDF, so scores stay stable.
 * - Ties are broken by id so results are deterministic.
 */
export class BM25Index {
  /**
   * @param {{id: string, terms: string[]}[]} docs analyzed documents (terms may repeat)
   * @param {{k1?: number, b?: number}} options
   */
  constructor(docs, { k1 = 1.2, b = 0.75 } = {}) {
    this.k1 = k1;
    this.b = b;
    this.ids = [];
    this.lengths = [];
    this.postings = new Map(); // term -> flat [docIndex, tf, docIndex, tf, ...]
    let total = 0;

    docs.forEach((doc, index) => {
      this.ids.push(doc.id);
      this.lengths.push(doc.terms.length);
      total += doc.terms.length;
      const tf = new Map();
      for (const term of doc.terms) tf.set(term, (tf.get(term) ?? 0) + 1);
      for (const [term, count] of tf) {
        let list = this.postings.get(term);
        if (!list) {
          list = [];
          this.postings.set(term, list);
        }
        list.push(index, count);
      }
    });

    this.size = docs.length;
    this.avgdl = this.size ? total / this.size : 0;
  }

  /** Number of documents containing the term. */
  docFreq(term) {
    return (this.postings.get(term)?.length ?? 0) / 2;
  }

  has(term) {
    return this.postings.has(term);
  }

  /** Every distinct term in the corpus (used for spelling correction). */
  vocabulary() {
    return this.postings.keys();
  }

  /** IDF of a term. A term found nowhere gets the maximum value for this corpus. */
  idf(term) {
    const n = this.docFreq(term);
    return Math.log(1 + (this.size - n + 0.5) / (n + 0.5));
  }

  /** The largest IDF any term can have in this corpus (a term found in no document). */
  get maxIdf() {
    return Math.log(1 + (this.size + 0.5) / 0.5);
  }

  /** Best possible score a single document could reach for these query terms (used to normalise scores). */
  maxScore(queryTerms) {
    let sum = 0;
    for (const [term, weight] of queryTerms) sum += weight * this.idf(term) * (this.k1 + 1);
    return sum;
  }

  /**
   * @param {Map<string, number>} queryTerms term -> weight
   * @param {{limit?: number, filter?: (docIndex: number) => boolean}} options
   * @returns {{id: string, index: number, score: number, matched: string[]}[]} best first
   */
  search(queryTerms, { limit = 10, filter = null } = {}) {
    if (!this.size || !queryTerms || queryTerms.size === 0) return [];
    const scores = new Map();
    const matched = new Map();

    for (const [term, weight] of queryTerms) {
      const list = this.postings.get(term);
      if (!list) continue;
      const idf = this.idf(term);
      for (let i = 0; i < list.length; i += 2) {
        const index = list[i];
        if (filter && !filter(index)) continue;
        const tf = list[i + 1];
        const lengthNorm = 1 - this.b + (this.b * this.lengths[index]) / this.avgdl;
        const part = (tf * (this.k1 + 1)) / (tf + this.k1 * lengthNorm);
        scores.set(index, (scores.get(index) ?? 0) + weight * idf * part);
        let set = matched.get(index);
        if (!set) {
          set = [];
          matched.set(index, set);
        }
        set.push(term);
      }
    }

    return [...scores]
      .map(([index, score]) => ({ id: this.ids[index], index, score, matched: matched.get(index) }))
      .sort((a, b) => b.score - a.score || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
      .slice(0, limit);
  }
}
