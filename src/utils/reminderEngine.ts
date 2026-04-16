/**
 * Centralized foreground reminder engine for spaacetime.
 *
 * Single source of truth for all reminder timing. Powers:
 *   - In-app sound playback (primary)
 *   - In-app visual toasts (secondary)
 *   - Browser notifications (optional, secondary)
 *
 * Reminder timeline per eligible task:
 *   1. Lead-up pulses: 3 sparse pulses in final 10 seconds (t-9, t-5, t-1)
 *   2. Due reminder: at exact task end time
 *   3. Overdue reminders: +1m, +2m, +3m, +4m, +5m (while incomplete)
 *
 * Polling loop runs every 2 seconds with tolerance window for sleep/resume.
 */

import type { Task } from '@/store/taskStore';
import type { NotificationLevel } from '@/utils/notificationService';
import { playUISound } from '@/utils/soundEngine';
import { toast } from 'sonner';

// ─── Types ───────────────────────────────────────────────────────────────────

export type ReminderEventType =
  | 'leadup_1' | 'leadup_2' | 'leadup_3'
  | 'due'
  | 'overdue_1' | 'overdue_2' | 'overdue_3' | 'overdue_4' | 'overdue_5';

export type ReminderEventStatus = 'pending' | 'fired' | 'cancelled' | 'skipped';

export interface ReminderEvent {
  taskId: string;
  taskTitle: string;
  dueTime: number;          // task end time ms
  scheduledFor: number;     // when this event should fire ms
  eventType: ReminderEventType;
  status: ReminderEventStatus;
  firedAt: number | null;
  occurrenceKey: string;    // stable identity: `${taskId}:${dueTime}`
}

// ─── Configuration ───────────────────────────────────────────────────────────

const POLL_INTERVAL_MS = 2_000;
const TOLERANCE_WINDOW_MS = 15_000;    // fire events up to 15s late (covers sleep/resume)
const MAX_OVERDUE_MINUTES = 5;
const DEBOUNCE_SOUND_MS = 300;         // min gap between sounds to avoid cacophony
const LEADUP_OFFSETS_MS = [9_000, 5_000, 1_000]; // before due: t-9s, t-5s, t-1s

// Persistence key for fired events (prevents re-firing after reload)
const FIRED_STORAGE_KEY = 'reminder-engine-fired';
const FIRED_TTL_MS = 30 * 60_000; // clean entries older than 30 min

// ─── State ───────────────────────────────────────────────────────────────────

let timeline: ReminderEvent[] = [];
let pollTimer: ReturnType<typeof setInterval> | null = null;
let lastSoundPlayedAt = 0;
let lastPollAt = 0;
let currentTasks: Task[] = [];
let currentLevel: NotificationLevel = 'off';
let currentSoundEnabled = true;
let currentPersistentOverdue = false;

// Persisted set of fired occurrence+event keys
let firedSet: Map<string, number> = loadFiredSet();

function firedKey(e: ReminderEvent): string {
  return `${e.occurrenceKey}:${e.eventType}`;
}

function loadFiredSet(): Map<string, number> {
  try {
    const raw = sessionStorage.getItem(FIRED_STORAGE_KEY);
    if (!raw) return new Map();
    const parsed: [string, number][] = JSON.parse(raw);
    const now = Date.now();
    return new Map(parsed.filter(([, ts]) => now - ts < FIRED_TTL_MS));
  } catch {
    return new Map();
  }
}

