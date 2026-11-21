/**
 * Splits a document's Markdown body into searchable, citable chunks (README 14.4).
 *
 * - Chunks follow the document's own headings, so every chunk knows its section ("Enrollment > Requirements").
 * - Blocks (paragraphs, lists, tables) stay whole when they fit; oversized ones are split by list item,
 *   table row (repeating the header) or sentence (with one sentence of overlap).
 * - `<!-- page: N -->` markers set the chunk's page; all other HTML comments are dropped.
 * Pure functions, so the build tool and tests can share them.
 */

export const CHUNK_DEFAULTS = Object.freeze({ targetChars: 900, maxChars: 1300, minChars: 120 });

const PAGE_RE = /^\s*<!--\s*page:\s*(\d+)\s*-->\s*$/i;
const HEADING_RE = /^(#{1,6})\s+(.+?)\s*#*\s*$/;
const LIST_RE = /^\s*(?:[-*+]|\d+[.)])\s+/;
const TABLE_RE = /^\s*\|.*\|\s*$/;
const FENCE_RE = /^\s*```/;

/** Remove HTML comments except page markers. */
export function stripComments(markdown) {
  return markdown.replace(/<!--(?!\s*page:)[\s\S]*?-->/gi, '');
}

/** Parse Markdown into blocks: heading, page, paragraph, list, table, code. */
export function parseBlocks(markdown) {
  const lines = markdown.replace(/\r\n?/g, '\n').split('\n');
  const blocks = [];
  let current = null;
  let inFence = false;

  const flush = () => {
    if (current) blocks.push({ type: current.type, text: current.lines.join('\n').trimEnd() });
    current = null;
  };

  for (const line of lines) {
    if (inFence) {
      current.lines.push(line);
      if (FENCE_RE.test(line)) {
        inFence = false;
        flush();
      }
      continue;
    }
    if (FENCE_RE.test(line)) {
      flush();
      current = { type: 'code', lines: [line] };
      inFence = true;
      continue;
    }
    const page = PAGE_RE.exec(line);
    if (page) {
      flush();
      blocks.push({ type: 'page', page: Number(page[1]) });
      continue;
    }
    const heading = HEADING_RE.exec(line);
    if (heading) {
      flush();
      blocks.push({ type: 'heading', level: heading[1].length, text: heading[2] });
      continue;
    }
    if (/^\s*$/.test(line)) {
      flush();
      continue;
    }
    const kind = TABLE_RE.test(line) ? 'table' : LIST_RE.test(line) ? 'list' : 'paragraph';
    if (current && current.type === kind) {
      current.lines.push(line);
    } else if (current && current.type === 'list' && kind === 'paragraph' && /^\s+\S/.test(line)) {
      current.lines.push(line); // indented continuation of a list item
    } else {
      flush();
      current = { type: kind, lines: [line] };
    }
  }
  flush();
  return blocks;
}

/* ---------- splitting oversized blocks ---------- */

function splitSentences(text) {
  const parts = text.match(/[^.!?]+(?:[.!?]+["')\]]*|$)\s*/g) ?? [text];
  return parts.map((s) => s.trim()).filter(Boolean);
}

function hardWrap(text, max) {
  const out = [];
  let line = '';
  for (const word of text.split(/\s+/)) {
    if (word.length > max) {
      if (line) out.push(line);
      for (let i = 0; i < word.length; i += max) out.push(word.slice(i, i + max));
      line = '';
      continue;
    }
    if (line && line.length + 1 + word.length > max) {
      out.push(line);
      line = word;
    } else {
      line = line ? `${line} ${word}` : word;
    }
  }
  if (line) out.push(line);
  return out;
}

function packUnits(units, limit, joiner) {
  const parts = [];
  let buf = [];
  let len = 0;
  for (const raw of units) {
    const pieces = raw.length > limit ? hardWrap(raw, limit) : [raw];
    for (const unit of pieces) {
      const add = (buf.length ? joiner.length : 0) + unit.length;
      if (buf.length && len + add > limit) {
        parts.push(buf.join(joiner));
        buf = [];
        len = 0;
      }
      len += (buf.length ? joiner.length : 0) + unit.length;
      buf.push(unit);
    }
  }
  if (buf.length) parts.push(buf.join(joiner));
  return parts;
}

function groupListItems(lines) {
  const items = [];
  for (const line of lines) {
    if (LIST_RE.test(line) || items.length === 0) items.push(line);
    else items[items.length - 1] += `\n${line}`;
  }
  return items;
}

function splitSentenceWindows(text, targetChars, maxChars) {
  const sentences = splitSentences(text).flatMap((s) => (s.length > maxChars ? hardWrap(s, targetChars) : [s]));
  const parts = [];
  let cur = [];
  let len = 0;
  for (const sentence of sentences) {
    if (cur.length && len + sentence.length + 1 > targetChars) {
      parts.push(cur.join(' '));
      const last = cur[cur.length - 1];
      cur = last.length <= 200 ? [last] : []; // one sentence of overlap keeps context across the cut
      len = cur.reduce((n, s) => n + s.length + 1, 0);
    }
    cur.push(sentence);
    len += sentence.length + 1;
  }
  if (cur.length) parts.push(cur.join(' '));
  return parts;
}

function splitBlock(block, { targetChars, maxChars }) {
  if (block.text.length <= maxChars) return [block.text];
  const lines = block.text.split('\n');
  if (block.type === 'list') return packUnits(groupListItems(lines), targetChars, '\n');
  if (block.type === 'table') {
    const hasSeparator = lines.length > 1 && /^\s*\|?[\s:|-]+\|?\s*$/.test(lines[1]);
    const header = hasSeparator ? lines.slice(0, 2) : [];
    const rows = hasSeparator ? lines.slice(2) : lines;
    const headerText = header.join('\n');
    const room = Math.max(200, targetChars - headerText.length - 1);
    return packUnits(rows, room, '\n').map((part) => (headerText ? `${headerText}\n${part}` : part));
  }
  return splitSentenceWindows(block.text, targetChars, maxChars);
}

/* ---------- chunking ---------- */

const cleanHeading = (text) =>
  text
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/[*_`]/g, '')
    .replace(/\s+/g, ' ')
    .trim();

