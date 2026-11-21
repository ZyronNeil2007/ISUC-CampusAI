import test from 'node:test';
import assert from 'node:assert/strict';
import { KnowledgePackService, PackError, fetchPack, sha256Hex } from '../../src/services/KnowledgePackService.js';
import { packFetch, samplePack, TODAY } from '../helpers/sample-pack.mjs';

const BASE = '/knowledge-pack/';

async function expectPackError(promise, pattern, kind) {
  await assert.rejects(promise, (error) => {
    assert.ok(error instanceof PackError);
    assert.match(error.message, pattern);
    if (kind) assert.equal(error.kind, kind);
    return true;
  });
}

test('sha256Hex matches the known digest', async () => {
  const bytes = new TextEncoder().encode('abc');
  assert.equal(await sha256Hex(bytes.buffer), 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
});

test('a valid pack loads, every file is hash-checked, and the content matches the build', async () => {
  const pack = await samplePack();
  const calls = [];
  const loaded = await fetchPack({ base: BASE, fetchImpl: packFetch(pack, { calls }) });
  assert.equal(loaded.manifest.contentLevel, 'sample');
  assert.equal(loaded.documents.length, pack.documents.length);
  assert.equal(loaded.chunks.length, pack.chunks.length);
  assert.deepEqual(loaded.lexicon.starterQuestions, pack.lexicon.starterQuestions);
  // Files are requested by content hash, so a half-updated cache cannot mix versions.
  assert.ok(calls.slice(1).every((u) => /\?h=[0-9a-f]{16}$/.test(u)), calls.join(' '));
});

test('no pack deployed (404) is "none", not an error', async () => {
  await expectPackError(fetchPack({ base: BASE, fetchImpl: async () => ({ ok: false, status: 404 }) }), /No knowledge pack/, 'none');
});

test('a server that answers with its own index.html instead of a manifest is "none"', async () => {
  const html = async () => ({ ok: true, status: 200, arrayBuffer: async () => new TextEncoder().encode('<!doctype html><html></html>').buffer });
  await expectPackError(fetchPack({ base: BASE, fetchImpl: html }), /No knowledge pack/, 'none');
});

test('offline with nothing cached is unavailable, with a plain explanation', async () => {
  await expectPackError(fetchPack({ base: BASE, fetchImpl: async () => { throw new TypeError('Failed to fetch'); } }), /may be offline/, 'unavailable');
});

test('a file that was changed after the manifest was written is refused', async () => {
  const pack = await samplePack();
  const tampered = pack.files.find((f) => f.path === 'chunks/chunks.json').content.replace('Registrar', 'Regsitrar');
  await expectPackError(fetchPack({ base: BASE, fetchImpl: packFetch(pack, { overrides: { 'chunks/chunks.json': tampered } }) }), /failed its integrity check \(chunks\/chunks\.json\)/);
});

test('same length, different bytes is still caught by the hash', async () => {
  const pack = await samplePack();
  const original = pack.files.find((f) => f.path === 'metadata/lexicon.json').content;
  const swapped = original.replace('"tor"', '"tox"');
  assert.equal(swapped.length, original.length);
  await expectPackError(fetchPack({ base: BASE, fetchImpl: packFetch(pack, { overrides: { 'metadata/lexicon.json': swapped } }) }), /integrity check/);
});

test('a missing pack file means an incomplete pack', async () => {
  const pack = await samplePack();
  await expectPackError(fetchPack({ base: BASE, fetchImpl: packFetch(pack, { overrides: { 'metadata/documents.json': null } }) }), /incomplete: metadata\/documents\.json/, 'unavailable');
});

test('a pack for a newer app is refused with the versions in the message', async () => {
  const pack = await samplePack();
  await expectPackError(fetchPack({ base: BASE, fetchImpl: packFetch(pack), appVersion: '0.0.1' }), /needs a different version of CampusAI.*0\.1\.0/);
});

test('an invalid manifest is refused', async () => {
  const pack = await samplePack();
  const manifest = JSON.parse(pack.files.find((f) => f.path === 'manifest.json').content);
  manifest.format = 99;
  await expectPackError(fetchPack({ base: BASE, fetchImpl: packFetch(pack, { overrides: { 'manifest.json': JSON.stringify(manifest) } }) }), /manifest is invalid: unsupported pack format/);
});

test('a pack whose parts disagree is refused even if every hash is right', async () => {
  const pack = await samplePack();
  const manifest = JSON.parse(pack.files.find((f) => f.path === 'manifest.json').content);
  manifest.chunkCount += 1;
  await expectPackError(fetchPack({ base: BASE, fetchImpl: packFetch(pack, { overrides: { 'manifest.json': JSON.stringify(manifest) } }) }), /inconsistent: manifest says/);
});

test('the service reports loading then ready, builds a working retriever, and describes the pack honestly', async () => {
  const pack = await samplePack();
  const service = new KnowledgePackService({ base: BASE, fetchImpl: packFetch(pack), now: () => TODAY });
  const seen = [];
  service.subscribe((s) => seen.push(s.status));
  assert.equal(service.current, null);
  await service.load();
  assert.deepEqual(seen, ['idle', 'loading', 'ready']);
  assert.equal(service.state.info.contentLevel, 'sample');
  assert.equal(service.state.info.signed, false);
  assert.equal(service.state.info.integrity, 'sha256');
  assert.equal(service.state.info.documentCount, pack.documents.length);
  assert.deepEqual(service.state.info.unusable.map((u) => `${u.id}:${u.validity}`).sort(), ['sample-summer-2026-advisory:expired', 'sample-tuition-and-fees-2025:superseded']);
  assert.equal(service.current.retriever.retrieve('What scholarships are available?').strong, true);
});

test('concurrent load() calls share one load', async () => {
  const pack = await samplePack();
  const calls = [];
  const service = new KnowledgePackService({ base: BASE, fetchImpl: packFetch(pack, { calls }) });
  await Promise.all([service.load(), service.load(), service.load()]);
  assert.equal(calls.filter((u) => u.endsWith('manifest.json')).length, 1);
});

test('the service never throws: a bad pack becomes an error state and no retriever', async () => {
  const pack = await samplePack();
  const bad = new KnowledgePackService({ base: BASE, fetchImpl: packFetch(pack, { overrides: { 'chunks/chunks.json': '[]' } }) });
  await bad.load();
  assert.equal(bad.state.status, 'error');
  assert.match(bad.state.error, /integrity check/);
  assert.equal(bad.current, null);

  const none = new KnowledgePackService({ base: BASE, fetchImpl: async () => ({ ok: false, status: 404 }) });
  await none.load();
  assert.equal(none.state.status, 'none');
  assert.equal(none.state.error, null);
});

test('an official pack does not use unverified documents', async () => {
  const pack = await samplePack();
  const manifest = JSON.parse(pack.files.find((f) => f.path === 'manifest.json').content);
  manifest.contentLevel = 'official';
  const service = new KnowledgePackService({ base: BASE, fetchImpl: packFetch(pack, { overrides: { 'manifest.json': JSON.stringify(manifest) } }), now: () => TODAY });
  await service.load();
  assert.equal(service.state.status, 'ready');
  assert.equal(service.current.retriever.allowUnverified, false);
  assert.equal(service.current.retriever.retrieve('What scholarships are available?').strong, false);
});

/* ---------- campus map ---------- */

test('the map is loaded with the pack and hash-checked like every other file', async () => {
  const pack = await samplePack();
  const loaded = await fetchPack({ base: BASE, fetchImpl: packFetch(pack) });
  assert.equal(loaded.map.buildings.length, 5);

  const tampered = pack.files.find((f) => f.path === 'metadata/map.json').content.replace('Library Building', 'Library Buildinx');
  await expectPackError(fetchPack({ base: BASE, fetchImpl: packFetch(pack, { overrides: { 'metadata/map.json': tampered } }) }), /integrity check \(metadata\/map\.json\)/);
});

test('a pack that lists a map but does not serve it is incomplete', async () => {
  const pack = await samplePack();
  await expectPackError(fetchPack({ base: BASE, fetchImpl: packFetch(pack, { overrides: { 'metadata/map.json': null } }) }), /incomplete/, 'unavailable');
});

test('the service exposes the map, and documents and chunks, for the campus pages', async () => {
  const pack = await samplePack();
  const service = new KnowledgePackService({ base: BASE, fetchImpl: packFetch(pack), now: () => TODAY });
  await service.load();
  assert.equal(service.current.map.title, 'Sample University campus (fictional schematic)');
  assert.equal(service.current.documents.length, pack.documents.length);
  assert.equal(service.current.chunks.length, pack.chunks.length);
});
