import { findInjectionPhrases, findRawHtml, stripHiddenCharacters } from '../../src/ai/retrieval/safety.js';

/**
 * Shared by the extractors. Everything they produce is a DRAFT: machine-read text that a person must compare with the
 * original before it can enter a pack (README 8.9). The front matter is full of TODO placeholders on purpose: the pack
 * builder refuses a document until a person has filled them in, so extracted text cannot be published by accident.
 */

export function slugify(name) {
  return String(name ?? '')
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/\.[a-z0-9]{1,5}$/, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60) || 'document';
}

/** Remove invisible characters and control codes, normalise spaces. Newlines are kept. */
export function sanitizeText(text) {
  return stripHiddenCharacters(String(text ?? ''))
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, '')
    .replace(/[  -   　]/g, ' ')
    .replace(/[ \t]+/g, ' ')
    .replace(/ *\n */g, '\n');
}

const cell = (text) => sanitizeText(text).replace(/\s*\n\s*/g, ' ').replace(/\|/g, '\\|').trim();

/** rows: string[][] (first row is the header). Ragged rows are padded. */
export function tableToMarkdown(rows) {
  const clean = rows.map((r) => r.map(cell)).filter((r) => r.some(Boolean));
  if (clean.length === 0) return '';
  const width = Math.max(...clean.map((r) => r.length));
  const pad = (r) => [...r, ...Array(width - r.length).fill('')];
  const [head, ...body] = clean.map(pad);
  return [`| ${head.join(' | ')} |`, `| ${head.map(() => '---').join(' | ')} |`, ...body.map((r) => `| ${r.join(' | ')} |`)].join('\n');
}

/** Things in extracted text that a reviewer must look at. */
export function reviewWarnings(markdown) {
  const warnings = [];
  const injected = findInjectionPhrases(markdown);
  if (injected.length) warnings.push(`text that reads like an instruction to an AI system: ${injected.map((s) => `"${s}"`).join(', ')}`);
  const html = findRawHtml(markdown);
  if (html) warnings.push(`raw HTML in the text (${html}); the pack builder will refuse it`);
  return warnings;
}

export function buildDraft({ suggestedTitle = '', body, sourceFile, extractedAt, warnings = [] }) {
  const warn = warnings.map((w) => `     - ${w.replace(/-->/g, '--&gt;')}`).join('\n');
  const title = suggestedTitle.replace(/\s+/g, ' ').trim();
  return `---
id: TODO               # lowercase letters, digits and hyphens, e.g. ${slugify(sourceFile)}
title: TODO            # suggested from the document: ${JSON.stringify(title || '(none found)')}
category: TODO         # enrollment, admission, scholarships, ... (see knowledge/README.md)
office: TODO           # the office that issued this document
version: TODO          # a quoted string such as "1.0"
publishedAt: TODO      # YYYY-MM-DD, from the document itself
source: TODO           # the official document this was taken from (extracted from ${sourceFile})
verificationStatus: draft
reviewRequired: true   # remove only after a person has compared this text with the original
---
<!--
  DRAFT. Machine-extracted from ${sourceFile} on ${extractedAt}. NOT verified.
  Before this can be packaged: compare every line with the original, fix errors (especially numbers, dates, fees and
  names), rebuild any tables, fill in every TODO above, delete this comment, and remove "reviewRequired".
${warn ? `  Things to check:\n${warn}\n` : ''}-->

${body.trim()}
`;
}
