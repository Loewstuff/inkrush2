import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { SIZE, ROUND_SECONDS, boardWithSeed, checkMove, pickSeed } from './rules.js';

const SEGMENTS = 18;
const KEY_ROWS = ['QWERTYUIOP', 'ASDFGHJKL', 'ZXCVBNM'];

const fmt = (s) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;

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

export default function App() {
  const [dict, setDict] = useState(null);
  const [phase, setPhase] = useState('loading'); // loading | ready | playing | over
  const [board, setBoard] = useState(() => boardWithSeed('PLANET'));
  const [pending, setPending] = useState([]);
  const [cursor, setCursor] = useState({ r: 4, c: 5 });
  const [dir, setDir] = useState('down');
  const [score, setScore] = useState(0);
  const [longest, setLongest] = useState('');
  const [status, setStatus] = useState('');
  const [shaking, setShaking] = useState(false);
  const [popped, setPopped] = useState([]);
  const [endsAt, setEndsAt] = useState(0);
  const [secondsLeft, setSecondsLeft] = useState(ROUND_SECONDS);

  useEffect(() => {
    fetch('/enable.txt')
      .then((r) => r.text())
      .then((t) => {
        setDict(new Set(t.split(/\s+/)));
        setPhase('ready');
      })
      .catch(() => setStatus('Could not load the dictionary. Refresh to retry.'));
  }, []);

  // Countdown from a fixed end time so it can't drift.
  useEffect(() => {
    if (phase !== 'playing') return undefined;
    const tick = () => {
      const left = Math.max(0, Math.ceil((endsAt - Date.now()) / 1000));
      setSecondsLeft(left);
      if (left === 0) {
        setPending([]);
        setPhase('over');
      }
    };
    tick();
    const id = setInterval(tick, 200);
    return () => clearInterval(id);
  }, [phase, endsAt]);

  const start = () => {
    setBoard(boardWithSeed(pickSeed()));
    setPending([]);
    setCursor({ r: 4, c: 5 });
    setDir('down');
    setScore(0);
    setLongest('');
    setStatus('');
    setPopped([]);
    setEndsAt(Date.now() + ROUND_SECONDS * 1000);
    setSecondsLeft(ROUND_SECONDS);
    setPhase('playing');
  };

  const canInput = phase === 'playing' && !shaking;

  const typeLetter = useCallback(
    (ch) => {
      if (!canInput) return;
      const at = nextOpen(board, cursor.r, cursor.c, dir);
      if (!at) return;
      setPending((p) => [...p.filter((t) => t.r !== at.r || t.c !== at.c), { ...at, ch }]);
      const next = nextOpen(board, at.r + (dir === 'down' ? 1 : 0), at.c + (dir === 'across' ? 1 : 0), dir);
      setCursor(next || at);
      setStatus('');
    },
    [canInput, board, cursor, dir],
  );

  const backspace = useCallback(() => {
    if (!canInput || pending.length === 0) return;
    const last = pending[pending.length - 1];
    setPending(pending.slice(0, -1));
    setCursor({ r: last.r, c: last.c });
    setStatus('');
  }, [canInput, pending]);

  const clear = () => {
    if (!canInput) return;
    setPending([]);
    setStatus('');
  };

  const submit = useCallback(() => {
    if (!canInput || !dict) return;
    const result = checkMove(board, pending, (w) => dict.has(w));
    if (!result.ok) {
      setStatus(result.error);
      if (pending.length > 0) {
        setShaking(true);
        setTimeout(() => {
          setPending([]);
          setShaking(false);
        }, 450);
      }
      return;
    }
    const next = board.map((row) => row.slice());
    for (const t of pending) next[t.r][t.c] = { ch: t.ch, kind: 'mine' };
    setBoard(next);
    setScore((s) => s + pending.length);
    const best = result.words.reduce((a, w) => (w.length > a.length ? w : a), '');
    setLongest((l) => (best.length > l.length ? best : l));
    setStatus(`${result.words.join(' + ')}  +${pending.length}`);
    setPopped(pending.map((t) => `${t.r},${t.c}`));
    setPending([]);
    setTimeout(() => setPopped([]), 400);
  }, [canInput, dict, board, pending]);

  const tapCell = (r, c) => {
    if (!canInput) return;
    if (cursor.r === r && cursor.c === c) setDir((d) => (d === 'down' ? 'across' : 'down'));
    else setCursor({ r, c });
  };

  // Desktop convenience: physical keyboard mirrors the on-screen one.
  const handlers = useRef({});
  handlers.current = { typeLetter, backspace, submit };
  useEffect(() => {
    const onKey = (e) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (/^[a-zA-Z]$/.test(e.key)) handlers.current.typeLetter(e.key.toUpperCase());
      else if (e.key === 'Backspace') handlers.current.backspace();
      else if (e.key === 'Enter') handlers.current.submit();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const pendingAt = useMemo(() => new Map(pending.map((t) => [`${t.r},${t.c}`, t.ch])), [pending]);
  const lit = phase === 'playing' || phase === 'over' ? Math.ceil((secondsLeft / ROUND_SECONDS) * SEGMENTS) : SEGMENTS;
  const typed = pending.map((t) => t.ch).join('');

  return (
    <div className="app">
      <header className="header">
        <div className="brand">
          <span className="logo keycap">I</span>
          <span className="title">Ink Rush</span>
        </div>
        <div className="timer">{fmt(secondsLeft)}</div>
        <div className="room keycap">SOLO</div>
      </header>

      <div className="countdown" aria-hidden="true">
        {Array.from({ length: SEGMENTS }, (_, i) => (
          <span key={i} className={i < lit ? 'seg on' : 'seg'} />
        ))}
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
              const isCursor = phase === 'playing' && cursor.r === r && cursor.c === c;
              let tile = null;
              if (pend) {
                tile = <span className={`tile pending${shaking ? ' shake' : ''}`}>{pend}</span>;
              } else if (cell) {
                tile = <span className={`tile ${cell.kind}${popped.includes(key) ? ' pop' : ''}`}>{cell.ch}</span>;
              }
              return (
                <button
                  key={key}
                  type="button"
                  className={`cell${isCursor ? ' cursor' : ''}`}
                  onClick={() => tapCell(r, c)}
                  aria-label={`Row ${r + 1}, column ${c + 1}`}
                >
                  {tile}
                </button>
              );
            }),
          )}
        </div>

        {phase !== 'playing' && (
          <div className="overlay">
            {phase === 'loading' && <p className="big">Loading dictionary…</p>}
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

      <div className={`status${shaking ? ' bad' : ''}`}>{status || ' '}</div>

      <div className="actions">
        <button type="button" className="keycap toggle" onClick={() => setDir((d) => (d === 'down' ? 'across' : 'down'))}>
          {dir === 'down' ? '↓ Down' : '→ Across'}
        </button>
        <button type="button" className="keycap clear" onClick={clear}>Clear</button>
        <button type="button" className="keycap submit" onClick={submit}>
          Submit{typed && <span className="typed">{typed}</span>}
        </button>
      </div>

      <div className="keyboard">
        {KEY_ROWS.map((row, i) => (
          <div className="krow" key={row}>
            {[...row].map((ch) => (
              <button key={ch} type="button" className="keycap key" onClick={() => typeLetter(ch)}>
                {ch}
              </button>
            ))}
            {i === 2 && (
              <button type="button" className="keycap key back" onClick={backspace} aria-label="Backspace">
                ⌫
              </button>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
