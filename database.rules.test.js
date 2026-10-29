// Runs the real rules in database.rules.json against simulated phones, including some attacks.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import targaryen from 'targaryen';

const rules = JSON.parse(readFileSync(new URL('./database.rules.json', import.meta.url), 'utf8'));
const TS = { '.sv': 'timestamp' };
const T0 = 1_700_000_000_000;
const CODE = 'ABCD';
const ROOM = `/rooms/${CODE}`;

// A tiny fake Firebase: every call is checked against the rules, and allowed writes change the data.
function world() {
  let db = targaryen.database(rules, {}, T0);
  let now = T0;
  const apply = (r) => {
    if (r.allowed) db = targaryen.database(rules, r.newDatabase.root, now); // fresh copy, so the next phone does not inherit this phone's sign-in
    return r.allowed;
  };
  const phone = (uid) => {
    const as = () => db.as(uid ? { uid } : null);
    return {
      uid,
      canRead: (path) => as().read(path, { now }).allowed,
      write: (path, value) => apply(as().write(path, value, { now })),
      update: (path, patch) => apply(as().update(path, patch, { now })),
    };
  };
  return { phone, wait: (ms) => (now += ms), data: (path) => db.root && db.as(null).with({ auth: null }) && null, peek: () => db };
}

const entry = (score, extra = {}) => ({ name: 'Ann', score, longest: 'PLANETS', ...extra });
const board = (n = 121) => '.'.repeat(n);

// The same calls src/room.js makes.
const create = (p, name = 'Host') => p.write(ROOM, { host: p.uid, created: TS, seats: { 0: p.uid }, players: { [p.uid]: { name, joined: TS } } });
// Like joinRoom: try seat 0, 1, 2... each as one all-or-nothing write, until one is free.
const join = (p, name = 'Guest') => {
  for (let i = 0; i < 8; i++) {
    if (p.update(ROOM, { [`seats/${i}`]: p.uid, [`players/${p.uid}`]: { name, joined: TS } })) return true;
  }
  return false;
};
const start = (p, ids, n = 1) =>
  p.update(ROOM, { round: { n, seed: 'PLANET', startedAt: TS, players: Object.fromEntries(ids.map((id) => [id, true])) } });
const report = (p, n, e) => p.write(`${ROOM}/scores/${n}/${p.uid}`, e);

// A room with a host and one guest, ready to start.
function lobby() {
  const w = world();
  const host = w.phone('host');
  const guest = w.phone('guest');
  assert.ok(create(host), 'host can create a room');
  assert.ok(join(guest), 'guest can join');
  return { w, host, guest, stranger: w.phone('stranger') };
}
// Same, with the round started and 5 seconds in.
function running() {
  const l = lobby();
  assert.ok(start(l.host, ['host', 'guest']), 'host can start');
  l.w.wait(5000);
  return l;
}

test('a normal game works end to end', () => {
  const { w, host, guest } = running();
  assert.ok(host.write(`${ROOM}/presence/host`, TS));
  assert.ok(guest.write(`${ROOM}/presence/guest`, TS));
  assert.ok(report(host, 1, entry(3)));
  assert.ok(report(host, 1, entry(7)));
  assert.ok(report(guest, 1, entry(5)));
  w.wait(90000);
  assert.ok(report(host, 1, entry(9, { board: board() })), 'final board goes in');
  assert.ok(host.update(ROOM, { round: null, lastN: 1 }), 'host rematches');
  assert.ok(start(host, ['host', 'guest'], 2), 'second round is number 2');
  assert.ok(guest.canRead(ROOM));
});

