import { Capacitor } from '@capacitor/core';
import { LocalNotifications } from '@capacitor/local-notifications';
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
  requestPermissionsCallable: boolean;
  checkPermissionsCallable: boolean;
  scheduleCallable: boolean;
  permissionStatus: NotificationPermissionStatus;
  requestResult: NotificationPermissionStatus | null;
  requestError: string | null;
  scheduleStatus: string | null;
  scheduleError: string | null;
}

export interface NotificationPermissionRequestResult {
  status: NotificationPermissionStatus;
  error: string | null;
}

export interface NotificationScheduleResult {
  ok: boolean;
  error: string | null;
  scheduledFor: string | null;
}

/** Minutes before the task start time to fire the notification */
const LEAD_MINUTES = 5;
const TEST_NOTIFICATION_ID = 984251;
const PLUGIN_NAME = 'LocalNotifications';

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

function formatNotificationError(error: unknown): string {
  if (error instanceof Error) {
    return `${error.name}: ${error.message}`;
  }

  if (typeof error === 'string') {
    return error;
  }

  try {
    return JSON.stringify(error);
  } catch {
    return String(error);
  }
}

function normalizePermissionStatus(status: string | undefined): NotificationPermissionStatus {
  if (status === 'granted' || status === 'denied') return status;
  return 'prompt';
}

function getRuntimeSnapshot(log = true) {
  const snapshot = {
    platform: Capacitor.getPlatform(),
    isNative: Capacitor.isNativePlatform(),
    pluginAvailable: Capacitor.isNativePlatform() ? Capacitor.isPluginAvailable(PLUGIN_NAME) : false,
    requestPermissionsCallable: typeof LocalNotifications.requestPermissions === 'function',
    checkPermissionsCallable: typeof LocalNotifications.checkPermissions === 'function',
    scheduleCallable: typeof LocalNotifications.schedule === 'function',
  };

  if (log) {
    logNotificationDebug('Capacitor runtime snapshot', {
      'Capacitor.isNativePlatform()': snapshot.isNative,
      'Capacitor.getPlatform()': snapshot.platform,
      [`Capacitor.isPluginAvailable('${PLUGIN_NAME}')`]: snapshot.pluginAvailable,
      'LocalNotifications.requestPermissions callable': snapshot.requestPermissionsCallable,
      'LocalNotifications.checkPermissions callable': snapshot.checkPermissionsCallable,
      'LocalNotifications.schedule callable': snapshot.scheduleCallable,
    });
  }

  return snapshot;
}

function getBaseDebugSnapshot(): NotificationDebugSnapshot {
  const runtime = getRuntimeSnapshot();

  let permissionStatus: NotificationPermissionStatus = 'prompt';
  let scheduleStatus: string | null = null;

  if (!runtime.isNative) {
    permissionStatus = 'denied';
    scheduleStatus = 'Notifications only run inside the native mobile app.';
  } else if (!runtime.pluginAvailable) {
    permissionStatus = 'denied';
    scheduleStatus = `Capacitor.isPluginAvailable('${PLUGIN_NAME}') returned false in the native app.`;
  }

  return {
    ...runtime,
    permissionStatus,
    requestResult: null,
    requestError: null,
    scheduleStatus,
    scheduleError: null,
  };
}

export function getNotificationDebugSnapshotSync(): NotificationDebugSnapshot {
  const snapshot = getBaseDebugSnapshot();
  logNotificationDebug('debug snapshot (sync)', snapshot);
  return snapshot;
}

export async function getNotificationDebugSnapshot(): Promise<NotificationDebugSnapshot> {
  const snapshot = getBaseDebugSnapshot();

  if (!snapshot.isNative || !snapshot.pluginAvailable || !snapshot.checkPermissionsCallable) {
    const nextSnapshot = !snapshot.checkPermissionsCallable && snapshot.isNative && snapshot.pluginAvailable
      ? {
          ...snapshot,
          permissionStatus: 'denied' as NotificationPermissionStatus,
          scheduleStatus: 'LocalNotifications.checkPermissions is not callable.',
        }
      : snapshot;

    logNotificationDebug('debug snapshot', nextSnapshot);
    return nextSnapshot;
  }

  try {
    const permissions = await LocalNotifications.checkPermissions();
    const nextSnapshot: NotificationDebugSnapshot = {
      ...snapshot,
      permissionStatus: normalizePermissionStatus(permissions.display),
    };

    logNotificationDebug('debug snapshot', nextSnapshot);
    return nextSnapshot;
  } catch (error) {
    const message = formatNotificationError(error);
    logNotificationError('LocalNotifications.checkPermissions threw while building debug snapshot', error);

    return {
      ...snapshot,
      permissionStatus: 'denied',
      scheduleStatus: `LocalNotifications.checkPermissions error: ${message}`,
      scheduleError: message,
    };
  }
}

