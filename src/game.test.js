import { test } from 'node:test';
import assert from 'node:assert/strict';
import { gameReducer, initGame, restoreGame, snapshot } from './game.js';

const wait = (ms) => new Promise((res) => setTimeout(res, ms));

test('10 key presses 20ms apart all land in order', async () => {
  let state = gameReducer(initGame(), { type: 'start', seed: 'PLANET' });
  // Each press dispatches blind, like a real tap: it never reads state itself.
  const dispatch = (a) => {
    state = gameReducer(state, a);
  };
  dispatch({ type: 'tap', r: 0, c: 0 });
  dispatch({ type: 'tap', r: 0, c: 0 }); // second tap on same cell flips to across
  const letters = [...'ABCDEFGHIJ'];
  for (const ch of letters) {
    dispatch({ type: 'letter', ch });
    await wait(20);
  }
  assert.equal(state.pending.length, 10);
  assert.deepEqual(state.pending.map((t) => t.ch), letters);
  assert.deepEqual(state.pending.map((t) => t.c), [0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
  assert.ok(state.pending.every((t) => t.r === 0));
});

test('a saved round comes back with its board, score and typed letters, and resumes without resetting', () => {
  let g = gameReducer(initGame('PLANET'), { type: 'start', seed: 'PLANET' });
  g = gameReducer(g, { type: 'letter', ch: 'X' });
  g = { ...g, score: 4, longest: 'PLANETS' };
  const saved = JSON.parse(JSON.stringify(snapshot(g)));
  let back = restoreGame('PLANET', saved);
  assert.equal(back.score, 4);
  assert.equal(back.pending.length, 1);
  back = gameReducer(back, { type: 'start', seed: 'PLANET' });
  assert.equal(back.active, true);
  assert.equal(back.score, 4);
});

test('a damaged save is ignored', () => {
  assert.equal(restoreGame('PLANET', { board: 'nope' }), null);
  assert.equal(restoreGame('PLANET', null), null);
});

test('round starts with the cursor under the first seed letter, going down', async () => {
  const { initGame } = await import('./game.js');
  const g = initGame('FLOWER');
  assert.deepEqual(g.cursor, { r: 6, c: 2 });
  assert.equal(g.dir, 'down');
});
