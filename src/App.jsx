import { memo, useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react';
import { ROUND_SECONDS, pickSeed } from './rules.js';
import { gameReducer, initGame } from './game.js';
import { beep, buzzer, unlockAudio } from './sound.js';

const RED_AT = 10;
const BEEPS_FROM = 5;
const MUTE_KEY = 'inkrush2.muted';
const KEY_ROWS = ['QWERTYUIOP', 'ASDFGHJKL', 'ZXCVBNM'];

const fmt = (s) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;

// Fire on finger-down, not click: clicks wait for finger-up, so fast two-thumb typing reorders or cancels them.
const press = (fn) => (e) => {
  if (e.button !== 0) return;
  e.preventDefault();
  fn();
};

const Cell = memo(function Cell({ r, c, ch, kind, cursor, shake, pop, onTap }) {
  let tile = null;
  if (kind === 'pending') tile = <span className={`tile pending${shake ? ' shake' : ''}`}>{ch}</span>;
  else if (kind) tile = <span className={`tile ${kind}${pop ? ' pop' : ''}`}>{ch}</span>;
  return (
    <button
      type="button"
      className={`cell${cursor ? ' cursor' : ''}`}
      onPointerDown={press(() => onTap(r, c))}
      aria-label={`Row ${r + 1}, column ${c + 1}`}
    >
      {tile}
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

export default function App() {
  const [dict, setDict] = useState(null);
  const [phase, setPhase] = useState('loading'); // loading | ready | playing | over | error
  const [game, dispatch] = useReducer(gameReducer, undefined, () => initGame());
  const [endsAt, setEndsAt] = useState(0);
  const [secondsLeft, setSecondsLeft] = useState(ROUND_SECONDS);
  const { board, pending, cursor, dir, score, longest, status, shaking, popped } = game;
  const [muted, setMuted] = useState(() => {
    try {
      return localStorage.getItem(MUTE_KEY) === '1';
    } catch {
      return false;
    }
  });
  const mutedRef = useRef(muted);
  mutedRef.current = muted;
  const leftBar = useRef(null);
  const rightBar = useRef(null);

  useEffect(() => {
    fetch('/enable.txt')
      .then((r) => r.text())
      .then((t) => {
        setDict(new Set(t.split(/\s+/)));
        setPhase('ready');
      })
      .catch(() => setPhase('error'));
  }, []);

  // Countdown from a fixed end time so it can't drift.
  useEffect(() => {
    if (phase !== 'playing') return undefined;
    let last = null;
    const tick = () => {
      const left = Math.max(0, Math.ceil((endsAt - Date.now()) / 1000));
      setSecondsLeft(left);
      if (left !== last && last !== null && !mutedRef.current) {
        if (left === 0) buzzer();
        else if (left <= BEEPS_FROM) beep();
      }
      last = left;
      if (left === 0) {
        dispatch({ type: 'end' });
        setPhase('over');
      }
    };
    tick();
    const id = setInterval(tick, 200);
    return () => clearInterval(id);
  }, [phase, endsAt]);

  // The bar is drawn every frame straight from the end time, outside React, so it tracks the clock exactly.
  useEffect(() => {
    const draw = (fill) => {
      const t = `scaleX(${fill})`;
      if (leftBar.current) leftBar.current.style.transform = t;
      if (rightBar.current) rightBar.current.style.transform = t;
    };
    if (phase !== 'playing') {
      draw(phase === 'over' ? 1 : 0);
      return undefined;
    }
    let id;
    const frame = () => {
      const msLeft = Math.max(0, endsAt - Date.now());
      draw(1 - msLeft / (ROUND_SECONDS * 1000));
      if (msLeft > 0) id = requestAnimationFrame(frame);
    };
    frame();
    return () => cancelAnimationFrame(id);
  }, [phase, endsAt]);

  const toggleMute = () => {
    const next = !muted;
    setMuted(next);
    if (!next) unlockAudio();
    try {
      localStorage.setItem(MUTE_KEY, next ? '1' : '0');
    } catch {
      // Storage blocked (private mode): the setting just won't persist.
    }
  };

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

  const start = () => {
    unlockAudio();
    dispatch({ type: 'start', seed: pickSeed() });
    setEndsAt(Date.now() + ROUND_SECONDS * 1000);
    setSecondsLeft(ROUND_SECONDS);
    setPhase('playing');
  };

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
  const urgent = (phase === 'playing' || phase === 'over') && secondsLeft <= RED_AT;
  const typed = pending.map((t) => t.ch).join('');

  return (
    <div className="app">
      <header className="header">
        <div className="brand">
          <span className="logo keycap">I</span>
          <span className="title">Ink Rush</span>
        </div>
        <div className="timer">{fmt(secondsLeft)}</div>
        <div className="header-right">
          <button
            type="button"
            className="keycap mute"
            onClick={toggleMute}
            aria-label={muted ? 'Unmute' : 'Mute'}
            aria-pressed={muted}
          >
            <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
              <path d="M4 9h4l5-4v14l-5-4H4z" fill="currentColor" />
              {muted ? (
                <path d="M16 9l5 6M21 9l-5 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
              ) : (
                <path d="M16 8.5a5 5 0 0 1 0 7M18.5 6a8.5 8.5 0 0 1 0 12" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" />
              )}
            </svg>
          </button>
          <div className="room keycap">SOLO</div>
        </div>
      </header>

      <div className={`countdown${urgent ? ' urgent' : ''}`} aria-hidden="true">
        <span className="half left" ref={leftBar} />
        <span className="half right" ref={rightBar} />
      </div>

      <div className="ticker">
        <div className="card keycap me">
          <span className="avatar">Y</span>
          <span className="name">You</span>
          <span className="score">{score}</span>
        </div>
      </div>

      <div className="tray">
        <div className="grid">
          {board.map((row, r) =>
            row.map((cell, c) => {
              const key = `${r},${c}`;
              const pend = pendingAt.get(key);
              return (
                <Cell
                  key={key}
                  r={r}
                  c={c}
                  ch={pend || cell?.ch}
                  kind={pend ? 'pending' : cell?.kind}
                  cursor={phase === 'playing' && cursor.r === r && cursor.c === c}
                  shake={!!pend && shaking}
                  pop={popped.includes(key)}
                  onTap={tapCell}
                />
              );
            }),
          )}
        </div>

        {phase !== 'playing' && (
          <div className="overlay">
            {phase === 'loading' && <p className="big">Loading dictionary…</p>}
            {phase === 'error' && <p className="big">Could not load the dictionary. Refresh to retry.</p>}
            {phase === 'ready' && (
              <>
                <p className="big">90 seconds. Most tiles wins.</p>
                <button type="button" className="keycap go" onClick={start}>Start</button>
              </>
            )}
            {phase === 'over' && (
              <>
                <p className="big">Time's up</p>
                <p className="final">{score}</p>
                <p className="sub">tiles placed{longest ? ` · longest word ${longest}` : ''}</p>
                <button type="button" className="keycap go" onClick={start}>Play again</button>
              </>
            )}
          </div>
        )}
      </div>

      <div className={`status${shaking ? ' bad' : ''}`}>{status || ' '}</div>

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
    </div>
  );
}
