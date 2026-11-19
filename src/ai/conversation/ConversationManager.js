import { buildMessages } from './PromptManager.js';

let nextId = 1;
const newId = () => `m${Date.now().toString(36)}${nextId++}`;

/**
 * In-memory conversation for the current session. Persistence (IndexedDB) arrives in Phase 6.
 * `engine` needs generate(messages, {onToken}) and interrupt().
 */
export class ConversationManager {
  constructor(engine) {
    this.engine = engine;
    this.messages = [];
    this.busy = false;
    this.listeners = new Set();
  }

  subscribe(fn) {
    this.listeners.add(fn);
    fn(this.messages, this.busy);
    return () => this.listeners.delete(fn);
  }

  #emit() {
    this.listeners.forEach((fn) => fn(this.messages, this.busy));
  }

  async send(text) {
    const content = text.trim();
    if (!content || this.busy) return;
    this.messages.push({ id: newId(), role: 'user', content, timestamp: Date.now(), citations: [] });
    await this.#respond();
  }

  /** Drop the last assistant reply and generate it again. */
  async regenerate() {
    if (this.busy) return;
    while (this.messages.length && this.messages[this.messages.length - 1].role === 'assistant') {
      this.messages.pop();
    }
    if (!this.messages.length) return;
    await this.#respond();
  }

  stop() {
    if (this.busy) this.engine.interrupt();
  }

  clear() {
    if (this.busy) return;
    this.messages = [];
    // Drop the engine's cached conversation state too (best effort).
    Promise.resolve(this.engine.resetChat?.()).catch(() => {});
    this.#emit();
  }

  async #respond() {
    const reply = { id: newId(), role: 'assistant', content: '', timestamp: Date.now(), citations: [], stopped: false, error: null };
    // Build the prompt before adding the empty reply.
    const prompt = buildMessages(this.messages);
    this.messages.push(reply);
    this.busy = true;
    this.#emit();

    try {
      const { text, finishReason } = await this.engine.generate(prompt, {
        onToken: (_delta, full) => {
          reply.content = full;
          this.#emit();
        },
      });
      reply.content = text;
      reply.stopped = finishReason === 'abort';
      reply.truncated = finishReason === 'length';
    } catch (err) {
      reply.error = String(err?.message ?? err);
    } finally {
      this.busy = false;
      this.#emit();
    }
  }
}
