import { SIZE, boardWithSeed, checkMove } from './rules.js';

const START_CURSOR = { r: 4, c: 5 };

// First cell at or after (r, c) in `dir` that doesn't hold a locked tile, or null if off the board.
function nextOpen(board, r, c, dir) {
  const dr = dir === 'down' ? 1 : 0;
  const dc = dir === 'across' ? 1 : 0;
  while (r < SIZE && c < SIZE && board[r][c]) {
    r += dr;
    c += dc;
  }
  return r < SIZE && c < SIZE ? { r, c } : null;
}

export function initGame(seed = 'PLANET') {
  return {
    active: false,
    board: boardWithSeed(seed),
    pending: [],
    cursor: START_CURSOR,
    dir: 'down',
    score: 0,
    longest: '',
    status: '',
    shaking: false,
    popped: [],
  };
}

// What gets saved so a refresh or app switch can pick the round back up (transient animation state is dropped).
export const snapshot = (s) => ({ board: s.board, pending: s.pending, cursor: s.cursor, dir: s.dir, score: s.score, longest: s.longest });

// Rebuild a game from a snapshot; null if it doesn't look right, so the caller starts fresh.
export function restoreGame(seed, saved) {
  const ok = Array.isArray(saved?.board) && saved.board.length === SIZE && saved.board.every((row) => Array.isArray(row) && row.length === SIZE);
  if (!ok || !Array.isArray(saved.pending) || !saved.cursor) return null;
  return { ...initGame(seed), ...snapshot(saved), resumed: true };
}

// Every input goes through here, so each key press builds on the state left by the one before it.
export function gameReducer(s, a) {
  const canInput = s.active && !s.shaking;
  switch (a.type) {
    case 'start':
      return s.resumed ? { ...s, active: true, resumed: false } : { ...initGame(a.seed), active: true };
    case 'end':
      return { ...s, active: false, pending: [], shaking: false };
    case 'letter': {
      if (!canInput) return s;
      const at = nextOpen(s.board, s.cursor.r, s.cursor.c, s.dir);
      if (!at) return s;
      const next = nextOpen(s.board, at.r + (s.dir === 'down' ? 1 : 0), at.c + (s.dir === 'across' ? 1 : 0), s.dir);
      return {
        ...s,
        pending: [...s.pending.filter((t) => t.r !== at.r || t.c !== at.c), { ...at, ch: a.ch }],
        cursor: next || at,
        status: '',
      };
    }
    case 'back': {
      if (!canInput || s.pending.length === 0) return s;
      const last = s.pending[s.pending.length - 1];
      return { ...s, pending: s.pending.slice(0, -1), cursor: { r: last.r, c: last.c }, status: '' };
    }
    case 'clear':
      return canInput ? { ...s, pending: [], status: '' } : s;
    case 'toggleDir':
      return { ...s, dir: s.dir === 'down' ? 'across' : 'down' };
    case 'tap': {
      if (!canInput) return s;
      if (s.cursor.r === a.r && s.cursor.c === a.c) return { ...s, dir: s.dir === 'down' ? 'across' : 'down' };
      return { ...s, cursor: { r: a.r, c: a.c } };
    }
    case 'submit': {
      if (!canInput) return s;
      const result = checkMove(s.board, s.pending, a.isWord);
      if (!result.ok) return { ...s, status: result.error, shaking: s.pending.length > 0 };
      const board = s.board.map((row) => row.slice());
      for (const t of s.pending) board[t.r][t.c] = { ch: t.ch, kind: 'mine' };
      const best = result.words.reduce((w1, w2) => (w2.length > w1.length ? w2 : w1), '');
      return {
        ...s,
        board,
        pending: [],
        score: s.score + s.pending.length,
        longest: best.length > s.longest.length ? best : s.longest,
        status: `${result.words.join(' + ')}  +${s.pending.length}`,
        popped: s.pending.map((t) => `${t.r},${t.c}`),
      };
    }
    case 'unshake':
      return { ...s, pending: [], shaking: false };
    case 'unpop':
      return { ...s, popped: [] };
    default:
      return s;
  }
}