test('reading: only members see the room, anyone signed in can see it exists', () => {
  const { host, guest, stranger, w } = lobby();
  assert.ok(host.canRead(ROOM) && guest.canRead(ROOM));
  assert.equal(stranger.canRead(ROOM), false);
  assert.equal(stranger.canRead(`${ROOM}/scores`), false);
  assert.equal(stranger.canRead(`${ROOM}/players`), false);
  assert.ok(stranger.canRead(`${ROOM}/host`));
  assert.ok(stranger.canRead(`${ROOM}/players/stranger`));
  assert.equal(stranger.canRead(`${ROOM}/players/host`), false);
  assert.equal(stranger.canRead('/rooms'), false, "can't list every room");
  assert.equal(w.phone(null).canRead(`${ROOM}/host`), false, 'signed-out phones see nothing');
});

test('attack: signed-out phones can do nothing', () => {
  const w = world();
  const nobody = w.phone(null);
  assert.equal(nobody.write(ROOM, { host: 'x', created: TS, seats: { 0: 'x' }, players: { x: { name: 'x', joined: TS } } }), false);
});

test('rooms: bad codes, fake hosts and stuffed rooms are refused', () => {
  const w = world();
  const a = w.phone('a');
  assert.equal(a.write('/rooms/ABC', { host: 'a', created: TS, seats: { 0: 'a' }, players: { a: { name: 'A', joined: TS } } }), false, '3-letter code');
  assert.equal(a.write('/rooms/abcd', { host: 'a', created: TS, seats: { 0: 'a' }, players: { a: { name: 'A', joined: TS } } }), false, 'lowercase code');
  assert.equal(a.write(ROOM, { host: 'someone-else', created: TS, seats: { 0: 'a' }, players: { a: { name: 'A', joined: TS } } }), false, 'host is not me');
  assert.equal(a.write(ROOM, { host: 'a', created: TS, seats: { 0: 'a', 1: 'b' }, players: { a: { name: 'A', joined: TS }, b: { name: 'B', joined: TS } } }), false, 'two players at birth');
  assert.equal(a.write(ROOM, { host: 'a', created: TS, seats: { 0: 'a' }, players: { a: { name: 'A', joined: TS } }, extra: 1 }), false, 'junk field');
  assert.ok(create(a));
});

test('attack: taking over or wiping an existing room', () => {
  const { guest, stranger, host } = lobby();
  assert.equal(create(stranger), false, 'create over a live room');
  assert.equal(guest.write(ROOM, null), false, 'member deletes the room');
  assert.equal(host.write(ROOM, null), false, 'even the host cannot delete it');
  assert.equal(guest.write(`${ROOM}/players/host`, null), false, 'kick the host out');
  assert.equal(guest.write(`${ROOM}/players/host/name`, 'Hacked'), false, "rename someone else");
  assert.equal(guest.write(`${ROOM}/junk`, 1), false, 'junk field in a room');
  assert.equal(guest.write(`${ROOM}/created`, 5), false);
});

test('joining: 8 players fit, the 9th is refused', () => {
  const w = world();
  assert.ok(create(w.phone('p1')));
  for (let i = 2; i <= 8; i++) assert.ok(join(w.phone(`p${i}`)), `player ${i} joins`);
  assert.equal(join(w.phone('p9')), false, 'player 9 is turned away');
  assert.equal(w.phone('p9').write(`${ROOM}/players/p9`, { name: 'P9', joined: TS }), false, '...even without a seat');
  assert.equal(w.phone('p9').write(`${ROOM}/seats/8`, 'p9'), false, 'a ninth seat does not exist');
  assert.equal(w.phone('p9').write(`${ROOM}/seats/3`, 'p9'), false, 'taking an occupied seat');
  assert.equal(w.phone('p2').write(`${ROOM}/seats/1`, null), true, 'leaving frees a seat');
  assert.ok(join(w.phone('p9')), 'and then the 9th can sit down');
  assert.ok(w.phone('p9').canRead(ROOM));
});

