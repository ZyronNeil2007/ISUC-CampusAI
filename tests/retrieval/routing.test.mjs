import test from 'node:test';
import assert from 'node:assert/strict';
import { GENERAL_LABEL, buildRefusal, campusSignals, decideRoute, isConceptQuestion, isSmallTalk } from '../../src/ai/retrieval/routing.js';
import { sampleRetriever } from '../helpers/sample-pack.mjs';

async function route(question, previousQuestion = null) {
  const r = await sampleRetriever();
  const retrieval = r.retrieve(question, { previousQuestion });
  const decision = decideRoute({ retrieval, question, lexicon: r.lexicon, officeTerms: r.officeTerms });
  return { ...decision, retrieval, retriever: r };
}

test('greetings, thanks and acknowledgements are small talk; real questions are not', () => {
  for (const q of ['Hello', 'hi po', 'Good morning!', 'Salamat po', 'thanks', 'ok', 'Kumusta']) assert.equal(isSmallTalk(q), true, q);
  for (const q of ['Hello, how do I enroll?', 'Thanks, where is the library?', '', '???', 'enrollment']) assert.equal(isSmallTalk(q), false, q);
});

test('only narrow "what is X" questions are concept questions', () => {
  for (const q of ['What is a thesis?', 'What does GWA mean?', 'Define prerequisite', 'Ano ang thesis?']) assert.equal(isConceptQuestion(q), true, q);
  for (const q of ['What is the enrollment deadline?', 'What are the requirements for enrollment?', 'What is my GWA at the university?', 'How do I enroll?']) {
    assert.equal(isConceptQuestion(q), false, q);
  }
});

test('campusSignals separates the campus name from topic words', async () => {
  const r = await sampleRetriever();
  const named = campusSignals('Is Sample University open today?', r.lexicon, r.officeTerms);
  assert.equal(named.explicit, true);
  const topical = campusSignals('Where do I pay the tuition?', r.lexicon, r.officeTerms);
  assert.equal(topical.explicit, false);
  assert.equal(topical.terms, true);
  const neither = campusSignals('What is a binary tree?', r.lexicon, r.officeTerms);
  assert.deepEqual([neither.explicit, neither.terms], [false, false]);
});

test('routes: a covered campus question goes to the sources', async () => {
  const d = await route('How do I request a Transcript of Records?');
  assert.deepEqual([d.route, d.reason], ['university', 'strong-match']);
});

test('routes: a campus question the pack cannot answer is refused, not improvised', async () => {
  const d = await route('Is there a dormitory?');
  assert.deepEqual([d.route, d.reason], ['refuse', 'campus-question-without-source']);
});

test('routes: a general concept goes to the general route, with the label', async () => {
  const d = await route('What is object-oriented programming?');
  assert.deepEqual([d.route, d.reason], ['general', 'concept-question']);
  assert.equal(GENERAL_LABEL, 'General information, not from university documents');
});

test('routes: a non-campus question with no campus words is general', async () => {
  const d = await route('How do I cook rice?');
  assert.equal(d.route, 'general');
});

test('routes: only an expired document covers it, so refuse and say why', async () => {
  const d = await route('How many units can I take in the summer?');
  assert.deepEqual([d.route, d.reason], ['refuse', 'only-unusable-document']);
});

test('routes: greetings are chat, with or without a pack', async () => {
  assert.equal((await route('Hello')).route, 'chat');
  assert.deepEqual(decideRoute({ retrieval: null, question: 'Salamat po', packLoaded: false }), { route: 'chat', reason: 'small-talk' });
});

test('routes: with no pack loaded nothing can be verified', () => {
  assert.deepEqual(decideRoute({ retrieval: null, question: 'How do I enroll?', packLoaded: false }), { route: 'general', reason: 'no-pack' });
});

test('routes: a question that is only filler is chat, not a refusal', async () => {
  const d = await route('please tell me');
  assert.deepEqual([d.route, d.reason], ['chat', 'no-content']);
});

test('routes: a follow-up uses the previous question', async () => {
  const d = await route('How much does it cost?', 'How do I request a Transcript of Records?');
  assert.equal(d.route, 'university');
});

test('refusal for an expired document names it, its expiry date and the office with its directory contact', async () => {
  const d = await route('How many units can I take in the summer?');
  const { text, sources } = buildRefusal({ retrieval: d.retrieval, retriever: d.retriever });
  assert.match(text, /Sample Summer 2026 Enrollment Advisory/);
  assert.match(text, /expired on 2026-06-30/);
  assert.match(text, /please ask Sample University Registrar/);
  assert.match(text, /Email: registrar@sample-university\.test/);
  assert.equal(sources.length, 1);
  assert.equal(sources[0].document.category, 'campus_offices');
});

test('refusal for a superseded document names the replacement', async () => {
  const d = await route('How much was tuition in 2025?');
  assert.equal(d.route, 'refuse');
  const { text } = buildRefusal({ retrieval: d.retrieval, retriever: d.retriever });
  assert.match(text, /has been replaced by "[^"]*2026[^"]*"/);
});

test('refusal with no source says it could not verify, and a loose match is only a hint', async () => {
  const d = await route('Is the gym open on Sundays?');
  assert.equal(d.route, 'refuse');
  const { text } = buildRefusal({ retrieval: d.retrieval, retriever: d.retriever });
  assert.match(text, /could not verify that/);
  assert.match(text, /does not clearly cover this/);
  assert.match(text, /may be able to point you to the right office/);
  assert.doesNotMatch(text, /For an official answer, please ask/);
});

test('refusal never invents contact details: no directory entry means no contact lines', async () => {
  const d = await route('Is there a dormitory?');
  const { text, sources } = buildRefusal({ retrieval: d.retrieval, retriever: d.retriever });
  assert.doesNotMatch(text, /Email:|Phone:|Location:/);
  assert.deepEqual(sources, []);
});

test('refusal without a pack says no pack is loaded', () => {
  const { text } = buildRefusal({ retrieval: null, retriever: null, packLoaded: false });
  assert.match(text, /No campus knowledge pack is loaded/);
});
