/**
 * Retrieval and routing evaluation (README 20.2: retrieval accuracy, appropriate refusal when evidence is missing).
 *
 * A question file lists, for each question, what should happen:
 *   { id, split, question, previous?, expect: {
 *       route | routes   university | general | refuse | chat   (routes = any of several is acceptable)
 *       docs             university answers: at least one source must come from one of these documents
 *       sections         ...and one source must be in one of these sections
 *       mustNotCite      document ids that must never be a source (superseded, expired)
 *       excluded         refusals: the document that exists but cannot be used (superseded, expired...)
 *   } }
 *
 * The numbers describe how well the PIPELINE works on THIS corpus and THESE questions. They are not a measure of
 * answer quality (no language model is involved) and they say nothing about real students' questions.
 */
import { Retriever } from '../../src/ai/retrieval/Retriever.js';
import { decideRoute } from '../../src/ai/retrieval/routing.js';

const lower = (s) => String(s ?? '').toLowerCase();

function runQuestion(retriever, q) {
  const retrieval = retriever.retrieve(q.question, { previousQuestion: q.previous ?? null });
  const decision = decideRoute({ retrieval, question: q.question, lexicon: retriever.lexicon, officeTerms: retriever.officeTerms });
  const expect = q.expect ?? {};
  const acceptable = expect.routes ?? [expect.route];
  const sourceDocs = retrieval.sources.map((s) => s.document.id);

  const checks = { route: acceptable.includes(decision.route) };
  const wantsSources = acceptable.length === 1 && acceptable[0] === 'university';
  let reciprocalRank = null;
  let hitAt1 = null;

  if (expect.docs) {
    const wanted = new Set(expect.docs);
    const rank = retrieval.hits.findIndex((h) => wanted.has(h.document.id));
    hitAt1 = rank === 0;
    reciprocalRank = rank === -1 ? 0 : 1 / (rank + 1);
    if (wantsSources) checks.sources = sourceDocs.some((d) => wanted.has(d));
  }
  if (expect.sections && wantsSources) {
    const wanted = expect.sections.map(lower);
    checks.section = retrieval.sources.some((s) => wanted.includes(lower(s.chunk.section)));
  }
  if (expect.mustNotCite) {
    checks.noStaleSource = !sourceDocs.some((d) => expect.mustNotCite.includes(d));
  }
  if (expect.excluded) {
    checks.excluded = retrieval.excluded?.document.id === expect.excluded;
  }

  return {
    id: q.id,
    split: q.split ?? 'all',
    question: q.question,
    previous: q.previous ?? null,
    expect,
    route: decision.route,
    reason: decision.reason,
    strong: retrieval.strong,
    coverage: retrieval.coverage,
    specificity: retrieval.specificity,
    rewritten: Boolean(retrieval.rewrittenFrom),
    corrections: retrieval.corrections,
    terms: retrieval.originals,
    topChunk: retrieval.hits[0]?.chunk.id ?? null,
    topSection: retrieval.hits[0]?.chunk.section ?? null,
    sources: retrieval.sources.map((s) => `${s.chunk.id}${s.chunk.section ? ` [${s.chunk.section}]` : ''}`),
    excludedDoc: retrieval.excluded?.document.id ?? null,
    acceptable,
    checks,
    hitAt1,
    reciprocalRank,
    pass: Object.values(checks).every(Boolean),
  };
}

const ratio = (num, den) => (den === 0 ? null : num / den);

