import { Capacitor } from '@capacitor/core';
import { isNative } from './nativePlatform';
import type { Task, Priority } from '@/store/taskStore';

/**
 * Notification intensity levels:
 * - 'off'      → no notifications
 * - 'important' → only FIXED (2) and LOCK (3) tasks
 * - 'all'      → all scheduled tasks (FLEX, SEMI, FIXED, LOCK)
 */
export type NotificationLevel = 'off' | 'important' | 'all';
export type NotificationPermissionStatus = 'granted' | 'denied' | 'prompt';

export interface NotificationDebugSnapshot {
  platform: string;
  isNative: boolean;
  pluginAvailable: boolean;
  permissionStatus: NotificationPermissionStatus;
  requestResult: NotificationPermissionStatus | null;
  scheduleStatus: string | null;
}

/** Minutes before the task start time to fire the notification */
const LEAD_MINUTES = 5;
const TEST_NOTIFICATION_ID = 984251;

function logNotificationDebug(message: string, data?: unknown) {
  if (data === undefined) {
    console.log(`[notifications] ${message}`);
    return;
  }

  console.log(`[notifications] ${message}`, data);
}

function logNotificationError(message: string, error: unknown) {
  console.error(`[notifications] ${message}`, error);
}

function normalizePermissionStatus(status: string | undefined): NotificationPermissionStatus {
  if (status === 'granted' || status === 'denied') return status;
  return 'prompt';
}

// Lazy-load the Capacitor plugin only on native
async function getPlugin() {
  logNotificationDebug('platform detection', {
    platform: Capacitor.getPlatform(),
    isNative,
  });

  if (!isNative) {
    logNotificationDebug('native guard prevented local notifications runtime path');
    return null;
  }

  try {
    const { LocalNotifications } = await import('@capacitor/local-notifications');
    logNotificationDebug('local notifications plugin import succeeded');
    return LocalNotifications;
  } catch (error) {
    logNotificationError('local notifications plugin import failed', error);
    return null;
  }
}

export async function getNotificationDebugSnapshot(): Promise<NotificationDebugSnapshot> {
  const LN = await getPlugin();

  if (!LN) {
    const snapshot: NotificationDebugSnapshot = {
      platform: Capacitor.getPlatform(),
      isNative,
      pluginAvailable: false,
      permissionStatus: 'denied',
      requestResult: null,
      scheduleStatus: 'Local notifications are unavailable in this runtime.',
    };

    logNotificationDebug('debug snapshot', snapshot);
    return snapshot;
  }

  try {
    const permissions = await LN.checkPermissions();
    const snapshot: NotificationDebugSnapshot = {
      platform: Capacitor.getPlatform(),
      isNative,
      pluginAvailable: true,
      permissionStatus: normalizePermissionStatus(permissions.display),
      requestResult: null,
      scheduleStatus: null,
    };

    logNotificationDebug('debug snapshot', snapshot);
    return snapshot;
  } catch (error) {
    logNotificationError('failed to build notification debug snapshot', error);
    return {
      platform: Capacitor.getPlatform(),
      isNative,
      pluginAvailable: true,
      permissionStatus: 'denied',
      requestResult: null,
      scheduleStatus: 'Failed to read current notification permission.',
    };
  }
}

/** Request notification permission directly from a user action. */
export async function requestNotificationPermission(): Promise<NotificationPermissionStatus> {
  logNotificationDebug('requestPermissions() invoked from direct user action');

  const LN = await getPlugin();
  if (!LN) return 'denied';

  try {
    const result = await LN.requestPermissions();
    const status = normalizePermissionStatus(result.display);
    logNotificationDebug('permission request result', { display: status });
    return status;
  } catch (error) {
    logNotificationError('requestPermissions() failed', error);
    return 'denied';
  }
}

/** Check current permission status without prompting. */
export async function checkNotificationPermission(): Promise<NotificationPermissionStatus> {
  const LN = await getPlugin();
  if (!LN) return 'denied';

  try {
    const { display } = await LN.checkPermissions();
    const status = normalizePermissionStatus(display);
    logNotificationDebug('checked notification permission', { display: status });
    return status;
  } catch (error) {
    logNotificationError('checkPermissions() failed', error);
    return 'denied';
  }
}

/** Schedule a test notification 8 seconds from now to verify permissions. */
export async function scheduleTestNotification(delaySeconds = 8): Promise<boolean> {
  const LN = await getPlugin();
  if (!LN) return false;

  const fireAt = new Date(Date.now() + delaySeconds * 1000);

  try {
    await LN.cancel({ notifications: [{ id: TEST_NOTIFICATION_ID }] });
  } catch {
    logNotificationDebug('no previous test notification to cancel');
  }

  try {
    await LN.schedule({
      notifications: [
        {
          id: TEST_NOTIFICATION_ID,
          title: 'spaacetime notifications enabled',
          body: `Test notification scheduled for ~${delaySeconds} seconds from now.`,
          schedule: { at: fireAt, allowWhileIdle: true },
          extra: {
            type: 'notification-permission-test',
            scheduledFor: fireAt.toISOString(),
          },
        },
      ],
    });

    logNotificationDebug('test notification scheduled successfully', {
      scheduledFor: fireAt.toISOString(),
    });
    return true;
  } catch (error) {
    logNotificationError('failed to schedule test notification', error);
    return false;
  }
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

  const permission = await checkNotificationPermission();
  if (permission !== 'granted') {
    logNotificationDebug('skipping task notification reschedule because permission is not granted', {
      permission,
    });
    return;
  }

  // Schedule each qualifying task
  for (const task of tasks) {
    await scheduleTaskNotification(task, level);
  }
}
