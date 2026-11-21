/**
 * Turns the plain text of a pack passage into a small block structure, and then into DOM nodes.
 * Pack text is DATA: it is never parsed as HTML and never put into innerHTML. Every string reaches the page through
 * textContent, so markup inside a document is shown as text.
 *
 * Supported: paragraphs, "- " bullets, "1. " numbered steps, "| a | b |" tables, **bold**.
 */

const BULLET = /^\s*[-*]\s+(.*)$/;
const NUMBERED = /^\s*\d{1,3}[.)]\s+(.*)$/;
const TABLE_ROW = /^\s*\|.*\|\s*$/;
const TABLE_RULE = /^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?\s*$/;

const cells = (line) => line.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map((c) => c.trim());

/** @returns {{type: 'p'|'ul'|'ol'|'table', text?: string, items?: string[], head?: string[], rows?: string[][]}[]} */
export function parseBlocks(text) {
  const lines = String(text ?? '').replace(/\r\n?/g, '\n').split('\n');
  const blocks = [];
  let paragraph = [];
  const flush = () => {
    if (paragraph.length) blocks.push({ type: 'p', text: paragraph.join(' ') });
    paragraph = [];
  };
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!line.trim()) {
      flush();
    } else if (TABLE_ROW.test(line)) {
      flush();
      const rows = [];
      while (i < lines.length && TABLE_ROW.test(lines[i])) rows.push(lines[i++]);
      i--;
      const hasRule = rows.length > 1 && TABLE_RULE.test(rows[1]);
      blocks.push({
        type: 'table',
        head: hasRule ? cells(rows[0]) : [],
        rows: rows.slice(hasRule ? 2 : 0).filter((r) => !TABLE_RULE.test(r)).map(cells),
      });
    } else if (BULLET.test(line) || NUMBERED.test(line)) {
      flush();
      const ordered = NUMBERED.test(line);
      const rx = ordered ? NUMBERED : BULLET;
      const items = [];
      while (i < lines.length && lines[i].trim() && rx.test(lines[i])) items.push(rx.exec(lines[i++])[1].trim());
      i--;
      blocks.push({ type: ordered ? 'ol' : 'ul', items });
    } else {
      paragraph.push(line.trim());
    }
  }
  flush();
  return blocks;
}

/** Append text with **bold** spans to a node, using text nodes only. */
function appendInline(parent, text) {
  const parts = String(text).split(/\*\*(.+?)\*\*/g);
  parts.forEach((part, i) => {
    if (!part) return;
    if (i % 2 === 1) {
      const strong = parent.ownerDocument.createElement('strong');
      strong.textContent = part;
      parent.append(strong);
    } else {
      parent.append(parent.ownerDocument.createTextNode(part));
    }
  });
}

/** Render passage text into `container` (a DOM element). */
export function renderText(container, text) {
  const doc = container.ownerDocument;
  const make = (tag, parent = container) => parent.appendChild(doc.createElement(tag));
  for (const block of parseBlocks(text)) {
    if (block.type === 'p') {
      appendInline(make('p'), block.text);
    } else if (block.type === 'ul' || block.type === 'ol') {
      const list = make(block.type);
      block.items.forEach((item) => appendInline(make('li', list), item));
    } else {
      const wrap = make('div');
      wrap.className = 'table-wrap';
      const table = make('table', wrap);
      if (block.head.length) {
        const tr = make('tr', make('thead', table));
        block.head.forEach((h) => (make('th', tr).textContent = h));
      }
      const body = make('tbody', table);
      block.rows.forEach((row) => {
        const tr = make('tr', body);
        row.forEach((c) => appendInline(make('td', tr), c));
      });
    }
  }
  return container;
}
