import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  MODEL_CATALOG,
  DEFAULT_MODEL_KEY,
  getModel,
  resolveModelId,
  resolveVramMB,
} from '../../src/ai/engine/catalog.js';

test('every catalog model id exists in the installed WebLLM prebuilt list', async () => {
  const { prebuiltAppConfig } = await import('@mlc-ai/web-llm');
  const known = new Set(prebuiltAppConfig.model_list.map((m) => m.model_id));
  for (const m of MODEL_CATALOG) {
    for (const variant of ['f16', 'f32']) {
      assert.ok(known.has(m.ids[variant]), `${m.ids[variant]} is not in WebLLM's model list`);
    }
  }
});

test('catalog GPU memory figures match WebLLM within 1 MB', async () => {
  const { prebuiltAppConfig } = await import('@mlc-ai/web-llm');
  const byId = new Map(prebuiltAppConfig.model_list.map((m) => [m.model_id, m]));
  for (const m of MODEL_CATALOG) {
    for (const variant of ['f16', 'f32']) {
      const actual = byId.get(m.ids[variant]).vram_required_MB;
      assert.ok(Math.abs(actual - m.vramMB[variant]) <= 1, `${m.ids[variant]}: catalog ${m.vramMB[variant]} vs WebLLM ${actual}`);
    }
  }
});

test('catalog entries are complete and unique', () => {
  const keys = MODEL_CATALOG.map((m) => m.key);
  assert.equal(new Set(keys).size, keys.length);
  assert.ok(getModel(DEFAULT_MODEL_KEY));
  for (const m of MODEL_CATALOG) {
    assert.ok(m.name && m.note && m.license, `${m.key} is missing name, note or license`);
    assert.ok(m.approxDownloadMB > 0);
  }
  assert.equal(getModel('nope'), null);
});

test('smaller GPU-memory models are listed first (picker order)', () => {
  const sizes = MODEL_CATALOG.map((m) => m.approxDownloadMB);
  assert.deepEqual(sizes, [...sizes].sort((a, b) => a - b));
});

test('resolve helpers choose the build matching shader-f16 support', () => {
  const m = getModel('qwen2.5-1.5b');
  assert.equal(resolveModelId(m, true), 'Qwen2.5-1.5B-Instruct-q4f16_1-MLC');
  assert.equal(resolveModelId(m, false), 'Qwen2.5-1.5B-Instruct-q4f32_1-MLC');
  assert.equal(resolveVramMB(m, true), 1630);
  assert.equal(resolveVramMB(m, false), 1889);
});

test('licenses that differ from the Apache 2.0 default carry a note', () => {
  for (const m of MODEL_CATALOG) {
    if (m.license !== 'Apache 2.0') assert.ok(m.licenseNote, `${m.key} has a non-Apache license but no licenseNote`);
  }
});
