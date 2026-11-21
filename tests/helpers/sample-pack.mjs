import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildPack } from '../../tools/lib/build-pack.mjs';
import { Retriever } from '../../src/ai/retrieval/Retriever.js';

const ROOT = path.resolve(fileURLToPath(new URL('../..', import.meta.url)));
export const SAMPLE_DIR = path.join(ROOT, 'knowledge/samples');

/** The date the sample corpus and its questions are written for (the summer advisory expired on 2026-06-30). */
export const TODAY = new Date(2026, 10, 20);

let built = null;
/** The fictional sample pack, built in memory once per test process. */
export async function samplePack() {
  built ??= await buildPack({ sourceDir: SAMPLE_DIR, contentLevel: 'sample', createdAt: '2026-11-20T00:00:00.000Z', write: false });
  if (!built.ok) throw new Error(`sample pack failed to build: ${built.errors.join('; ')}`);
  return built;
}

export async function sampleRetriever(options = {}) {
  const pack = await samplePack();
  return new Retriever(pack, { allowUnverified: true, now: () => TODAY, ...options });
}

/** A fetch() that serves a built pack from memory, for KnowledgePackService tests. Replace files to simulate faults. */
export function packFetch(pack, { overrides = {}, calls = [] } = {}) {
  const files = new Map(pack.files.map((f) => [f.path, f.content]));
  return async (url) => {
    calls.push(url);
    const rel = String(url).split('knowledge-pack/')[1]?.split('?')[0];
    const override = overrides[rel];
    if (override === null) return { ok: false, status: 404, arrayBuffer: async () => new ArrayBuffer(0) };
    const content = override ?? files.get(rel);
    if (content === undefined) return { ok: false, status: 404, arrayBuffer: async () => new ArrayBuffer(0) };
    const bytes = new TextEncoder().encode(content);
    return { ok: true, status: 200, arrayBuffer: async () => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) };
  };
}