export function summarize(results) {
  const total = results.length;
  const expectsUniversity = results.filter((r) => r.acceptable.length === 1 && r.acceptable[0] === 'university');
  const mustNotBeUniversity = results.filter((r) => !r.acceptable.includes('university'));
  const withDocs = results.filter((r) => r.reciprocalRank !== null && r.acceptable.includes('university'));
  const refusalsWithExcluded = results.filter((r) => r.expect.excluded);

  const byRoute = {};
  for (const route of ['university', 'general', 'refuse', 'chat']) {
    const expected = results.filter((r) => r.acceptable.length === 1 && r.acceptable[0] === route);
    const predicted = results.filter((r) => r.route === route);
    const correct = expected.filter((r) => r.route === route).length;
    byRoute[route] = {
      expected: expected.length,
      predicted: predicted.length,
      recall: ratio(correct, expected.length),
      precision: ratio(predicted.filter((r) => r.acceptable.length === 1 && r.acceptable[0] === route).length, predicted.length),
    };
  }

  return {
    questions: total,
    passed: results.filter((r) => r.pass).length,
    passRate: ratio(results.filter((r) => r.pass).length, total),
    routeAccuracy: ratio(results.filter((r) => r.checks.route).length, total),
    // The critical number: a campus question that should have been refused (or answered generally) but was
    // answered from sources as if the university had said it.
    falseAnswers: mustNotBeUniversity.filter((r) => r.route === 'university').map((r) => r.id),
    falseAnswerRate: ratio(mustNotBeUniversity.filter((r) => r.route === 'university').length, mustNotBeUniversity.length),
    // Answerable questions that were refused or sent to the general route.
    falseRefusals: expectsUniversity.filter((r) => r.route !== 'university').map((r) => r.id),
    falseRefusalRate: ratio(expectsUniversity.filter((r) => r.route !== 'university').length, expectsUniversity.length),
    hitAt1: ratio(withDocs.filter((r) => r.hitAt1).length, withDocs.length),
    mrr: withDocs.length ? withDocs.reduce((sum, r) => sum + r.reciprocalRank, 0) / withDocs.length : null,
    hitAtSources: ratio(expectsUniversity.filter((r) => r.checks.sources !== false && r.route === 'university' && r.pass).length, expectsUniversity.length),
    staleSources: results.filter((r) => r.checks.noStaleSource === false).map((r) => r.id),
    excludedAccuracy: ratio(refusalsWithExcluded.filter((r) => r.checks.excluded).length, refusalsWithExcluded.length),
    byRoute,
    failures: results.filter((r) => !r.pass).map((r) => r.id),
  };
}

/**
 * @param {{documents: object[], chunks: object[], lexicon: object, manifest?: object}} pack
 * @param {object[]} questions
 * @param {{retrieverOptions?: object, today?: Date}} [options]
 */
export function evaluateQuestions(pack, questions, { retrieverOptions = {}, today } = {}) {
  const retriever = new Retriever(pack, {
    allowUnverified: pack.manifest ? pack.manifest.contentLevel !== 'official' : true,
    now: today ? () => today : undefined,
    ...retrieverOptions,
  });
  const results = questions.map((q) => runQuestion(retriever, q));

  const splits = {};
  for (const split of new Set(results.map((r) => r.split))) {
    splits[split] = summarize(results.filter((r) => r.split === split));
  }

  // Starter questions are shown to students, so each one must be answerable from this pack.
  const starters = (pack.lexicon?.starterQuestions ?? []).map((question) => {
    const retrieval = retriever.retrieve(question);
    const decision = decideRoute({ retrieval, question, lexicon: retriever.lexicon, officeTerms: retriever.officeTerms });
    return { question, route: decision.route };
  });

  return {
    results,
    all: summarize(results),
    splits,
    starterQuestions: { total: starters.length, failing: starters.filter((s) => s.route !== 'university') },
    retriever,
  };
}

/** Pass/fail gates for regression protection. Returns the list of failed gates (empty when all pass). */
export function checkGates(summary, gates) {
  const failed = [];
  const check = (name, ok, detail) => {
    if (!ok) failed.push(`${name}: ${detail}`);
  };
  const pct = (v) => (v === null ? 'n/a' : `${(v * 100).toFixed(1)}%`);
  if (gates.maxFalseAnswers !== undefined) {
    check('false answers', summary.falseAnswers.length <= gates.maxFalseAnswers, `${summary.falseAnswers.length} (${summary.falseAnswers.join(', ')})`);
  }
  if (gates.maxStaleSources !== undefined) {
    check('stale sources', summary.staleSources.length <= gates.maxStaleSources, summary.staleSources.join(', '));
  }
  for (const [name, key] of [['route accuracy', 'routeAccuracy'], ['hit@sources', 'hitAtSources'], ['pass rate', 'passRate'], ['hit@1', 'hitAt1']]) {
    const min = gates[`min${key[0].toUpperCase()}${key.slice(1)}`];
    if (min !== undefined) check(name, summary[key] === null || summary[key] >= min, `${pct(summary[key])} < ${pct(min)}`);
  }
  if (gates.maxFalseRefusalRate !== undefined) {
    check('false refusals', summary.falseRefusalRate === null || summary.falseRefusalRate <= gates.maxFalseRefusalRate, `${pct(summary.falseRefusalRate)} (${summary.falseRefusals.join(', ')})`);
  }
  return failed;
}
