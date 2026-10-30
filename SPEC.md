# INK RUSH 2 — Spec

Real-time multiplayer word race, mobile-first web app at inkrush2.loewstuff.com.

## Lobby
Nickname only, no accounts. Host taps Create Game and gets a 4-letter room code + shareable link (?room=ABCD). 2–8 players (hard cap 8). Host taps Start. Late joiners wait for next round.

## Round
90 seconds, timer synced via Firebase server timestamp. Each player has a private 11x11 board. All boards start with the same seed word (random common English word, 5–7 letters, from a curated list) placed horizontally through the center.

## Input
Tap a cell to set the cursor; tap the same cell again to toggle across/down. Type on a custom on-screen keyboard (never the native keyboard); cursor auto-advances, skipping existing tiles. Backspace removes pending tiles. Submit button checks the word.

## Rules
Strict Scrabble. New tiles in one row or column, contiguous (gaps filled by existing tiles), connected to existing tiles. No diagonals. Every word of 2+ letters formed, including crossings, must be valid. Check instantly on the phone against the public-domain ENABLE word list. Valid = tiles lock permanently with tile pop animation. Invalid = tiles shake and return, no penalty.

## Score
1 point per tile placed. Seed word doesn't count.

## During Round
Live ticker showing every player's tile count. Opponent boards stay hidden.

## End
Ranked scoreboard, winner highlighted. Tie-breaker: longest single word. Swipe through every player's final board. Rematch button = same room, new seed. Disconnected players keep their score.

## Look
LOOK — "Keycap" (clean, tactile, detail-oriented):
- Page side padding 6px. Background #eceef1. Text #1b1e24, secondary text #4d535e. Accent orange #ff7a3d (always dark text on orange).
- Fonts: IBM Plex Sans for UI, IBM Plex Mono for tiles, timer and scores (Google Fonts).
- Keycap effect everywhere: rounded corners plus a 3px darker bottom edge (inset box-shadow) so things look like physical keys. On tap, keys press down (edge shrinks to 1px).
- Header: small dark keycap logo with "I", "Ink Rush" title, big mono timer (0:47) in the center, room code in a small white keycap chip on the right.
- Under the header: an 18-segment countdown bar (dark segments drain to light gray as time runs out).
- Score ticker: player cards in a 4-column grid (2 rows if more than 4 players). Each card is a white keycap with an initial avatar circle, name, and mono score. Your own card has an orange bottom edge and orange avatar.
- Board: 11x11 inside a recessed tray (#dfe2e7, 4px padding, radius 14, 2px gap, inner shadow). Tiles are sized from the screen width so the board fills it: tile = (width - 12 - 8 - 20) / 11 (about 32px on a 390px phone). Tile letters are IBM Plex Mono bold 22px. Empty cells are light (#e9ebef) and slightly sunken. Seed word tiles are graphite (#2b2f37) keycaps with white letters. Your placed tiles are orange keycaps. Pending (typed, not yet submitted) tiles are white keycaps with a 2px orange ring. The cursor cell is a white keycap with a 2px orange ring and a bold green (#159a5a) arrow (right = across, down = down) that never blocks taps. Direction hint: empty cells from the cursor forward to the board edge are tinted rgba(30,170,100,0.25); existing tiles in that path get a 2px rgba(30,170,100,0.6) ring. It updates instantly on cursor move, Down/Across tap and same-cell toggle.
- Action row: "↓ Down / → Across" toggle, "Clear", and a wide orange "Submit" button that shows the letters being typed.
- Custom on-screen keyboard: white keycaps, 48px tall, QWERTY with a wider gray backspace key.
- Valid word: tiles pop slightly as they lock in. Invalid word: tiles shake and return.
- Board, timer, ticker and keyboard all fit an iPhone screen without scrolling. Big tap targets.

### Results screen look
- Ranking: score, then longest single word. Players still tied share a place (standard competition ranking: 1, 1, 3).
- Rows are keycaps with a 3px darker bottom edge and dark text: 1st gold #ffd23d, 2nd silver #d4d9e1, 3rd bronze #d9955f, 4th and below neutral white. No orange, no "YOU" marker.
- Each row: bold mono place number, nickname as entered, then (1st place only, ties included) a WINNER badge: dark graphite keycap, gold-to-white shimmering letters (~2.5s loop) and four twinkling sparkles. Reduced motion shows a static gold gradient.

## Tech
Vite + React, Firebase Realtime Database (https://inkrush2-default-rtdb.firebaseio.com/), Vercel hosting. Firebase config in .env.local and Vercel environment variables, never committed. Scores are reported by each phone (acceptable for friends-only play).