const comparable = (text) => cleanHeading(text).toLowerCase();

/**
 * @param {string} markdown document body (front matter already removed)
 * @param {{id: string, title: string, category?: string, office?: string}} doc
 * @returns {{id, documentId, section, page, text, metadata}[]}
 */
export function chunkMarkdown(markdown, doc, options = {}) {
  const { targetChars, maxChars, minChars } = { ...CHUNK_DEFAULTS, ...options };
  const blocks = parseBlocks(stripComments(markdown));
  const chunks = [];
  const stack = [];
  const titleKey = comparable(doc.title ?? '');
  let page = null;
  let pending = [];
  let counter = 0;

  const emit = (section, parts) => {
    if (!parts.length) return;
    const groups = [];
    let buf = [];
    let len = 0;
    for (const part of parts) {
      const add = (buf.length ? 2 : 0) + part.text.length;
      if (buf.length && len + add > targetChars) {
        groups.push(buf);
        buf = [];
        len = 0;
      }
      len += (buf.length ? 2 : 0) + part.text.length;
      buf.push(part);
    }
    if (buf.length) groups.push(buf);

    // Fold a tiny trailing group into the previous one when it still fits.
    if (groups.length > 1) {
      const lastText = groups[groups.length - 1].map((p) => p.text).join('\n\n');
      const prevText = groups[groups.length - 2].map((p) => p.text).join('\n\n');
      if (lastText.length < minChars && prevText.length + 2 + lastText.length <= maxChars) {
        groups[groups.length - 2].push(...groups.pop());
      }
    }

    for (const group of groups) {
      counter += 1;
      chunks.push({
        id: `${doc.id}:${String(counter).padStart(3, '0')}`,
        documentId: doc.id,
        section,
        page: group[0].page,
        text: group.map((p) => p.text).join('\n\n'),
        metadata: { category: doc.category ?? null, office: doc.office ?? null },
      });
    }
  };

  const flush = () => {
    emit(stack.map((h) => h.text).join(' > '), pending);
    pending = [];
  };

  for (const block of blocks) {
    if (block.type === 'page') {
      page = block.page;
    } else if (block.type === 'heading') {
      flush();
      while (stack.length && stack[stack.length - 1].level >= block.level) stack.pop();
      // A top-level heading that just repeats the document title adds nothing to the section path.
      if (!(block.level === 1 && comparable(block.text) === titleKey)) {
        stack.push({ level: block.level, text: cleanHeading(block.text) });
      }
    } else {
      for (const text of splitBlock(block, { targetChars, maxChars })) pending.push({ text, page });
    }
  }
  flush();
  return chunks;
}

/**
 * One chunk per table row ("Header: value" lines). Used for CSV sources such as office lists.
 * The first column's value becomes the section so citations read "Office of the Registrar".
 */
export function rowsToChunks(headers, rows, doc) {
  const chunks = [];
  rows.forEach((row, i) => {
    const cells = headers.map((h, col) => [h, (row[col] ?? '').trim()]).filter(([, v]) => v !== '');
    if (!cells.length) return;
    chunks.push({
      id: `${doc.id}:${String(i + 1).padStart(3, '0')}`,
      documentId: doc.id,
      section: cells[0][1],
      page: null,
      text: cells.map(([h, v]) => `${h}: ${v}`).join('\n'),
      metadata: { category: doc.category ?? null, office: doc.office ?? null },
    });
  });
  return chunks;
}
