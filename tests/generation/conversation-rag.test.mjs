import test from 'node:test';
import assert from 'node:assert/strict';
import { ConversationManager } from '../../src/ai/conversation/ConversationManager.js';
import { AnswerPlanner } from '../../src/ai/generation/AnswerPlanner.js';
import { GENERAL_LABEL } from '../../src/ai/retrieval/routing.js';
import { samplePack, sampleRetriever } from '../helpers/sample-pack.mjs';

function fakeEngine(reply = 'ok') {
  return {
    calls: [],
    async generate(messages, { onToken }) {
      this.calls.push(messages);
      const text = typeof reply === 'function' ? reply(messages) : reply;
      onToken(text, text);
      return { text, finishReason: 'stop' };
    },
    interrupt() {},
  };
}

async function setup(reply) {
  const retriever = await sampleRetriever();
  const pack = await samplePack();
  const engine = fakeEngine(reply);
  const chat = new ConversationManager(engine, { planner: new AnswerPlanner(() => ({ retriever, manifest: pack.manifest })) });
  return { chat, engine };
}

test('a covered question: the model gets numbered sources, and the reply carries them with citation flags', async () => {
  const { chat, engine } = await setup('A Transcript of Records costs 150 pesos per copy [S1].');
  await chat.send('How much is a Transcript of Records?');
  assert.equal(engine.calls.length, 1);
  const prompt = engine.calls[0];
  assert.match(prompt[0].content, /Answer from the numbered SOURCES/);
  assert.match(prompt.at(-1).content, /\[S1\] .*›.*\n/);
  assert.match(prompt.at(-1).content, /Question: How much is a Transcript of Records\?$/);

  const reply = chat.messages.at(-1);
  assert.equal(reply.route, 'university');
  assert.equal(reply.label, null);
  assert.ok(reply.sources.length >= 1);
  assert.deepEqual(reply.citations, ['S1']);
  assert.equal(reply.sources[0].cited, true);
  assert.equal(reply.sources[0].documentId, 'sample-document-requests');
  assert.deepEqual(reply.warnings, []);
});

test('a figure the sources do not contain is flagged on the reply', async () => {
  const { chat } = await setup('A Transcript of Records costs 999 pesos per copy [S1].');
  await chat.send('How much is a Transcript of Records?');
  assert.ok(chat.messages.at(-1).warnings.includes('unsupported-number'));
});

test('an answer without citations still lists the sources that were consulted', async () => {
  const { chat } = await setup('A Transcript of Records costs 150 pesos per copy.');
  await chat.send('How much is a Transcript of Records?');
  const reply = chat.messages.at(-1);
  assert.deepEqual(reply.warnings, ['no-citation']);
  assert.ok(reply.sources.length >= 1);
  assert.ok(reply.sources.every((s) => s.cited === false));
});

test('a university question with no verified source is refused WITHOUT calling the model', async () => {
  const { chat, engine } = await setup('I would have made something up');
  await chat.send('Is there a dormitory?');
  assert.equal(engine.calls.length, 0);
  const reply = chat.messages.at(-1);
  assert.equal(reply.route, 'refuse');
  assert.match(reply.content, /could not verify that/);
  assert.doesNotMatch(reply.content, /made something up/);
  assert.equal(chat.busy, false);
});

test('an expired document is named in the refusal and the model is not called', async () => {
  const { chat, engine } = await setup('nope');
  await chat.send('How many units can I take in the summer?');
  assert.equal(engine.calls.length, 0);
  const reply = chat.messages.at(-1);
  assert.match(reply.content, /expired on 2026-06-30/);
  assert.equal(reply.sources[0].documentId, 'sample-office-directory'); // the registrar's directory entry
});

test('a general question is answered as general information, with no sources and different rules', async () => {
  const { chat, engine } = await setup('OOP organises code into objects.');
  await chat.send('What is object-oriented programming?');
  const reply = chat.messages.at(-1);
  assert.equal(reply.route, 'general');
  assert.equal(reply.label, GENERAL_LABEL);
  assert.deepEqual(reply.sources, []);
  assert.match(engine.calls[0][0].content, /not matched to any university document/);
  assert.doesNotMatch(engine.calls[0].at(-1).content, /SOURCES/);
});

test('greetings get a chat prompt and no label', async () => {
  const { chat, engine } = await setup('Hello! Ask me about the campus.');
  await chat.send('Hello');
  assert.equal(chat.messages.at(-1).route, 'chat');
  assert.equal(chat.messages.at(-1).label, null);
  assert.match(engine.calls[0][0].content, /greeting/);
});

test('a follow-up is retrieved with the previous question', async () => {
  const { chat, engine } = await setup('It costs 150 pesos [S1].');
  await chat.send('How do I request a Transcript of Records?');
  await chat.send('How much does it cost?');
  assert.equal(engine.calls.length, 2);
  assert.equal(chat.messages.at(-1).sources[0].documentId, 'sample-document-requests');
  // The question the model sees is the student's own words; the previous turns are in the history.
  assert.match(engine.calls[1].at(-1).content, /Question: How much does it cost\?$/);
  assert.equal(engine.calls[1][1].content, 'How do I request a Transcript of Records?');
});

test('regenerate plans again and replaces the reply', async () => {
  let n = 0;
  const { chat, engine } = await setup(() => `Answer ${++n} [S1].`);
  await chat.send('How much is a Transcript of Records?');
  await chat.regenerate();
  assert.equal(engine.calls.length, 2);
  assert.equal(chat.messages.length, 2);
  assert.match(chat.messages[1].content, /Answer 2/);
  assert.deepEqual(chat.messages[1].citations, ['S1']);
});

test('regenerating a refusal stays a refusal', async () => {
  const { chat, engine } = await setup('x');
  await chat.send('Is there a dormitory?');
  await chat.regenerate();
  assert.equal(engine.calls.length, 0);
  assert.equal(chat.messages.length, 2);
  assert.equal(chat.messages[1].route, 'refuse');
});

test('with no pack loaded, ISU questions are treated as unverifiable (Phase 3 prompt) and labelled general', async () => {
  const engine = fakeEngine('I cannot verify that.');
  const chat = new ConversationManager(engine, { planner: new AnswerPlanner(() => null) });
  await chat.send('How do I enroll?');
  assert.match(engine.calls[0][0].content, /No verified ISU documents/);
  assert.equal(chat.messages.at(-1).route, 'general');
  assert.equal(chat.messages.at(-1).label, GENERAL_LABEL);
  assert.deepEqual(chat.messages.at(-1).sources, []);
});

test('an engine error leaves no sources or warnings and the chat usable', async () => {
  const retriever = await sampleRetriever();
  const pack = await samplePack();
  const chat = new ConversationManager({ generate: async () => { throw new Error('GPU lost'); }, interrupt() {} }, { planner: new AnswerPlanner(() => ({ retriever, manifest: pack.manifest })) });
  await chat.send('How much is a Transcript of Records?');
  const reply = chat.messages.at(-1);
  assert.equal(reply.error, 'GPU lost');
  assert.deepEqual(reply.sources, []);
  assert.equal(chat.busy, false);
});

test('messages stay JSON-serialisable (Phase 6 will persist them)', async () => {
  const { chat } = await setup('It costs 150 pesos [S1].');
  await chat.send('How much is a Transcript of Records?');
  assert.doesNotThrow(() => JSON.stringify(chat.messages));
});
