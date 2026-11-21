import { buildMessages } from './PromptManager.js';
import { buildPrompt } from './ContextManager.js';
import { finalizeAnswer, sourceCard } from '../generation/CitationManager.js';

let nextId = 1;
const newId = () => `m${Date.now().toString(36)}${nextId++}`;

/**
 * In-memory conversation for the current session. Persistence (IndexedDB) arrives in Phase 6.
 *
 * `engine` needs generate(messages, {onToken}) and interrupt().
 * `planner` (optional, see generation/AnswerPlanner.js) routes each question: answer from retrieved sources, answer as
 * general information, refuse without calling the model, or chat. Without a planner every question goes straight to
 * the model with the Phase 3 prompt.
 *
 * An assistant reply is {id, role, content, timestamp, route, label, sources, citations, warnings, stopped, truncated, error}.
 * `sources` are the passages the model was given (or the closest document for a refusal), `citations` the ids it cited.
 */
export class ConversationManager {
  constructor(engine, { planner = null } = {}) {
    this.engine = engine;
    this.planner = planner;
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
    const asked = this.messages.filter((m) => m.role === 'user');
    const question = asked.at(-1)?.content ?? '';
    const plan = this.planner ? this.planner.plan(question, asked.length > 1 ? asked.at(-2).content : null) : null;

    const reply = {
      id: newId(),
      role: 'assistant',
      content: '',
      timestamp: Date.now(),
      route: plan?.route ?? null,
      label: plan?.label ?? null,
      sources: [],
      citations: [],
      warnings: [],
      stopped: false,
      error: null,
    };

    // A university question with no verified source: a fixed answer, and the model is never called.
    if (plan?.route === 'refuse') {
      reply.content = plan.refusal.text;
      reply.sources = plan.refusal.sources.map((hit) => sourceCard(hit, null));
      this.messages.push(reply);
      this.#emit();
      return;
    }

    // Build the prompt before adding the empty reply.
    let prompt;
    let used = [];
    if (plan) {
      const route = plan.route === 'chat' || plan.packLoaded ? plan.route : null;
      ({ messages: prompt, used } = buildPrompt({ history: this.messages, route, hits: plan.hits, today: plan.today, contentLevel: plan.contentLevel }));
    } else {
      prompt = buildMessages(this.messages);
    }
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
      if (plan?.route === 'university' && used.length && text.trim()) {
        const checked = finalizeAnswer(text, used, { question });
        reply.content = checked.content;
        reply.sources = checked.sources;
        reply.citations = checked.citedIds;
        reply.warnings = checked.warnings;
      }
    } catch (err) {
      reply.error = String(err?.message ?? err);
    } finally {
      this.busy = false;
      this.#emit();
    }
  }
}
