import test from 'node:test';
import assert from 'node:assert/strict';
import { RETRIEVAL_DEFAULTS, Retriever, editDistance, isFollowUp } from '../../src/ai/retrieval/Retriever.js';
import { sampleRetriever, samplePack, TODAY } from '../helpers/sample-pack.mjs';

test('editDistance counts insertions, deletions, substitutions and swapped neighbours', () => {
  assert.equal(editDistance('abc', 'abc'), 0);
  assert.equal(editDistance('scholarhip', 'scholarship'), 1);
  assert.equal(editDistance('teh', 'the'), 1);
  assert.equal(editDistance('kitten', 'sitting'), 3);
  assert.equal(editDistance('', 'abc'), 3);
});

test('isFollowUp recognises questions that lean on the previous one', () => {
  for (const q of ['And the fees?', 'How much does it cost?', 'What about transferees?', 'Is that required?', 'Paano naman ang scholarship?']) {
    assert.equal(isFollowUp(q), true, q);
  }
  for (const q of ['How do I enroll?', 'Where is the library?', '']) assert.equal(isFollowUp(q), false, q);
});

test('a well-covered question is strong and returns the right passage first', async () => {
  const r = await sampleRetriever();
  const result = r.retrieve('What are the requirements for new freshmen?');
  assert.equal(result.strong, true);
  assert.ok(result.coverage >= RETRIEVAL_DEFAULTS.minCoverage);
  assert.ok(result.sources.length >= 1 && result.sources.length <= RETRIEVAL_DEFAULTS.limit);
  assert.ok(result.sources.some((s) => s.chunk.section === 'Requirements for new freshmen'));
});

test('a question about something the corpus never mentions is not strong', async () => {
  const r = await sampleRetriever();
  const result = r.retrieve('How much is the tuition for the astrophysics program?');
  assert.equal(result.strong, false);
  assert.deepEqual(result.sources, []);
});

test('the "how much" cue gets the passage with the fee into the sources, and never counts as coverage', async () => {
  const question = 'How much is a certificate of good moral character?';
  const feeTable = (result) => result.sources.some((s) => s.chunk.section === 'Documents, fees and processing time');
  // Several passages mention the certificate; only one has the fee. Without the cue it is not handed to the model.
  assert.equal(feeTable((await sampleRetriever({ cueWeight: 0 })).retrieve(question)), false);
  const r = await sampleRetriever();
  assert.equal(feeTable(r.retrieve(question)), true);
  // The cue words are not part of the question: an unknown topic stays unanswerable, and they are not reported.
  const unknown = r.retrieve('How much is the zzyzx?');
  assert.equal(unknown.strong, false);
  assert.deepEqual(unknown.originals, ['zzyzx']);
});

test('generic campus words and bare numbers alone never make a match strong', async () => {
  const r = await sampleRetriever();
  for (const q of ['student', 'students', 'university', 'office', 'Where is the office?', 'campus', '2026']) {
    assert.equal(r.retrieve(q).strong, false, `"${q}" should not be strong`);
  }
  // ...but a topic word next to them is enough.
  assert.equal(r.retrieve('Where is the Registrar office?').strong, true);
  assert.equal(r.retrieve('enrollment').strong, true);
});

test('expired and superseded documents are never sources', async () => {
  const r = await sampleRetriever();
  const banned = new Set(['sample-summer-2026-advisory', 'sample-tuition-and-fees-2025']);
  for (const q of ['How much is tuition per unit?', 'When is summer enrollment?', 'What are the tuition and fees?', 'How many units in the summer?']) {
    for (const hit of r.retrieve(q).hits) assert.ok(!banned.has(hit.document.id), `${q}: ${hit.document.id}`);
  }
  const unusable = r.unusableDocuments().map((u) => `${u.document.id}:${u.validity}`).sort();
  assert.deepEqual(unusable, ['sample-summer-2026-advisory:expired', 'sample-tuition-and-fees-2025:superseded']);
});

test('an expired document that answers better than anything current is named, not bypassed', async () => {
  const r = await sampleRetriever();
  const result = r.retrieve('How many units can I take in the summer?');
  assert.equal(result.strong, false);
  assert.equal(result.excluded.document.id, 'sample-summer-2026-advisory');
  assert.equal(result.excluded.validity, 'expired');
  assert.deepEqual(result.sources, []);
});

