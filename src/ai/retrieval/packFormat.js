import { validateCampusMap } from '../../modules/campusMap.js';

/**
 * Knowledge-pack format, shared by the build tool (Node) and the app (browser).
 * Pure functions only: no DOM and no Node APIs, so both sides validate identically.
 * Spec: README 8.3 (categories), 8.4 (metadata), 8.5 (statuses), 8.6 (pack), 14.3 and 14.4 (models).
 */

export const PACK_FORMAT = 1;

/** README 8.3. These ids are the canonical `category` values; folder names are only organisational. */
export const CATEGORIES = Object.freeze([
  'academic',
  'admission',
  'enrollment',
  'scholarships',
  'campus_offices',
  'campus_facilities',
  'student_services',
  'student_life',
  'announcements',
  'document_requests',
  'university_policies',
]);

/** README 8.5. */
export const STATUSES = Object.freeze([
  'draft',
  'pending_verification',
  'verified',
  'superseded',
  'expired',
  'archived',
]);

/**
 * official: only verified documents (the only level that may be presented as university information).
 * draft:    contains unverified documents; for team review.
 * sample:   synthetic test content; must never be presented as real.
 */
export const CONTENT_LEVELS = Object.freeze(['official', 'draft', 'sample']);

/** Files a pack may contain. When present they are listed in the manifest and checked like the required files. */
export const OPTIONAL_PACK_FILES = Object.freeze({
  map: 'metadata/map.json',
});

/** Files every pack must contain, relative to the pack directory. */
export const PACK_FILES = Object.freeze({
  documents: 'metadata/documents.json',
  chunks: 'chunks/chunks.json',
  lexicon: 'metadata/lexicon.json',
});

const ID_RE = /^[a-z0-9][a-z0-9-]{1,79}$/;
const SEMVER_RE = /^(\d+)\.(\d+)\.(\d+)(?:-[0-9A-Za-z.-]+)?$/;
const SHA256_RE = /^[0-9a-f]{64}$/;
const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

const REQUIRED_DOC_FIELDS = ['id', 'title', 'category', 'office', 'version', 'publishedAt', 'verificationStatus', 'source'];
const OPTIONAL_DOC_FIELDS = [
  'effectiveAt',
  'expiresAt',
  'lastVerifiedAt',
  'sample',
  'reviewRequired',
  'extractedBy',
  'extractedAt',
  'tags',
  'supersededBy',
];

const isText = (v) => typeof v === 'string' && v.trim().length > 0;
const isTodo = (v) => typeof v === 'string' && /^todo\b/i.test(v.trim());

/* ---------- dates and versions ---------- */

