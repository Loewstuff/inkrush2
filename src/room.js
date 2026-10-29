import { get, onValue, ref, remove, runTransaction, serverTimestamp, set, update } from 'firebase/database';
import { db } from './firebase.js';
import { pickSeed } from './rules.js';

export const MAX_PLAYERS = 8;
export const MIN_PLAYERS = 2;
// Gap between the host tapping Start and the clock running, so every phone has the round before it begins.
export const LEAD_MS = 3000;
const CODE_LETTERS = 'ABCDEFGHJKLMNPQRSTUVWXYZ'; // no I or O: they look like 1 and 0

const roomRef = (code, path = '') => ref(db, `rooms/${code}${path}`);

// One random id per phone, kept across refreshes so a reload is the same player.
export function playerId() {
  try {
    let id = localStorage.getItem('inkrush2.pid');
    if (!id) {
      id = crypto.randomUUID();
      localStorage.setItem('inkrush2.pid', id);
    }
    return id;
  } catch {
    return crypto.randomUUID();
  }
}

export const cleanCode = (s) => (s || '').toUpperCase().replace(/[^A-Z]/g, '').slice(0, 4);

export async function createRoom(pid, name) {
  for (let tries = 0; tries < 10; tries++) {
    const code = Array.from({ length: 4 }, () => CODE_LETTERS[Math.floor(Math.random() * CODE_LETTERS.length)]).join('');
    // Claim the code only if nobody has it.
    const { committed } = await runTransaction(roomRef(code), (cur) =>
      cur ? undefined : { host: pid, created: serverTimestamp(), players: { [pid]: { name, joined: serverTimestamp() } } },
    );
    if (committed) return code;
  }
  throw new Error('Could not make a room code. Try again.');
}

// Resolves to null on success, or a message saying why not.
export async function joinRoom(code, pid, name) {
  const snap = await get(roomRef(code));
  if (!snap.exists()) return `No room called ${code}`;
  let full = false;
  await runTransaction(roomRef(code, '/players'), (players) => {
    const list = players || {};
    if (list[pid]) return { ...list, [pid]: { ...list[pid], name } };
    if (Object.keys(list).length >= MAX_PLAYERS) {
      full = true;
      return undefined;
    }
    full = false;
    return { ...list, [pid]: { name, joined: serverTimestamp() } };
  });
  return full ? `Room ${code} is full (${MAX_PLAYERS} players)` : null;
}

export const leaveRoom = (code, pid) => remove(roomRef(code, `/players/${pid}`));

export const watchRoom = (code, cb) => onValue(roomRef(code), (snap) => cb(snap.val()));

// Everyone in the lobby right now plays; anyone who joins later waits for the next round.
export function startRound(code, room) {
  return update(roomRef(code), {
    round: {
      n: (room.round?.n || 0) + 1,
      seed: pickSeed(),
      startedAt: serverTimestamp(),
      players: Object.fromEntries(Object.keys(room.players || {}).map((id) => [id, true])),
    },
  });
}

export const reportScore = (code, n, pid, entry) => set(roomRef(code, `/scores/${n}/${pid}`), entry);