/** Request notification permission directly from a user action. */
export async function requestNotificationPermission(): Promise<NotificationPermissionRequestResult> {
  const runtime = getRuntimeSnapshot();
  logNotificationDebug('requestPermissions() invoked from direct user action');

  if (!runtime.isNative) {
    const error = 'Capacitor runtime is web, so iOS local notifications cannot be requested here.';
    logNotificationDebug(error);
    return { status: 'denied', error };
  }

  if (!runtime.pluginAvailable) {
    const error = `Capacitor.isPluginAvailable('${PLUGIN_NAME}') returned false.`;
    logNotificationDebug(error);
    return { status: 'denied', error };
  }

  if (!runtime.requestPermissionsCallable) {
    const error = 'LocalNotifications.requestPermissions is not callable.';
    logNotificationDebug(error);
    return { status: 'denied', error };
  }

  try {
    logNotificationDebug('calling LocalNotifications.requestPermissions()…');
    const result = await LocalNotifications.requestPermissions();
    const status = normalizePermissionStatus(result.display);
    logNotificationDebug('LocalNotifications.requestPermissions result', { display: status });
    return { status, error: null };
  } catch (error) {
    const message = formatNotificationError(error);
    logNotificationError('LocalNotifications.requestPermissions threw', error);
    return { status: 'denied', error: message };
  }
}

/** Check current permission status without prompting. */
export async function checkNotificationPermission(): Promise<NotificationPermissionStatus> {
  const runtime = getRuntimeSnapshot();
  if (!runtime.isNative || !runtime.pluginAvailable || !runtime.checkPermissionsCallable) return 'denied';

  try {
    const { display } = await LocalNotifications.checkPermissions();
    const status = normalizePermissionStatus(display);
    logNotificationDebug('checked notification permission', { display: status });
    return status;
  } catch (error) {
    logNotificationError('LocalNotifications.checkPermissions threw', error);
    return 'denied';
  }
}

/** Schedule a test notification 8 seconds from now to verify permissions. */
export async function scheduleTestNotification(delaySeconds = 8): Promise<NotificationScheduleResult> {
  const runtime = getRuntimeSnapshot();
  if (!runtime.isNative) {
    return {
      ok: false,
      error: 'Capacitor runtime is web, so test notifications cannot be scheduled here.',
      scheduledFor: null,
    };
  }

  if (!runtime.pluginAvailable) {
    return {
      ok: false,
      error: `Capacitor.isPluginAvailable('${PLUGIN_NAME}') returned false.`,
      scheduledFor: null,
    };
  }

  if (!runtime.scheduleCallable) {
    return {
      ok: false,
      error: 'LocalNotifications.schedule is not callable.',
      scheduledFor: null,
    };
  }

  const fireAt = new Date(Date.now() + delaySeconds * 1000);

  try {
    await LocalNotifications.cancel({ notifications: [{ id: TEST_NOTIFICATION_ID }] });
  } catch (error) {
    logNotificationError('failed to cancel previous test notification', error);
  }

  try {
    await LocalNotifications.schedule({
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
    return {
      ok: true,
      error: null,
      scheduledFor: fireAt.toISOString(),
    };
  } catch (error) {
    const message = formatNotificationError(error);
    logNotificationError('LocalNotifications.schedule threw while scheduling test notification', error);
    return {
      ok: false,
      error: message,
      scheduledFor: fireAt.toISOString(),
    };
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
  const runtime = getRuntimeSnapshot(false);
  if (!runtime.isNative || !runtime.pluginAvailable || !runtime.scheduleCallable) return;
  if (!shouldNotify(task, level)) return;
  if (!task.time || task.completed) return;

  const [h, m] = task.time.split(':').map(Number);
  const scheduleDate = new Date(`${task.date}T00:00:00`);
  scheduleDate.setHours(h, m - LEAD_MINUTES, 0, 0);

  // Don't schedule in the past
  if (scheduleDate.getTime() <= Date.now()) return;

  const notifId = taskIdToNumber(task.id);

  // Cancel any existing notification for this task first
  try { await LocalNotifications.cancel({ notifications: [{ id: notifId }] }); } catch { /* ignore */ }

  await LocalNotifications.schedule({
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
  const runtime = getRuntimeSnapshot(false);
  if (!runtime.isNative || !runtime.pluginAvailable) return;
  try {
    await LocalNotifications.cancel({ notifications: [{ id: taskIdToNumber(taskId) }] });
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
  const runtime = getRuntimeSnapshot(false);
  if (!runtime.isNative || !runtime.pluginAvailable || !runtime.scheduleCallable) return;

  // Cancel all pending notifications
  const pending = await LocalNotifications.getPending();
  if (pending.notifications.length > 0) {
    await LocalNotifications.cancel({ notifications: pending.notifications });
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
