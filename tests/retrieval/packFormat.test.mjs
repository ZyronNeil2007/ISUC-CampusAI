import test from 'node:test';
import assert from 'node:assert/strict';
import {
  PACK_FORMAT,
  PACK_FILES,
  compareVersions,
  documentValidity,
  isIsoDate,
  isSafeRelativePath,
  parseVersion,
  supportsAppVersion,
  toLocalIsoDate,
  validateDocumentMeta,
  validateManifest,
  validatePackContents,
} from '../../src/ai/retrieval/packFormat.js';

const goodDoc = () => ({
  id: 'sample-enrollment',
  title: 'Sample Enrollment Guide',
  category: 'enrollment',
  office: 'Sample Registrar',
  version: '1.0',
  publishedAt: '2026-01-15',
  verificationStatus: 'verified',
  lastVerifiedAt: '2026-02-01',
  source: 'Sample University Registrar memo 2026-001',
});

const sha = 'a'.repeat(64);
const goodManifest = () => ({
  format: PACK_FORMAT,
  packVersion: '0.1.0',
  minAppVersion: '0.1.0',
  campus: 'Sample University',
  contentLevel: 'sample',
  createdAt: '2026-03-01T00:00:00.000Z',
  publishedAt: null,
  documentCount: 1,
  chunkCount: 1,
  files: Object.values(PACK_FILES).map((path) => ({ path, sha256: sha, bytes: 10 })),
});

/* ---------- dates, versions, paths ---------- */

test('isIsoDate accepts real calendar dates only', () => {
  assert.ok(isIsoDate('2026-02-28'));
  assert.ok(isIsoDate('2028-02-29')); // leap year
  assert.ok(!isIsoDate('2026-02-29'));
  assert.ok(!isIsoDate('2026-02-30'));
  assert.ok(!isIsoDate('2026-13-01'));
  assert.ok(!isIsoDate('2026-2-3'));
  assert.ok(!isIsoDate('26-02-03'));
  assert.ok(!isIsoDate('2026-02-03T00:00:00Z'));
  assert.ok(!isIsoDate(20260203));
  assert.ok(!isIsoDate(null));
});

test('toLocalIsoDate formats the device-local calendar date', () => {
  assert.equal(toLocalIsoDate(new Date(2026, 0, 5, 23, 59)), '2026-01-05');
  assert.equal(toLocalIsoDate(new Date(2026, 11, 31, 0, 0)), '2026-12-31');
  assert.match(toLocalIsoDate(), /^\d{4}-\d{2}-\d{2}$/);
});

test('versions parse and compare numerically, not as strings', () => {
  assert.deepEqual(parseVersion('1.2.3'), [1, 2, 3]);
  assert.deepEqual(parseVersion('1.2.3-beta.1'), [1, 2, 3]);
  assert.equal(parseVersion('1.2'), null);
  assert.equal(parseVersion('v1.2.3'), null);
  assert.equal(compareVersions('1.10.0', '1.9.0'), 1);
  assert.equal(compareVersions('1.0.0', '1.0.0'), 0);
  assert.equal(compareVersions('0.9.9', '1.0.0'), -1);
  assert.throws(() => compareVersions('1.0', '1.0.0'), /Invalid version/);
});

test('supportsAppVersion honours minAppVersion and optional maxAppVersion', () => {
  assert.ok(supportsAppVersion({ minAppVersion: '0.1.0' }, '0.1.0'));
  assert.ok(supportsAppVersion({ minAppVersion: '0.1.0' }, '1.0.0'));
  assert.ok(!supportsAppVersion({ minAppVersion: '0.2.0' }, '0.1.9'));
  assert.ok(!supportsAppVersion({ minAppVersion: '0.1.0', maxAppVersion: '0.9.0' }, '1.0.0'));
  assert.ok(supportsAppVersion({ minAppVersion: '0.1.0', maxAppVersion: '0.9.0' }, '0.9.0'));
});