function persistFiredSet() {
  try {
    const entries = [...firedSet.entries()];
    sessionStorage.setItem(FIRED_STORAGE_KEY, JSON.stringify(entries));
  } catch { /* quota exceeded — non-critical */ }
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

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

function shouldNotify(task: Task, level: NotificationLevel): boolean {
  if (level === 'off') return false;
  if (level === 'all') return true;
  return (task.priority as number) >= 2;
}

function priorityLabel(p: number): string {
  switch (p) {
    case 0: return 'FLEX';
    case 1: return 'SEMI';
    case 2: return 'FIXED';
    case 3: return 'LOCK';
    default: return '';
  }
}

// ─── Timeline Generation ─────────────────────────────────────────────────────

function buildTimeline(tasks: Task[], level: NotificationLevel, persistentOverdue: boolean): ReminderEvent[] {
  if (level === 'off') return [];

  const now = Date.now();
  const today = getTodayStr();
  const events: ReminderEvent[] = [];

  const eligible = tasks.filter(t => {
    if (t.date !== today) return false;
    if (t.completed) return false;
    if ((t as any).archivedAt) return false;
    if ((t as any).inWaitingRoom) return false;
    if (!t.time) return false;
    return shouldNotify(t, level);
  });

  for (const task of eligible) {
    const endMs = getTaskEndMs(task);
    if (!endMs) continue;

    const occurrenceKey = `${task.id}:${endMs}`;

    // Cutoff: don't create events older than MAX_OVERDUE + tolerance
    const maxEventTime = endMs + MAX_OVERDUE_MINUTES * 60_000;
    if (maxEventTime + TOLERANCE_WINDOW_MS < now) continue;

    // Lead-up pulses (3 pulses in final 10 seconds)
    LEADUP_OFFSETS_MS.forEach((offset, i) => {
      const fireAt = endMs - offset;
      if (fireAt + TOLERANCE_WINDOW_MS < now) return; // too old
      events.push({
        taskId: task.id,
        taskTitle: task.title,
        dueTime: endMs,
        scheduledFor: fireAt,
        eventType: `leadup_${i + 1}` as ReminderEventType,
        status: 'pending',
        firedAt: null,
        occurrenceKey,
      });
    });

    // Due reminder
    if (endMs + TOLERANCE_WINDOW_MS >= now) {
      events.push({
        taskId: task.id,
        taskTitle: task.title,
        dueTime: endMs,
        scheduledFor: endMs,
        eventType: 'due',
        status: 'pending',
        firedAt: null,
        occurrenceKey,
      });
    }

    // Overdue reminders (1-5 minutes, only if persistent overdue enabled)
    if (persistentOverdue) {
      for (let m = 1; m <= MAX_OVERDUE_MINUTES; m++) {
        const fireAt = endMs + m * 60_000;
        if (fireAt + TOLERANCE_WINDOW_MS < now) continue;
        events.push({
          taskId: task.id,
          taskTitle: task.title,
          dueTime: endMs,
          scheduledFor: fireAt,
          eventType: `overdue_${m}` as ReminderEventType,
          status: 'pending',
          firedAt: null,
          occurrenceKey,
        });
      }
    }
  }

  return events;
}

// ─── Delivery: Sound ─────────────────────────────────────────────────────────

function deliverSound(event: ReminderEvent) {
  if (!currentSoundEnabled) return;

  const now = Date.now();
  if (now - lastSoundPlayedAt < DEBOUNCE_SOUND_MS) return;

  switch (event.eventType) {
    case 'leadup_1':
    case 'leadup_2':
    case 'leadup_3':
      playUISound('orbitalPulse');
      break;
    case 'due':
      playUISound('alarm');
      break;
    case 'overdue_1':
    case 'overdue_2':
    case 'overdue_3':
    case 'overdue_4':
    case 'overdue_5':
      playUISound('persistentReminder');
      break;
  }

  lastSoundPlayedAt = now;
}

// ─── Delivery: Visual Toast ──────────────────────────────────────────────────

function deliverVisual(event: ReminderEvent) {
  // Only show toasts for due and overdue, not leadup pulses
  if (event.eventType.startsWith('leadup')) return;

  const label = priorityLabel(
    currentTasks.find(t => t.id === event.taskId)?.priority as number ?? 0
  );

  if (event.eventType === 'due') {
    toast(`⏰ ${event.taskTitle} — time's up`, {
      description: `${label} task time has ended`,
      duration: 8000,
      id: `reminder-${event.occurrenceKey}-due`,
    });
  } else {
    const minute = event.eventType.replace('overdue_', '');
    toast(`${event.taskTitle} — ${minute} min overdue`, {
      description: 'Complete, move, or delete to dismiss',
      duration: 6000,
      id: `reminder-${event.occurrenceKey}-${event.eventType}`,
    });
  }
}

// ─── Delivery: Browser Notification ──────────────────────────────────────────

function deliverBrowserNotification(event: ReminderEvent) {
  if (typeof Notification === 'undefined') return;
  if (Notification.permission !== 'granted') return;
  // Only for due and overdue
  if (event.eventType.startsWith('leadup')) return;

  try {
    const task = currentTasks.find(t => t.id === event.taskId);
    const label = priorityLabel(task?.priority as number ?? 0);

    if (event.eventType === 'due') {
      new Notification(`⏰ ${event.taskTitle} — time's up`, {
        body: `${label} task time has ended`,
        tag: `reminder-${event.occurrenceKey}-due`,
        icon: '/favicon.png',
      });
    } else {
      const minute = event.eventType.replace('overdue_', '');
      new Notification(`${event.taskTitle} — ${minute} min overdue`, {
        body: 'Complete, move, or delete to dismiss',
        tag: `reminder-${event.occurrenceKey}-${event.eventType}`,
        icon: '/favicon.png',
      });
    }
  } catch { /* browser notification failure is non-critical */ }
}

// ─── Poll Loop ───────────────────────────────────────────────────────────────

function poll() {
  const now = Date.now();
  const wasSleeping = lastPollAt > 0 && (now - lastPollAt) > POLL_INTERVAL_MS * 5;
  lastPollAt = now;

  // If we resumed from sleep, rebuild timeline to catch any changes
  if (wasSleeping) {
    timeline = buildTimeline(currentTasks, currentLevel, currentPersistentOverdue);
  }

  // Check each pending event
  for (const event of timeline) {
    if (event.status !== 'pending') continue;

    const key = firedKey(event);

    // Already fired in this or previous session
    if (firedSet.has(key)) {
      event.status = 'fired';
      continue;
    }

    // Check if task is now completed/deleted/rescheduled
    const task = currentTasks.find(t => t.id === event.taskId);
    if (!task || task.completed || (task as any).archivedAt) {
      event.status = 'cancelled';
      continue;
    }

    // Check if task's due time changed (occurrence invalidation)
    const currentEndMs = getTaskEndMs(task);
    if (currentEndMs !== event.dueTime) {
      event.status = 'cancelled';
      continue;
    }

    // Not yet time
    if (event.scheduledFor > now) continue;

    // Past tolerance window — skip
    if (now - event.scheduledFor > TOLERANCE_WINDOW_MS) {
      event.status = 'skipped';
      continue;
    }

    // ── Fire the event ──
    event.status = 'fired';
    event.firedAt = now;
    firedSet.set(key, now);

    // Deliver through all channels
    deliverSound(event);
    deliverVisual(event);
    deliverBrowserNotification(event);
  }

  // Persist fired set periodically (every ~10 polls)
  if (Math.random() < 0.1) {
    cleanFiredSet();
    persistFiredSet();
  }
}

function cleanFiredSet() {
  const now = Date.now();
  for (const [key, ts] of firedSet) {
    if (now - ts > FIRED_TTL_MS) firedSet.delete(key);
  }
}

// ─── Public API ──────────────────────────────────────────────────────────────

/**
 * Update the reminder engine with current task/settings state.
 * Called by the hook whenever tasks or settings change.
 */
export function updateReminderEngine(
  tasks: Task[],
  level: NotificationLevel,
  soundEnabled: boolean,
  persistentOverdue: boolean,
) {
  currentTasks = tasks;
  currentLevel = level;
  currentSoundEnabled = soundEnabled;
  currentPersistentOverdue = persistentOverdue;

  if (level === 'off' || !soundEnabled) {
    timeline = [];
    return;
  }

  // Rebuild timeline, preserving fired status via firedSet
  timeline = buildTimeline(tasks, level, persistentOverdue);

  // Mark already-fired events
  for (const event of timeline) {
    if (firedSet.has(firedKey(event))) {
      event.status = 'fired';
    }
  }
}

/**
 * Cancel all reminder events for a specific task immediately.
 * Called when a task is completed, deleted, etc.
 */
export function cancelRemindersForTask(taskId: string) {
  for (const event of timeline) {
    if (event.taskId === taskId && event.status === 'pending') {
      event.status = 'cancelled';
    }
  }
}

/**
 * Start the polling loop. Idempotent — safe to call multiple times.
 */
export function startReminderEngine() {
  if (pollTimer) return;
  lastPollAt = Date.now();
  pollTimer = setInterval(poll, POLL_INTERVAL_MS);
  // Run first poll immediately
  poll();
}

/**
 * Stop the polling loop and clear all state.
 */
export function stopReminderEngine() {
  if (pollTimer) {
    clearInterval(pollTimer);
    pollTimer = null;
  }
  timeline = [];
  lastPollAt = 0;
}

/**
 * Get current timeline snapshot for debugging.
 */
export function getReminderTimeline(): readonly ReminderEvent[] {
  return timeline;
}
