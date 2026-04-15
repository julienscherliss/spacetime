/**
 * In-app notification sound service.
 * Plays audio alerts at the same times web/native notifications fire,
 * using the Web Audio API (no external sound files needed).
 */

import type { Task, Priority } from '@/store/taskStore';
import type { NotificationLevel } from '@/utils/notificationService';

interface ScheduledSound {
  taskId: string;
  type: 'warning' | 'alarm';
  timerId: ReturnType<typeof setTimeout>;
  fireAt: number;
}

const scheduled = new Map<string, ScheduledSound>();
let lastFingerprint = '';
let audioCtx: AudioContext | null = null;

function getAudioCtx(): AudioContext | null {
  if (!audioCtx) {
    try {
      audioCtx = new AudioContext();
    } catch {
      return null;
    }
  }
  if (audioCtx.state === 'suspended') {
    audioCtx.resume().catch(() => {});
  }
  return audioCtx;
}

/** Play a short synthetic chime — 'warning' is softer, 'alarm' is more urgent */
function playSound(type: 'warning' | 'alarm') {
  const ctx = getAudioCtx();
  if (!ctx) return;

  const now = ctx.currentTime;

  if (type === 'warning') {
    // Gentle two-note chime
    const notes = [660, 880];
    notes.forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0, now + i * 0.15);
      gain.gain.linearRampToValueAtTime(0.15, now + i * 0.15 + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.001, now + i * 0.15 + 0.4);
      osc.connect(gain).connect(ctx.destination);
      osc.start(now + i * 0.15);
      osc.stop(now + i * 0.15 + 0.4);
    });
  } else {
    // Urgent three-note alarm
    const notes = [880, 1100, 880];
    notes.forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0, now + i * 0.12);
      gain.gain.linearRampToValueAtTime(0.2, now + i * 0.12 + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.001, now + i * 0.12 + 0.3);
      osc.connect(gain).connect(ctx.destination);
      osc.start(now + i * 0.12);
      osc.stop(now + i * 0.12 + 0.3);
    });
  }
}

function shouldNotify(task: Task, level: NotificationLevel): boolean {
  if (level === 'off') return false;
  if (level === 'all') return true;
  return (task.priority as number) >= 2;
}

function getTodayStr(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function getTaskEndMs(task: Task): number | null {
  if (!task.time) return null;
  const [h, m] = task.time.split(':').map(Number);
  const dt = new Date(`${task.date}T00:00:00`);
  dt.setHours(h, m, 0, 0);
  const durationMin = (task.duration && task.duration > 0) ? task.duration : 30;
  return dt.getTime() + durationMin * 60_000;
}

function makeKey(taskId: string, type: 'warning' | 'alarm'): string {
  return `sound:${taskId}:${type}`;
}

function buildFingerprint(tasks: Task[], level: NotificationLevel): string {
  if (level === 'off') return 'off';
  const today = getTodayStr();
  const parts = tasks
    .filter(t => shouldNotify(t, level) && t.time && !t.completed && t.date === today)
    .map(t => `${t.id}:${t.date}:${t.time}:${t.duration}:${t.priority}:${t.completed}`)
    .sort();
  return `${level}:${parts.join('|')}`;
}

export function cancelAllSounds() {
  for (const [, entry] of scheduled) {
    clearTimeout(entry.timerId);
  }
  scheduled.clear();
  lastFingerprint = '';
}

export function syncNotificationSounds(tasks: Task[], level: NotificationLevel) {
  const fp = buildFingerprint(tasks, level);
  if (fp === lastFingerprint) return;
  lastFingerprint = fp;

  if (level === 'off') {
    cancelAllSounds();
    return;
  }

  const now = Date.now();
  const today = getTodayStr();

  const desired = new Map<string, { taskId: string; type: 'warning' | 'alarm'; fireAt: number }>();

  const eligible = tasks.filter(t => {
    if (t.date !== today) return false;
    if (t.completed) return false;
    if (!t.time) return false;
    return shouldNotify(t, level);
  });

  for (const task of eligible) {
    const endMs = getTaskEndMs(task);
    if (!endMs) continue;

    const warningMs = endMs - 5 * 60_000;

    if (warningMs > now) {
      desired.set(makeKey(task.id, 'warning'), { taskId: task.id, type: 'warning', fireAt: warningMs });
    }
    if (endMs > now) {
      desired.set(makeKey(task.id, 'alarm'), { taskId: task.id, type: 'alarm', fireAt: endMs });
    }
  }

  // Cancel stale
  for (const [key, entry] of scheduled) {
    if (!desired.has(key) || desired.get(key)!.fireAt !== entry.fireAt) {
      clearTimeout(entry.timerId);
      scheduled.delete(key);
    }
  }

  // Schedule new
  for (const [key, item] of desired) {
    if (scheduled.has(key) && scheduled.get(key)!.fireAt === item.fireAt) continue;

    const delay = item.fireAt - now;
    const timerId = setTimeout(() => {
      playSound(item.type);
      scheduled.delete(key);
    }, delay);

    scheduled.set(key, { taskId: item.taskId, type: item.type, timerId, fireAt: item.fireAt });
  }
}
