/**
 * Cassette-futurism sound engine for spaacetime.
 *
 * All sounds are synthesized via Web Audio API — no external files needed.
 * The aesthetic: soft analog, slightly imperfect, warm tape character.
 *
 * Three core sounds:
 *   1. tapeClick  — task complete / toggle (muted cassette button press)
 *   2. blip       — minor interaction / notification (detuned sine blip)
 *   3. swell      — focus mode start / session complete (warm analog pad)
 *
 * Plus notification variants built on the same aesthetic:
 *   4. warning    — 5-min pre-notification (gentle dual-tone)
 *   5. alarm      — task end notification (warmer, more insistent)
 */

import { useTimezoneStore } from '@/store/timezoneStore';

let audioCtx: AudioContext | null = null;
let lastPlayTime = 0;
const MIN_INTERVAL_MS = 80; // debounce rapid-fire

function ctx(): AudioContext | null {
  if (!audioCtx) {
    try { audioCtx = new AudioContext(); } catch { return null; }
  }
  if (audioCtx.state === 'suspended') audioCtx.resume().catch(() => {});
  return audioCtx;
}

/** Master gain — keeps everything quiet and respectful of system volume */
function masterGain(c: AudioContext, volume = 0.12): GainNode {
  const g = c.createGain();
  g.gain.value = volume;
  g.connect(c.destination);
  return g;
}

/** Low-pass filter for tape warmth */
function warmFilter(c: AudioContext, freq = 3000): BiquadFilterNode {
  const f = c.createBiquadFilter();
  f.type = 'lowpass';
  f.frequency.value = freq;
  f.Q.value = 0.7;
  return f;
}

/** Subtle random detune for analog imperfection */
function drift(): number {
  return (Math.random() - 0.5) * 8; // ±4 cents
}

// ─── Sound: Tape Click ───────────────────────────────────────────────────────
// Short, muted percussive click — like pressing a cassette deck button.
// Uses filtered noise burst + low thump.

function playTapeClick(c: AudioContext) {
  const t = c.currentTime;
  const master = masterGain(c, 0.1);

  // Noise burst (filtered)
  const bufferSize = c.sampleRate * 0.03; // 30ms
  const buffer = c.createBuffer(1, bufferSize, c.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < bufferSize; i++) {
    data[i] = (Math.random() * 2 - 1) * 0.5;
  }
  const noise = c.createBufferSource();
  noise.buffer = buffer;

  const noiseFilter = c.createBiquadFilter();
  noiseFilter.type = 'bandpass';
  noiseFilter.frequency.value = 800;
  noiseFilter.Q.value = 2;

  const noiseGain = c.createGain();
  noiseGain.gain.setValueAtTime(0.6, t);
  noiseGain.gain.exponentialRampToValueAtTime(0.001, t + 0.04);

  noise.connect(noiseFilter).connect(noiseGain).connect(master);
  noise.start(t);
  noise.stop(t + 0.04);

  // Low thump
  const osc = c.createOscillator();
  osc.type = 'sine';
  osc.frequency.setValueAtTime(120, t);
  osc.frequency.exponentialRampToValueAtTime(40, t + 0.06);

  const thumpGain = c.createGain();
  thumpGain.gain.setValueAtTime(0.4, t);
  thumpGain.gain.exponentialRampToValueAtTime(0.001, t + 0.06);

  osc.connect(thumpGain).connect(master);
  osc.start(t);
  osc.stop(t + 0.07);
}

// ─── Sound: Blip ─────────────────────────────────────────────────────────────
// Soft sine-wave blip, slightly detuned, minimal sci-fi feel. 50-120ms.

function playBlip(c: AudioContext) {
  const t = c.currentTime;
  const master = masterGain(c, 0.08);
  const filter = warmFilter(c, 4000);
  filter.connect(master);

  // Two slightly detuned oscillators for analog character
  [440 + drift(), 443 + drift()].forEach((freq) => {
    const osc = c.createOscillator();
    osc.type = 'sine';
    osc.frequency.value = freq;

    const g = c.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(0.5, t + 0.008); // fast attack
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.09); // ~90ms total

    osc.connect(g).connect(filter);
    osc.start(t);
    osc.stop(t + 0.1);
  });
}

// ─── Sound: Swell ────────────────────────────────────────────────────────────
// Gentle analog swell/pad. Warm, soft attack (200-500ms), emotionally grounding.

