import { get, onDisconnect, onValue, ref, runTransaction, serverTimestamp, set, update } from 'firebase/database';
import { db, serverNow } from './firebase.js';
import { pickSeed } from './rules.js';

export const MAX_PLAYERS = 8;
export const MIN_PLAYERS = 2;
// A phone that hasn't checked in for this long shows as "away".
export const AWAY_MS = 15000;
const BEAT_MS = 5000;
// Gap between the host tapping Start and the clock running, so every phone has the round before it begins.
export const LEAD_MS = 3000;
const CODE_LETTERS = 'ABCDEFGHJKLMNPQRSTUVWXYZ'; // no I or O: they look like 1 and 0

const roomRef = (code, path = '') => ref(db, `rooms/${code}${path}`);

export const cleanCode = (s) => (s || '').toUpperCase().replace(/[^A-Z]/g, '').slice(0, 4);

export async function createRoom(pid, name) {
  for (let tries = 0; tries < 10; tries++) {
    const code = Array.from({ length: 4 }, () => CODE_LETTERS[Math.floor(Math.random() * CODE_LETTERS.length)]).join('');
    if ((await get(roomRef(code, '/host'))).exists()) continue;
    try {
      // The database only lets this through if nobody has the code yet.
      await set(roomRef(code), {
        host: pid,
        created: serverTimestamp(),
        seats: { 0: pid },
        players: { [pid]: { name, joined: serverTimestamp() } },
      });
      return code;
    } catch {
      // Someone grabbed the code a moment ago: try another.
    }
  }
  throw new Error('Could not make a room code. Try again.');
}

// Resolves to null on success, or a message saying why not.
// The database lets anyone check a room exists, but only members read it, so we try for a seat (0-7) and it says no when they're all taken.
export async function joinRoom(code, pid, name) {
  if (!(await get(roomRef(code, '/host'))).exists()) return `No room called ${code}`;
  if ((await get(roomRef(code, `/players/${pid}`))).exists()) {
    await update(roomRef(code, `/players/${pid}`), { name }); // already in: just refresh the name
    return null;
  }
  for (let seat = 0; seat < MAX_PLAYERS; seat++) {
    try {
      await update(roomRef(code), { [`seats/${seat}`]: pid, [`players/${pid}`]: { name, joined: serverTimestamp() } });
      return null;
    } catch {
      // That seat is taken (or the room is closed to us): try the next one.
    }
  }
  return `Room ${code} is full (${MAX_PLAYERS} players)`;
}

// `next` is who takes over if the leaver was host. In the lobby the leaver's seat is freed; after a round they stay on the board.
export function leaveRoom(code, pid, { next, freeSeat, seats }) {
  const changes = { [`presence/${pid}`]: 0 };
  if (freeSeat) {
    changes[`players/${pid}`] = null;
    for (const [seat, id] of Object.entries(seats || {})) if (id === pid) changes[`seats/${seat}`] = null;
  }
  if (next) changes.host = next;
  return update(roomRef(code), changes);
}

// Each phone stamps the server time every few seconds (and the instant its connection drops).
export function trackPresence(code, pid) {
  const me = roomRef(code, `/presence/${pid}`);
  const beat = () => set(me, serverTimestamp()).catch(() => {});
  const stopWatching = onValue(ref(db, '.info/connected'), (snap) => {
    if (!snap.val()) return;
    onDisconnect(me).set(serverTimestamp()).catch(() => {});
    beat();
  });
  const timer = setInterval(beat, BEAT_MS);
  const onShow = () => !document.hidden && beat();
  document.addEventListener('visibilitychange', onShow);
  return () => {
    clearInterval(timer);
    stopWatching();
    document.removeEventListener('visibilitychange', onShow);
    onDisconnect(me).cancel().catch(() => {});
  };
}

export const isAway = (room, id) => {
  const seen = room.presence?.[id];
  return seen !== undefined && serverNow() - seen > AWAY_MS;
};

// Whoever should be host next: the earliest joiner (other than `not`) who is still here.
export function nextHost(room, not) {
  const joined = (id) => room.players?.[id]?.joined || 0;
  return Object.keys(room.players || {})
    .filter((id) => id !== not && !isAway(room, id))
    .sort((a, b) => joined(a) - joined(b))[0];
}

// Only moves host off the person we think is gone, so two phones claiming at once can't fight.
export const claimHost = (code, gone, me) =>
  runTransaction(roomRef(code, '/host'), (host) => (host === gone ? me : undefined));

// If the database stops letting us read the room (we're no longer a member), that looks the same as the room being gone.
export const watchRoom = (code, cb) => onValue(roomRef(code), (snap) => cb(snap.val()), () => cb(null));

// Everyone in the lobby who's still here plays; anyone who joins later waits for the next round.
export function startRound(code, room) {
  const here = Object.keys(room.players || {}).filter((id) => !isAway(room, id));
  return update(roomRef(code), {
    round: {
      n: (room.lastN || 0) + 1,
      seed: pickSeed(),
      startedAt: serverTimestamp(),
      players: Object.fromEntries(here.map((id) => [id, true])),
    },
  });
}

// Back to the lobby in the same room; the next Start picks a fresh seed word.
export const rematch = (code, room) => update(roomRef(code), { round: null, lastN: room.round.n });

export const reportScore = (code, n, pid, entry) => set(roomRef(code, `/scores/${n}/${pid}`), entry);
