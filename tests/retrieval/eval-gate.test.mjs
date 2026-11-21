import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { checkGates, evaluateQuestions } from '../../tools/lib/eval-retrieval.mjs';
import { SAMPLE_DIR, TODAY, samplePack } from '../helpers/sample-pack.mjs';

const file = JSON.parse(await readFile(path.join(SAMPLE_DIR, 'eval/sample-questions.json'), 'utf8'));

test('the question set itself is well formed and refers only to documents and sections that exist', async () => {
  const pack = await samplePack();
  const docs = new Set(pack.documents.map((d) => d.id));
  const sectionsByDoc = new Map();
  for (const c of pack.chunks) sectionsByDoc.set(c.documentId, new Set([...(sectionsByDoc.get(c.documentId) ?? []), c.section]));

  const ids = new Set();
  for (const q of file.questions) {
    assert.ok(!ids.has(q.id), `duplicate question id ${q.id}`);
    ids.add(q.id);
    assert.ok(['dev', 'holdout'].includes(q.split), `${q.id}: split`);
    assert.ok(typeof q.question === 'string' && q.question.trim(), `${q.id}: question text`);
    const routes = q.expect.routes ?? [q.expect.route];
    assert.ok(routes.length > 0 && routes.every((r) => ['university', 'general', 'refuse', 'chat'].includes(r)), `${q.id}: route`);
    for (const d of [...(q.expect.docs ?? []), ...(q.expect.mustNotCite ?? []), ...(q.expect.excluded ? [q.expect.excluded] : [])]) {
      assert.ok(docs.has(d), `${q.id}: unknown document ${d}`);
    }
    if (q.expect.sections) {
      const known = new Set((q.expect.docs ?? []).flatMap((d) => [...(sectionsByDoc.get(d) ?? [])]).map((s) => s.toLowerCase()));
      for (const s of q.expect.sections) assert.ok(known.has(s.toLowerCase()), `${q.id}: no section "${s}" in ${q.expect.docs}`);
    }
  }
  assert.ok(file.questions.filter((q) => q.split === 'dev').length >= 80);
  assert.ok(file.questions.filter((q) => q.split === 'holdout').length >= 60);
});

test('every question the app suggests to students can be answered from the pack', async () => {
  const report = evaluateQuestions(await samplePack(), file.questions, { today: TODAY });
  assert.deepEqual(report.starterQuestions.failing, []);
  assert.ok(report.starterQuestions.total >= 5);
});

test('dev questions: no false answers, no stale sources, and most answers right (regression gate)', async () => {
  const report = evaluateQuestions(await samplePack(), file.questions.filter((q) => q.split === 'dev'), { today: TODAY });
  const failed = checkGates(report.all, { maxFalseAnswers: 0, maxStaleSources: 0, minRouteAccuracy: 0.95, minHitAtSources: 0.95, minPassRate: 0.95 });
  assert.deepEqual(failed, []);
});

// The holdout questions were NOT used to tune anything, and they are harder: they rephrase and use words that the
// documents and the lexicon do not. These floors record where the system stands so that a change cannot make it worse
// without a decision; they are not a goal. The honest reading is in docs/knowledge-base.md: many correct answers are
// refused because the wording differs from the documents (false refusals), and one general arithmetic question is
// answered from sources.
test('holdout questions: stale documents are never cited and quality does not regress below the recorded level', async () => {
  const report = evaluateQuestions(await samplePack(), file.questions.filter((q) => q.split === 'holdout'), { today: TODAY });
  assert.deepEqual(report.all.staleSources, []);
  assert.ok(report.all.falseAnswers.length <= 1, `false answers: ${report.all.falseAnswers}`);
  assert.ok(report.all.passRate >= 0.65, `pass rate ${report.all.passRate}`);
  assert.ok(report.all.hitAt1 >= 0.8, `hit@1 ${report.all.hitAt1}`);
});

test('the evaluation is deterministic', async () => {
  const pack = await samplePack();
  const a = evaluateQuestions(pack, file.questions, { today: TODAY });
  const b = evaluateQuestions(pack, file.questions, { today: TODAY });
  assert.deepEqual(a.results.map((r) => [r.id, r.route, r.sources]), b.results.map((r) => [r.id, r.route, r.sources]));
});
