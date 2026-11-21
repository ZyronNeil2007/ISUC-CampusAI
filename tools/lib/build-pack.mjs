/**
 * Builds a CampusAI knowledge pack from Markdown and CSV sources.
 *
 *   knowledge/<category>/*.md       document with YAML front matter (README 8.4)
 *   knowledge/<category>/*.csv      table (one chunk per row) with a sibling <name>.meta.yml for the metadata
 *   knowledge/pack.yml              campus name, pack version, minimum app version
 *   knowledge/lexicon.yml           aliases, campus terms, starter questions
 *
 * Output (README 8.6): manifest.json, metadata/documents.json, chunks/chunks.json, metadata/lexicon.json.
 *
 * Content levels:
 *   official  verified documents only. The only level that may be presented as university information.
 *   draft     also includes unverified documents, for team review.
 *   sample    fictional test content, every document must say `sample: true`.
 *
 * The build is deterministic: the same sources and `createdAt` always produce byte-identical files.
 */
import { createHash } from 'node:crypto';
import { mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import YAML from 'yaml';
import { chunkMarkdown, rowsToChunks, stripComments } from '../../src/ai/retrieval/ChunkManager.js';
import {
  CONTENT_LEVELS,
  PACK_FILES,
  PACK_FORMAT,
  parseVersion,
  validateDocumentMeta,
  validateManifest,
  validatePackContents,
} from '../../src/ai/retrieval/packFormat.js';
import { findInjectionPhrases, findRawHtml, stripHiddenCharacters } from '../../src/ai/retrieval/safety.js';
import { analyze } from '../../src/ai/retrieval/tokenizer.js';
import { parseCsv } from './csv.mjs';

const sha256 = (data) => createHash('sha256').update(data).digest('hex');
const byText = (a, b) => (a < b ? -1 : a > b ? 1 : 0);

const DOC_FIELD_ORDER = [
  'id',
  'title',
  'category',
  'office',
  'version',
  'publishedAt',
  'effectiveAt',
  'expiresAt',
  'lastVerifiedAt',
  'verificationStatus',
  'source',
  'supersededBy',
  'tags',
  'sample',
  'reviewRequired',
  'extractedBy',
  'extractedAt',
];

const MAX_STARTER_QUESTIONS = 12;
const IGNORED_FILES = /(^|\/)(pack\.yml|lexicon\.yml|readme\.md)$|\.meta\.yml$/i;
const UNPACKAGED_TYPES = /\.(pdf|docx?|pptx?|xlsx?|html?|txt|rtf|odt|png|jpe?g|gif|webp)$/i;

/* ---------- reading sources ---------- */

async function walk(root, rel = '') {
  const entries = (await readdir(path.join(root, rel), { withFileTypes: true })).sort((a, b) => byText(a.name, b.name));
  const files = [];
  for (const entry of entries) {
    // "_drafts" holds extraction output that is not ready for review; "samples" is built only with --sample.
    if (entry.name.startsWith('.') || entry.name.startsWith('_')) continue;
    const childRel = rel ? `${rel}/${entry.name}` : entry.name;
    if (entry.isDirectory()) {
      if (entry.name === 'samples') continue;
      files.push(...(await walk(root, childRel)));
    } else if (entry.isFile()) {
      files.push(childRel);
    }
  }
  return files;
}

const normalizeNewlines = (text) => text.replace(/^﻿/, '').replace(/\r\n?/g, '\n');

function splitFrontMatter(text) {
  const match = /^---\n([\s\S]*?)\n---[ \t]*(?:\n|$)/.exec(text);
  return match ? { yaml: match[1], body: text.slice(match[0].length) } : null;
}

function parseYaml(source, label, errors) {
  try {
    // YAML 1.2 core schema: unquoted dates such as 2026-05-20 stay strings.
    return YAML.parse(source);
  } catch (error) {
    errors.push(`${label}: invalid YAML (${String(error.message).split('\n')[0]})`);
    return undefined;
  }
}

async function readConfig(sourceDir, errors) {
  const file = path.join(sourceDir, 'pack.yml');
  let text;
  try {
    text = await readFile(file, 'utf8');
  } catch {
    errors.push(`pack.yml not found in ${sourceDir}. It needs: campus, packVersion, minAppVersion.`);
    return null;
  }
  const config = parseYaml(normalizeNewlines(text), 'pack.yml', errors);
  if (config === undefined) return null;
  if (!config || typeof config !== 'object' || Array.isArray(config)) {
    errors.push('pack.yml must be a mapping with campus, packVersion and minAppVersion');
    return null;
  }
  if (typeof config.campus !== 'string' || !config.campus.trim()) errors.push('pack.yml: campus is missing');
  if (!parseVersion(config.packVersion)) errors.push('pack.yml: packVersion must be a quoted-or-plain x.y.z version such as 0.1.0');
  if (!parseVersion(config.minAppVersion)) errors.push('pack.yml: minAppVersion must be a version such as 0.1.0');
  return config;
}

/* ---------- lexicon ---------- */

const cleanPhrase = (value) => String(value).replace(/\s+/g, ' ').trim().toLowerCase();

function uniqueInOrder(list) {
  return [...new Set(list)];
}

/** Validate and normalise lexicon.yml. Returns the compiled lexicon (never throws). */
export function compileLexicon(raw, { errors, warnings, label = 'lexicon.yml' }) {
  const lexicon = { aliases: [], campusNames: [], campusTerms: [], starterQuestions: [] };
  if (raw === undefined || raw === null) return lexicon;
  if (typeof raw !== 'object' || Array.isArray(raw)) {
    errors.push(`${label}: must be a mapping with aliases, campusNames, campusTerms and starterQuestions`);
    return lexicon;
  }
  for (const key of Object.keys(raw)) {
    if (!(key in lexicon)) warnings.push(`${label}: unknown key "${key}" is ignored`);
  }

  const listOf = (key) => {
    const value = raw[key];
    if (value === undefined || value === null) return [];
    if (!Array.isArray(value)) {
      errors.push(`${label}: ${key} must be a list`);
      return [];
    }
    return value;
  };

  listOf('aliases').forEach((group, i) => {
    if (!Array.isArray(group) || group.length < 2 || !group.every((p) => typeof p === 'string' && p.trim())) {
      errors.push(`${label}: aliases[${i}] must be a list of at least two phrases`);
      return;
    }
    const phrases = uniqueInOrder(group.map(cleanPhrase));
    const empty = phrases.filter((p) => analyze(p).length === 0);
    if (empty.length) {
      errors.push(`${label}: aliases[${i}] has phrases with no searchable words: ${empty.join(', ')}`);
      return;
    }
    if (phrases.length < 2) {
      warnings.push(`${label}: aliases[${i}] repeats the same phrase and is ignored`);
      return;
    }
    lexicon.aliases.push(phrases);
  });

  for (const key of ['campusNames', 'campusTerms']) {
    const phrases = [];
    listOf(key).forEach((item, i) => {
      if (typeof item !== 'string' || !item.trim()) {
        errors.push(`${label}: ${key}[${i}] must be a non-empty string`);
        return;
      }
      const phrase = cleanPhrase(item);
      if (analyze(phrase).length === 0) {
        errors.push(`${label}: ${key}[${i}] "${item}" has no searchable words`);
        return;
      }
      phrases.push(phrase);
    });
    lexicon[key] = uniqueInOrder(phrases);
  }

  const questions = [];
  listOf('starterQuestions').forEach((item, i) => {
    const q = typeof item === 'string' ? item.replace(/\s+/g, ' ').trim() : '';
    if (q.length < 5 || q.length > 160) errors.push(`${label}: starterQuestions[${i}] must be 5-160 characters`);
    else questions.push(q);
  });
  if (questions.length > MAX_STARTER_QUESTIONS) {
    warnings.push(`${label}: only the first ${MAX_STARTER_QUESTIONS} starter questions are used`);
  }
  lexicon.starterQuestions = uniqueInOrder(questions).slice(0, MAX_STARTER_QUESTIONS);
  return lexicon;
}

/* ---------- documents ---------- */

function pickDocumentFields(meta) {
  const out = {};
  for (const key of DOC_FIELD_ORDER) {
    if (meta[key] !== undefined && meta[key] !== null && meta[key] !== '') out[key] = meta[key];
  }
  return out;
}

async function readDocument(sourceDir, file, errors) {
  const raw = normalizeNewlines(await readFile(path.join(sourceDir, file), 'utf8'));

  if (/\.csv$/i.test(file)) {
    const sidecar = file.replace(/\.csv$/i, '.meta.yml');
    let metaText;
    try {
      metaText = normalizeNewlines(await readFile(path.join(sourceDir, sidecar), 'utf8'));
    } catch {
      errors.push(`${file}: a CSV needs a metadata file next to it named ${path.posix.basename(sidecar)}`);
      return null;
    }
    const meta = parseYaml(metaText, sidecar, errors);
    if (meta === undefined) return null;
    let table;
    try {
      table = parseCsv(raw);
    } catch (error) {
      errors.push(`${file}: ${error.message}`);
      return null;
    }
    if (table.length < 2) {
      errors.push(`${file}: a CSV needs a header row and at least one data row`);
      return null;
    }
    const headers = table[0].map((h) => h.trim());
    if (headers.some((h) => !h) || new Set(headers).size !== headers.length) {
      errors.push(`${file}: the header row needs a unique, non-empty name for every column`);
      return null;
    }
    const width = headers.length;
    const wrong = table.findIndex((row, i) => i > 0 && row.length > width);
    if (wrong > 0) {
      errors.push(`${file}: row ${wrong + 1} has more cells than the ${width} header columns`);
      return null;
    }
    return { file, kind: 'csv', meta, headers, rows: table.slice(1), raw };
  }

  const parts = splitFrontMatter(raw);
  if (!parts) {
    errors.push(`${file}: missing front matter (a block of YAML between two "---" lines at the top of the file)`);
    return null;
  }
  const meta = parseYaml(parts.yaml, file, errors);
  if (meta === undefined) return null;
  return { file, kind: 'md', meta, body: parts.body, raw: parts.body };
}

/* ---------- the build ---------- */

/**
 * @param {object} options
 * @param {string} options.sourceDir folder with documents, pack.yml and lexicon.yml
 * @param {string} [options.outDir] where to write the pack (required unless write is false)
 * @param {'official'|'draft'|'sample'} options.contentLevel
 * @param {string} [options.createdAt] ISO timestamp, fixed for reproducible builds
 * @param {string} [options.packVersion] overrides pack.yml
 * @param {boolean} [options.strict] treat suspicious-text warnings as errors
 * @param {boolean} [options.write] set false to validate only (default true)
 */
export async function buildPack(options) {
  const { sourceDir, outDir, contentLevel, strict = false, write = true } = options;
  const createdAt = options.createdAt ?? new Date().toISOString();
  const errors = [];
  const warnings = [];
  const skipped = [];
  const result = { ok: false, errors, warnings, skipped, manifest: null, documents: [], chunks: [], lexicon: null, files: [] };

  if (!CONTENT_LEVELS.includes(contentLevel)) {
    errors.push(`contentLevel must be one of: ${CONTENT_LEVELS.join(', ')}`);
    return result;
  }
  if (Number.isNaN(Date.parse(createdAt))) {
    errors.push(`createdAt "${createdAt}" is not a valid timestamp`);
    return result;
  }

  let files;
  try {
    files = await walk(sourceDir);
  } catch {
    errors.push(`source folder not found: ${sourceDir}`);
    return result;
  }

  const config = await readConfig(sourceDir, errors);

  const parsed = [];
  for (const file of files) {
    if (IGNORED_FILES.test(file)) continue;
    if (/\.(md|csv)$/i.test(file)) {
      const doc = await readDocument(sourceDir, file, errors);
      if (doc) parsed.push(doc);
    } else if (UNPACKAGED_TYPES.test(file)) {
      warnings.push(`${file}: only .md and .csv files are packaged. Convert it first (tools/extract-text.mjs) and have a person check the result.`);
    }
  }

  // Decide which documents belong in this pack.
  const included = [];
  for (const doc of parsed) {
    const meta = doc.meta && typeof doc.meta === 'object' && !Array.isArray(doc.meta) ? doc.meta : null;
    if (!meta) {
      errors.push(`${doc.file}: front matter must be a mapping of fields`);
      continue;
    }
    const status = meta.verificationStatus;
    if (meta.sample === true && contentLevel !== 'sample') {
      errors.push(`${doc.file}: sample documents can only be built into the sample pack`);
      continue;
    }
    if (contentLevel === 'sample' && meta.sample !== true) {
      errors.push(`${doc.file}: every document in the sample pack must say "sample: true"`);
      continue;
    }
    if (status === 'archived') {
      skipped.push({ file: doc.file, id: meta.id, reason: 'archived documents are never packaged' });
      continue;
    }
    if (contentLevel === 'official' && status !== 'verified') {
      skipped.push({ file: doc.file, id: meta.id, reason: `status is "${status}"; an official pack contains verified documents only` });
      continue;
    }
    included.push(doc);
  }

  // Validate, chunk and collect.
  const seenIds = new Map();
  const documents = [];
  const chunks = [];
  for (const doc of included) {
    const { errors: metaErrors, warnings: metaWarnings } = validateDocumentMeta(doc.meta);
    metaErrors.forEach((e) => errors.push(`${doc.file}: ${e}`));
    metaWarnings.forEach((w) => warnings.push(`${doc.file}: ${w}`));
    if (metaErrors.length) continue;

    const { id } = doc.meta;
    if (seenIds.has(id)) {
      errors.push(`${doc.file}: duplicate document id "${id}" (also used by ${seenIds.get(id)})`);
      continue;
    }
    seenIds.set(id, doc.file);

    const ref = { id, title: doc.meta.title, category: doc.meta.category, office: doc.meta.office };
    let docChunks;
    let visibleText;
    if (doc.kind === 'csv') {
      docChunks = rowsToChunks(doc.headers, doc.rows, ref);
      visibleText = doc.rows.map((r) => r.join(' ')).join('\n');
    } else {
      visibleText = stripComments(doc.body).replace(/<!--\s*page:\s*\d+\s*-->/gi, '');
      docChunks = chunkMarkdown(doc.body, ref);
      const html = findRawHtml(doc.body);
      if (html) warnings.push(`${doc.file}: contains raw HTML (${html}), which is shown as plain text. Use Markdown instead.`);
    }
    if (!visibleText.trim() || docChunks.length === 0) {
      errors.push(`${doc.file}: the document has no text to search`);
      continue;
    }

    if (/\bTODO\b/.test(visibleText)) {
      const message = `${doc.file}: the text still contains "TODO"`;
      if (doc.meta.verificationStatus === 'verified') errors.push(`${message}; a verified document must be complete`);
      else warnings.push(message);
    }
    const suspicious = findInjectionPhrases(visibleText);
    if (suspicious.length) {
      const message = `${doc.file}: text looks like an instruction to an AI (${suspicious.map((s) => `"${s}"`).join(', ')}). Check that it is real campus content.`;
      (strict ? errors : warnings).push(message);
    }
    if (stripHiddenCharacters(doc.raw) !== doc.raw) {
      const message = `${doc.file}: contains invisible control or zero-width characters`;
      (strict ? errors : warnings).push(message);
    }

    documents.push({
      ...pickDocumentFields(doc.meta),
      chunkCount: docChunks.length,
      contentSha256: sha256(doc.raw),
    });
    for (const c of docChunks) {
      chunks.push({ id: c.id, documentId: c.documentId, section: c.section, page: c.page, text: c.text });
    }
  }
  documents.sort((a, b) => byText(a.id, b.id));

  if (contentLevel === 'official' && documents.length === 0 && errors.length === 0) {
    errors.push(
      'No verified documents were found, so there is nothing to put in an official pack. ' +
        'Add documents under knowledge/ with verificationStatus: verified, or use --sample (fictional test content) or --include-drafts (team review).'
    );
  }

  // Lexicon.
  let lexiconRaw;
  try {
    lexiconRaw = parseYaml(normalizeNewlines(await readFile(path.join(sourceDir, 'lexicon.yml'), 'utf8')), 'lexicon.yml', errors);
  } catch {
    warnings.push('lexicon.yml not found: aliases, campus terms and starter questions will be empty');
  }
  const lexicon = compileLexicon(lexiconRaw, { errors, warnings });

  if (errors.length || !config) return { ...result, skipped, documents, chunks, lexicon };

  // Assemble the pack files.
  const packFiles = [
    { path: PACK_FILES.chunks, content: `${JSON.stringify(chunks)}\n` },
    { path: PACK_FILES.documents, content: `${JSON.stringify(documents, null, 2)}\n` },
    { path: PACK_FILES.lexicon, content: `${JSON.stringify(lexicon, null, 2)}\n` },
  ]
    .map((f) => ({ ...f, bytes: Buffer.byteLength(f.content, 'utf8'), sha256: sha256(Buffer.from(f.content, 'utf8')) }))
    .sort((a, b) => byText(a.path, b.path));

  const count = (key) =>
    Object.fromEntries(
      Object.entries(documents.reduce((acc, d) => ({ ...acc, [d[key]]: (acc[d[key]] ?? 0) + 1 }), {})).sort(([a], [b]) => byText(a, b))
    );

  const manifest = {
    format: PACK_FORMAT,
    packVersion: options.packVersion ?? config.packVersion,
    minAppVersion: config.minAppVersion,
    campus: config.campus.trim(),
    contentLevel,
    createdAt,
    publishedAt: null,
    documentCount: documents.length,
    chunkCount: chunks.length,
    stats: { categories: count('category'), statuses: count('verificationStatus') },
    files: packFiles.map(({ path: p, sha256: hash, bytes }) => ({ path: p, sha256: hash, bytes })),
    // Reserved for Phase 6 (README 16.7): publisher signature and key id.
    signature: null,
    signingKeyId: null,
    verification: { integrity: 'sha256', signed: false },
  };

  errors.push(...validateManifest(manifest), ...validatePackContents(manifest, documents, chunks, lexicon));
  if (errors.length) return { ...result, skipped, documents, chunks, lexicon, manifest };

  const manifestContent = `${JSON.stringify(manifest, null, 2)}\n`;
  const allFiles = [...packFiles, { path: 'manifest.json', content: manifestContent }];

  if (write) {
    if (!outDir) throw new Error('outDir is required when write is true');
    let existing = [];
    try {
      existing = await readdir(outDir);
    } catch {
      /* the folder does not exist yet */
    }
    if (existing.length && !existing.includes('manifest.json')) {
      errors.push(`refusing to overwrite ${outDir}: it has files but is not a knowledge pack (no manifest.json)`);
      return { ...result, skipped, documents, chunks, lexicon, manifest };
    }
    await rm(outDir, { recursive: true, force: true });
    for (const f of allFiles) {
      const target = path.join(outDir, f.path);
      await mkdir(path.dirname(target), { recursive: true });
      await writeFile(target, f.content, 'utf8');
    }
  }

  return { ok: true, errors, warnings, skipped, manifest, documents, chunks, lexicon, files: allFiles };
}