test('joining: only as yourself, only into a room that exists, tidy names', () => {
  const { stranger, guest, w } = lobby();
  assert.equal(stranger.write(`${ROOM}/players/guest`, { name: 'Imposter', joined: TS }), false, 'join as someone else');
  assert.equal(stranger.write(`${ROOM}/players/someone`, { name: 'X', joined: TS }), false, 'make up a player');
  assert.equal(w.phone('z').write('/rooms/WXYZ/players/z', { name: 'Z', joined: TS }), false, "room that doesn't exist");
  assert.equal(join(stranger, ''), false, 'empty name');
  assert.equal(join(stranger, 'ThirteenChars'), false, 'name over 12 characters');
  assert.equal(stranger.write(`${ROOM}/players/stranger`, { name: 'S', joined: TS, admin: true }), false, 'extra field');
  assert.equal(guest.write(`${ROOM}/players/guest`, { name: 'Guest', joined: 5 }), false, 'rewrite join time to jump the queue');
  assert.ok(guest.update(`${ROOM}/players/guest`, { name: 'Renamed' }), 'rejoin can change name');
  assert.ok(join(stranger, 'Sam'));
});

test('starting: only the host, only with the right round number and real players', () => {
  const { host, guest, stranger } = lobby();
  assert.equal(start(guest, ['host', 'guest']), false, 'non-host starts');
  assert.equal(start(stranger, ['host', 'guest']), false, 'outsider starts');
  assert.equal(start(host, ['host', 'guest'], 5), false, 'wrong round number');
  assert.equal(start(host, ['host', 'ghost']), false, "player who isn't in the room");
  assert.equal(host.update(ROOM, { round: { n: 1, seed: 'xx', startedAt: TS, players: { host: true, guest: true } } }), false, 'junk seed');
  assert.equal(host.update(ROOM, { round: { n: 1, seed: 'PLANET', startedAt: 5, players: { host: true, guest: true } } }), false, 'fake start time');
  assert.ok(start(host, ['host', 'guest']));
  assert.equal(start(host, ['host', 'guest'], 2), false, 'second start while one is running');
});

test('scores: you can only write your own, honestly shaped, for the running round', () => {
  const { host, guest, stranger, w } = running();
  assert.equal(guest.write(`${ROOM}/scores/1/host`, entry(99)), false, "edit another player's score");
  assert.equal(stranger.write(`${ROOM}/scores/1/stranger`, entry(5)), false, 'outsider scores');
  assert.equal(stranger.write(`${ROOM}/scores/1/host`, entry(99)), false);
  assert.ok(report(host, 1, entry(10)));
  assert.equal(report(host, 1, entry(4)), false, 'score going down');
  assert.equal(report(host, 1, entry(500)), false, 'impossible score');
  assert.equal(report(host, 1, entry(-1)), false, 'negative score');
  assert.equal(report(host, 1, entry(5.5)), false, 'fractional score');
  assert.equal(report(host, 1, entry('12')), false, 'score as text');
  assert.equal(report(host, 2, entry(5)), false, 'wrong round');
  assert.equal(report(host, 1, entry(12, { board: board(50) })), false, 'short board');
  assert.equal(report(host, 1, entry(12, { board: 'x'.repeat(121) })), false, 'board with junk characters');
  assert.equal(report(host, 1, entry(12, { admin: true })), false, 'extra field');
  assert.equal(report(host, 1, entry(12, { longest: 'a-very-long-word-indeed' })), false, 'long "longest word"');
  assert.equal(host.write(`${ROOM}/scores/1/host/score`, 1000), false, 'poke the score directly');
  assert.equal(host.write(`${ROOM}/scores/1`, null), false, "wipe everyone's scores");
  w.wait(200000);
  assert.equal(report(host, 1, entry(20)), false, 'long after the round');
});

test('scores: nothing before a round, and late joiners cannot score', () => {
  const { host, guest, w, stranger } = lobby();
  assert.equal(report(host, 1, entry(1)), false, 'no round yet');
  assert.ok(start(host, ['host', 'guest']));
  assert.equal(report(host, 1, entry(1)), false, 'before the countdown ends');
  w.wait(5000);
  assert.ok(join(stranger, 'Late'));
  assert.equal(report(stranger, 1, entry(5)), false, 'joined mid-round, not in the round');
  assert.ok(report(guest, 1, entry(2)));
});

