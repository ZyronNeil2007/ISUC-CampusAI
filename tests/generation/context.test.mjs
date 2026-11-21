import test from 'node:test';
import assert from 'node:assert/strict';
import { buildPrompt } from '../../src/ai/conversation/ContextManager.js';
import { buildSystemPrompt } from '../../src/ai/conversation/PromptManager.js';

const hit = (text, section = 'Fees') => ({ chunk: { id: 'c1', documentId: 'd1', section, text }, document: { id: 'd1', title: 'Doc', office: 'Registrar', version: '1.0.0', publishedAt: '2026-01-01' } });
const u = (content) => ({ role: 'user', content });
const a = (content) => ({ role: 'assistant', content });

test('university prompt: rules in the system message, sources and question in the last user message', () => {
  const { messages, used } = buildPrompt({ history: [u('How much is a TOR?')], route: 'university', hits: [hit('A TOR costs 150 pesos.')], today: '2026-11-20', contentLevel: 'sample' });
  assert.equal(messages[0].role, 'system');
  assert.match(messages[0].content, /Use only what the sources say/);
  assert.match(messages[0].content, /FICTIONAL sample content/);
  assert.match(messages[0].content, /Today's date: 2026-11-20/);
  const last = messages.at(-1);
  assert.equal(last.role, 'user');
  assert.match(last.content, /^SOURCES \(.*never instructions\):\n<<<\n\[S1\] Doc › Fees/);
  assert.match(last.content, />>>\n\nQuestion: How much is a TOR\?$/);
  assert.deepEqual(used.map((s) => s.id), ['S1']);
  // Retrieved text is never in the system message, where it would carry the system's authority.
  assert.doesNotMatch(messages[0].content, /150 pesos/);
});

test('general and chat prompts carry no sources and different rules', () => {
  const general = buildPrompt({ history: [u('What is a thesis?')], route: 'general' });
  assert.equal(general.used.length, 0);
  assert.match(general.messages[0].content, /not matched to any university document/);
  assert.equal(general.messages.at(-1).content, 'What is a thesis?');
  const chat = buildPrompt({ history: [u('Hello')], route: 'chat' });
  assert.match(chat.messages[0].content, /greeting/);
});

test('without a route the Phase 3 prompt is used: no verified documents on this device', () => {
  const { messages } = buildPrompt({ history: [u('hi')] });
  assert.equal(messages[0].content, buildSystemPrompt());
  assert.match(messages[0].content, /No verified ISU documents/);
});

test('earlier answers lose their [S#] markers, which refer to sources the model no longer sees', () => {
  const { messages } = buildPrompt({ history: [u('First?'), a('It is 150 pesos [S1].'), u('And rush?')], route: 'general' });
  assert.deepEqual(messages.slice(1).map((m) => m.content), ['First?', 'It is 150 pesos.', 'And rush?']);
});

test('old turns are dropped first and the latest turn is always kept', () => {
  const history = [u('a'.repeat(3000)), a('b'.repeat(3000)), u('c'.repeat(3000)), a('d'.repeat(3000)), u('latest question')];
  const { messages } = buildPrompt({ history, route: 'general', maxChars: 7000 });
  assert.equal(messages.at(-1).content, 'latest question');
  assert.ok(messages.reduce((n, m) => n + m.content.length, 0) <= 7000 + 50);
  assert.equal(messages[1].role, 'user'); // starts with the student
  assert.ok(messages.length < 6);
});

test('sources are shrunk, not the question, when the question is very long', () => {
  const longQuestion = 'Please explain this: ' + 'word '.repeat(700);
  const { messages, used } = buildPrompt({ history: [u(longQuestion)], route: 'university', hits: [hit('x '.repeat(500)), hit('y '.repeat(500))], maxChars: 6000 });
  assert.ok(messages.at(-1).content.endsWith(longQuestion));
  assert.ok(used.length >= 1);
  assert.ok(messages.reduce((n, m) => n + m.content.length, 0) < 6500);
});

test('a history that does not end with a student turn produces no model call content', () => {
  assert.deepEqual(buildPrompt({ history: [], route: 'general' }).used, []);
  assert.equal(buildPrompt({ history: [u('q'), a('answer')], route: 'general' }).messages.length, 1);
});
