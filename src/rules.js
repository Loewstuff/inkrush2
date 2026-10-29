export const SIZE = 11;
export const ROUND_SECONDS = 90;

export const SEED_WORDS = [
  'PLANET', 'BRIDGE', 'CASTLE', 'GARDEN', 'ORANGE', 'SILVER', 'WINTER', 'MARKET',
  'FOREST', 'ROCKET', 'BASKET', 'CANDLE', 'DRAGON', 'FLOWER', 'GOLDEN', 'HAMMER',
  'JUNGLE', 'KITTEN', 'LADDER', 'MIRROR', 'PEPPER', 'RIBBON', 'SUMMER', 'TICKET',
  'WINDOW', 'YELLOW', 'ANCHOR', 'BUTTER', 'COOKIE', 'DOCTOR', 'ENGINE', 'FINGER',
  'GUITAR', 'HONEY', 'ISLAND', 'JACKET', 'LEMON', 'MONKEY', 'NAPKIN', 'OYSTER',
  'PIRATE', 'QUARTZ', 'RABBIT', 'SPIDER', 'TURTLE', 'VIOLIN', 'WIZARD', 'ZIPPER',
  'APPLE', 'BREAD', 'CLOUD', 'DANCE', 'EARTH', 'FLAME', 'GRAPE', 'HEART',
  'LIGHT', 'MUSIC', 'OCEAN', 'PIANO', 'QUEEN', 'RIVER', 'STONE', 'TIGER',
  'WATER', 'BALLOON', 'CAPTAIN', 'DIAMOND', 'FREEDOM',
  'GALAXY', 'HARVEST', 'JOURNEY', 'KITCHEN', 'LANTERN', 'MONSTER', 'PUZZLE',
];

export function pickSeed() {
  return SEED_WORDS[Math.floor(Math.random() * SEED_WORDS.length)];
}

export function emptyBoard() {
  return Array.from({ length: SIZE }, () => Array(SIZE).fill(null));
}

// Board cells are null or { ch, kind: 'seed' | 'mine' }.
export function boardWithSeed(word) {
  const board = emptyBoard();
  const row = Math.floor(SIZE / 2);
  const start = Math.floor((SIZE - word.length) / 2);
  for (let i = 0; i < word.length; i++) board[row][start + i] = { ch: word[i], kind: 'seed' };
  return board;
}

// Collect the full run of letters through (r, c) in a direction, using `get(r, c)` -> letter or null.
function runThrough(get, r, c, dr, dc) {
  let r0 = r;
  let c0 = c;
  while (get(r0 - dr, c0 - dc)) {
    r0 -= dr;
    c0 -= dc;
  }
  let word = '';
  let r1 = r0;
  let c1 = c0;
  while (get(r1, c1)) {
    word += get(r1, c1);
    r1 += dr;
    c1 += dc;
  }
  return { word, r: r0, c: c0 };
}

/**
 * Check a move. `pending` is [{ r, c, ch }]. Returns { ok: true, words } or { ok: false, error }.
 * `isWord(lowercaseString)` is the dictionary check.
 */
export function checkMove(board, pending, isWord) {
  if (pending.length === 0) return { ok: false, error: 'Type some letters first' };

  const inBounds = (r, c) => r >= 0 && c >= 0 && r < SIZE && c < SIZE;
  const get = (r, c) => {
    if (!inBounds(r, c)) return null;
    const p = pending.find((t) => t.r === r && t.c === c);
    if (p) return p.ch;
    return board[r][c] ? board[r][c].ch : null;
  };

  const rows = new Set(pending.map((t) => t.r));
  const cols = new Set(pending.map((t) => t.c));
  if (rows.size > 1 && cols.size > 1) return { ok: false, error: 'Letters must be in one line' };

  // Contiguous: every cell between the first and last new tile must be filled.
  if (pending.length > 1) {
    const horizontal = rows.size === 1;
    const line = pending.map((t) => (horizontal ? t.c : t.r));
    const lo = Math.min(...line);
    const hi = Math.max(...line);
    const fixed = horizontal ? pending[0].r : pending[0].c;
    for (let i = lo; i <= hi; i++) {
      if (!(horizontal ? get(fixed, i) : get(i, fixed))) {
        return { ok: false, error: 'No gaps allowed' };
      }
    }
  }

  // Connected: at least one new tile touches an existing tile.
  const touches = pending.some(({ r, c }) =>
    [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dr, dc]) => {
      const nr = r + dr;
      const nc = c + dc;
      return inBounds(nr, nc) && board[nr][nc];
    }),
  );
  if (!touches) return { ok: false, error: 'Must connect to existing tiles' };

  // Every word of 2+ letters through a new tile, in both directions.
  const words = new Map();
  for (const { r, c } of pending) {
    for (const [dr, dc] of [[0, 1], [1, 0]]) {
      const run = runThrough(get, r, c, dr, dc);
      if (run.word.length >= 2) words.set(`${run.r},${run.c},${dr}`, run.word);
    }
  }
  const list = [...words.values()];
  if (list.length === 0) return { ok: false, error: 'Must form a word' };

  const bad = list.find((w) => !isWord(w.toLowerCase()));
  if (bad) return { ok: false, error: `${bad} isn't a word` };

  return { ok: true, words: list };
}
