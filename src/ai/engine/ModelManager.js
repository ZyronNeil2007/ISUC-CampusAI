import { DEFAULT_MODEL_KEY, getModel, resolveModelId } from './catalog.js';
import { WebLLMEngine, isModelCached, deleteModelFromCache } from './WebLLMEngine.js';
import { checkCompatibility } from '../../services/CompatibilityService.js';

const STORAGE_KEY = 'campusai.model';
const BUSY = new Set(['downloading', 'loading']);

function readSelected() {
  try {
    const k = localStorage.getItem(STORAGE_KEY);
    return getModel(k) ? k : DEFAULT_MODEL_KEY;
  } catch {
    return DEFAULT_MODEL_KEY;
  }
}

async function requestPersistence() {
  try {
    if (navigator.storage?.persist && !(await navigator.storage.persisted())) {
      await navigator.storage.persist();
    }
  } catch {
    /* best effort: the browser may refuse or not support it */
  }
}

/** Turn engine errors into messages a student can act on. */
export function friendlyError(err) {
  const text = `${err?.name ?? ''} ${err?.message ?? err}`;
  if (/quota|no space|storage/i.test(text)) {
    return 'Not enough storage to save this model. Free up space or choose a smaller model.';
  }
  if (/DeviceLost|device (was )?lost|out of memory|\bOOM\b/i.test(text)) {
    return 'The GPU ran out of memory or was reset. Try a smaller model.';
  }
  if (/ShaderF16/i.test(text)) {
    return 'This device does not support the selected model format. Try a different model.';
  }
  if (/WebGPU|adapter/i.test(text)) {
    return 'This device could not start WebGPU. Try a smaller model or a different browser.';
  }
  if (/fetch|network|ERR_|Failed to load/i.test(text)) {
    return 'The download failed. Check your connection and try again; files that finished downloading are kept.';
  }
  return `Could not load the model: ${err?.message ?? err}`;
}

/**
 * Owns the single on-device engine for the whole app so it survives page navigation.
 * Status: idle | downloading | loading | ready | error
 * Dependencies are injectable so the state machine can be tested without a GPU.
 */
export class ModelManager {
  constructor({
    engine = new WebLLMEngine(),
    cache = { isCached: isModelCached, remove: deleteModelFromCache },
    detect = checkCompatibility,
  } = {}) {
    this.engine = engine;
    this.cache = cache;
    this.detect = detect;
    this.compat = null;
    this.listeners = new Set();
    this.state = { status: 'idle', modelKey: readSelected(), progress: 0, text: '', error: null };
  }

  subscribe(fn) {
    this.listeners.add(fn);
    fn(this.state);
    return () => this.listeners.delete(fn);
  }

  #set(patch) {
    this.state = { ...this.state, ...patch };
    this.listeners.forEach((fn) => fn(this.state));
  }

  async getCompat() {
    this.compat ??= await this.detect();
    return this.compat;
  }

  select(modelKey) {
    if (!getModel(modelKey) || BUSY.has(this.state.status) || modelKey === this.state.modelKey) return;
    try {
      localStorage.setItem(STORAGE_KEY, modelKey);
    } catch {
      /* selection applies for this session only */
    }
    this.engine.unload();
    this.#set({ modelKey, status: 'idle', progress: 0, text: '', error: null });
  }

  async isCached(modelKey) {
    try {
      const compat = await this.getCompat();
      return await this.cache.isCached(resolveModelId(getModel(modelKey), compat.shaderF16));
    } catch {
      return false;
    }
  }

  /** Download (if needed) and initialize the selected model. Resolves true when ready. */
  async load() {
    if (BUSY.has(this.state.status)) return false;
    // Claim the busy state before any await so a double click cannot start two loads.
    this.#set({ status: 'loading', progress: 0, text: 'Checking this device…', error: null });

    const { modelKey } = this.state;
    const compat = await this.getCompat();
    if (!compat.webgpu) {
      this.#set({ status: 'error', error: `On-device AI is unavailable on this device. ${compat.webgpuReason}` });
      return false;
    }

    const modelId = resolveModelId(getModel(modelKey), compat.shaderF16);
    const cached = await this.isCached(modelKey);
    if (!cached) await requestPersistence();
    this.#set({
      status: cached ? 'loading' : 'downloading',
      text: cached ? 'Loading model from this device…' : 'Starting download…',
    });

    try {
      await this.engine.load(modelId, (report) => {
        this.#set({ progress: report.progress ?? 0, text: report.text ?? '' });
      });
      this.#set({ status: 'ready', progress: 1, text: 'Model ready.' });
      return true;
    } catch (err) {
      this.#set({ status: 'error', error: friendlyError(err) });
      return false;
    }
  }

  /** Delete a model's downloaded files. Refused while that model is downloading or loading. */
  async remove(modelKey) {
    const isSelected = modelKey === this.state.modelKey;
    if (isSelected && BUSY.has(this.state.status)) return false;
    const compat = await this.getCompat();
    const modelId = resolveModelId(getModel(modelKey), compat.shaderF16);
    if (isSelected) {
      await this.engine.unload();
      this.#set({ status: 'idle', progress: 0, text: '', error: null });
    }
    await this.cache.remove(modelId);
    return true;
  }
}

export const modelManager = new ModelManager();
