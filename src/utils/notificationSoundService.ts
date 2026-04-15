/**
 * In-app notification sound scheduling.
 * Uses the cassette-futurism sound engine for audio output.
 *
 * Schedule:
 *   - 5 min before end:         warning sound
 *   - Last 10 seconds (each s): orbital pulse
 *   - At task end:              alarm sound
 *   - 1-5 min overdue (each):   persistent reminder (if persistentOverdue on)
 */

import type { Task } from '@/store/taskStore';
import type { NotificationLevel } from '@/utils/notificationService';
import { playUISound } from '@/utils/soundEngine';
import { useTimezoneStore } from '@/store/timezoneStore';

interface ScheduledSound {
  taskId: string;
  type: string;
  timerId: ReturnType<typeof setTimeout>;
  fireAt: number;
}

const scheduled = new Map<string, ScheduledSound>();
const delivered = new Set<string>();
let lastFingerprint = '';

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

function makeKey(taskId: string, type: string): string {
  return `sound:${taskId}:${type}`;
}

function buildFingerprint(tasks: Task[], level: NotificationLevel, persistent: boolean): string {
  if (level === 'off') return 'off';
  const today = getTodayStr();
  // Include current minute so we re-evaluate which sounds to schedule as time passes
  const nowMin = Math.floor(Date.now() / 60_000);
  const parts = tasks
    .filter(t => shouldNotify(t, level) && t.time && !t.completed && t.date === today)
    .map(t => `${t.id}:${t.date}:${t.time}:${t.duration}:${t.priority}:${t.completed}`)
    .sort();
  return `${level}:${persistent}:${nowMin}:${parts.join('|')}`;
}

export function cancelAllSounds() {
  for (const [, entry] of scheduled) {
    clearTimeout(entry.timerId);
  }
  scheduled.clear();
  delivered.clear();
  lastFingerprint = '';
}

function scheduleSound(key: string, taskId: string, type: string, fireAt: number, desired: Map<string, { taskId: string; type: string; fireAt: number }>) {
  desired.set(key, { taskId, type, fireAt });
}

function deliverImmediately(key: string, type: string, fireAt: number, now: number, graceMs: number) {
  if (delivered.has(key)) return;
  if (fireAt > now) return;
  if (now - fireAt > graceMs) return;

  playUISound(type as any);
  delivered.add(key);
}

export function syncNotificationSounds(tasks: Task[], level: NotificationLevel) {
  const persistent = useTimezoneStore.getState().persistentOverdue;
  const fp = buildFingerprint(tasks, level, persistent);
  if (fp === lastFingerprint) return;
  lastFingerprint = fp;

  if (level === 'off') {
    cancelAllSounds();
    return;
  }

  const now = Date.now();
  const today = getTodayStr();

  const desired = new Map<string, { taskId: string; type: string; fireAt: number }>();

  const eligible = tasks.filter(t => {
    if (t.date !== today) return false;
    if (t.completed) return false;
    if (!t.time) return false;
    return shouldNotify(t, level);
  });

  for (const task of eligible) {
    const endMs = getTaskEndMs(task);
    if (!endMs) continue;

    // 5-min warning
    const warningMs = endMs - 5 * 60_000;
    if (warningMs > now) {
      scheduleSound(makeKey(task.id, 'warning'), task.id, 'warning', warningMs, desired);
    } else if (endMs > now) {
      deliverImmediately(makeKey(task.id, 'warning'), 'warning', warningMs, now, 5 * 60_000);
    }

    // Orbital pulse: last 10 seconds (one pulse per second)
    for (let s = 10; s >= 1; s--) {
      const pulseMs = endMs - s * 1000;
      if (pulseMs > now) {
        scheduleSound(makeKey(task.id, `pulse-${s}`), task.id, 'orbitalPulse', pulseMs, desired);
      }
    }

    // Alarm at end
    if (endMs > now) {
      scheduleSound(makeKey(task.id, 'alarm'), task.id, 'alarm', endMs, desired);
    } else {
      deliverImmediately(makeKey(task.id, 'alarm'), 'alarm', endMs, now, 60_000);
    }

    // Persistent reminders: each minute for 5 minutes after end
    if (persistent) {
      for (let m = 1; m <= 5; m++) {
        const reminderMs = endMs + m * 60_000;
        if (reminderMs > now) {
          scheduleSound(makeKey(task.id, `persist-${m}`), task.id, 'persistentReminder', reminderMs, desired);
        } else {
          deliverImmediately(makeKey(task.id, `persist-${m}`), 'persistentReminder', reminderMs, now, 60_000);
        }
      }
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
    const soundType = item.type as any;
    const timerId = setTimeout(() => {
      playUISound(soundType);
      delivered.add(key);
      scheduled.delete(key);
    }, delay);

    scheduled.set(key, { taskId: item.taskId, type: item.type, timerId, fireAt: item.fireAt });
  }
}
