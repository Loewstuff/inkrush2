import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { boardWithSeed, checkMove, SEED_WORDS } from './rules.js';

const dict = new Set(readFileSync(new URL('../public/enable.txt', import.meta.url), 'utf8').split(/\s+/));
const isWord = (w) => dict.has(w);
const tiles = (s, r, c, dir) =>
  [...s].map((ch, i) => ({ ch, r: dir === 'down' ? r + i : r, c: dir === 'down' ? c : c + i }));

test('all seed words are valid and 5-7 letters', () => {
  for (const w of SEED_WORDS) {
    assert.ok(isWord(w.toLowerCase()), w);
    assert.ok(w.length >= 5 && w.length <= 7, w);
  }
});

// PLANET sits at row 5, cols 2..7
const board = () => boardWithSeed('PLANET');

test('valid down word through a seed letter', () => {
  // "PLANET" A at col 4 -> "CAT" down: C(4,4) A existing(5,4) T(6,4)
  const res = checkMove(board(), [{ ch: 'C', r: 4, c: 4 }, { ch: 'T', r: 6, c: 4 }], isWord);
  assert.equal(res.ok, true);
  assert.deepEqual(res.words, ['CAT']);
});

test('rejects disconnected, gapped, diagonal, and non-words', () => {
  assert.equal(checkMove(board(), tiles('CAT', 0, 0, 'across'), isWord).ok, false);
  assert.equal(checkMove(board(), [{ ch: 'C', r: 3, c: 4 }, { ch: 'T', r: 6, c: 4 }], isWord).error, 'No gaps allowed');
  assert.equal(checkMove(board(), [{ ch: 'C', r: 4, c: 3 }, { ch: 'T', r: 6, c: 4 }], isWord).ok, false);
  assert.equal(checkMove(board(), [{ ch: 'Q', r: 4, c: 4 }, { ch: 'Z', r: 6, c: 4 }], isWord).ok, false);
});

test('crossing words must also be valid', () => {
  // Laying "AT" across at row 4 cols 4..5 above A and N forms AA? -> "AA" (valid) and "TN" (invalid)
  const res = checkMove(board(), tiles('AT', 4, 4, 'across'), isWord);
  assert.equal(res.ok, false);
});

test('single tile extending the seed word counts', () => {
  // PLANETS: S at (5,8)
  const res = checkMove(board(), [{ ch: 'S', r: 5, c: 8 }], isWord);
  assert.equal(res.ok, true);
  assert.deepEqual(res.words, ['PLANETS']);
});
