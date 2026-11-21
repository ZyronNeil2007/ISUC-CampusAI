#!/usr/bin/env node
/**
 * Evaluate retrieval and routing against a question set.
 *
 *   npm run eval                          the fictional sample corpus and its question set
 *   node tools/eval-retrieval.mjs --source knowledge --questions knowledge/eval/questions.json --draft
 *
 * Prints metrics per split, then every failing question with what the system did. Exit code 1 when a gate fails.
 */
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { parseArgs } from 'node:util';
import { fileURLToPath } from 'node:url';
import { buildPack } from './lib/build-pack.mjs';
import { checkGates, evaluateQuestions } from './lib/eval-retrieval.mjs';

const ROOT = path.resolve(fileURLToPath(new URL('..', import.meta.url)));

const HELP = `Usage: node tools/eval-retrieval.mjs [options]

  --source <dir>       Corpus folder (default: knowledge/samples)
  --questions <file>   Question set  (default: knowledge/samples/eval/sample-questions.json)
  --level <level>      sample | draft | official   (default: sample)
  --today <YYYY-MM-DD> Date used for document validity (default: "evaluatedOn" in the question file)
  --split <name>       Only this split (dev, holdout)
  --verbose            Show every question, not just failures
  --no-gates           Do not fail the exit code on gate failures
  -h, --help
`;

let args;
try {
  args = parseArgs({
    options: {
      source: { type: 'string' },
      questions: { type: 'string' },
      level: { type: 'string' },
      today: { type: 'string' },
      split: { type: 'string' },
      verbose: { type: 'boolean' },
      'no-gates': { type: 'boolean' },
      help: { type: 'boolean', short: 'h' },
    },
  }).values;
} catch (error) {
  console.error(`${error.message}\n\n${HELP}`);
  process.exit(2);
}
if (args.help) {
  console.log(HELP);
  process.exit(0);
}

const level = args.level ?? 'sample';
const sourceDir = path.resolve(args.source ?? path.join(ROOT, 'knowledge/samples'));
const questionsFile = path.resolve(args.questions ?? path.join(ROOT, 'knowledge/samples/eval/sample-questions.json'));

const built = await buildPack({ sourceDir, contentLevel: level, write: false });
if (!built.ok) {
  for (const e of built.errors) console.error(`error: ${e}`);
  process.exit(1);
}
const file = JSON.parse(await readFile(questionsFile, 'utf8'));
const todayText = args.today ?? file.evaluatedOn;
const [y, m, d] = String(todayText).split('-').map(Number);
const today = new Date(y, m - 1, d);

let questions = file.questions;
if (args.split) questions = questions.filter((q) => q.split === args.split);

const report = evaluateQuestions(built, questions, { today });
const pct = (v) => (v === null ? '  n/a' : `${(v * 100).toFixed(1)}%`.padStart(5));
const splits = Object.keys(report.splits).sort();

console.log(`Retrieval evaluation: ${path.relative(ROOT, sourceDir)} (${level}), validity date ${todayText}, ${questions.length} questions\n`);
const rows = [
  ['questions', (s) => String(s.questions)],
  ['fully correct', (s) => `${s.passed} (${pct(s.passRate)})`],
  ['route accuracy', (s) => pct(s.routeAccuracy)],
  ['false answers (must be 0)', (s) => String(s.falseAnswers.length)],
  ['false refusal rate', (s) => pct(s.falseRefusalRate)],
  ['hit@1 (ranking)', (s) => pct(s.hitAt1)],
  ['hit@sources (what the model sees)', (s) => pct(s.hitAtSources)],
  ['MRR', (s) => (s.mrr === null ? '  n/a' : s.mrr.toFixed(3))],
  ['stale sources (must be 0)', (s) => String(s.staleSources.length)],
  ['excluded-document detection', (s) => pct(s.excludedAccuracy)],
];
console.log(`${''.padEnd(36)}${[...splits, 'all'].map((s) => s.padStart(10)).join('')}`);
for (const [label, fn] of rows) {
  console.log(`${label.padEnd(36)}${[...splits.map((s) => report.splits[s]), report.all].map((s) => fn(s).padStart(10)).join('')}`);
}
console.log(`\nStarter questions answerable: ${report.starterQuestions.total - report.starterQuestions.failing.length}/${report.starterQuestions.total}`);
for (const f of report.starterQuestions.failing) console.log(`  not answerable (${f.route}): ${f.question}`);

const shown = report.results.filter((r) => args.verbose || !r.pass);
if (shown.length) console.log(`\n${args.verbose ? 'Questions' : 'Failures'} (${shown.length}):`);
for (const r of shown) {
  console.log(`\n[${r.id}] ${r.pass ? 'ok  ' : 'FAIL'} ${r.question}${r.previous ? `   (after: "${r.previous}")` : ''}`);
  console.log(`   expected ${r.acceptable.join('|')}${r.expect.docs ? ` from ${r.expect.docs.map((d) => d.replace('sample-', '')).join(', ')}` : ''}${r.expect.sections ? ` in [${r.expect.sections.join('; ')}]` : ''}${r.expect.excluded ? ` (excluded: ${r.expect.excluded})` : ''}`);
  console.log(`   got      ${r.route} (${r.reason}) strong=${r.strong} coverage=${r.coverage.toFixed(2)} specificity=${r.specificity.toFixed(2)}${r.rewritten ? ' rewritten' : ''}`);
  console.log(`   terms    ${r.terms.join(' ')}${r.corrections.length ? `  corrected: ${r.corrections.map((c) => `${c.from}->${c.to}`).join(', ')}` : ''}`);
  if (r.topChunk) console.log(`   top      ${r.topChunk}${r.topSection ? ` [${r.topSection}]` : ''}`);
  if (r.sources.length) console.log(`   sources  ${r.sources.join(' | ')}`);
  if (r.excludedDoc) console.log(`   excluded ${r.excludedDoc}`);
  console.log(`   checks   ${Object.entries(r.checks).map(([k, v]) => `${k}:${v ? 'ok' : 'NO'}`).join(' ')}`);
}

const GATES = { maxFalseAnswers: 0, maxStaleSources: 0, minRouteAccuracy: 0.9, minHitAtSources: 0.9 };
let failed = [];
for (const s of splits) failed.push(...checkGates(report.splits[s], GATES).map((f) => `${s}: ${f}`));
if (report.starterQuestions.failing.length) failed.push('starter questions: some are not answerable from the pack');
console.log(failed.length ? `\nGATES FAILED:\n  ${failed.join('\n  ')}` : '\nAll gates passed.');
console.log('\nThese numbers describe the pipeline on this corpus and these questions only. See docs/knowledge-base.md for what they do not show.');
if (failed.length && !args['no-gates']) process.exit(1);
