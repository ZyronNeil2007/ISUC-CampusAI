import test from 'node:test';
import assert from 'node:assert/strict';
import { chunkMarkdown, parseBlocks, rowsToChunks, stripComments, CHUNK_DEFAULTS } from '../../src/ai/retrieval/ChunkManager.js';

const DOC = { id: 'enrollment-guide', title: 'Enrollment Guide', category: 'enrollment', office: 'Registrar' };

const words = (text) => text.toLowerCase().match(/[a-z0-9]+/g) ?? [];

test('stripComments removes HTML comments but keeps page markers', () => {
  const md = 'before <!-- TODO verify this --> after\n<!-- page: 3 -->\n<!--\nmulti\nline\n-->end';
  const out = stripComments(md);
  assert.ok(!out.includes('TODO'));
  assert.ok(!out.includes('multi'));
  assert.ok(out.includes('<!-- page: 3 -->'));
  assert.ok(out.includes('before  after'));
});

test('parseBlocks recognises headings, paragraphs, lists, tables, code and page markers', () => {
  const blocks = parseBlocks(
    [
      '# Title',
      '',
      'A paragraph',
      'continues here.',
      '',
      '- one',
      '- two',
      '  continued',
      '',
      '| a | b |',
      '|---|---|',
      '| 1 | 2 |',
      '',
      '```',
      '# not a heading',
      '',
      'still code',
      '```',
      '<!-- page: 2 -->',
      '1. first',
      '2) second',
    ].join('\n')
  );
  assert.deepEqual(
    blocks.map((b) => b.type),
    ['heading', 'paragraph', 'list', 'table', 'code', 'page', 'list']
  );
  assert.equal(blocks[1].text, 'A paragraph\ncontinues here.');
  assert.equal(blocks[2].text, '- one\n- two\n  continued');
  assert.ok(blocks[4].text.includes('# not a heading') && blocks[4].text.includes('still code'));
  assert.equal(blocks[5].page, 2);
  assert.equal(blocks[6].text, '1. first\n2) second');
});

test('parseBlocks tolerates Windows line endings', () => {
  const blocks = parseBlocks('# T\r\n\r\npara one\r\n\r\n- a\r\n- b\r\n');
  assert.deepEqual(blocks.map((b) => b.type), ['heading', 'paragraph', 'list']);
  assert.ok(blocks.every((b) => !b.text || !b.text.includes('\r')));
});

test('sections follow headings; a top-level heading equal to the document title is omitted', () => {
  const md = [
    '# Enrollment Guide',
    '',
    'Intro text for the guide that is long enough to be its own chunk of the document overall.',
    '',
    '## Requirements',
    '',
    'Bring your documents to the office.',
    '',
    '### Freshmen',
    '',
    'Freshmen submit Form 138.',
    '',
    '### Transferees',
    '',
    'Transferees submit a transcript.',
    '',
    '## Fees',
    '',
    'Fees are paid at the cashier.',
  ].join('\n');
  const chunks = chunkMarkdown(md, DOC);
  assert.deepEqual(
    chunks.map((c) => c.section),
    ['', 'Requirements', 'Requirements > Freshmen', 'Requirements > Transferees', 'Fees']
  );
  assert.equal(chunks[2].text, 'Freshmen submit Form 138.');
});

test('a level-1 heading that differs from the document title stays in the path', () => {
  const chunks = chunkMarkdown('# Other Heading\n\n## Sub\n\ntext here', DOC);
  assert.equal(chunks[0].section, 'Other Heading > Sub');
});

test('heading markup is cleaned in section names', () => {
  const chunks = chunkMarkdown('## **Bold** and [linked](http://x.test) `code`\n\ntext', DOC);
  assert.equal(chunks[0].section, 'Bold and linked code');
});

test('chunk ids are sequential, zero-padded and tied to the document', () => {
  const chunks = chunkMarkdown('## A\n\none\n\n## B\n\ntwo\n\n## C\n\nthree', DOC);
  assert.deepEqual(chunks.map((c) => c.id), ['enrollment-guide:001', 'enrollment-guide:002', 'enrollment-guide:003']);
  assert.ok(chunks.every((c) => c.documentId === 'enrollment-guide'));
  assert.deepEqual(chunks[0].metadata, { category: 'enrollment', office: 'Registrar' });
});

test('page markers set the page; text before any marker has no page', () => {
  const md = ['## A', '', 'before any marker', '', '<!-- page: 2 -->', '', '## B', '', 'on page two', '', '<!-- page: 3 -->', '', 'now page three'].join('\n');
  const chunks = chunkMarkdown(md, DOC);
  assert.equal(chunks[0].page, null);
  assert.equal(chunks[1].page, 2);
  assert.equal(chunks[1].section, 'B');
  assert.ok(chunks[1].text.includes('on page two'));
});

test('other HTML comments never reach chunk text', () => {
  const chunks = chunkMarkdown('## A\n\nvisible <!-- hidden TODO: ask the registrar --> text\n\n<!-- DRAFT BANNER -->', DOC);
  const all = chunks.map((c) => c.text).join('\n');
  assert.ok(all.includes('visible'));
  assert.ok(!/TODO|hidden|BANNER/.test(all));
});

test('a fenced block with # lines does not create sections', () => {
  const chunks = chunkMarkdown('## A\n\n```\n# comment\ncode\n```\n\nafter', DOC);
  assert.equal(chunks.length, 1);
  assert.equal(chunks[0].section, 'A');
  assert.ok(chunks[0].text.includes('# comment'));
});

