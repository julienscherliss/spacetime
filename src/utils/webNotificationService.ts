/**
 * Web browser notification service for spaacetime.
 *
 * Two notifications per eligible task:
 *   1. 5 minutes before task END (completion) time
 *   2. At task END time (alarm)
 *
 * Notifications are cleared when the task is completed, deleted, or moved.
 * Uses setTimeout-based scheduling (no service worker needed).
 */

import type { Task, Priority } from '@/store/taskStore';
import type { NotificationLevel } from '@/utils/notificationService';

interface ScheduledWebNotification {
  taskId: string;
  type: 'warning' | 'alarm';
  timerId: ReturnType<typeof setTimeout>;
  fireAt: number;
}

const scheduled = new Map<string, ScheduledWebNotification>();
let lastFingerprint = '';

function priorityLabel(p: Priority): string {
  switch (p) {
    case 0: return 'FLEX';
    case 1: return 'SEMI';
    case 2: return 'FIXED';
    case 3: return 'LOCK';
    default: return '';
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
  return `${taskId}:${type}`;
}

function fireNotification(title: string, body: string, tag: string) {
  if (Notification.permission !== 'granted') return;
  try {
    new Notification(title, {
      body,
      tag,
      icon: '/favicon.png',
      requireInteraction: true,
    });
  } catch (e) {
    console.warn('[web-notifications] fire error', e);
  }
}

function cancelKey(key: string) {
  const entry = scheduled.get(key);
  if (entry) {
    clearTimeout(entry.timerId);
    scheduled.delete(key);
  }
}

export function cancelWebNotificationsForTask(taskId: string) {
  cancelKey(makeKey(taskId, 'warning'));
  cancelKey(makeKey(taskId, 'alarm'));
  lastFingerprint = ''; // force re-sync
}

export function cancelAllWebNotifications() {
  for (const [key, entry] of scheduled) {
    clearTimeout(entry.timerId);
  }
  scheduled.clear();
  lastFingerprint = '';
}

function buildFingerprint(tasks: Task[], level: NotificationLevel): string {
  if (level === 'off') return 'off';
  const today = getTodayStr();
  const parts = tasks
    .filter(t => shouldNotify(t, level) && t.time && !t.completed && t.date === today && !t.archivedAt && !t.inWaitingRoom)
    .map(t => `${t.id}:${t.date}:${t.time}:${t.duration}:${t.priority}:${t.completed}`)
    .sort();
  return `${level}:${parts.join('|')}`;
}

export function syncWebNotifications(tasks: Task[], level: NotificationLevel) {
  const fp = buildFingerprint(tasks, level);
  if (fp === lastFingerprint) return;
  lastFingerprint = fp;

  if (level === 'off' || Notification.permission !== 'granted') {
    cancelAllWebNotifications();
    return;
  }

  const now = Date.now();
  const today = getTodayStr();

  // Build desired set
  const desired = new Map<string, { taskId: string; type: 'warning' | 'alarm'; fireAt: number; title: string; body: string }>();

  const eligible = tasks.filter(t => {
    if (t.date !== today) return false;
    if (t.completed || t.archivedAt || t.inWaitingRoom) return false;
    if (!t.time) return false;
    return shouldNotify(t, level);
  });

  for (const task of eligible) {
    const endMs = getTaskEndMs(task);
    if (!endMs) continue;

    const warningMs = endMs - 5 * 60_000;
    const pLabel = priorityLabel(task.priority);

    if (warningMs > now) {
      const key = makeKey(task.id, 'warning');
      desired.set(key, {
        taskId: task.id,
        type: 'warning',
        fireAt: warningMs,
        title: `${pLabel} — ${task.title}`,
        body: '5 minutes until task completion time',
      });
    }

    if (endMs > now) {
      const key = makeKey(task.id, 'alarm');
      desired.set(key, {
        taskId: task.id,
        type: 'alarm',
        fireAt: endMs,
        title: `⏰ ${task.title} — time's up`,
        body: 'Task time has ended. Complete, move, or delete to dismiss.',
      });
    }
  }

  // Cancel notifications no longer desired
  for (const [key, entry] of scheduled) {
    if (!desired.has(key) || desired.get(key)!.fireAt !== entry.fireAt) {
      clearTimeout(entry.timerId);
      scheduled.delete(key);
    }
  }

  // Schedule new ones
  for (const [key, item] of desired) {
    if (scheduled.has(key) && scheduled.get(key)!.fireAt === item.fireAt) continue;

    const delay = item.fireAt - now;
    const timerId = setTimeout(() => {
      fireNotification(item.title, item.body, key);
      scheduled.delete(key);
    }, delay);

    scheduled.set(key, {
      taskId: item.taskId,
      type: item.type,
      timerId,
      fireAt: item.fireAt,
    });
  }
}

export async function requestWebNotificationPermission(): Promise<NotificationPermission> {
  if (!('Notification' in window)) return 'denied';
  if (Notification.permission === 'granted') return 'granted';
  if (Notification.permission === 'denied') return 'denied';
  return Notification.requestPermission();
}

export function getWebNotificationPermission(): NotificationPermission | 'unsupported' {
  if (!('Notification' in window)) return 'unsupported';
  return Notification.permission;
}
