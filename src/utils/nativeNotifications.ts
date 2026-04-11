import { isNative } from './nativePlatform';
import type { Task, Priority } from '@/store/taskStore';

/**
 * Notification intensity levels:
 * - 'off'      → no notifications
 * - 'important' → only FIXED (2) and LOCK (3) tasks
 * - 'all'      → all scheduled tasks (FLEX, SEMI, FIXED, LOCK)
 */
export type NotificationLevel = 'off' | 'important' | 'all';

/** Minutes before the task start time to fire the notification */
const LEAD_MINUTES = 5;

// Lazy-load the Capacitor plugin only on native
async function getPlugin() {
  if (!isNative) return null;
  const { LocalNotifications } = await import('@capacitor/local-notifications');
  return LocalNotifications;
}

/** Request notification permission. Returns true if granted. */
export async function requestNotificationPermission(): Promise<boolean> {
  const LN = await getPlugin();
  if (!LN) return false;

  const { display } = await LN.checkPermissions();
  if (display === 'granted') return true;

  const result = await LN.requestPermissions();
  return result.display === 'granted';
}

/** Derive a stable numeric ID from a task UUID (notifications need number IDs). */
function taskIdToNumber(id: string): number {
  let hash = 0;
  for (let i = 0; i < id.length; i++) {
    hash = ((hash << 5) - hash + id.charCodeAt(i)) | 0;
  }
  return Math.abs(hash);
}

/** Check whether a task qualifies for notifications at the given level. */
function shouldNotify(task: Task, level: NotificationLevel): boolean {
  if (level === 'off') return false;
  if (level === 'all') return true;
  // 'important' → FIXED (2) and LOCK (3) only
  return (task.priority as number) >= 2;
}

/** Priority label for notification body */
function priorityLabel(p: Priority): string {
  switch (p) {
    case 0: return 'FLEX';
    case 1: return 'SEMI';
    case 2: return 'FIXED';
    case 3: return 'LOCK';
    default: return '';
  }
}

/**
 * Schedule a local notification for a single task.
 * Automatically skips if the task has no time, is completed, or
 * doesn't match the current notification level.
 */
export async function scheduleTaskNotification(
  task: Task,
  level: NotificationLevel,
): Promise<void> {
  const LN = await getPlugin();
  if (!LN) return;
  if (!shouldNotify(task, level)) return;
  if (!task.time || task.completed) return;

  const [h, m] = task.time.split(':').map(Number);
  const scheduleDate = new Date(`${task.date}T00:00:00`);
  scheduleDate.setHours(h, m - LEAD_MINUTES, 0, 0);

  // Don't schedule in the past
  if (scheduleDate.getTime() <= Date.now()) return;

  const notifId = taskIdToNumber(task.id);

  // Cancel any existing notification for this task first
  try { await LN.cancel({ notifications: [{ id: notifId }] }); } catch { /* ignore */ }

  await LN.schedule({
    notifications: [
      {
        id: notifId,
        title: `${priorityLabel(task.priority)} — ${task.title}`,
        body: `Starts in ${LEAD_MINUTES} min · ${task.time}`,
        schedule: { at: scheduleDate, allowWhileIdle: true },
        extra: { taskId: task.id },
      },
    ],
  });
}

/** Cancel the notification for a specific task. */
export async function cancelTaskNotification(taskId: string): Promise<void> {
  const LN = await getPlugin();
  if (!LN) return;
  try {
    await LN.cancel({ notifications: [{ id: taskIdToNumber(taskId) }] });
  } catch { /* ignore */ }
}

/**
 * Reschedule notifications for all provided tasks based on the current level.
 * Cancels everything first, then schedules qualifying tasks.
 */
export async function rescheduleAllNotifications(
  tasks: Task[],
  level: NotificationLevel,
): Promise<void> {
  const LN = await getPlugin();
  if (!LN) return;

  // Cancel all pending notifications
  const pending = await LN.getPending();
  if (pending.notifications.length > 0) {
    await LN.cancel({ notifications: pending.notifications });
  }

  if (level === 'off') return;

  // Schedule each qualifying task
  for (const task of tasks) {
    await scheduleTaskNotification(task, level);
  }
}