test('short blocks in one section are grouped up to the target size, not one chunk per paragraph', () => {
  const paras = Array.from({ length: 4 }, (_, i) => `Paragraph ${i} has a few words in it.`);
  const chunks = chunkMarkdown(`## A\n\n${paras.join('\n\n')}`, DOC);
  assert.equal(chunks.length, 1);
  assert.ok(chunks[0].text.includes('Paragraph 3'));
});

test('a long section is split into chunks no larger than maxChars, losing no words', () => {
  const sentences = Array.from({ length: 60 }, (_, i) => `Sentence number ${i} explains requirement ${i} for the enrollment process.`);
  const md = `## Long\n\n${sentences.join(' ')}`;
  const chunks = chunkMarkdown(md, DOC);
  assert.ok(chunks.length > 2);
  for (const c of chunks) {
    assert.ok(c.text.length <= CHUNK_DEFAULTS.maxChars, `chunk of ${c.text.length} chars exceeds the limit`);
    assert.equal(c.section, 'Long');
  }
  const covered = new Set(chunks.flatMap((c) => words(c.text)));
  for (const w of words(sentences.join(' '))) assert.ok(covered.has(w), `missing word ${w}`);
});

test('sentence windows overlap by one sentence so context is not cut mid-thought', () => {
  const sentences = Array.from({ length: 40 }, (_, i) => `Sentence ${String(i).padStart(2, '0')} is here and says something useful.`);
  const chunks = chunkMarkdown(`## S\n\n${sentences.join(' ')}`, DOC, { targetChars: 300, maxChars: 400 });
  assert.ok(chunks.length > 2);
  for (let i = 1; i < chunks.length; i++) {
    const prevLast = chunks[i - 1].text.split(/(?<=\.)\s+/).pop();
    assert.ok(chunks[i].text.startsWith(prevLast), `chunk ${i} should start with the last sentence of chunk ${i - 1}`);
  }
});

test('a long list is split between items, never inside one', () => {
  const items = Array.from({ length: 50 }, (_, i) => `- Item ${i}: submit document number ${i} to the office`);
  const chunks = chunkMarkdown(`## Requirements\n\n${items.join('\n')}`, DOC);
  assert.ok(chunks.length > 1);
  for (const c of chunks) {
    assert.ok(c.text.length <= CHUNK_DEFAULTS.maxChars);
    for (const line of c.text.split('\n')) assert.match(line, /^- Item \d+: submit document number \d+ to the office$/);
  }
  assert.equal(chunks.flatMap((c) => c.text.split('\n')).length, 50);
});

test('a long table is split by rows and every part repeats the header', () => {
  const rows = Array.from({ length: 40 }, (_, i) => `| Office ${i} | Room ${i} | 08:00-17:00 weekdays |`);
  const table = ['| Office | Room | Hours |', '|---|---|---|', ...rows].join('\n');
  const chunks = chunkMarkdown(`## Offices\n\n${table}`, DOC);
  assert.ok(chunks.length > 1);
  for (const c of chunks) {
    const lines = c.text.split('\n');
    assert.equal(lines[0], '| Office | Room | Hours |');
    assert.equal(lines[1], '|---|---|---|');
    assert.ok(c.text.length <= CHUNK_DEFAULTS.maxChars);
  }
  assert.equal(chunks.reduce((n, c) => n + c.text.split('\n').length - 2, 0), 40);
});

test('a single enormous word is hard-wrapped rather than exceeding the limit', () => {
  const chunks = chunkMarkdown(`## A\n\n${'x'.repeat(3000)}`, DOC);
  assert.ok(chunks.length >= 2);
  for (const c of chunks) assert.ok(c.text.length <= CHUNK_DEFAULTS.maxChars);
});

test('a tiny trailing piece is folded into the previous chunk when it fits', () => {
  const big = 'Word '.repeat(170).trim() + '.'; // ~850 chars, fits one chunk
  const chunks = chunkMarkdown(`## A\n\n${big}\n\nTiny end.`, DOC);
  assert.equal(chunks.length, 1);
  assert.ok(chunks[0].text.endsWith('Tiny end.'));
});

test('empty and heading-only documents produce no chunks', () => {
  assert.deepEqual(chunkMarkdown('', DOC), []);
  assert.deepEqual(chunkMarkdown('# Enrollment Guide\n\n## Empty\n\n## Also empty', DOC), []);
  assert.deepEqual(chunkMarkdown('<!-- only a comment -->', DOC), []);
});

test('chunking is deterministic', () => {
  const md = '## A\n\n' + 'Some sentence about fees. '.repeat(100);
  assert.deepEqual(chunkMarkdown(md, DOC), chunkMarkdown(md, DOC));
});

test('rowsToChunks makes one "Header: value" chunk per row and skips empty cells and rows', () => {
  const doc = { id: 'offices', title: 'Offices', category: 'campus_offices', office: 'Admin' };
  const chunks = rowsToChunks(
    ['Office', 'Location', 'Hours', 'Email'],
    [
      ['Registrar', 'Ground floor', '8-5', ''],
      ['', '', '', ''],
      ['Library', '2F', '', 'lib@example.test'],
    ],
    doc
  );
  assert.equal(chunks.length, 2);
  assert.equal(chunks[0].id, 'offices:001');
  assert.equal(chunks[0].section, 'Registrar');
  assert.equal(chunks[0].text, 'Office: Registrar\nLocation: Ground floor\nHours: 8-5');
  assert.equal(chunks[1].id, 'offices:003'); // ids follow the source row so edits stay traceable
  assert.equal(chunks[1].text, 'Office: Library\nLocation: 2F\nEmail: lib@example.test');
  assert.equal(chunks[1].page, null);
});
