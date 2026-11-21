import { parse } from 'node-html-parser';
import { sanitizeText, tableToMarkdown } from './draft-markdown.mjs';

const DROP = 'script, style, noscript, template, iframe, svg, canvas, form, nav, header, footer, aside, button, select, [hidden], [aria-hidden="true"]';
const BLOCK = new Set(['p', 'div', 'section', 'article', 'main', 'ul', 'ol', 'li', 'table', 'blockquote', 'pre', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'dl', 'dt', 'dd', 'figure', 'figcaption']);

const inline = (node) => sanitizeText(node.text).replace(/\s+/g, ' ').trim();

/** Web page to draft Markdown. Navigation, scripts, forms and hidden elements are dropped; tables become Markdown tables. */
export function extractHtml(html) {
  const root = parse(String(html), { blockTextElements: { script: false, style: false, noscript: false } });
  const warnings = [];
  const title = inline(root.querySelector('title') ?? root.querySelector('h1') ?? parse(''));
  const main = root.querySelector('main') ?? root.querySelector('article') ?? root.querySelector('[role="main"]') ?? root.querySelector('body') ?? root;
  if (main === root || main.tagName?.toLowerCase() === 'body') warnings.push('no <main> or <article> element found: navigation text may have been included');
  main.querySelectorAll(DROP).forEach((n) => n.remove());

  const out = [];
  let images = 0;
  const walk = (node, listDepth = 0) => {
    if (node.nodeType === 3) {
      // Keep the text's own spaces so inline tags (<b>, <a>) do not split words or add a space before punctuation.
      const t = sanitizeText(node.text).replace(/\s+/g, ' ');
      if (t) out.push(t);
      return;
    }
    const tag = node.tagName?.toLowerCase();
    if (!tag) return node.childNodes.forEach((c) => walk(c, listDepth));
    if (tag === 'img') {
      images++;
      return;
    }
    if (/^h[1-6]$/.test(tag)) {
      const t = inline(node);
      if (t) out.push(`\n\n${'#'.repeat(Number(tag[1]))} ${t}\n\n`);
      return;
    }
    if (tag === 'table') {
      const rows = node.querySelectorAll('tr').map((tr) => tr.querySelectorAll('th, td').map((c) => inline(c)));
      const md = tableToMarkdown(rows);
      if (md) out.push(`\n\n${md}\n\n`);
      if (node.querySelector('[rowspan], [colspan]')) warnings.push('a table uses merged cells; check it against the original');
      return;
    }
    if (tag === 'li') {
      const own = node.childNodes.filter((c) => !['ul', 'ol'].includes(c.tagName?.toLowerCase()));
      const text = own.map((c) => (c.nodeType === 3 ? c.text : c.text)).join(' ');
      const t = sanitizeText(text).replace(/\s+/g, ' ').trim();
      if (t) out.push(`\n${'  '.repeat(listDepth)}- ${t}`);
      node.childNodes.filter((c) => ['ul', 'ol'].includes(c.tagName?.toLowerCase())).forEach((c) => walk(c, listDepth + 1));
      return;
    }
    if (tag === 'pre') {
      out.push(`\n\n\`\`\`\n${sanitizeText(node.text).trim()}\n\`\`\`\n\n`);
      return;
    }
    if (tag === 'br') {
      out.push('\n');
      return;
    }
    if (tag === 'ul' || tag === 'ol') {
      if (listDepth === 0) out.push('\n\n');
      node.childNodes.forEach((c) => walk(c, listDepth));
      if (listDepth === 0) out.push('\n\n');
      return;
    }
    const block = BLOCK.has(tag);
    if (block) out.push('\n\n');
    node.childNodes.forEach((c) => walk(c, listDepth));
    if (block) out.push('\n\n');
  };
  walk(main);
  if (images) warnings.push(`${images} image(s) were skipped; any text inside images is NOT included`);

  const body = out
    .join('')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n[ \t]+(?![ \t]*- )/g, '\n') // keep the indentation of nested list items only
    .replace(/\n{3,}/g, '\n\n')
    .replace(/([^\n ])[ \t]{2,}/g, '$1 ')
    .replace(/(^|\n)(#+) +/g, '$1$2 ')
    .trim();
  if (body.length < 40) warnings.push('almost no text was found');
  return { title, markdown: body, warnings, stats: { characters: body.length, images } };
}