test('isSafeRelativePath rejects anything that could leave the pack', () => {
  for (const ok of ['chunks/chunks.json', 'metadata/documents.json', 'a.json']) assert.ok(isSafeRelativePath(ok), ok);
  for (const bad of ['', '/etc/passwd', '../x', 'a/../b', 'a//b', './a', 'a\\b', 'http://x.test/a', 'file:///a', 'C:/a', null, 3]) {
    assert.ok(!isSafeRelativePath(bad), String(bad));
  }
});

/* ---------- document metadata ---------- */

test('a complete verified document passes with no errors', () => {
  const { errors, warnings } = validateDocumentMeta(goodDoc());
  assert.deepEqual(errors, []);
  assert.deepEqual(warnings, []);
});

test('missing required fields are each reported', () => {
  const { errors } = validateDocumentMeta({});
  for (const f of ['id', 'title', 'category', 'office', 'version', 'publishedAt', 'verificationStatus', 'source']) {
    assert.ok(errors.some((e) => e.includes(`"${f}"`)), `no error for ${f}`);
  }
});

test('non-objects are rejected', () => {
  for (const bad of [null, undefined, 'text', [], 3]) {
    assert.equal(validateDocumentMeta(bad).errors.length, 1);
  }
});

test('TODO placeholders block the build (README 8.9)', () => {
  const doc = { ...goodDoc(), office: 'TODO', version: 'TODO: ask registrar' };
  const { errors } = validateDocumentMeta(doc);
  assert.ok(errors.some((e) => e.includes('"office"') && /TODO/.test(e)));
  assert.ok(errors.some((e) => e.includes('"version"') && /TODO/.test(e)));
});

test('category, status, id, version and date formats are checked', () => {
  const bad = {
    ...goodDoc(),
    id: 'Bad ID!',
    category: 'sports',
    verificationStatus: 'approved',
    version: 1.0,
    publishedAt: '15/01/2026',
    effectiveAt: '2026-02-30',
  };
  const { errors } = validateDocumentMeta(bad);
  assert.ok(errors.some((e) => e.startsWith('id must be')));
  assert.ok(errors.some((e) => e.includes('category "sports"')));
  assert.ok(errors.some((e) => e.includes('verificationStatus "approved"')));
  assert.ok(errors.some((e) => e.includes('version must be a quoted string')));
  assert.ok(errors.some((e) => e.includes('publishedAt must be a calendar date')));
  assert.ok(errors.some((e) => e.includes('effectiveAt must be a calendar date')));
});

test('a verified document needs lastVerifiedAt', () => {
  const doc = goodDoc();
  delete doc.lastVerifiedAt;
  assert.ok(validateDocumentMeta(doc).errors.some((e) => e.includes('lastVerifiedAt')));
  // Not required for drafts.
  assert.deepEqual(validateDocumentMeta({ ...doc, verificationStatus: 'draft' }).errors, []);
});

test('reviewRequired: true blocks the verified status (extracted text must be checked first)', () => {
  const { errors } = validateDocumentMeta({ ...goodDoc(), reviewRequired: true });
  assert.ok(errors.some((e) => e.includes('reviewRequired')));
  assert.deepEqual(validateDocumentMeta({ ...goodDoc(), reviewRequired: false }).errors, []);
  assert.deepEqual(validateDocumentMeta({ ...goodDoc(), verificationStatus: 'draft', reviewRequired: true }).errors, []);
});

test('sample documents can never be marked verified', () => {
  const { errors } = validateDocumentMeta({ ...goodDoc(), sample: true });
  assert.ok(errors.some((e) => e.includes('sample documents must not be marked verified')));
  assert.deepEqual(validateDocumentMeta({ ...goodDoc(), sample: true, verificationStatus: 'draft' }).errors, []);
});

test('expiresAt must not precede effectiveAt', () => {
  const { errors } = validateDocumentMeta({ ...goodDoc(), effectiveAt: '2026-06-01', expiresAt: '2026-05-31' });
  assert.ok(errors.some((e) => e.includes('expiresAt is earlier than effectiveAt')));
});

