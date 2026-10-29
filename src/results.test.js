import { test } from 'node:test';
import assert from 'node:assert/strict';
import { boardWithSeed } from './rules.js';
import { decodeBoard, encodeBoard, rankPlayers } from './results.js';

test('board survives encode and decode, keeping seed and placed tiles apart', () => {
  const board = boardWithSeed('PLANET');
  board[4][3] = { ch: 'A', kind: 'mine' };
  const text = encodeBoard(board);
  assert.equal(text.length, 121);
  assert.deepEqual(decodeBoard(text, 'PLANET'), board);
});

test('ranking: most tiles, then longest word breaks ties', () => {
  const ranked = rankPlayers([
    { name: 'Ann', score: 5, longest: 'CAT' },
    { name: 'Bob', score: 9, longest: 'DO' },
    { name: 'Cy', score: 5, longest: 'TIGERS' },
  ]);
  assert.deepEqual(ranked.map((p) => p.name), ['Bob', 'Cy', 'Ann']);
});
