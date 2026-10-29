import { test } from 'node:test';
import assert from 'node:assert/strict';
import { gameReducer, initGame } from './game.js';

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
