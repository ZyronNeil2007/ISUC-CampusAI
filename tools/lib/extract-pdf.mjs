import { sanitizeText } from './draft-markdown.mjs';

/**
 * PDF to draft Markdown using pdf.js text positions.
 *
 * Limits, stated plainly: only the text layer is read (scanned pages need OCR, which is NOT done here); tables are
 * flattened into lines; columns are read in the order the file stores them. Headings are guessed from font size and
 * lists from bullets, so the result is a starting point for a person, never a finished document.
 */

const BULLET = /^([•·▪◦●■\-–*]|\d{1,2}[.)]|[a-z][.)])\s+/;
const PAGE_NUMBER = /^(page\s*)?\d{1,4}(\s*(of|\/)\s*\d{1,4})?$/i;
const EDGE = 0.08; // top and bottom 8% of the page count as header and footer area

const norm = (s) => s.toLowerCase().replace(/\d+/g, '#').replace(/\s+/g, ' ').trim();

/** @param {{items: {str: string, x: number, y: number, h: number}[]}} page */
function toLines(page) {
  const items = page.items.filter((i) => i.str.trim() !== '').sort((a, b) => b.y - a.y || a.x - b.x);
  const lines = [];
  for (const item of items) {
    const line = lines.find((l) => Math.abs(l.y - item.y) <= Math.max(2, item.h * 0.4));
    if (line) line.items.push(item);
    else lines.push({ y: item.y, items: [item] });
  }
  return lines
    .sort((a, b) => b.y - a.y)
    .map((l) => {
      const parts = l.items.sort((a, b) => a.x - b.x);
      let text = '';
      let end = null;
      for (const p of parts) {
        const gap = end === null ? 0 : p.x - end;
        text += (end !== null && gap > p.h * 0.15 && !text.endsWith(' ') && !p.str.startsWith(' ') ? ' ' : '') + p.str;
        end = p.x + (p.w ?? p.str.length * p.h * 0.5);
      }
      return { y: l.y, h: Math.max(...parts.map((p) => p.h)), text: sanitizeText(text).replace(/\s+/g, ' ').trim() };
    })
    .filter((l) => l.text);
}

/**
 * Pure layout step (no pdf.js), so it can be tested with plain objects.
 * @param {{number: number, width: number, height: number, items: object[]}[]} pages
 */
export function layoutPages(pages) {
  const warnings = [];
  const perPage = pages.map((p) => ({ ...p, lines: toLines(p) }));

  // Header/footer: the same text near the top or bottom edge on most pages, plus bare page numbers.
  const edgeCount = new Map();
  const isEdge = (p, l) => l.y > p.height * (1 - EDGE) || l.y < p.height * EDGE;
  for (const p of perPage) {
    for (const key of new Set(p.lines.filter((l) => isEdge(p, l)).map((l) => norm(l.text)))) edgeCount.set(key, (edgeCount.get(key) ?? 0) + 1);
  }
  const repeated = new Set([...edgeCount].filter(([, n]) => pages.length >= 2 && n >= Math.max(2, Math.ceil(pages.length / 2))).map(([k]) => k));
  for (const p of perPage) p.lines = p.lines.filter((l) => !(isEdge(p, l) && (repeated.has(norm(l.text)) || PAGE_NUMBER.test(l.text))));

  // Body size = the font size that carries the most characters.
  const weight = new Map();
  for (const p of perPage) for (const l of p.lines) weight.set(Math.round(l.h), (weight.get(Math.round(l.h)) ?? 0) + l.text.length);
  const body = [...weight].sort((a, b) => b[1] - a[1])[0]?.[0] ?? 11;
  const headingSizes = [...new Set([...perPage.flatMap((p) => p.lines)].filter((l) => l.h >= body * 1.15 && l.text.length <= 120).map((l) => Math.round(l.h)))].sort((a, b) => b - a);
  const levelOf = (h) => Math.min(headingSizes.indexOf(Math.round(h)) + 1, 3);

  const out = [];
  let title = '';
  for (const p of perPage) {
    out.push(`<!-- page: ${p.number} -->`);
    if (p.lines.length === 0) {
      warnings.push(`page ${p.number} has no text layer (a scan or an image?). No OCR was done, so its content is missing`);
      continue;
    }
    let para = null;
    const flush = () => {
      if (para) out.push(para.text);
      para = null;
    };
    for (const l of p.lines) {
      if (l.h >= body * 1.15 && headingSizes.includes(Math.round(l.h)) && l.text.length <= 120) {
        flush();
        const level = levelOf(l.h);
        if (!title && level === 1) title = l.text;
        const last = out.at(-1);
        if (last?.startsWith('#') && last.split(' ')[0].length === level) out[out.length - 1] = `${last} ${l.text}`; // wrapped heading
        else out.push(`${'#'.repeat(level)} ${l.text}`);
      } else if (BULLET.test(l.text)) {
        flush();
        out.push(l.text.replace(BULLET, (m) => (/^\d/.test(m) ? m.replace(/[)]/, '.') : '- ')));
      } else if (para && para.y - l.y <= l.h * 1.6) {
        para.text = /[a-z]-$/.test(para.text) && /^[a-z]/.test(l.text) ? para.text.slice(0, -1) + l.text : `${para.text} ${l.text}`;
        para.y = l.y;
      } else {
        flush();
        para = { text: l.text, y: l.y };
      }
    }
    flush();
  }
  // Blank line between blocks, but consecutive list items stay together.
  const isItem = (t) => /^(- |\d+\. )/.test(t);
  const markdown = out.reduce((acc, t, i) => acc + (i === 0 ? '' : isItem(t) && isItem(out[i - 1]) ? '\n' : '\n\n') + t, '');
  if (markdown.replace(/<!-- page: \d+ -->/g, '').trim().length < 40) warnings.push('almost no text was found');
  if (headingSizes.length === 0) warnings.push('no headings were detected (all text is one size): add headings by hand so passages get section names');
  warnings.push('tables, columns and footnotes are not reconstructed: compare the layout with the original');
  return { title, markdown, warnings, stats: { pages: pages.length, bodySize: body, headingSizes } };
}

export async function extractPdf(bytes) {
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const task = pdfjs.getDocument({ data: new Uint8Array(bytes), useSystemFonts: true, isEvalSupported: false, disableFontFace: true, verbosity: 0 });
  const doc = await task.promise;
  const pages = [];
  try {
    for (let n = 1; n <= doc.numPages; n++) {
      const page = await doc.getPage(n);
      const [, , width, height] = page.view;
      const content = await page.getTextContent();
      pages.push({
        number: n,
        width,
        height,
        items: content.items
          .filter((i) => typeof i.str === 'string')
          .map((i) => ({ str: i.str, x: i.transform[4], y: i.transform[5], h: Math.hypot(i.transform[2], i.transform[3]) || i.height, w: i.width })),
      });
    }
  } finally {
    await task.destroy();
  }
  return layoutPages(pages);
}
