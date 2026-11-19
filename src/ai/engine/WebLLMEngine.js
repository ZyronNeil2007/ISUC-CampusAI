/**
 * Thin wrapper around WebLLM. The library is imported lazily so the rest of the
 * app (and non-AI pages) never pays for it, and so this module can be unit-tested
 * with a fake engine.
 */
export class WebLLMEngine {
  constructor() {
    this.engine = null;
    this.worker = null;
    this.loadedModelId = null;
  }

  async load(modelId, onProgress) {
    const webllm = await import('@mlc-ai/web-llm');
    await this.unload();

    this.worker = new Worker(new URL('./worker.js', import.meta.url), { type: 'module' });
    try {
      this.engine = await webllm.CreateWebWorkerMLCEngine(this.worker, modelId, {
        initProgressCallback: (report) => onProgress?.(report),
      });
    } catch (err) {
      this.worker.terminate();
      this.worker = null;
      this.engine = null;
      throw err;
    }
    this.loadedModelId = modelId;
  }

  isLoaded() {
    return this.engine !== null;
  }

  /**
   * Stream a chat completion. Calls onToken with each text delta and resolves
   * with the full text and finish reason.
   */
  async generate(messages, { onToken, temperature = 0.3, maxTokens = 512 } = {}) {
    if (!this.engine) throw new Error('No model is loaded.');
    const stream = await this.engine.chat.completions.create({
      messages,
      stream: true,
      temperature,
      max_tokens: maxTokens,
    });
    let text = '';
    let finishReason = null;
    for await (const chunk of stream) {
      const choice = chunk.choices?.[0];
      const delta = choice?.delta?.content ?? '';
      if (delta) {
        text += delta;
        onToken?.(delta, text);
      }
      if (choice?.finish_reason) finishReason = choice.finish_reason;
    }
    return { text, finishReason };
  }

  interrupt() {
    this.engine?.interruptGenerate();
  }

  async resetChat() {
    await this.engine?.resetChat();
  }

  async unload() {
    try {
      await this.engine?.unload();
    } catch {
      /* ignore */
    }
    this.worker?.terminate();
    this.engine = null;
    this.worker = null;
    this.loadedModelId = null;
  }
}

export async function isModelCached(modelId) {
  const webllm = await import('@mlc-ai/web-llm');
  return webllm.hasModelInCache(modelId);
}

export async function deleteModelFromCache(modelId) {
  const webllm = await import('@mlc-ai/web-llm');
  await webllm.deleteModelAllInfoInCache(modelId);
}
