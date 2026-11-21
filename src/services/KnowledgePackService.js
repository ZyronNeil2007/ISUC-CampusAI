import { APP_VERSION } from '../app/version.js';
import { PACK_FILES, supportsAppVersion, validateManifest, validatePackContents } from '../ai/retrieval/packFormat.js';
import { Retriever } from '../ai/retrieval/Retriever.js';

/**
 * Loads the knowledge pack that was deployed next to the app (README 8.6 and 14.4).
 *
 *   manifest.json  ->  validate  ->  fetch each file  ->  check its SHA-256  ->  validate contents  ->  build the index
 *
 * What this does NOT do yet (Phase 6): install packs into IndexedDB, check for newer versions, verify a signature.
 * Until then the hashes catch accidental corruption and a half-updated deployment; they do not prove who published
 * the pack, and the status says so ("Integrity checked, not signed").
 *
 * Status: idle -> loading -> ready | none (no pack deployed) | error (a pack exists but cannot be trusted).
 * The app works without a pack; it then declines to answer university-specific questions.
 */

const defaultBase = () => `${typeof import.meta !== 'undefined' && import.meta.env?.BASE_URL ? import.meta.env.BASE_URL : './'}knowledge-pack/`;

/** Lowercase hex SHA-256 of an ArrayBuffer, using the platform's Web Crypto. */
export async function sha256Hex(buffer) {
  const subtle = globalThis.crypto?.subtle;
  if (!subtle) {
    throw new Error('This browser context cannot verify file integrity (Web Crypto needs https or localhost).');
  }
  const digest = await subtle.digest('SHA-256', buffer);
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('');
}

export class PackError extends Error {
  constructor(message, { kind = 'invalid' } = {}) {
    super(message);
    this.name = 'PackError';
    this.kind = kind; // 'none' = nothing deployed, anything else = a pack that cannot be trusted
  }
}

const decode = (buffer) => new TextDecoder('utf-8').decode(buffer);

/**
 * Fetch, verify and parse a pack. Throws PackError. Pure of UI state so it can be tested with a fake fetch.
 * @returns {Promise<{manifest: object, documents: object[], chunks: object[], lexicon: object}>}
 */
export async function fetchPack({ base, fetchImpl, appVersion = APP_VERSION }) {
  let res;
  try {
    res = await fetchImpl(`${base}manifest.json`, { cache: 'no-cache' });
  } catch {
    throw new PackError('The knowledge pack could not be loaded. You may be offline and the pack was never downloaded on this device.', { kind: 'unavailable' });
  }
  if (res.status === 404) throw new PackError('No knowledge pack is installed.', { kind: 'none' });
  if (!res.ok) throw new PackError(`The knowledge pack could not be loaded (HTTP ${res.status}).`, { kind: 'unavailable' });

  let manifest;
  try {
    manifest = JSON.parse(decode(await res.arrayBuffer()));
  } catch {
    // A dev or preview server answers unknown paths with the app's own index.html: that means "no pack here".
    throw new PackError('No knowledge pack is installed.', { kind: 'none' });
  }

  const manifestErrors = validateManifest(manifest);
  if (manifestErrors.length) throw new PackError(`The knowledge pack manifest is invalid: ${manifestErrors[0]}`);
  if (!supportsAppVersion(manifest, appVersion)) {
    throw new PackError(`This knowledge pack needs a different version of CampusAI (pack requires ${manifest.minAppVersion}${manifest.maxAppVersion ? ` to ${manifest.maxAppVersion}` : ' or newer'}, this is ${appVersion}).`);
  }

  const parsed = {};
  for (const [name, path] of Object.entries(PACK_FILES)) {
    const entry = manifest.files.find((f) => f.path === path);
    // The hash is part of the URL: each content version has its own cache entry, so a half-cached update can never
    // pair a new manifest with old files.
    const file = await fetchImpl(`${base}${path}?h=${entry.sha256.slice(0, 16)}`).catch(() => null);
    if (!file || !file.ok) {
      throw new PackError(`The knowledge pack is incomplete: ${path} could not be loaded.`, { kind: 'unavailable' });
    }
    const buffer = await file.arrayBuffer();
    if (buffer.byteLength !== entry.bytes || (await sha256Hex(buffer)) !== entry.sha256) {
      throw new PackError(`The knowledge pack failed its integrity check (${path}). It will not be used.`);
    }
    try {
      parsed[name] = JSON.parse(decode(buffer));
    } catch {
      throw new PackError(`The knowledge pack file ${path} is not valid JSON.`);
    }
  }

  const contentErrors = validatePackContents(manifest, parsed.documents, parsed.chunks, parsed.lexicon);
  if (contentErrors.length) throw new PackError(`The knowledge pack is inconsistent: ${contentErrors[0]}`);
  return { manifest, documents: parsed.documents, chunks: parsed.chunks, lexicon: parsed.lexicon };
}

export class KnowledgePackService {
  constructor({ base = defaultBase(), fetchImpl = (...args) => fetch(...args), appVersion = APP_VERSION, now = () => new Date() } = {}) {
    this.base = base.endsWith('/') ? base : `${base}/`;
    this.fetchImpl = fetchImpl;
    this.appVersion = appVersion;
    this.now = now;
    this.listeners = new Set();
    this.state = { status: 'idle', error: null, info: null };
    this.pack = null; // {manifest, retriever}
    this._loading = null;
  }

  subscribe(fn) {
    this.listeners.add(fn);
    fn(this.state);
    return () => this.listeners.delete(fn);
  }

  /** The loaded pack, or null: {manifest, retriever, lexicon}. */
  get current() {
    return this.pack;
  }

  #set(state) {
    this.state = state;
    this.listeners.forEach((fn) => fn(this.state));
  }

  /** Load once; concurrent callers share one load. Never throws: failures become the service state. */
  load() {
    this._loading ??= this.#load().finally(() => {
      this._loading = null;
    });
    return this._loading;
  }

  async #load() {
    this.#set({ status: 'loading', error: null, info: null });
    try {
      const { manifest, documents, chunks, lexicon } = await fetchPack({ base: this.base, fetchImpl: this.fetchImpl, appVersion: this.appVersion });
      const retriever = new Retriever({ documents, chunks, lexicon }, { allowUnverified: manifest.contentLevel !== 'official', now: this.now });
      this.pack = { manifest, retriever, lexicon };
      this.#set({ status: 'ready', error: null, info: describePack(manifest, retriever) });
    } catch (error) {
      this.pack = null;
      if (error instanceof PackError && error.kind === 'none') this.#set({ status: 'none', error: null, info: null });
      else this.#set({ status: 'error', error: String(error?.message ?? error), info: null });
    }
    return this.state;
  }
}

/** What the UI shows about a loaded pack. */
export function describePack(manifest, retriever) {
  const unusable = retriever.unusableDocuments();
  return {
    campus: manifest.campus,
    packVersion: manifest.packVersion,
    contentLevel: manifest.contentLevel,
    createdAt: manifest.createdAt,
    publishedAt: manifest.publishedAt ?? null,
    documentCount: manifest.documentCount,
    chunkCount: manifest.chunkCount,
    signed: Boolean(manifest.signature),
    integrity: manifest.verification?.integrity ?? 'sha256',
    starterQuestions: retriever.lexicon.starterQuestions ?? [],
    unusable: unusable.map(({ document, validity }) => ({ id: document.id, title: document.title, validity })),
  };
}
