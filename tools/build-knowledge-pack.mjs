#!/usr/bin/env node
/**
 * Build a CampusAI knowledge pack. See tools/lib/build-pack.mjs and docs/knowledge-base.md.
 *
 *   npm run pack            official pack: verified documents from knowledge/
 *   npm run pack:sample     fictional sample pack from knowledge/samples/ (for development and tests)
 *   npm run pack:draft      also includes unverified documents (for team review, never for deployment)
 *   npm run pack:check      validate only, write nothing
 */
import { parseArgs } from 'node:util';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildPack } from './lib/build-pack.mjs';

const ROOT = path.resolve(fileURLToPath(new URL('..', import.meta.url)));

const HELP = `Usage: node tools/build-knowledge-pack.mjs [options]

  --sample             Build the fictional sample pack from knowledge/samples (never for deployment)
  --include-drafts     Include unverified documents: a "draft" pack for team review (never for deployment)
  --source <dir>       Folder with documents, pack.yml and lexicon.yml   (default: knowledge)
  --out <dir>          Output folder                                     (default: public/knowledge-pack)
  --pack-version <v>   Override packVersion from pack.yml
  --created-at <iso>   Fixed timestamp for reproducible output (or set SOURCE_DATE_EPOCH)
  --check              Validate only; write nothing
  --strict             Treat suspicious-text warnings as errors
  -h, --help           Show this help
`;

let args;
try {
  args = parseArgs({
    options: {
      sample: { type: 'boolean' },
      'include-drafts': { type: 'boolean' },
      source: { type: 'string' },
      out: { type: 'string' },
      'pack-version': { type: 'string' },
      'created-at': { type: 'string' },
      check: { type: 'boolean' },
      strict: { type: 'boolean' },
      help: { type: 'boolean', short: 'h' },
    },
    allowPositionals: false,
  }).values;
} catch (error) {
  console.error(`${error.message}\n\n${HELP}`);
  process.exit(2);
}

if (args.help) {
  console.log(HELP);
  process.exit(0);
}
if (args.sample && args['include-drafts']) {
  console.error('Choose either --sample or --include-drafts, not both.');
  process.exit(2);
}

const contentLevel = args.sample ? 'sample' : args['include-drafts'] ? 'draft' : 'official';
const sourceDir = path.resolve(args.source ?? path.join(ROOT, args.sample ? 'knowledge/samples' : 'knowledge'));
const outDir = path.resolve(args.out ?? path.join(ROOT, 'public/knowledge-pack'));
const epoch = process.env.SOURCE_DATE_EPOCH;
const createdAt =
  args['created-at'] ?? (epoch && /^\d+$/.test(epoch) ? new Date(Number(epoch) * 1000).toISOString() : new Date().toISOString());

const rel = (p) => path.relative(process.cwd(), p) || '.';
const result = await buildPack({
  sourceDir,
  outDir,
  contentLevel,
  createdAt,
  packVersion: args['pack-version'],
  strict: Boolean(args.strict),
  write: !args.check,
});

for (const w of result.warnings) console.warn(`warning: ${w}`);

if (!result.ok) {
  for (const e of result.errors) console.error(`error: ${e}`);
  console.error(`\nBuild failed: ${result.errors.length} problem${result.errors.length === 1 ? '' : 's'}.`);
  process.exit(1);
}

const { manifest, skipped } = result;
console.log(`\nCampusAI knowledge pack (${manifest.contentLevel})`);
console.log(`  campus:     ${manifest.campus}`);
console.log(`  version:    ${manifest.packVersion}   (needs app ${manifest.minAppVersion} or newer)`);
console.log(`  documents:  ${manifest.documentCount}   chunks: ${manifest.chunkCount}`);
console.log(`  categories: ${Object.entries(manifest.stats.categories).map(([k, v]) => `${k} ${v}`).join(', ')}`);
console.log(`  statuses:   ${Object.entries(manifest.stats.statuses).map(([k, v]) => `${k} ${v}`).join(', ')}`);
for (const s of skipped) console.log(`  skipped:    ${s.file} (${s.reason})`);
console.log(args.check ? '  nothing written (--check)' : `  written to  ${rel(outDir)}`);
if (contentLevel === 'sample') console.log('\nThis is the SAMPLE pack: fictional content for testing. Do not deploy it as university information.');
if (contentLevel === 'draft') console.log('\nThis is a DRAFT pack: it contains unverified documents. Do not deploy it.');
console.log('The pack is not signed yet (signature verification arrives with the Phase 6 pack installer).');
