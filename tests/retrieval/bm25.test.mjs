import test from 'node:test';
import assert from 'node:assert/strict';
import { BM25Index } from '../../src/ai/retrieval/BM25.js';

const close = (actual, expected, eps = 1e-9) =>
  assert.ok(Math.abs(actual - expected) < eps, `expected ${actual} to be within ${eps} of ${expected}`);

const docs = [
  { id: 'd1', terms: ['a', 'b', 'b'] },
  { id: 'd2', terms: ['b', 'c'] },
  { id: 'd3', terms: ['c', 'c', 'c', 'd'] },
];

test('scores match a hand-computed BM25 (k1=1.2, b=0.75, Lucene idf)', () => {
  const index = new BM25Index(docs);
  assert.equal(index.size, 3);
  close(index.avgdl, 3);

  const idfB = Math.log(1 + (3 - 2 + 0.5) / (2 + 0.5)); // b appears in 2 of 3 docs
  close(index.idf('b'), idfB);
  close(idfB, 0.4700036292457356);

  const results = index.search(new Map([['b', 1]]));
  assert.deepEqual(results.map((r) => r.id), ['d1', 'd2']);
  // d1: tf 2, len 3 -> norm 1;   d2: tf 1, len 2 -> norm 0.75
  close(results[0].score, idfB * ((2 * 2.2) / (2 + 1.2 * 1)));
  close(results[1].score, idfB * ((1 * 2.2) / (1 + 1.2 * 0.75)));
  close(results[0].score, 0.6463, 1e-3);
  close(results[1].score, 0.5442, 1e-3);
});

test('idf: rarer terms score higher, a term in every doc is still positive, unknown terms get the maximum', () => {
  const index = new BM25Index([
    { id: 'x', terms: ['common', 'rare'] },
    { id: 'y', terms: ['common'] },
    { id: 'z', terms: ['common'] },
  ]);
  assert.ok(index.idf('rare') > index.idf('common'));
  assert.ok(index.idf('common') > 0);
  close(index.idf('never-seen'), index.maxIdf);
  assert.ok(index.idf('never-seen') > index.idf('rare'));
  assert.equal(index.docFreq('common'), 3);
  assert.equal(index.docFreq('rare'), 1);
  assert.equal(index.docFreq('never-seen'), 0);
  assert.ok(index.has('rare'));
  assert.ok(!index.has('never-seen'));
});

test('higher term frequency ranks higher; extra occurrences give diminishing returns', () => {
  const filler = ['x', 'y', 'z', 'w', 'v', 'u'];
  const index = new BM25Index([
    { id: 'one', terms: ['fee', ...filler] },
    { id: 'two', terms: ['fee', 'fee', ...filler.slice(1)] },
    { id: 'four', terms: ['fee', 'fee', 'fee', 'fee', ...filler.slice(3)] },
    { id: 'none', terms: filler },
  ]);
  const scores = Object.fromEntries(index.search(new Map([['fee', 1]])).map((r) => [r.id, r.score]));
  assert.ok(scores.two > scores.one);
  assert.ok(scores.four > scores.two);
  // Saturation: later occurrences add less per occurrence than the first repeat did.
  assert.ok(scores.two - scores.one > (scores.four - scores.two) / 2);
  assert.ok(!('none' in scores));
});

test('length normalisation: a short passage beats a long one with the same term count', () => {
  const index = new BM25Index([
    { id: 'short', terms: ['fee', 'pay'] },
    { id: 'long', terms: ['fee', ...Array.from({ length: 40 }, (_, i) => `w${i}`)] },
    { id: 'other', terms: ['unrelated'] },
  ]);
  const [first, second] = index.search(new Map([['fee', 1]]));
  assert.equal(first.id, 'short');
  assert.equal(second.id, 'long');
  assert.ok(first.score > second.score);
});

test('term weights scale each term\'s contribution (aliases count less)', () => {
  const index = new BM25Index([
    { id: 'orig', terms: ['tor', 'x'] },
    { id: 'alias', terms: ['transcript', 'x'] },
    { id: 'pad', terms: ['y', 'z'] },
  ]);
  const results = index.search(new Map([['tor', 1], ['transcript', 0.6]]));
  assert.equal(results[0].id, 'orig');
  assert.equal(results[1].id, 'alias');
  close(results[1].score / results[0].score, (0.6 * index.idf('transcript')) / (1 * index.idf('tor')));
});

test('matched lists the query terms found in each document', () => {
  const index = new BM25Index(docs);
  const [top] = index.search(new Map([['b', 1], ['c', 1], ['zzz', 1]]));
  assert.ok(top.matched.every((t) => ['b', 'c'].includes(t)));
  const d2 = index.search(new Map([['b', 1], ['c', 1]])).find((r) => r.id === 'd2');
  assert.deepEqual([...d2.matched].sort(), ['b', 'c']);
});

test('filter hides documents without changing idf or the scores of the rest', () => {
  const index = new BM25Index(docs);
  const idfBefore = index.idf('b');
  const all = index.search(new Map([['b', 1]]));
  const filtered = index.search(new Map([['b', 1]]), { filter: (i) => index.ids[i] !== 'd1' });
  assert.deepEqual(filtered.map((r) => r.id), ['d2']);
  assert.equal(index.idf('b'), idfBefore);
  close(filtered[0].score, all.find((r) => r.id === 'd2').score);
});

test('ties are broken by id so results are deterministic', () => {
  const index = new BM25Index([
    { id: 'c', terms: ['same', 'text'] },
    { id: 'a', terms: ['same', 'text'] },
    { id: 'b', terms: ['same', 'text'] },
    { id: 'other', terms: ['else'] },
  ]);
  const ids = index.search(new Map([['same', 1]])).map((r) => r.id);
  assert.deepEqual(ids, ['a', 'b', 'c']);
  assert.deepEqual(index.search(new Map([['same', 1]])).map((r) => r.id), ids);
});

test('limit caps the result count', () => {
  const index = new BM25Index(Array.from({ length: 20 }, (_, i) => ({ id: `d${String(i).padStart(2, '0')}`, terms: ['t', `u${i}`] })));
  assert.equal(index.search(new Map([['t', 1]]), { limit: 5 }).length, 5);
  assert.equal(index.search(new Map([['t', 1]])).length, 10);
});

test('empty corpus, empty query and unknown terms return no results', () => {
  assert.deepEqual(new BM25Index([]).search(new Map([['a', 1]])), []);
  assert.deepEqual(new BM25Index(docs).search(new Map()), []);
  assert.deepEqual(new BM25Index(docs).search(null), []);
  assert.deepEqual(new BM25Index(docs).search(new Map([['nope', 1]])), []);
});

test('empty documents are tolerated', () => {
  const index = new BM25Index([{ id: 'e', terms: [] }, { id: 'f', terms: ['x'] }]);
  assert.deepEqual(index.search(new Map([['x', 1]])).map((r) => r.id), ['f']);
});

test('maxScore is the sum of weight * idf * (k1 + 1) over the query terms', () => {
  const index = new BM25Index(docs);
  const q = new Map([['b', 1], ['c', 0.6]]);
  close(index.maxScore(q), (index.idf('b') + 0.6 * index.idf('c')) * 2.2);
  const best = index.search(q)[0].score;
  assert.ok(best <= index.maxScore(q));
});
