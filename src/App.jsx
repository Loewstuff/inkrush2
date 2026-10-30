import { memo, useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react';
import { ROUND_SECONDS } from './rules.js';
import { gameReducer, initGame, restoreGame, snapshot } from './game.js';
import { beep, buzzer, unlockAudio } from './sound.js';
import { serverNow, signIn } from './firebase.js';
import { LEAD_MS, MAX_PLAYERS, MIN_PLAYERS, claimHost, cleanCode, createRoom, isAway, joinRoom, leaveRoom, nextHost, rematch, reportScore, startRound, trackPresence, watchRoom } from './room.js';
import { decodeBoard, encodeBoard, rankPlayers, withPlaces } from './results.js';

const RED_AT = 10;
const BEEPS_FROM = 5;
const MUTE_KEY = 'inkrush2.muted';
const NAME_KEY = 'inkrush2.name';
const GAME_KEY = 'inkrush2.game'; // the round in progress, so a refresh or app switch can pick it back up
const KEY_ROWS = ['QWERTYUIOP', 'ASDFGHJKL', 'ZXCVBNM'];

const fmt = (s) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
const initial = (name) => (name || '?').trim().charAt(0).toUpperCase() || '?';

const load = (key) => {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
};
const save = (key, value) => {
  try {
    localStorage.setItem(key, value);
  } catch {
    // Storage blocked (private mode): the setting just won't persist.
  }
};

// Only a save from this exact room, round and player counts; anything else starts fresh.
function loadSavedGame(code, n, pid, seed) {
  try {
    const saved = JSON.parse(load(GAME_KEY));
    return saved?.code === code && saved.n === n && saved.pid === pid ? restoreGame(seed, saved) : null;
  } catch {
    return null;
  }
}

// Keep ?room=ABCD in the address bar so a refresh or a copied link lands in the same room.
const setUrlRoom = (code) => {
  const url = new URL(window.location.href);
  if (code) url.searchParams.set('room', code);
  else url.searchParams.delete('room');
  window.history.replaceState(null, '', url);
};

// Fire on finger-down, not click: clicks wait for finger-up, so fast two-thumb typing reorders or cancels them.
const press = (fn) => (e) => {
  if (e.button !== 0) return;
  e.preventDefault();
  fn();
};

// Players in join order, so ticker cards and lobby lists don't jump around.
function joinOrder(room, ids) {
  const joined = (id) => room.players?.[id]?.joined || 0;
  return [...ids].sort((a, b) => joined(a) - joined(b));
}

// Green arrow on the cursor cell; green (not black) so it can't be mistaken for a letter.
function Arrow({ dir }) {
  return (
    <svg className="arrow" viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">
      <path
        d={dir === 'down' ? 'M12 4v15M6 13l6 6 6-6' : 'M4 12h15M13 6l6 6-6 6'}
        fill="none"
        stroke="#159a5a"
        strokeWidth="3"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

const Cell = memo(function Cell({ r, c, ch, kind, cursor, arrow, path, shake, pop, onTap }) {
  let tile = null;
  if (kind === 'pending') tile = <span className={`tile pending${shake ? ' shake' : ''}`}>{ch}</span>;
  else if (kind) tile = <span className={`tile ${kind}${pop ? ' pop' : ''}`}>{ch}</span>;
  return (
    <button
      type="button"
      className={`cell${cursor ? ' cursor' : ''}${path ? ' path' : ''}${path && kind ? ' path-tile' : ''}`}
      onPointerDown={press(() => onTap(r, c))}
      aria-label={`Row ${r + 1}, column ${c + 1}`}
    >
      {tile}
      {arrow && !kind && <Arrow dir={arrow} />}
    </button>
  );
});

const Key = memo(function Key({ ch, onKey }) {
  return (
    <button type="button" className="keycap key" onPointerDown={press(() => onKey(ch))}>
      {ch}
    </button>
  );
});

function Header({ timer, code, muted, onMute }) {
  return (
    <header className="header">
      <div className="brand">
        <span className="logo keycap">I</span>
        <span className="title">Ink Rush</span>
      </div>
      <div className="timer">{timer}</div>
      <div className="header-right">
        <button type="button" className="keycap mute" onClick={onMute} aria-label={muted ? 'Unmute' : 'Mute'} aria-pressed={muted}>
          <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
            <path d="M4 9h4l5-4v14l-5-4H4z" fill="currentColor" />
            {muted ? (
              <path d="M16 9l5 6M21 9l-5 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            ) : (
              <path d="M16 8.5a5 5 0 0 1 0 7M18.5 6a8.5 8.5 0 0 1 0 12" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" />
            )}
          </svg>
        </button>
        {code && <div className="room keycap">{code}</div>}
      </div>
    </header>
  );
}

function PlayerCard({ name, score, me, away }) {
  return (
    <div className={`card keycap${me ? ' me' : ''}${away ? ' away' : ''}`}>
      <span className="avatar">{initial(name)}</span>
      <span className="name">{away ? 'away' : name}</span>
      {score !== undefined && <span className="score">{score}</span>}
    </div>
  );
}

function Home({ urlCode, busy, error, onCreate, onJoin }) {
  const [name, setName] = useState(() => load(NAME_KEY) || '');
  const [code, setCode] = useState('');
  const nick = name.trim();

  return (
    <div className="screen">
      <div className="hero">
        <span className="logo keycap big-logo">I</span>
        <h1>Ink Rush</h1>
        <p className="sub">90-second word race for 2–{MAX_PLAYERS} phones</p>
      </div>
      <label className="field">
        <span className="label">Nickname</span>
        <input
          className="input"
          value={name}
          maxLength={12}
          placeholder="Your name"
          autoComplete="off"
          onChange={(e) => setName(e.target.value)}
        />
      </label>
      {urlCode ? (
        <button type="button" className="keycap go wide" disabled={!nick || busy} onClick={() => onJoin(urlCode, nick)}>
          Join room {urlCode}
        </button>
      ) : (
        <>
          <button type="button" className="keycap go wide" disabled={!nick || busy} onClick={() => onCreate(nick)}>
            Create Game
          </button>
          <p className="sub">or join a friend's game</p>
          <div className="join-row">
            <input
              className="input code-input"
              value={code}
              placeholder="CODE"
              autoComplete="off"
              autoCapitalize="characters"
              onChange={(e) => setCode(cleanCode(e.target.value))}
            />
            <button type="button" className="keycap plain" disabled={!nick || code.length !== 4 || busy} onClick={() => onJoin(code, nick)}>
              Join
            </button>
          </div>
        </>
      )}
      <p className="error">{error || ' '}</p>
    </div>
  );
}

function Lobby({ code, room, pid, away, onStart, onLeave }) {
  const [note, setNote] = useState('');
  const ids = joinOrder(room, Object.keys(room.players || {}));
  const isHost = room.host === pid;
  const hostName = room.players?.[room.host]?.name || 'the host';
  const enough = ids.filter((id) => !away.has(id)).length >= MIN_PLAYERS;

  const share = async () => {
    const url = `${window.location.origin}/?room=${code}`;
    try {
      if (navigator.share) {
        await navigator.share({ title: 'Ink Rush', text: `Join my Ink Rush game! Room ${code}`, url });
        return;
      }
      await navigator.clipboard.writeText(url);
      setNote('Link copied');
    } catch (e) {
      if (e?.name !== 'AbortError') setNote(url);
    }
  };

  return (
    <div className="screen">
      <p className="label">Room code</p>
      <div className="bigcode">{code}</div>
      <button type="button" className="keycap plain" onClick={share}>Share invite link</button>
      <p className="sub">{note || ' '}</p>
      <p className="label">Players {ids.length}/{MAX_PLAYERS}</p>
      <div className="ticker">
        {ids.map((id) => (
          <PlayerCard key={id} name={room.players[id].name} me={id === pid} away={away.has(id)} />
        ))}
      </div>
      {isHost ? (
        <>
          <button type="button" className="keycap go wide" disabled={!enough} onClick={onStart}>Start</button>
          <p className="sub">{enough ? 'Everyone here will play.' : `Need at least ${MIN_PLAYERS} players.`}</p>
        </>
      ) : (
        <p className="big">Waiting for {hostName} to start…</p>
      )}
      <button type="button" className="link" onClick={onLeave}>Leave room</button>
    </div>
  );
}

function MiniBoard({ text, seed }) {
  const board = useMemo(() => decodeBoard(text || '', seed), [text, seed]);
  return (
    <div className="tray mini">
      <div className="grid">
        {board.map((row, r) =>
          row.map((cell, c) => (
            <span className="cell" key={`${r},${c}`}>
              {cell && <span className={`tile ${cell.kind}`}>{cell.ch}</span>}
            </span>
          )),
        )}
      </div>
      {!text && <div className="overlay"><p className="sub">Waiting for board…</p></div>}
    </div>
  );
}

function Winner() {
  return (
    <span className="winner keycap">
      <span className="glitter">WINNER</span>
      <i className="spark s1" />
      <i className="spark s2" />
      <i className="spark s3" />
      <i className="spark s4" />
    </span>
  );
}

function Results({ room, pid, away, onRematch, onLeave }) {
  const { round } = room;
  const scores = room.scores?.[round.n] || {};
  const ranked = withPlaces(
    rankPlayers(
      joinOrder(room, Object.keys(round.players)).map((id) => ({
        id,
        name: room.players?.[id]?.name || scores[id]?.name || 'Player',
        score: scores[id]?.score || 0,
        longest: scores[id]?.longest || '',
        board: scores[id]?.board,
        away: away.has(id),
      })),
    ),
  );
  const strip = useRef(null);
  const [slide, setSlide] = useState(0);
  const show = (i) => strip.current?.scrollTo({ left: i * strip.current.clientWidth, behavior: 'smooth' });

  return (
    <div className="results" style={{ '--rows': ranked.length }}>
      <ol className="ranks">
        {ranked.map((p, i) => (
          <li key={p.id}>
            <button
              type="button"
              className={`rank keycap${p.place <= 3 ? ` place-${p.place}` : ''}${slide === i ? ' viewing' : ''}`}
              onClick={() => show(i)}
            >
              <span className="place">{p.place}</span>
              <span className="name">{p.name}{p.away && <em className="away-tag"> away</em>}</span>
              {p.place === 1 ? <Winner /> : <span />}
              <span className="longest">{p.longest}</span>
              <span className="score">{p.score}</span>
            </button>
          </li>
        ))}
      </ol>
      <div className="strip" ref={strip} onScroll={(e) => setSlide(Math.round(e.currentTarget.scrollLeft / e.currentTarget.clientWidth))}>
        {ranked.map((p) => (
          <div className="slide" key={p.id}>
            <p className="slide-name">{p.name} · {p.score} tiles</p>
            <MiniBoard text={p.board} seed={round.seed} />
          </div>
        ))}
      </div>
      <div className="dots" aria-hidden="true">
        {ranked.map((p, i) => <span key={p.id} className={slide === i ? 'on' : ''} />)}
      </div>
      {room.host === pid ? (
        <button type="button" className="keycap go wide" onClick={onRematch}>Rematch</button>
      ) : (
        <p className="sub">Waiting for {room.players?.[room.host]?.name || 'the host'} to start a rematch…</p>
      )}
      <button type="button" className="link" onClick={onLeave}>Leave room</button>
    </div>
  );
}

function Play({ code, room, pid, away, dict, muted, onMute, onRematch, onLeave }) {
  const { round } = room;
  const startAt = round.startedAt + LEAD_MS;
  const endAt = startAt + ROUND_SECONDS * 1000;
  const clockAt = useCallback((now) => (now < startAt ? 'countdown' : now < endAt ? 'playing' : 'over'), [startAt, endAt]);

  const [game, dispatch] = useReducer(gameReducer, null, () => loadSavedGame(code, round.n, pid, round.seed) || initGame(round.seed));
  const { board, pending, cursor, dir, score, longest, status, shaking, popped } = game;
  const [clock, setClock] = useState(() => clockAt(serverNow()));
  const [secondsLeft, setSecondsLeft] = useState(ROUND_SECONDS);
  const [getReady, setGetReady] = useState(3);
  const played = useRef(!!game.resumed); // true from the start if we're picking a round back up
  const mutedRef = useRef(muted);
  mutedRef.current = muted;
  const leftBar = useRef(null);
  const rightBar = useRef(null);
  const myName = room.players?.[pid]?.name || 'Player';

  // Everything counts from the server's start time, so all phones agree to within a fraction of a second.
  useEffect(() => {
    if (clock === 'over') return undefined;
    let last = null;
    const tick = () => {
      const now = serverNow();
      const left = Math.max(0, Math.min(ROUND_SECONDS, Math.ceil((endAt - now) / 1000)));
      setSecondsLeft(left);
      setGetReady(Math.max(1, Math.ceil((startAt - now) / 1000)));
      if (left !== last && last !== null && !mutedRef.current) {
        if (left === 0) buzzer();
        else if (left <= BEEPS_FROM) beep();
      }
      last = left;
      setClock(clockAt(now));
    };
    tick();
    const id = setInterval(tick, 100);
    return () => clearInterval(id);
  }, [clock, startAt, endAt, clockAt]);

  useEffect(() => {
    if (clock === 'playing') {
      played.current = true;
      dispatch({ type: 'start', seed: round.seed });
    } else if (clock === 'over') {
      dispatch({ type: 'end' });
    }
  }, [clock, round.seed]);

  // Report the tile count live for the ticker, and the finished board once time is up.
  // Only if this phone actually played, so a late refresh can't wipe a score with zero.
  useEffect(() => {
    if (!played.current) return;
    const entry = { name: myName, score, longest };
    if (clock === 'over') entry.board = encodeBoard(board);
    reportScore(code, round.n, pid, entry).catch(() => {});
  }, [clock, score]); // eslint-disable-line react-hooks/exhaustive-deps

  // Save progress as it changes, so a refresh or app switch comes back to the same board, score and pending letters.
  useEffect(() => {
    if (played.current) save(GAME_KEY, JSON.stringify({ code, n: round.n, pid, ...snapshot(game) }));
  }, [board, pending, cursor, dir, score, longest]); // eslint-disable-line react-hooks/exhaustive-deps

  // The bar is drawn every frame straight from the end time, outside React, so it tracks the clock exactly.
  useEffect(() => {
    const draw = (fill) => {
      const t = `scaleX(${fill})`;
      if (leftBar.current) leftBar.current.style.transform = t;
      if (rightBar.current) rightBar.current.style.transform = t;
    };
    if (clock !== 'playing') {
      draw(clock === 'over' ? 1 : 0);
      return undefined;
    }
    let id;
    const frame = () => {
      const msLeft = Math.max(0, endAt - serverNow());
      draw(1 - msLeft / (ROUND_SECONDS * 1000));
      if (msLeft > 0) id = requestAnimationFrame(frame);
    };
    frame();
    return () => cancelAnimationFrame(id);
  }, [clock, endAt]);

  useEffect(() => {
    if (!shaking) return undefined;
    const id = setTimeout(() => dispatch({ type: 'unshake' }), 450);
    return () => clearTimeout(id);
  }, [shaking]);

  useEffect(() => {
    if (popped.length === 0) return undefined;
    const id = setTimeout(() => dispatch({ type: 'unpop' }), 400);
    return () => clearTimeout(id);
  }, [popped]);

  // All stable, so memoized keys and cells never re-render just because a handler changed.
  const typeLetter = useCallback((ch) => dispatch({ type: 'letter', ch }), []);
  const tapCell = useCallback((r, c) => dispatch({ type: 'tap', r, c }), []);
  const backspace = useCallback(() => dispatch({ type: 'back' }), []);
  const clear = useCallback(() => dispatch({ type: 'clear' }), []);
  const toggleDir = useCallback(() => dispatch({ type: 'toggleDir' }), []);
  // Dictionary lookup happens only here, never while typing.
  const submit = useCallback(() => dict && dispatch({ type: 'submit', isWord: (w) => dict.has(w) }), [dict]);

  // Desktop convenience: physical keyboard mirrors the on-screen one.
  useEffect(() => {
    const onKey = (e) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (/^[a-zA-Z]$/.test(e.key)) typeLetter(e.key.toUpperCase());
      else if (e.key === 'Backspace') backspace();
      else if (e.key === 'Enter') submit();
      else return;
      e.preventDefault();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [typeLetter, backspace, submit]);

  const pendingAt = useMemo(() => new Map(pending.map((t) => [`${t.r},${t.c}`, t.ch])), [pending]);
  const urgent = clock !== 'countdown' && secondsLeft <= RED_AT;
  const typed = pending.map((t) => t.ch).join('');
  const ids = joinOrder(room, Object.keys(round.players));
  const scores = room.scores?.[round.n] || {};

  return (
    <div className={`app${ids.length > 4 ? ' two-rows' : ''}`}>
      <Header timer={fmt(secondsLeft)} code={code} muted={muted} onMute={onMute} />

      <div className={`countdown${urgent ? ' urgent' : ''}`} aria-hidden="true">
        <span className="half left" ref={leftBar} />
        <span className="half right" ref={rightBar} />
      </div>

      {clock === 'over' ? (
        <Results room={room} pid={pid} away={away} onRematch={onRematch} onLeave={onLeave} />
      ) : (
        <>
          <div className="ticker">
            {ids.map((id) => (
              <PlayerCard
                key={id}
                name={room.players?.[id]?.name || scores[id]?.name || 'Player'}
                score={id === pid ? score : scores[id]?.score || 0}
                me={id === pid}
                away={away.has(id)}
              />
            ))}
          </div>

          <div className="tray">
            <div className="grid">
              {board.map((row, r) =>
                row.map((cell, c) => {
                  const key = `${r},${c}`;
                  const pend = pendingAt.get(key);
                  const isCursor = clock === 'playing' && cursor.r === r && cursor.c === c;
                  const ahead = dir === 'down' ? c === cursor.c && r > cursor.r : r === cursor.r && c > cursor.c;
                  return (
                    <Cell
                      key={key}
                      r={r}
                      c={c}
                      ch={pend || cell?.ch}
                      kind={pend ? 'pending' : cell?.kind}
                      cursor={isCursor}
                      arrow={isCursor ? dir : null}
                      path={clock === 'playing' && ahead}
                      shake={!!pend && shaking}
                      pop={popped.includes(key)}
                      onTap={tapCell}
                    />
                  );
                }),
              )}
            </div>
            {clock === 'countdown' && (
              <div className="overlay">
                <p className="big">Get ready</p>
                <p className="final">{getReady}</p>
                <p className="sub">90 seconds. Most tiles wins.</p>
              </div>
            )}
          </div>

          <div className={`status${shaking ? ' bad' : ''}`}>{(dict ? status : 'Loading dictionary…') || ' '}</div>

          <div className="actions">
            <button type="button" className="keycap toggle" onPointerDown={press(toggleDir)}>
              {dir === 'down' ? '↓ Down' : '→ Across'}
            </button>
            {/* Submit and Clear wait for finger-up so a brushing thumb can't fire them. */}
            <button type="button" className="keycap clear" onClick={clear}>Clear</button>
            <button type="button" className="keycap submit" onClick={submit}>
              Submit{typed && <span className="typed">{typed}</span>}
            </button>
          </div>

          <div className="keyboard">
            {KEY_ROWS.map((row, i) => (
              <div className="krow" key={row}>
                {[...row].map((ch) => (
                  <Key key={ch} ch={ch} onKey={typeLetter} />
                ))}
                {i === 2 && (
                  <button type="button" className="keycap key back" onPointerDown={press(backspace)} aria-label="Backspace">
                    ⌫
                  </button>
                )}
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

export default function App() {
  const [pid, setPid] = useState(null);
  const [authError, setAuthError] = useState(false);
  const [urlCode, setUrlCode] = useState(() => cleanCode(new URLSearchParams(window.location.search).get('room')));
  const [dict, setDict] = useState(null);
  const [code, setCode] = useState(null);
  const [room, setRoom] = useState(undefined); // undefined = still loading
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [muted, setMuted] = useState(() => load(MUTE_KEY) === '1');
  const [, setTick] = useState(0);
  const inRoom = !!room?.players?.[pid];

  // Re-check who's gone quiet every couple of seconds.
  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 2000);
    return () => clearInterval(id);
  }, []);

  // While we're in a room, keep telling the others we're here.
  useEffect(() => {
    if (!code || !inRoom) return undefined;
    return trackPresence(code, pid);
  }, [code, pid, inRoom]);

  // If the host is gone, the next player still here takes over. Only that one phone makes the move.
  useEffect(() => {
    if (!inRoom || !room.host || room.host === pid) return;
    const gone = !room.players[room.host] || isAway(room, room.host);
    if (gone && nextHost(room, room.host) === pid) claimHost(code, room.host, pid).catch(() => {});
  });

  useEffect(() => {
    signIn().then(setPid, () => setAuthError(true));
  }, []);

  useEffect(() => {
    fetch('/enable.txt')
      .then((r) => r.text())
      .then((t) => setDict(new Set(t.split(/\s+/))))
      .catch(() => setError('Could not load the dictionary. Refresh to retry.'));
  }, []);

  // Opening the link again (or refreshing) drops you straight back into a room you're already in.
  useEffect(() => {
    if (!urlCode || !pid) return undefined;
    return watchRoom(urlCode, (r) => {
      if (r?.players?.[pid]) setCode((c) => c || urlCode);
    });
  }, [urlCode, pid]);

  useEffect(() => {
    if (!code) return undefined;
    setRoom(undefined);
    return watchRoom(code, setRoom);
  }, [code]);

  const enter = (c) => {
    setUrlRoom(c);
    setCode(c);
  };

  const guard = async (fn) => {
    unlockAudio(); // inside a tap, so iPhones will let the countdown beeps play later
    setBusy(true);
    setError('');
    try {
      await fn();
    } catch (e) {
      setError(/permission/i.test(e?.message) ? 'The game server refused the connection.' : e?.message || 'Something went wrong.');
    }
    setBusy(false);
  };

  const onCreate = (name) =>
    guard(async () => {
      save(NAME_KEY, name);
      enter(await createRoom(pid, name));
    });

  const onJoin = (c, name) =>
    guard(async () => {
      save(NAME_KEY, name);
      const why = await joinRoom(c, pid, name);
      if (why) setError(why);
      else enter(c);
    });

  const goHome = () => {
    setUrlRoom(null);
    setUrlCode('');
    setCode(null);
    setRoom(undefined);
  };

  const onLeave = () => {
    // Leaving the lobby (or sitting out a round) frees your seat; leaving after playing keeps your score on the board.
    // If you're host, the next player here takes over right away.
    if (inRoom) {
      const next = room.host === pid ? nextHost(room, pid) : undefined;
      leaveRoom(code, pid, { next, freeSeat: !room.round?.players?.[pid], seats: room.seats }).catch(() => {});
    }
    goHome();
  };

  const toggleMute = () => {
    const next = !muted;
    setMuted(next);
    if (!next) unlockAudio();
    save(MUTE_KEY, next ? '1' : '0');
  };

  const shell = (body) => (
    <div className="app">
      <Header timer={fmt(ROUND_SECONDS)} code={code} muted={muted} onMute={toggleMute} />
      {body}
    </div>
  );

  if (!pid) {
    return shell(
      <div className="screen">
        <p className="big">{authError ? "Couldn't connect to the game server. Refresh to try again." : 'Connecting…'}</p>
      </div>,
    );
  }
  if (!code) return shell(<Home urlCode={urlCode} busy={busy} error={error} onCreate={onCreate} onJoin={onJoin} />);
  if (room === undefined) return shell(<div className="screen"><p className="big">Connecting…</p></div>);
  if (room === null || !room.players?.[pid]) {
    return shell(
      <div className="screen">
        <p className="big">You're not in room {code} any more.</p>
        <button type="button" className="keycap go wide" onClick={goHome}>Home</button>
      </div>,
    );
  }

  const { round } = room;
  const away = new Set(Object.keys(room.players).filter((id) => id !== pid && isAway(room, id)));
  if (!round) return shell(<Lobby code={code} room={room} pid={pid} away={away} onStart={() => startRound(code, room)} onLeave={onLeave} />);
  if (round.players?.[pid]) {
    return <Play key={round.n} code={code} room={room} pid={pid} away={away} dict={dict} muted={muted} onMute={toggleMute} onRematch={() => rematch(code, room).catch(() => {})} onLeave={onLeave} />;
  }
  // Joined mid-round: they sit this one out and play the next.
  return shell(
    <div className="screen">
      <p className="big">A round is in progress.</p>
      <p className="sub">You'll play in the next round.</p>
      <button type="button" className="link" onClick={onLeave}>Leave room</button>
    </div>,
  );
}
