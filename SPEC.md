# INK RUSH 2 — Spec

Real-time multiplayer word race, mobile-first web app at inkrush2.loewstuff.com.

## Lobby
Nickname only, no accounts. Host taps Create Game and gets a 4-letter room code + shareable link (?room=ABCD). 2–8+ players. Host taps Start. Late joiners wait for next round.

## Round
90 seconds, timer synced via Firebase server timestamp. Each player has a private 11x11 board. All boards start with the same seed word (random common English word, 5–7 letters, from a curated list) placed horizontally through the center.

## Input
Tap a cell to set the cursor; tap the same cell again to toggle across/down. Type on a custom on-screen keyboard (never the native keyboard); cursor auto-advances, skipping existing tiles. Backspace removes pending tiles. Submit button checks the word.

## Rules
Strict Scrabble. New tiles in one row or column, contiguous (gaps filled by existing tiles), connected to existing tiles. No diagonals. Every word of 2+ letters formed, including crossings, must be valid. Check instantly on the phone against the public-domain ENABLE word list. Valid = tiles lock permanently with ink-splash effect. Invalid = tiles shake and return, no penalty.

## Score
1 point per tile placed. Seed word doesn't count.

## During Round
Live ticker showing every player's tile count. Opponent boards stay hidden.

## End
Ranked scoreboard, winner highlighted. Tie-breaker: longest single word. Swipe through every player's final board. Rematch button = same room, new seed. Disconnected players keep their score.

## Look
Ink & paper. Cream paper board, brush-ink letters, ink splatters. Board, timer, ticker and keyboard all fit an iPhone screen without scrolling. Big tap targets.

## Tech
Vite + React, Firebase Realtime Database (https://inkrush2-default-rtdb.firebaseio.com/), Vercel hosting. Firebase config in .env.local and Vercel environment variables, never committed. Scores are reported by each phone (acceptable for friends-only play).
