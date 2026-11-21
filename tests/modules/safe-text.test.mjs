import test from 'node:test';
import assert from 'node:assert/strict';
import { parseBlocks } from '../../src/utils/safeText.js';

test('paragraphs, bullets, numbered steps and tables', () => {
  const blocks = parseBlocks('Intro line\ncontinues.\n\n- one\n- two\n\n1. first\n2) second\n\n| Item | Fee |\n|------|-----|\n| TOR | 100 |');
  assert.deepEqual(blocks, [
    { type: 'p', text: 'Intro line continues.' },
    { type: 'ul', items: ['one', 'two'] },
    { type: 'ol', items: ['first', 'second'] },
    { type: 'table', head: ['Item', 'Fee'], rows: [['TOR', '100']] },
  ]);
});

test('a table without a header rule has no head; empty input has no blocks', () => {
  assert.deepEqual(parseBlocks('| a | b |\n| c | d |'), [{ type: 'table', head: [], rows: [['a', 'b'], ['c', 'd']] }]);
  assert.deepEqual(parseBlocks(''), []);
  assert.deepEqual(parseBlocks(null), []);
});

test('markup in a document stays as text in the block structure (rendering uses textContent only)', () => {
  const [block] = parseBlocks('<img src=x onerror=alert(1)> <script>bad()</script>');
  assert.equal(block.type, 'p');
  assert.equal(block.text, '<img src=x onerror=alert(1)> <script>bad()</script>');
});

test('the renderer never uses innerHTML', async () => {
  const { readFile } = await import('node:fs/promises');
  for (const f of ['src/utils/safeText.js', 'src/pages/shared/packView.js', 'src/pages/directory/directory.js', 'src/pages/guide/guide.js', 'src/pages/announcements/announcements.js', 'src/pages/map/map.js']) {
    const code = await readFile(new URL(`../../${f}`, import.meta.url), 'utf8');
    assert.ok(!/innerHTML|insertAdjacentHTML|outerHTML/.test(code.replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, '')), `${f} must not write HTML`);
  }
});
