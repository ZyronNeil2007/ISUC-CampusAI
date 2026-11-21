#!/usr/bin/env node
/**
 * Turn a PDF, web page or text file into a DRAFT Markdown document for knowledge/ (README 8.9, Phase 4).
 *
 *   node tools/extract-text.mjs student-manual.pdf charter.html --out knowledge/_drafts
 *
 * The draft is never published by itself: its front matter is full of TODO placeholders and "reviewRequired: true", so
 * the pack builder refuses it until a person has compared it with the original, fixed it and filled the fields in.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { parseArgs } from 'node:util';
import { fileURLToPath } from 'node:url';
import { buildDraft, reviewWarnings, sanitizeText, slugify } from './lib/draft-markdown.mjs';
import { extractHtml } from './lib/extract-html.mjs';
import { extractPdf } from './lib/extract-pdf.mjs';

const ROOT = path.resolve(fileURLToPath(new URL('..', import.meta.url)));
const HELP = `Usage: node tools/extract-text.mjs <file...> [options]

  Reads .pdf, .html/.htm and .txt/.md files and writes draft Markdown, one file each.

  --out <dir>   Output folder (default: knowledge/_drafts, which is not packaged and not committed)
  --force       Overwrite an existing draft
  -h, --help

Scanned PDFs have no text layer; this tool does not do OCR. Anything extracted must be checked against the original.
`;

export async function extractFile(file) {
  const ext = path.extname(file).toLowerCase();
  const bytes = readFileSync(file);
  if (ext === '.pdf') return extractPdf(bytes);
  if (ext === '.html' || ext === '.htm') return extractHtml(bytes.toString('utf8'));
  if (ext === '.txt' || ext === '.md') {
    const text = sanitizeText(bytes.toString('utf8')).replace(/\r\n?/g, '\n').trim();
    return { title: text.split('\n', 1)[0].replace(/^#+\s*/, '').slice(0, 120), markdown: text, warnings: ['plain text: headings and tables were not detected'], stats: { characters: text.length } };
  }
  throw new Error(`unsupported file type "${ext}" (use PDF, HTML or text; convert Word files to PDF first)`);
}

async function main() {
  const { values, positionals } = parseArgs({ options: { out: { type: 'string' }, force: { type: 'boolean' }, help: { type: 'boolean', short: 'h' } }, allowPositionals: true });
  if (values.help || positionals.length === 0) {
    console.log(HELP);
    return values.help ? 0 : 2;
  }
  const outDir = path.resolve(values.out ?? path.join(ROOT, 'knowledge/_drafts'));
  mkdirSync(outDir, { recursive: true });
  let failed = 0;
  for (const file of positionals) {
    try {
      const { title, markdown, warnings } = await extractFile(file);
      const all = [...warnings, ...reviewWarnings(markdown)];
      const target = path.join(outDir, `${slugify(path.basename(file))}.md`);
      if (existsSync(target) && !values.force) throw new Error(`${path.relative(process.cwd(), target)} already exists (use --force to overwrite)`);
      writeFileSync(target, buildDraft({ suggestedTitle: title, body: markdown, sourceFile: path.basename(file), extractedAt: new Date().toISOString().slice(0, 10), warnings: all }));
      console.log(`${path.basename(file)} -> ${path.relative(process.cwd(), target)}`);
      for (const w of all) console.log(`   check: ${w}`);
    } catch (error) {
      failed++;
      console.error(`${path.basename(file)}: ${error.message}`);
    }
  }
  console.log('\nThese are DRAFTS. Compare each with the original, fill in the TODO fields and remove "reviewRequired" before packaging.');
  return failed ? 1 : 0;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) process.exit(await main());
