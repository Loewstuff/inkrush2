import { SIZE, boardWithSeed } from './rules.js';

// A board travels as one 121-character string: a letter per filled cell, '.' for empty.
export function encodeBoard(board) {
  return board.map((row) => row.map((cell) => (cell ? cell.ch : '.')).join('')).join('');
}

// Rebuild a board from its string. Cells that match the seed word stay seed tiles; the rest were placed.
export function decodeBoard(text, seed) {
  const board = boardWithSeed(seed);
  for (let r = 0; r < SIZE; r++) {
    for (let c = 0; c < SIZE; c++) {
      const ch = text[r * SIZE + c];
      if (ch && ch !== '.' && !board[r][c]) board[r][c] = { ch, kind: 'mine' };
    }
  }
  return board;
}

// Most tiles first; ties go to the longer single word, then alphabetically so everyone sees the same order.
export function rankPlayers(entries) {
  return [...entries].sort(
    (a, b) =>
      b.score - a.score || (b.longest || '').length - (a.longest || '').length || a.name.localeCompare(b.name),
  );
}

// Standard competition ranking over an already-ranked list: players level on tiles and
// longest word share a place, and the next place skips ahead (1, 1, 3).
export function withPlaces(ranked) {
  const same = (a, b) => a.score === b.score && (a.longest || '').length === (b.longest || '').length;
  return ranked.map((p, i) => {
    let first = i;
    while (first > 0 && same(ranked[first - 1], p)) first--;
    return { ...p, place: first + 1 };
  });
}