test('a superseded document points to its replacement', async () => {
  const r = await sampleRetriever();
  const result = r.retrieve('How much was tuition in 2025?');
  assert.equal(result.excluded?.document.id, 'sample-tuition-and-fees-2025');
  assert.equal(result.excluded.validity, 'superseded');
  assert.equal(result.excluded.replacement.id, 'sample-tuition-and-fees-2026');
});

test('validity follows the device date: before the expiry the advisory is usable', async () => {
  const pack = await samplePack();
  const earlier = new Retriever(pack, { allowUnverified: true, now: () => new Date(2026, 5, 1) });
  const result = earlier.retrieve('How many units can I take in the summer?');
  assert.equal(result.strong, true);
  assert.equal(result.sources[0].document.id, 'sample-summer-2026-advisory');
});

test('spelling mistakes are corrected against words in the documents', async () => {
  const r = await sampleRetriever();
  const result = r.retrieve('scholarhip requirements');
  assert.deepEqual(result.corrections, [{ from: 'scholarhip', to: 'scholarship' }]);
  assert.equal(result.strong, true);
  // A word that is simply unknown is not "corrected" into something else.
  assert.deepEqual(r.retrieve('How much is the zzyzx?').corrections, []);
});

test('a short follow-up is searched together with the previous question', async () => {
  const r = await sampleRetriever();
  const result = r.retrieve('How much does it cost?', { previousQuestion: 'How do I request a Transcript of Records?' });
  assert.equal(result.strong, true);
  assert.equal(result.rewrittenFrom, 'How do I request a Transcript of Records?');
  assert.equal(result.question, 'How much does it cost?');
  assert.equal(result.sources[0].document.id, 'sample-document-requests');
  // Alone, the same words are answered from whatever mentions costs: the previous question is what steers it.
  const alone = r.retrieve('How much does it cost?');
  assert.equal(alone.rewrittenFrom, null);
  assert.notEqual(alone.sources[0].document.id, 'sample-document-requests');
});

test('a long self-contained question is not rewritten with the previous one', async () => {
  const r = await sampleRetriever();
  const result = r.retrieve('What are the requirements for new freshmen?', { previousQuestion: 'Where is the library?' });
  assert.equal(result.rewrittenFrom, null);
});

test('tokens in the alias lexicon bridge vocabulary: "TOR" finds the Transcript of Records', async () => {
  const r = await sampleRetriever();
  const result = r.retrieve('How do I get my TOR?');
  assert.equal(result.strong, true);
  assert.ok(result.sources.some((s) => s.document.id === 'sample-document-requests'));
});

test('officeContact finds the directory entry for an office, and null otherwise', async () => {
  const r = await sampleRetriever();
  const contact = r.officeContact('Sample University Registrar');
  assert.equal(contact.office, 'Office of the University Registrar');
  assert.match(contact.chunk.text, /registrar@sample-university\.test/);
  assert.equal(r.officeContact('Department of Nothing'), null);
  assert.equal(r.officeContact(''), null);
});

test('empty and filler-only questions return an empty result', async () => {
  const r = await sampleRetriever();
  for (const q of ['', '   ', 'please tell me', '???']) {
    const result = r.retrieve(q);
    assert.equal(result.strong, false);
    assert.deepEqual(result.hits, []);
  }
});

test('official packs do not use unverified documents', async () => {
  const pack = await samplePack();
  const strict = new Retriever(pack, { allowUnverified: false, now: () => TODAY });
  const result = strict.retrieve('What are the requirements for new freshmen?');
  assert.equal(result.strong, false); // every sample document is "draft"
  assert.ok(strict.unusableDocuments().length >= pack.documents.length - 2);
});

test('the same question gives the same answer every time', async () => {
  const r = await sampleRetriever();
  const a = r.retrieve('How do I request a Transcript of Records?');
  const b = r.retrieve('How do I request a Transcript of Records?');
  assert.deepEqual(a.sources.map((s) => s.chunk.id), b.sources.map((s) => s.chunk.id));
  assert.deepEqual(a.sources.map((s) => s.score), b.sources.map((s) => s.score));
});
