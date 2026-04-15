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
let primed = false;
const MIN_INTERVAL_MS = 80; // debounce rapid-fire

function ctx(): AudioContext | null {
  if (!audioCtx) {
    try { audioCtx = new AudioContext(); } catch { return null; }
  }
  if (audioCtx.state === 'suspended') audioCtx.resume().catch(() => {});
  return audioCtx;
}

function emitSilentPulse(c: AudioContext) {
  const buffer = c.createBuffer(1, 1, c.sampleRate);
  const source = c.createBufferSource();
  const gain = c.createGain();
  gain.gain.value = 0.00001;
  source.buffer = buffer;
  source.connect(gain).connect(c.destination);
  source.start();
  source.stop(c.currentTime + 0.001);
}

export async function primeSoundEngine(): Promise<boolean> {
  const c = ctx();
  if (!c) return false;

  try {
    if (c.state !== 'running') {
      await c.resume();
    }

    if (!primed && c.state === 'running') {
      emitSilentPulse(c);
      primed = true;
    }

    return c.state === 'running';
  } catch {
    return false;
  }
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

// ─── Sound: Tape Click (Task Complete) ───────────────────────────────────────
// Satisfying click-glow: crisp mechanical snap into a warm radiating bloom

function playTapeClick(c: AudioContext) {
  const t = c.currentTime;
  const master = masterGain(c, 0.22);

  // ── The Click: crisp but warm snap ──
  const clickFilter = c.createBiquadFilter();
  clickFilter.type = 'bandpass';
  clickFilter.frequency.value = 1800;
  clickFilter.Q.value = 1.2;
  clickFilter.connect(master);

  // Noise snap — slightly brighter than before for more "click"
  const bufLen = c.sampleRate * 0.018;
  const buf = c.createBuffer(1, bufLen, c.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < bufLen; i++) d[i] = (Math.random() * 2 - 1) * 0.5;
  const noise = c.createBufferSource();
  noise.buffer = buf;
  const nG = c.createGain();
  nG.gain.setValueAtTime(0.8, t);
  nG.gain.exponentialRampToValueAtTime(0.001, t + 0.035);
  noise.connect(nG).connect(clickFilter);
  noise.start(t);
  noise.stop(t + 0.04);

  // Pitched click body — gives snap its "thock"
  const click = c.createOscillator();
  click.type = 'sine';
  click.frequency.setValueAtTime(400 + drift(), t);
  click.frequency.exponentialRampToValueAtTime(120, t + 0.05);
  const cG = c.createGain();
  cG.gain.setValueAtTime(0.6, t);
  cG.gain.exponentialRampToValueAtTime(0.001, t + 0.06);
  click.connect(cG).connect(master);
  click.start(t);
  click.stop(t + 0.07);

  // ── The Glow: warm radiating bloom ──
  const glowFilter = warmFilter(c, 2800);
  glowFilter.connect(master);

  // Main glow: major third chord blooming outward
  const glowNotes = [
    { freq: 330 + drift(), type: 'sine' as OscillatorType, vol: 0.28 },
    { freq: 415 + drift(), type: 'sine' as OscillatorType, vol: 0.15 },
    { freq: 660 + drift() * 2, type: 'triangle' as OscillatorType, vol: 0.08 },
  ];

  glowNotes.forEach(({ freq, type, vol }, i) => {
    const osc = c.createOscillator();
    osc.type = type;
    osc.frequency.value = freq;

    const g = c.createGain();
    const onset = t + 0.03 + i * 0.012;
    g.gain.setValueAtTime(0, onset);
    g.gain.linearRampToValueAtTime(vol, onset + 0.06);  // fast bloom
    g.gain.setValueAtTime(vol * 0.9, onset + 0.15);
    g.gain.exponentialRampToValueAtTime(0.001, onset + 0.55); // long warm tail

    osc.connect(g).connect(glowFilter);
    osc.start(onset);
    osc.stop(onset + 0.6);
  });
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

// ─── Sound: Orbital Pulse ────────────────────────────────────────────────────
// Subtle, rhythmic low pulse — like a distant orbital beacon.
// Used during the last 10 seconds of a task as a gentle countdown.

function playOrbitalPulse(c: AudioContext) {
  const t = c.currentTime;
  const master = masterGain(c, 0.06);
  const filter = warmFilter(c, 1800);
  filter.connect(master);

  // Low sub-bass pulse
  const osc = c.createOscillator();
  osc.type = 'sine';
  osc.frequency.value = 110 + drift();

  const g = c.createGain();
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(0.5, t + 0.04);
  g.gain.exponentialRampToValueAtTime(0.001, t + 0.25);

  // Slight harmonic shimmer on top
  const osc2 = c.createOscillator();
  osc2.type = 'sine';
  osc2.frequency.value = 330 + drift();
  const g2 = c.createGain();
  g2.gain.setValueAtTime(0, t);
  g2.gain.linearRampToValueAtTime(0.15, t + 0.03);
  g2.gain.exponentialRampToValueAtTime(0.001, t + 0.15);

  osc.connect(g).connect(filter);
  osc2.connect(g2).connect(filter);
  osc.start(t);
  osc.stop(t + 0.3);
  osc2.start(t);
  osc2.stop(t + 0.2);
}

// ─── Sound: Persistent Reminder ──────────────────────────────────────────────
// Slightly more insistent than alarm — used for overdue minute reminders

function playPersistentReminder(c: AudioContext) {
  const t = c.currentTime;
  const master = masterGain(c, 0.1);
  const filter = warmFilter(c, 2800);
  filter.connect(master);

  // Two-pulse: same note repeated, feels like a gentle nudge
  [0, 0.2].forEach((offset) => {
    const osc = c.createOscillator();
    osc.type = 'triangle';
    osc.frequency.value = 523 + drift(); // C5

    const g = c.createGain();
    g.gain.setValueAtTime(0, t + offset);
    g.gain.linearRampToValueAtTime(0.35, t + offset + 0.015);
    g.gain.exponentialRampToValueAtTime(0.001, t + offset + 0.2);

    osc.connect(g).connect(filter);
    osc.start(t + offset);
    osc.stop(t + offset + 0.25);
  });
}

// ─── Public API ──────────────────────────────────────────────────────────────

export type SoundType = 'tapeClick' | 'blip' | 'swell' | 'warning' | 'alarm' | 'orbitalPulse' | 'persistentReminder';

const players: Record<SoundType, (c: AudioContext) => void> = {
  tapeClick: playTapeClick,
  blip: playBlip,
  swell: playSwell,
  warning: playWarning,
  alarm: playAlarm,
  orbitalPulse: playOrbitalPulse,
  persistentReminder: playPersistentReminder,
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

  const c = ctx();
  if (!c) return;

  const play = () => {
    lastPlayTime = Date.now();
    players[type](c);
  };

  if (c.state === 'running') {
    play();
    return;
  }

  c.resume()
    .then(() => {
      if (c.state === 'running') play();
    })
    .catch(() => {});
}

/**
 * Play a notification sound (warning/alarm). Same debounce and global toggle.
 */
export function playNotificationSound(type: 'warning' | 'alarm') {
  playUISound(type);
}