test('tags must be a list of strings', () => {
  assert.deepEqual(validateDocumentMeta({ ...goodDoc(), tags: ['fees', 'tuition'] }).errors, []);
  assert.ok(validateDocumentMeta({ ...goodDoc(), tags: 'fees' }).errors.some((e) => e.includes('tags must be a list')));
  assert.ok(validateDocumentMeta({ ...goodDoc(), tags: ['ok', 3] }).errors.some((e) => e.includes('tags must be a list')));
});

test('supersededBy must be a valid id, not the document itself, and warns when the status is not superseded', () => {
  const superseded = { ...goodDoc(), verificationStatus: 'superseded', supersededBy: 'sample-enrollment-v2' };
  assert.deepEqual(validateDocumentMeta(superseded), { errors: [], warnings: [] });
  assert.ok(validateDocumentMeta({ ...superseded, supersededBy: 'Not An Id' }).errors.some((e) => e.startsWith('supersededBy must be')));
  assert.ok(validateDocumentMeta({ ...superseded, supersededBy: 'sample-enrollment' }).errors.some((e) => e.includes('cannot supersede itself')));
  const warned = validateDocumentMeta({ ...goodDoc(), supersededBy: 'sample-enrollment-v2' });
  assert.ok(warned.warnings.some((w) => w.includes('supersededBy is only used')));
});

test('unknown fields produce a warning, not an error', () => {
  const { errors, warnings } = validateDocumentMeta({ ...goodDoc(), colour: 'blue' });
  assert.deepEqual(errors, []);
  assert.deepEqual(warnings, ['unknown field "colour" is ignored']);
});

/* ---------- validity ---------- */

test('documentValidity: statuses, effective dates and expiry', () => {
  const today = '2026-06-15';
  const v = (meta, opts) => documentValidity({ verificationStatus: 'verified', ...meta }, today, opts);
  assert.equal(v({}), 'current');
  assert.equal(v({ verificationStatus: 'superseded' }), 'superseded');
  assert.equal(v({ verificationStatus: 'archived' }), 'archived');
  assert.equal(v({ verificationStatus: 'expired' }), 'expired');
  assert.equal(v({ effectiveAt: '2026-06-16' }), 'not-yet-effective');
  assert.equal(v({ effectiveAt: '2026-06-15' }), 'current');
  assert.equal(v({ expiresAt: '2026-06-14' }), 'expired');
  assert.equal(v({ expiresAt: '2026-06-15' }), 'current'); // the expiry date itself is still valid
});

test('documentValidity: unverified documents are unusable unless the pack allows them', () => {
  for (const status of ['draft', 'pending_verification']) {
    assert.equal(documentValidity({ verificationStatus: status }, '2026-06-15'), 'unverified');
    assert.equal(documentValidity({ verificationStatus: status }, '2026-06-15', { allowUnverified: true }), 'current');
  }
  // Superseded and archived documents stay unusable even in permissive packs.
  assert.equal(documentValidity({ verificationStatus: 'superseded' }, '2026-06-15', { allowUnverified: true }), 'superseded');
  assert.equal(
    documentValidity({ verificationStatus: 'draft', expiresAt: '2025-01-01' }, '2026-06-15', { allowUnverified: true }),
    'expired'
  );
});

/* ---------- manifest ---------- */

test('a complete manifest is valid', () => {
  assert.deepEqual(validateManifest(goodManifest()), []);
});

test('manifest problems are each reported', () => {
  assert.deepEqual(validateManifest(null), ['manifest is not an object']);
  const bad = {
    ...goodManifest(),
    format: 2,
    packVersion: '1.0',
    minAppVersion: 'x',
    campus: '',
    contentLevel: 'real',
    createdAt: 'yesterday',
    documentCount: -1,
    chunkCount: 1.5,
    files: [{ path: '../evil.json', sha256: 'xyz', bytes: -3 }],
  };
  const errors = validateManifest(bad).join('\n');
  for (const needle of [
    'unsupported pack format',
    'packVersion',
    'minAppVersion',
    'campus',
    'contentLevel',
    'createdAt',
    'documentCount',
    'chunkCount',
    'files[0].path',
    'files[0].sha256',
    'files[0].bytes',
    'files must include metadata/documents.json',
    'files must include chunks/chunks.json',
    'files must include metadata/lexicon.json',
  ]) {
    assert.ok(errors.includes(needle), `expected an error mentioning "${needle}"`);
  }
});

