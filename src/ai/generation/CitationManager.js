import { neutralizeSource } from '../retrieval/safety.js';
import { analyze } from '../retrieval/tokenizer.js';

/**
 * Source-supported answers (README 14.7 and 15.3).
 *
 *   buildSourceContext   numbers the retrieved passages [S1], [S2]... and fits them into a character budget
 *   finalizeAnswer       checks what the model wrote against those passages
 *
 * The checks are LEXICAL and deliberately modest. They catch the obvious failures (a marker for a source that was never
 * given, a figure that appears in no source) and flag them to the student. They cannot prove that a sentence is true,
 * and a model can paraphrase a passage into something it does not say. Sources stay visible so the student can check.
 */

export const MARKER = /\[S(\d{1,4})\]/g;

/** Hand-off limits: enough for four short passages, small enough for a 4k-token context window. */
export const SOURCE_BUDGET = Object.freeze({ totalChars: 3200, perSourceChars: 1000 });

function describeProvenance(doc) {
  const parts = [doc.office, doc.version ? `version ${doc.version}` : null, doc.publishedAt ? `published ${doc.publishedAt}` : null];
  return parts.filter(Boolean).join(', ');
}

/** Cut at a sentence or line boundary when possible, and say so. */
function clip(text, limit) {
  if (text.length <= limit) return { text, clipped: false };
  const slice = text.slice(0, limit);
  const cut = Math.max(slice.lastIndexOf('\n'), slice.lastIndexOf('. '), slice.lastIndexOf('| '));
  return { text: `${(cut > limit * 0.5 ? slice.slice(0, cut + 1) : slice).trimEnd()} […]`, clipped: true };
}

/** What the UI shows for one source. `id` is the model's marker (S1...) or null for a source that was not given to the model. */
export function sourceCard(hit, id = null, clipped = false) {
  const { chunk, document: doc } = hit;
  return {
    id,
    chunkId: chunk.id,
    documentId: doc.id,
    title: doc.title,
    office: doc.office ?? null,
    section: chunk.section || null,
    page: chunk.page ?? null,
    version: doc.version ?? null,
    publishedAt: doc.publishedAt ?? null,
    excerpt: chunk.text, // the full passage, shown as plain text
    clipped,
    cited: false,
  };
}

/**
 * @param {{chunk: object, document: object}[]} hits retrieval hits, best first
 * @returns {{block: string, used: object[]}} block goes to the model; used goes to the UI
 */
export function buildSourceContext(hits, { totalChars = SOURCE_BUDGET.totalChars, perSourceChars = SOURCE_BUDGET.perSourceChars } = {}) {
  const used = [];
  const lines = [];
  let remaining = totalChars;
  for (const hit of hits) {
    const { chunk, document: doc } = hit;
    const cleaned = neutralizeSource(chunk.text);
    const room = Math.min(perSourceChars, remaining - 120); // keep room for the heading line
    if (room < 150 && used.length > 0) break;
    const { text, clipped } = clip(cleaned, Math.max(room, 150));
    const id = `S${used.length + 1}`;
    const heading = [doc.title, chunk.section || null, chunk.page ? `page ${chunk.page}` : null].filter(Boolean).join(' › ');
    lines.push(`[${id}] ${neutralizeSource(heading)} (${neutralizeSource(describeProvenance(doc))})\n${text}`);
    used.push(sourceCard(hit, id, clipped));
    remaining -= lines[lines.length - 1].length + 2;
  }
  return { block: lines.join('\n\n'), used };
}

/** Markers the model wrote, as numbers, in order of first appearance. */
export function citedNumbers(text) {
  const seen = [];
  for (const match of String(text ?? '').matchAll(MARKER)) {
    const n = Number(match[1]);
    if (!seen.includes(n)) seen.push(n);
  }
  return seen;
}

/** Remove source markers, e.g. from earlier turns that are sent back to the model as history. */
export function stripMarkers(text) {
  return String(text ?? '')
    .replace(MARKER, '')
    .replace(/[ \t]+([.,;:!?])/g, '$1')
    .replace(/ {2,}/g, ' ')
    .trim();
}

