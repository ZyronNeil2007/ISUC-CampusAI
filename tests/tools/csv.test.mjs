import test from 'node:test';
import assert from 'node:assert/strict';
import { parseCsv } from '../../tools/lib/csv.mjs';

test('parses plain rows and a missing final newline', () => {
  assert.deepEqual(parseCsv('a,b,c\n1,2,3'), [['a', 'b', 'c'], ['1', '2', '3']]);
  assert.deepEqual(parseCsv('a,b\n1,2\n'), [['a', 'b'], ['1', '2']]);
});

test('quoted fields keep commas, quotes and line breaks', () => {
  const rows = parseCsv('name,notes\n"Smith, J.","said ""hi"""\n"two\nlines",x\n');
  assert.deepEqual(rows, [['name', 'notes'], ['Smith, J.', 'said "hi"'], ['two\nlines', 'x']]);
});

test('handles CRLF, lone CR and a byte-order mark', () => {
  assert.deepEqual(parseCsv('﻿a,b\r\n1,2\r\n'), [['a', 'b'], ['1', '2']]);
  assert.deepEqual(parseCsv('a,b\r1,2'), [['a', 'b'], ['1', '2']]);
  assert.deepEqual(parseCsv('a\r\n"x\r\ny"\r\n'), [['a'], ['x\ny']]);
});

test('empty cells are kept and blank lines are dropped', () => {
  assert.deepEqual(parseCsv('a,b,c\n1,,3\n\n,,\n4,5,6'), [['a', 'b', 'c'], ['1', '', '3'], ['4', '5', '6']]);
  assert.deepEqual(parseCsv(''), []);
  assert.deepEqual(parseCsv('\n\n'), []);
});

test('malformed quotes report the line', () => {
  assert.throws(() => parseCsv('a,b\n1,"never closed\n2,3'), /line 2: a quoted field is never closed/);
  assert.throws(() => parseCsv('a,b\nab"c,2'), /line 2: a quote appears in the middle/);
});