/** True for a real calendar date written YYYY-MM-DD. */
export function isIsoDate(value) {
  if (typeof value !== 'string') return false;
  const m = DATE_RE.exec(value);
  if (!m) return false;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  const dt = new Date(Date.UTC(y, mo - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === mo - 1 && dt.getUTCDate() === d;
}

/** The calendar date on this device ("today") as YYYY-MM-DD. ISO dates compare correctly as strings. */
export function toLocalIsoDate(date = new Date()) {
  const pad = (n) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export function parseVersion(value) {
  const m = SEMVER_RE.exec(String(value));
  return m ? [Number(m[1]), Number(m[2]), Number(m[3])] : null;
}

/** Compare major.minor.patch. Pre-release tags are ignored for ordering. Throws on an invalid version. */
export function compareVersions(a, b) {
  const pa = parseVersion(a);
  const pb = parseVersion(b);
  if (!pa) throw new Error(`Invalid version: ${a}`);
  if (!pb) throw new Error(`Invalid version: ${b}`);
  for (let i = 0; i < 3; i++) {
    if (pa[i] !== pb[i]) return pa[i] < pb[i] ? -1 : 1;
  }
  return 0;
}

/** Does this app version fall inside the range the pack declares support for? */
export function supportsAppVersion(manifest, appVersion) {
  if (compareVersions(appVersion, manifest.minAppVersion) < 0) return false;
  if (manifest.maxAppVersion && compareVersions(appVersion, manifest.maxAppVersion) > 0) return false;
  return true;
}

/* ---------- paths ---------- */

/** A path that stays inside the pack: relative, no scheme, no "..", no empty segments. */
export function isSafeRelativePath(p) {
  if (typeof p !== 'string' || p.length === 0) return false;
  if (p.startsWith('/') || p.includes('\\')) return false;
  if (/^[a-z][a-z0-9+.-]*:/i.test(p)) return false;
  return !p.split('/').some((seg) => seg === '' || seg === '..' || seg === '.');
}

/* ---------- document metadata ---------- */

/**
 * Validate one document's front matter. Returns { errors, warnings } (string arrays).
 * Errors block the build; warnings are informational.
 */
export function validateDocumentMeta(meta) {
  const errors = [];
  const warnings = [];
  if (!meta || typeof meta !== 'object' || Array.isArray(meta)) {
    return { errors: ['front matter is missing or is not a mapping'], warnings };
  }

  for (const f of REQUIRED_DOC_FIELDS) {
    if (meta[f] === undefined || meta[f] === null || meta[f] === '') errors.push(`missing required field "${f}"`);
  }
  for (const [key, value] of Object.entries(meta)) {
    if (isTodo(value)) errors.push(`field "${key}" is still a TODO placeholder`);
    if (!REQUIRED_DOC_FIELDS.includes(key) && !OPTIONAL_DOC_FIELDS.includes(key)) {
      warnings.push(`unknown field "${key}" is ignored`);
    }
  }

  if (meta.id != null && !ID_RE.test(String(meta.id))) {
    errors.push('id must be 2-80 characters: lowercase letters, digits and hyphens, starting with a letter or digit');
  }
  for (const f of ['title', 'office', 'source']) {
    if (meta[f] != null && meta[f] !== '' && !isText(meta[f])) errors.push(`${f} must be a non-empty string`);
  }
  if (isText(meta.title) && meta.title.length > 200) errors.push('title is longer than 200 characters');
  if (meta.category != null && meta.category !== '' && !CATEGORIES.includes(meta.category)) {
    errors.push(`category "${meta.category}" is not one of: ${CATEGORIES.join(', ')}`);
  }
  if (meta.verificationStatus != null && meta.verificationStatus !== '' && !STATUSES.includes(meta.verificationStatus)) {
    errors.push(`verificationStatus "${meta.verificationStatus}" is not one of: ${STATUSES.join(', ')}`);
  }
  if (meta.version != null && meta.version !== '' && typeof meta.version !== 'string') {
    errors.push('version must be a quoted string, for example "1.0"');
  }
  for (const f of ['publishedAt', 'effectiveAt', 'expiresAt', 'lastVerifiedAt']) {
    const v = meta[f];
    if (v == null || v === '' || isTodo(v)) continue;
    if (!isIsoDate(v)) errors.push(`${f} must be a calendar date written YYYY-MM-DD (got ${JSON.stringify(v)})`);
  }
  if (isIsoDate(meta.effectiveAt) && isIsoDate(meta.expiresAt) && meta.expiresAt < meta.effectiveAt) {
    errors.push('expiresAt is earlier than effectiveAt');
  }
  for (const f of ['sample', 'reviewRequired']) {
    if (meta[f] !== undefined && meta[f] !== null && typeof meta[f] !== 'boolean') errors.push(`${f} must be true or false`);
  }
  if (meta.tags != null && !(Array.isArray(meta.tags) && meta.tags.every(isText))) {
    errors.push('tags must be a list of non-empty strings');
  }
  if (meta.supersededBy != null && meta.supersededBy !== '') {
    if (!ID_RE.test(String(meta.supersededBy))) errors.push('supersededBy must be the id of the document that replaces this one');
    else if (meta.supersededBy === meta.id) errors.push('a document cannot supersede itself');
    if (meta.verificationStatus !== 'superseded') warnings.push('supersededBy is only used when verificationStatus is "superseded"');
  }

  if (meta.verificationStatus === 'verified') {
    if (!isIsoDate(meta.lastVerifiedAt)) errors.push('a verified document needs lastVerifiedAt (YYYY-MM-DD)');
    if (meta.reviewRequired === true) {
      errors.push(
        'reviewRequired is still true: a person must check extracted text against the original, then remove this field (README 8.9)'
      );
    }
    if (meta.sample === true) errors.push('sample documents must not be marked verified');
  }
  return { errors, warnings };
}

/**
 * Is a document usable as a source right now?
 * 'current' is the only usable result. Non-official packs (sample/draft) may use unverified documents,
 * and the UI labels them as such.
 */
export function documentValidity(meta, today, { allowUnverified = false } = {}) {
  const status = meta.verificationStatus;
  if (status === 'superseded') return 'superseded';
  if (status === 'archived') return 'archived';
  if (status === 'expired') return 'expired';
  if (status !== 'verified' && !allowUnverified) return 'unverified';
  if (meta.effectiveAt && today < meta.effectiveAt) return 'not-yet-effective';
  if (meta.expiresAt && today > meta.expiresAt) return 'expired';
  return 'current';
}

/* ---------- manifest and pack contents ---------- */

/** Validate a parsed manifest.json. Returns an array of error strings (empty when valid). */
export function validateManifest(m) {
  const errors = [];
  if (!m || typeof m !== 'object' || Array.isArray(m)) return ['manifest is not an object'];

  if (m.format !== PACK_FORMAT) {
    errors.push(`unsupported pack format ${JSON.stringify(m.format)} (this app reads format ${PACK_FORMAT})`);
  }
  if (!parseVersion(m.packVersion)) errors.push('packVersion must look like 1.2.3');
  if (!parseVersion(m.minAppVersion)) errors.push('minAppVersion must look like 1.2.3');
  if (m.maxAppVersion != null && !parseVersion(m.maxAppVersion)) errors.push('maxAppVersion must look like 1.2.3');
  if (!isText(m.campus)) errors.push('campus is missing');
  if (!CONTENT_LEVELS.includes(m.contentLevel)) errors.push(`contentLevel must be one of: ${CONTENT_LEVELS.join(', ')}`);
  if (typeof m.createdAt !== 'string' || Number.isNaN(Date.parse(m.createdAt))) errors.push('createdAt must be an ISO timestamp');
  if (m.publishedAt != null && (typeof m.publishedAt !== 'string' || Number.isNaN(Date.parse(m.publishedAt)))) {
    errors.push('publishedAt must be an ISO timestamp or null');
  }
  for (const f of ['documentCount', 'chunkCount']) {
    if (!Number.isInteger(m[f]) || m[f] < 0) errors.push(`${f} must be a non-negative integer`);
  }

  if (!Array.isArray(m.files) || m.files.length === 0) {
    errors.push('files must list the pack files with their SHA-256 hashes');
  } else {
    m.files.forEach((f, i) => {
      if (!f || !isSafeRelativePath(f.path)) errors.push(`files[${i}].path must be a relative path inside the pack`);
      if (!f || !SHA256_RE.test(f.sha256 ?? '')) errors.push(`files[${i}].sha256 must be 64 lowercase hex characters`);
      if (!f || !Number.isInteger(f.bytes) || f.bytes < 0) errors.push(`files[${i}].bytes must be a non-negative integer`);
    });
    for (const required of Object.values(PACK_FILES)) {
      if (!m.files.some((f) => f && f.path === required)) errors.push(`files must include ${required}`);
    }
  }
  return errors;
}

/**
 * Cross-check the parsed pack files against each other and the manifest.
 * Returns an array of error strings (empty when consistent).
 */
export function validatePackContents(manifest, documents, chunks, lexicon, map = null) {
  const errors = [];
  if (!Array.isArray(documents)) return ['documents.json must contain an array'];
  if (!Array.isArray(chunks)) return ['chunks.json must contain an array'];

  const docIds = new Set();
  for (const doc of documents) {
    const { errors: docErrors } = validateDocumentMeta(doc);
    docErrors.forEach((e) => errors.push(`document ${doc?.id ?? '?'}: ${e}`));
    if (doc?.id) {
      if (docIds.has(doc.id)) errors.push(`duplicate document id ${doc.id}`);
      docIds.add(doc.id);
    }
  }
  for (const doc of documents) {
    if (doc?.supersededBy && !docIds.has(doc.supersededBy)) {
      errors.push(`document ${doc.id} says it is superseded by ${doc.supersededBy}, which is not in the pack`);
    }
  }
  const chunkIds = new Set();
  for (const c of chunks) {
    if (!c || !isText(c.id) || !isText(c.text) || !isText(c.documentId)) {
      errors.push(`chunk ${c?.id ?? '?'} is missing id, documentId or text`);
      continue;
    }
    if (chunkIds.has(c.id)) errors.push(`duplicate chunk id ${c.id}`);
    chunkIds.add(c.id);
    if (!docIds.has(c.documentId)) errors.push(`chunk ${c.id} refers to unknown document ${c.documentId}`);
  }
  if (documents.length !== manifest.documentCount) {
    errors.push(`manifest says ${manifest.documentCount} documents but documents.json has ${documents.length}`);
  }
  if (chunks.length !== manifest.chunkCount) {
    errors.push(`manifest says ${manifest.chunkCount} chunks but chunks.json has ${chunks.length}`);
  }
  if (!lexicon || typeof lexicon !== 'object' || Array.isArray(lexicon)) {
    errors.push('lexicon.json must contain an object');
  } else {
    if (!Array.isArray(lexicon.aliases)) errors.push('lexicon.aliases must be an array');
    if (!Array.isArray(lexicon.campusTerms)) errors.push('lexicon.campusTerms must be an array');
    for (const f of ['campusNames', 'starterQuestions']) {
      if (lexicon[f] !== undefined && !Array.isArray(lexicon[f])) errors.push(`lexicon.${f} must be an array`);
    }
  }
  if (map !== null && map !== undefined) validateCampusMap(map).forEach((e) => errors.push(`campus map: ${e}`));
  return errors;
}