test('manifest must list every required pack file', () => {
  const m = goodManifest();
  m.files = m.files.filter((f) => f.path !== PACK_FILES.lexicon);
  assert.deepEqual(validateManifest(m), ['files must include metadata/lexicon.json']);
});

/* ---------- pack contents ---------- */

const goodChunk = () => ({ id: 'sample-enrollment:001', documentId: 'sample-enrollment', section: 'A', page: null, text: 'Some text.' });
const goodLexicon = () => ({ aliases: [], campusTerms: [], starterQuestions: [] });

test('consistent pack contents pass', () => {
  assert.deepEqual(validatePackContents(goodManifest(), [goodDoc()], [goodChunk()], goodLexicon()), []);
});

test('pack contents: count mismatches, orphan chunks and duplicates are caught', () => {
  const manifest = { ...goodManifest(), documentCount: 3, chunkCount: 5 };
  const orphan = { ...goodChunk(), id: 'x:001', documentId: 'ghost' };
  const dupe = goodChunk();
  const errors = validatePackContents(manifest, [goodDoc(), goodDoc()], [goodChunk(), dupe, orphan], goodLexicon()).join('\n');
  assert.match(errors, /duplicate document id sample-enrollment/);
  assert.match(errors, /duplicate chunk id sample-enrollment:001/);
  assert.match(errors, /chunk x:001 refers to unknown document ghost/);
  assert.match(errors, /manifest says 3 documents but documents\.json has 2/);
  assert.match(errors, /manifest says 5 chunks but chunks\.json has 3/);
});

test('pack contents: supersededBy must point at a document that is in the pack', () => {
  const old = { ...goodDoc(), id: 'old-fees', verificationStatus: 'superseded', supersededBy: 'new-fees' };
  const chunk = { ...goodChunk(), id: 'old-fees:001', documentId: 'old-fees' };
  const manifest = { ...goodManifest(), documentCount: 1, chunkCount: 1 };
  assert.match(validatePackContents(manifest, [old], [chunk], goodLexicon()).join('\n'), /superseded by new-fees, which is not in the pack/);
  const replacement = { ...goodDoc(), id: 'new-fees' };
  const both = validatePackContents({ ...manifest, documentCount: 2 }, [old, replacement], [chunk], goodLexicon());
  assert.deepEqual(both, []);
});

test('pack contents: invalid document metadata and empty chunks are caught', () => {
  const doc = { ...goodDoc(), category: 'nope' };
  const emptyChunk = { ...goodChunk(), id: 'sample-enrollment:002', text: '   ' };
  const errors = validatePackContents({ ...goodManifest(), chunkCount: 2 }, [doc], [goodChunk(), emptyChunk], goodLexicon()).join('\n');
  assert.match(errors, /document sample-enrollment: category "nope"/);
  assert.match(errors, /chunk sample-enrollment:002 is missing id, documentId or text/);
});

test('pack contents: lexicon shape is checked and non-array files are rejected', () => {
  assert.match(validatePackContents(goodManifest(), [goodDoc()], [goodChunk()], null).join('\n'), /lexicon.json must contain an object/);
  assert.match(validatePackContents(goodManifest(), [goodDoc()], [goodChunk()], { aliases: {}, campusTerms: [] }).join('\n'), /lexicon.aliases must be an array/);
  assert.deepEqual(validatePackContents(goodManifest(), {}, [], goodLexicon()), ['documents.json must contain an array']);
  assert.deepEqual(validatePackContents(goodManifest(), [], {}, goodLexicon()), ['chunks.json must contain an array']);
});
