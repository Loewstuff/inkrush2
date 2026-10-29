// Countdown sounds, generated with Web Audio so there are no files to load.
let ctx = null;

// Call from a tap (Start): iPhones only allow audio once a user gesture has started it.
export function unlockAudio() {
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return;
  if (!ctx) ctx = new AC();
  if (ctx.state === 'suspended') ctx.resume();
  // A silent blip inside the gesture fully unlocks older iOS Safari.
  const src = ctx.createBufferSource();
  src.buffer = ctx.createBuffer(1, 1, 22050);
  src.connect(ctx.destination);
  src.start(0);
}

function tone(freq, seconds, type, volume) {
  if (!ctx) return;
  const t = ctx.currentTime;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = type;
  osc.frequency.value = freq;
  // Quick fade in and out so it doesn't click.
  gain.gain.setValueAtTime(0, t);
  gain.gain.linearRampToValueAtTime(volume, t + 0.01);
  gain.gain.setValueAtTime(volume, t + seconds - 0.05);
  gain.gain.linearRampToValueAtTime(0, t + seconds);
  osc.connect(gain).connect(ctx.destination);
  osc.start(t);
  osc.stop(t + seconds);
}

export const beep = () => tone(880, 0.12, 'sine', 0.3);
export const buzzer = () => tone(160, 0.8, 'square', 0.18);
