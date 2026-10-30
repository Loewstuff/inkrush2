import { test } from 'node:test';
import assert from 'node:assert/strict';
import { boardWithSeed } from './rules.js';
import { decodeBoard, encodeBoard, rankPlayers, withPlaces } from './results.js';

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

const places = (entries) => withPlaces(rankPlayers(entries)).map((p) => `${p.name}:${p.place}`);

test('places: 2-player game', () => {
  assert.deepEqual(places([
    { name: 'Ann', score: 4, longest: 'CAT' },
    { name: 'Bob', score: 7, longest: 'DOG' },
  ]), ['Bob:1', 'Ann:2']);
});

test('places: two-way tie for 1st, next player is 3rd', () => {
  assert.deepEqual(places([
    { name: 'Ann', score: 8, longest: 'CATS' },
    { name: 'Bob', score: 8, longest: 'DOGS' },
    { name: 'Cy', score: 3, longest: 'AT' },
  ]), ['Ann:1', 'Bob:1', 'Cy:3']);
});

test('places: three-way tie shares one place', () => {
  assert.deepEqual(places([
    { name: 'Ann', score: 5, longest: 'CAT' },
    { name: 'Bob', score: 5, longest: 'DOG' },
    { name: 'Cy', score: 5, longest: 'PIG' },
    { name: 'Di', score: 1, longest: 'A' },
  ]), ['Ann:1', 'Bob:1', 'Cy:1', 'Di:4']);
});

test('places: longest word breaks a tie on tiles', () => {
  assert.deepEqual(places([
    { name: 'Ann', score: 6, longest: 'CAT' },
    { name: 'Bob', score: 6, longest: 'TIGERS' },
    { name: 'Cy', score: 6, longest: 'TIGERS' },
  ]), ['Bob:1', 'Cy:1', 'Ann:3']);
});