function playSwell(c: AudioContext) {
  const t = c.currentTime;
  const master = masterGain(c, 0.07);
  const filter = warmFilter(c, 2200);
  filter.connect(master);

  // Chord: root + major third + fifth, all with slight drift
  const freqs = [220 + drift(), 277 + drift(), 330 + drift()];

  freqs.forEach((freq) => {
    const osc = c.createOscillator();
    osc.type = 'sine';
    osc.frequency.value = freq;

    // Second oscillator slightly detuned for warmth
    const osc2 = c.createOscillator();
    osc2.type = 'triangle';
    osc2.frequency.value = freq + drift() * 2;

    const g = c.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(0.3, t + 0.3);   // soft attack ~300ms
    g.gain.setValueAtTime(0.3, t + 0.5);
    g.gain.exponentialRampToValueAtTime(0.001, t + 1.2); // gentle decay

    const g2 = c.createGain();
    g2.gain.setValueAtTime(0, t);
    g2.gain.linearRampToValueAtTime(0.1, t + 0.35);
    g2.gain.exponentialRampToValueAtTime(0.001, t + 1.0);

    osc.connect(g).connect(filter);
    osc2.connect(g2).connect(filter);
    osc.start(t);
    osc.stop(t + 1.3);
    osc2.start(t);
    osc2.stop(t + 1.1);
  });
}

// ─── Sound: Warning (notification) ──────────────────────────────────────────
// Gentle two-tone — warm, low-passed, tape-y

function playWarning(c: AudioContext) {
  const t = c.currentTime;
  const master = masterGain(c, 0.09);
  const filter = warmFilter(c, 2800);
  filter.connect(master);

  const notes = [392 + drift(), 523 + drift()]; // G4, C5
  notes.forEach((freq, i) => {
    const osc = c.createOscillator();
    osc.type = 'sine';
    osc.frequency.value = freq;

    const g = c.createGain();
    g.gain.setValueAtTime(0, t + i * 0.18);
    g.gain.linearRampToValueAtTime(0.35, t + i * 0.18 + 0.02);
    g.gain.exponentialRampToValueAtTime(0.001, t + i * 0.18 + 0.35);

    osc.connect(g).connect(filter);
    osc.start(t + i * 0.18);
    osc.stop(t + i * 0.18 + 0.4);
  });
}

// ─── Sound: Alarm (notification) ─────────────────────────────────────────────
// More insistent but still warm — triple pulse with tape wobble

function playAlarm(c: AudioContext) {
  const t = c.currentTime;
  const master = masterGain(c, 0.11);
  const filter = warmFilter(c, 3200);
  filter.connect(master);

  const notes = [523 + drift(), 659 + drift(), 523 + drift()]; // C5, E5, C5
  notes.forEach((freq, i) => {
    const osc = c.createOscillator();
    osc.type = 'triangle';
    osc.frequency.value = freq;
    // Subtle vibrato for tape wobble
    const lfo = c.createOscillator();
    lfo.frequency.value = 4.5;
    const lfoGain = c.createGain();
    lfoGain.gain.value = 3;
    lfo.connect(lfoGain).connect(osc.frequency);
    lfo.start(t);
    lfo.stop(t + 0.8);

    const g = c.createGain();
    g.gain.setValueAtTime(0, t + i * 0.14);
    g.gain.linearRampToValueAtTime(0.4, t + i * 0.14 + 0.015);
    g.gain.exponentialRampToValueAtTime(0.001, t + i * 0.14 + 0.28);

    osc.connect(g).connect(filter);
    osc.start(t + i * 0.14);
    osc.stop(t + i * 0.14 + 0.3);
  });
}

// ─── Public API ──────────────────────────────────────────────────────────────

export type SoundType = 'tapeClick' | 'blip' | 'swell' | 'warning' | 'alarm';

const players: Record<SoundType, (c: AudioContext) => void> = {
  tapeClick: playTapeClick,
  blip: playBlip,
  swell: playSwell,
  warning: playWarning,
  alarm: playAlarm,
};

/**
 * Play a UI sound. Respects the global sound toggle.
 * Debounces rapid-fire calls (80ms minimum interval).
 */
export function playUISound(type: SoundType) {
  // Check global sound setting
  const soundEnabled = useTimezoneStore.getState().soundEnabled;
  if (!soundEnabled) return;

  // Debounce
  const now = Date.now();
  if (now - lastPlayTime < MIN_INTERVAL_MS) return;
  lastPlayTime = now;

  const c = ctx();
  if (!c) return;

  players[type](c);
}

/**
 * Play a notification sound (warning/alarm). Same debounce and global toggle.
 */
export function playNotificationSound(type: 'warning' | 'alarm') {
  playUISound(type);
}
