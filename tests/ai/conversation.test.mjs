import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ConversationManager } from '../../src/ai/conversation/ConversationManager.js';
import { buildMessages, buildSystemPrompt } from '../../src/ai/conversation/PromptManager.js';

function fakeEngine(reply = 'Hello there', finish = 'stop') {
  return {
    calls: [],
    interrupted: false,
    async generate(messages, { onToken }) {
      this.calls.push(messages);
      let full = '';
      for (const w of reply.split(' ')) {
        full += (full ? ' ' : '') + w;
        onToken(w, full);
      }
      return { text: full, finishReason: finish };
    },
    interrupt() { this.interrupted = true; },
  };
}

test('send adds user and streamed assistant message', async () => {
  const c = new ConversationManager(fakeEngine());
  await c.send('  hi  ');
  assert.equal(c.messages.length, 2);
  assert.equal(c.messages[0].content, 'hi');
  assert.equal(c.messages[1].content, 'Hello there');
  assert.equal(c.busy, false);
});

test('empty input and concurrent sends are ignored', async () => {
  const e = fakeEngine();
  const c = new ConversationManager(e);
  await c.send('   ');
  assert.equal(c.messages.length, 0);
  const p = c.send('one');
  await c.send('two'); // busy -> ignored
  await p;
  assert.equal(c.messages.filter((m) => m.role === 'user').length, 1);
});

test('regenerate replaces last assistant reply', async () => {
  const e = fakeEngine();
  const c = new ConversationManager(e);
  await c.send('hi');
  await c.regenerate();
  assert.equal(c.messages.length, 2);
  assert.equal(e.calls.length, 2);
  assert.equal(e.calls[1].at(-1).role, 'user');
});

test('hitting the length limit is flagged; clear resets the engine chat', async () => {
  let reset = 0;
  const e = fakeEngine('cut off', 'length');
  e.resetChat = async () => {
    reset++;
  };
  const c = new ConversationManager(e);
  await c.send('x');
  assert.equal(c.messages[1].truncated, true);
  assert.equal(c.messages[1].stopped, false);
  c.clear();
  assert.equal(c.messages.length, 0);
  assert.equal(reset, 1);
});

test('abort marks reply as stopped; errors are captured', async () => {
  const c = new ConversationManager(fakeEngine('partial', 'abort'));
  await c.send('x');
  assert.equal(c.messages[1].stopped, true);
  const bad = new ConversationManager({ generate: async () => { throw new Error('boom'); }, interrupt() {} });
  await bad.send('x');
  assert.equal(bad.messages[1].error, 'boom');
  assert.equal(bad.busy, false);
});

test('prompt: system first, starts with user, trims old turns, keeps latest', () => {
  const hist = [
    { role: 'user', content: 'a'.repeat(5000) },
    { role: 'assistant', content: 'b'.repeat(5000) },
    { role: 'user', content: 'latest' },
  ];
  const m = buildMessages(hist, { maxChars: 6000 });
  assert.equal(m[0].role, 'system');
  assert.equal(m[1].role, 'user');
  assert.equal(m.at(-1).content, 'latest');
  assert.ok(m.length <= 3);
});

test('system prompt forbids inventing ISU facts when no knowledge base', () => {
  assert.match(buildSystemPrompt(), /No verified ISU documents/);
  assert.doesNotMatch(buildSystemPrompt({ hasKnowledge: true }), /No verified ISU documents/);
});