const NUMBER = /\d[\d,]*(?:\.\d+)?/g;
const normalizeNumber = (value) => value.replace(/,/g, '').replace(/\.0+$/, '');

function numbersIn(text) {
  return new Set([...String(text ?? '').matchAll(NUMBER)].map((m) => normalizeNumber(m[0])));
}

/** Sentences, keeping any trailing [S#] marker with the sentence it supports. */
export function splitSentences(text) {
  return String(text ?? '')
    .split(/(?<=[.!?])(?:\s*(?:\[S\d{1,4}\])+)?\s+|\n+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

/**
 * Check the model's answer against the sources it was given.
 *
 * @param {string} text the model's reply
 * @param {object[]} used descriptors from buildSourceContext
 * @param {{question?: string}} [context]
 * @returns {{content: string, sources: object[], citedIds: string[], warnings: string[], invalidMarkers: number[],
 *            unsupportedSentences: string[], unsupportedNumbers: string[]}}
 */
export function finalizeAnswer(text, used, { question = '' } = {}) {
  const raw = String(text ?? '');
  const valid = new Set(used.map((_, i) => i + 1));
  const invalidMarkers = citedNumbers(raw).filter((n) => !valid.has(n));

  // A marker for a source the model was never given is removed, not trusted.
  const content = raw
    .replace(MARKER, (_marker, n) => (valid.has(Number(n)) ? `[S${Number(n)}]` : ''))
    .replace(/[ \t]+([.,;:!?])/g, '$1')
    .replace(/ {2,}/g, ' ')
    .trim();

  const citedIds = citedNumbers(content).map((n) => `S${n}`);
  const sources = used.map((s) => ({ ...s, cited: citedIds.includes(s.id) }));

  // Does each cited sentence share most of its content words with the source it cites?
  const termsOf = new Map(used.map((s) => [s.id, new Set(analyze(`${s.title} ${s.section ?? ''} ${s.excerpt}`))]));
  const unsupportedSentences = [];
  for (const sentence of splitSentences(content)) {
    const markers = [...sentence.matchAll(MARKER)].map((m) => `S${m[1]}`).filter((id) => termsOf.has(id));
    if (markers.length === 0) continue;
    const terms = analyze(sentence.replace(MARKER, ' '));
    if (terms.length < 3) continue; // too short to judge
    const supported = markers.some((id) => {
      const have = termsOf.get(id);
      return terms.filter((t) => have.has(t)).length / terms.length >= 0.4;
    });
    if (!supported) unsupportedSentences.push(sentence);
  }

  // Every figure in the answer should be in a source (or in the question itself).
  const allowed = new Set([...numbersIn(question), ...used.flatMap((s) => [...numbersIn(`${s.title} ${s.section ?? ''} ${s.excerpt} ${s.version ?? ''} ${s.publishedAt ?? ''}`)])]);
  const unsupportedNumbers = [...numbersIn(content.replace(MARKER, ' '))].filter((n) => !allowed.has(n));

  const warnings = [];
  if (invalidMarkers.length) warnings.push('invalid-citation');
  if (unsupportedSentences.length) warnings.push('unsupported-sentence');
  if (unsupportedNumbers.length) warnings.push('unsupported-number');
  if (citedIds.length === 0 && used.length > 0) warnings.push('no-citation');

  return { content, sources, citedIds, warnings, invalidMarkers, unsupportedSentences, unsupportedNumbers };
}

/** Plain-language notes for the student, one per warning. */
export const WARNING_TEXT = Object.freeze({
  'invalid-citation': 'The answer pointed to a source that was not provided, so that reference was removed.',
  'unsupported-sentence': 'Some statements could not be matched to the sources they cite. Check the sources below.',
  'unsupported-number': 'Some figures or dates in this answer were not found in the sources. Please verify them with the responsible office.',
  'no-citation': 'This answer did not cite its sources. The documents that were consulted are listed below; please check them.',
});