test('presence: only your own, and only the real time', () => {
  const { host, guest, stranger } = lobby();
  assert.ok(guest.write(`${ROOM}/presence/guest`, TS));
  assert.ok(guest.write(`${ROOM}/presence/guest`, 0), 'marking yourself gone is fine');
  assert.equal(host.write(`${ROOM}/presence/guest`, TS), false, "write someone else's presence");
  assert.equal(stranger.write(`${ROOM}/presence/stranger`, TS), false, 'outsider');
  assert.equal(guest.write(`${ROOM}/presence/guest`, T0 + 10 ** 9), false, 'made-up future time');
  assert.equal(guest.write(`${ROOM}/presence/guest`, 'here'), false, 'not a number');
});

test('rematch: only the host, only after time is up', () => {
  const { host, guest, w } = running();
  assert.equal(host.update(ROOM, { round: null, lastN: 1 }), false, 'host ends it early');
  w.wait(86000);
  assert.equal(guest.update(ROOM, { round: null, lastN: 1 }), false, 'non-host rematch');
  assert.equal(guest.write(`${ROOM}/round`, null), false, 'non-host deletes round');
  assert.equal(guest.write(`${ROOM}/lastN`, 0), false, 'non-host edits round counter');
  assert.equal(host.update(ROOM, { round: null, lastN: 7 }), false, 'host fiddles the round counter');
  assert.equal(host.write(`${ROOM}/round/seed`, 'ABCDEF'), false, 'change the seed mid-round');
  assert.ok(host.update(ROOM, { round: null, lastN: 1 }));
});

test('host: handoff by the host, or takeover only when the host has gone quiet', () => {
  const { host, guest, stranger, w } = lobby();
  assert.ok(host.write(`${ROOM}/presence/host`, TS));
  assert.ok(guest.write(`${ROOM}/presence/guest`, TS));
  assert.equal(guest.write(`${ROOM}/host`, 'guest'), false, 'grab host while host is here');
  assert.equal(stranger.write(`${ROOM}/host`, 'stranger'), false, 'outsider grabs host');
  w.wait(10000);
  assert.equal(guest.write(`${ROOM}/host`, 'guest'), false, 'only 10 seconds quiet');
  w.wait(6000);
  assert.equal(stranger.write(`${ROOM}/host`, 'stranger'), false, 'outsider still cannot');
  assert.ok(guest.write(`${ROOM}/host`, 'guest'), 'host quiet for 16s: guest takes over');
});

test('host: leaving host names a real player; leaving frees the seat', () => {
  const { host, guest } = lobby();
  assert.equal(host.update(ROOM, { host: 'ghost', 'presence/host': 0, 'players/host': null }), false, 'hand host to nobody');
  assert.ok(host.update(ROOM, { host: 'guest', 'presence/host': 0, 'players/host': null }), 'host leaves the lobby');
  assert.equal(host.canRead(ROOM), false, 'and can no longer read it');
  assert.ok(guest.canRead(ROOM));
});

test("players can leave their own seat but not anyone else's", () => {
  const { host, guest } = lobby();
  assert.equal(host.write(`${ROOM}/players/guest`, null), false);
  assert.ok(guest.update(ROOM, { 'presence/guest': 0, 'players/guest': null }));
});

test('seats: one per account, and you cannot kick someone out of theirs', () => {
  const { host, guest, stranger } = lobby();
  assert.equal(stranger.write(`${ROOM}/seats/5`, 'guest'), false, "claim a seat in someone else's name");
  assert.ok(stranger.write(`${ROOM}/seats/5`, 'stranger'));
  assert.equal(stranger.write(`${ROOM}/seats/6`, 'stranger'), false, 'second seat for the same account');
  assert.equal(host.write(`${ROOM}/seats/1`, null), false, "release someone else's seat");
  assert.ok(guest.update(ROOM, { 'seats/1': null, 'players/guest': null }), 'guest leaves, seat freed');
});
