import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ModelManager, friendlyError } from '../../src/ai/engine/ModelManager.js';

function make({ webgpu = true, shaderF16 = true, cached = false, loadImpl } = {}) {
  const calls = { load: [], unload: 0, removed: [] };
  const engine = {
    loadedModelId: null,
    async load(id, onProgress) {
      calls.load.push(id);
      onProgress({ progress: 0.5, text: 'half way' });
      if (loadImpl) await loadImpl(calls.load.length);
      this.loadedModelId = id;
    },
    async unload() {
      calls.unload++;
      this.loadedModelId = null;
    },
  };
  const cache = {
    isCached: async () => cached,
    remove: async (id) => {
      calls.removed.push(id);
    },
  };
  const detect = async () => ({ webgpu, shaderF16, webgpuReason: webgpu ? '' : 'No compatible GPU adapter was found.' });
  const mgr = new ModelManager({ engine, cache, detect });
  const seen = [];
  mgr.subscribe((s) => seen.push(s.status));
  return { mgr, calls, seen, engine };
}

test('downloads then becomes ready, using the f16 build when supported', async () => {
  const { mgr, calls, seen } = make();
  assert.equal(await mgr.load(), true);
  assert.equal(mgr.state.status, 'ready');
  assert.equal(mgr.state.progress, 1);
  assert.deepEqual(calls.load, ['Llama-3.2-1B-Instruct-q4f16_1-MLC']);
  assert.ok(seen.includes('downloading'));
  assert.equal(seen.at(-1), 'ready');
});

test('falls back to the f32 build without shader-f16', async () => {
  const { mgr, calls } = make({ shaderF16: false });
  await mgr.load();
  assert.deepEqual(calls.load, ['Llama-3.2-1B-Instruct-q4f32_1-MLC']);
});

test('an already downloaded model loads without a download state', async () => {
  const { mgr, seen } = make({ cached: true });
  await mgr.load();
  assert.ok(!seen.includes('downloading'));
  assert.equal(mgr.state.status, 'ready');
});

test('no WebGPU: reports an error and never touches the engine or a cloud fallback', async () => {
  const { mgr, calls } = make({ webgpu: false });
  assert.equal(await mgr.load(), false);
  assert.equal(mgr.state.status, 'error');
  assert.match(mgr.state.error, /No compatible GPU adapter/);
  assert.equal(calls.load.length, 0);
});

test('a failed load surfaces a friendly error and can be retried', async () => {
  const { mgr } = make({
    loadImpl: async (n) => {
      if (n === 1) throw new Error('Failed to fetch');
    },
  });
  assert.equal(await mgr.load(), false);
  assert.equal(mgr.state.status, 'error');
  assert.match(mgr.state.error, /download failed/i);
  assert.equal(await mgr.load(), true);
  assert.equal(mgr.state.status, 'ready');
  assert.equal(mgr.state.error, null);
});

test('a second load while one is running is ignored', async () => {
  let release;
  const gate = new Promise((r) => (release = r));
  const { mgr, calls } = make({ loadImpl: () => gate });
  const first = mgr.load();
  assert.equal(await mgr.load(), false);
  release();
  assert.equal(await first, true);
  assert.equal(calls.load.length, 1);
});

test('select is ignored while busy and resets state otherwise', async () => {
  let release;
  const gate = new Promise((r) => (release = r));
  const { mgr, calls } = make({ loadImpl: () => gate });
  const p = mgr.load();
  mgr.select('qwen2.5-3b');
  assert.notEqual(mgr.state.modelKey, 'qwen2.5-3b');
  release();
  await p;
  mgr.select('qwen2.5-3b');
  assert.equal(mgr.state.modelKey, 'qwen2.5-3b');
  assert.equal(mgr.state.status, 'idle');
  assert.equal(calls.unload, 1);
  mgr.select('not-a-model');
  assert.equal(mgr.state.modelKey, 'qwen2.5-3b');
});

test('remove unloads the selected model and deletes its files; refused while busy', async () => {
  let release;
  const gate = new Promise((r) => (release = r));
  const { mgr, calls } = make({ loadImpl: () => gate });
  const p = mgr.load();
  assert.equal(await mgr.remove(mgr.state.modelKey), false);
  assert.equal(calls.removed.length, 0);
  release();
  await p;
  assert.equal(await mgr.remove(mgr.state.modelKey), true);
  assert.equal(mgr.state.status, 'idle');
  assert.deepEqual(calls.removed, ['Llama-3.2-1B-Instruct-q4f16_1-MLC']);
});

test('friendlyError maps common failures', () => {
  assert.match(friendlyError(new Error('QuotaExceededError: disk full')), /storage/i);
  assert.match(friendlyError(Object.assign(new Error('x'), { name: 'DeviceLostError' })), /GPU/);
  assert.match(friendlyError(new Error('NetworkError when attempting to fetch')), /download failed/i);
  assert.match(friendlyError(new Error('weird')), /Could not load the model: weird/);
});
