/**
 * Centralized notification service for Capacitor iOS local notifications.
 *
 * Architecture:
 *   - Permission flow: check/request only, never triggers scheduling
 *   - Test notification flow: isolated, uses dedicated ID namespace
 *   - Task notification flow: diff-based sync, idempotent, guarded against concurrent runs
 *   - Overdue notification flow: rolling window of per-minute reminders
 *
 * iOS limit: max 64 pending local notifications. We reserve 1 slot for test
 * notifications and use the remaining 63 for task reminders, prioritized by
 * nearest fire time. Overdue reminders share this budget.
 *
 * All native plugin interactions go through this module.
 * UI components should never call LocalNotifications directly.
 */

import { Capacitor } from '@capacitor/core';
import { LocalNotifications } from '@capacitor/local-notifications';
import type { Task, Priority } from '@/store/taskStore';

// ─── Types ───────────────────────────────────────────────────────────────────

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

export interface SyncResult {
  scheduled: number;
  canceled: number;
  unchanged: number;
  skipped: boolean;
  reason?: string;
}

// ─── Constants ───────────────────────────────────────────────────────────────

const LEAD_MINUTES = 5;
const TEST_NOTIFICATION_ID = 984251;
const PLUGIN_NAME = 'LocalNotifications';

/**
 * iOS allows a maximum of 64 pending local notifications.
 * We reserve 1 slot for the test notification.
 */
const IOS_MAX_PENDING = 64;
const MAX_TASK_NOTIFICATIONS = IOS_MAX_PENDING - 1; // 63

/**
 * Task notification IDs use the range [1_000_000, 2_000_000).
 * Overdue notifications use the range [2_000_000, 3_000_000).
 * Test notification uses a fixed ID outside these ranges.
 */
const TASK_ID_OFFSET = 1_000_000;
const OVERDUE_ID_OFFSET = 2_000_000;

/** Max overdue reminders per task in a single sync window */
const MAX_OVERDUE_PER_TASK = 15;
/** Total overdue slots across all tasks */
const MAX_OVERDUE_TOTAL = 30;

// ─── Internal state / guards ─────────────────────────────────────────────────

/** Prevents overlapping sync jobs */
let syncInFlight = false;

/** Last fingerprint used for sync — skip if unchanged */
let lastSyncFingerprint = '';

/** Debug mode — enable verbose per-task logging */
let debugMode = false;

/** Cached permission status to avoid redundant native calls */
let cachedPermission: NotificationPermissionStatus | null = null;

// ─── Helpers ─────────────────────────────────────────────────────────────────

function log(msg: string, data?: unknown) {
  if (data !== undefined) {
    console.log(`[notifications] ${msg}`, JSON.stringify(data));
  } else {
    console.log(`[notifications] ${msg}`);
  }
}

function logDebug(msg: string, data?: unknown) {
  if (!debugMode) return;
  log(msg, data);
}

function formatError(error: unknown): string {
  if (error instanceof Error) return `${error.name}: ${error.message}`;
  if (typeof error === 'string') return error;
  try { return JSON.stringify(error); } catch { return String(error); }
}

function normalizePermission(status: string | undefined): NotificationPermissionStatus {
  if (status === 'granted' || status === 'denied') return status;
  return 'prompt';
}

function isPluginReady(): boolean {
  return (
    Capacitor.isNativePlatform() &&
    Capacitor.isPluginAvailable(PLUGIN_NAME) &&
    typeof LocalNotifications.schedule === 'function'
  );
}

/** Derive a stable numeric ID for a task, offset into the task namespace */
function taskNotificationId(taskId: string): number {
  let hash = 0;
  for (let i = 0; i < taskId.length; i++) {
    hash = ((hash << 5) - hash + taskId.charCodeAt(i)) | 0;
  }
  return TASK_ID_OFFSET + (Math.abs(hash) % 1_000_000);
}

/**
 * Derive a stable numeric ID for an overdue reminder based on task + absolute
 * minute timestamp. This ensures the same minute slot always produces the same
 * ID regardless of when the sync runs, preventing cancel/reschedule churn.
 */
function overdueNotificationId(taskId: string, absoluteMinuteTimestamp: number): number {
  let hash = 0;
  const key = `${taskId}:overdue:${absoluteMinuteTimestamp}`;
  for (let i = 0; i < key.length; i++) {
    hash = ((hash << 5) - hash + key.charCodeAt(i)) | 0;
  }
  return OVERDUE_ID_OFFSET + (Math.abs(hash) % 1_000_000);
}

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

/** Build a fingerprint of notification-relevant task data for change detection */
function buildFingerprint(tasks: Task[], level: NotificationLevel, persistentOverdue: boolean): string {
  if (level === 'off') return 'off';
  const parts = tasks
    .filter(t => shouldNotify(t, level) && t.time && !t.completed)
    .map(t => `${t.id}:${t.date}:${t.time}:${t.priority}:${t.title}:${t.completed}`)
    .sort();
  return `${level}:po=${persistentOverdue}:${parts.join('|')}`;
}

interface DesiredNotification {
  title: string;
  body: string;
  fireAt: Date;
  taskId: string;
  type: 'reminder' | 'overdue';
}

/**
 * Compute desired notifications, capped to MAX_TASK_NOTIFICATIONS (63),
 * prioritized by nearest fire time so the most imminent reminders are kept.
 * When persistentOverdue is enabled, also schedules overdue minute-by-minute reminders.
 */
function computeDesired(
  tasks: Task[],
  level: NotificationLevel,
  persistentOverdue: boolean,
): Map<number, DesiredNotification> {
  if (level === 'off') return new Map();

  const now = Date.now();
  const candidates: { id: number; data: DesiredNotification }[] = [];

  // Budget tracking for overdue notifications
  let totalOverdueSlots = 0;

  for (const task of tasks) {
    if (!shouldNotify(task, level)) continue;
    if (!task.time || task.completed) continue;

    const [h, m] = task.time.split(':').map(Number);
    const taskTime = new Date(`${task.date}T00:00:00`);
    taskTime.setHours(h, m, 0, 0);
    const taskTimeMs = taskTime.getTime();

    // 5-minute-before reminder
    const fireAt = new Date(taskTimeMs - LEAD_MINUTES * 60_000);
    if (fireAt.getTime() > now) {
      candidates.push({
        id: taskNotificationId(task.id),
        data: {
          title: `${priorityLabel(task.priority)} — ${task.title}`,
          body: `Starts in ${LEAD_MINUTES} min · ${task.time}`,
          fireAt,
          taskId: task.id,
          type: 'reminder',
        },
      });
    }

    // Overdue persistent reminders
    if (persistentOverdue && taskTimeMs <= now) {
      // Task is overdue — schedule rolling reminders for the next N minutes
      const overdueMinutes = Math.floor((now - taskTimeMs) / 60_000);
      const remainingSlots = Math.min(MAX_OVERDUE_PER_TASK, MAX_OVERDUE_TOTAL - totalOverdueSlots);

      if (remainingSlots > 0) {
        let scheduled = 0;
        for (let offset = 1; offset <= remainingSlots; offset++) {
          const minuteFromNow = offset;
          const fireTime = new Date(now + minuteFromNow * 60_000);
          const totalOffset = overdueMinutes + offset;

          candidates.push({
            id: overdueNotificationId(task.id, totalOffset),
            data: {
              title: `OVERDUE — ${task.title}`,
              body: `${totalOffset} min overdue · was ${task.time}`,
              fireAt: fireTime,
              taskId: task.id,
              type: 'overdue',
            },
          });
          scheduled++;
        }

        totalOverdueSlots += scheduled;
        log(`overdue schedule: ${scheduled} reminders for task "${task.title}" (${overdueMinutes}min overdue)`);
      }
    }
  }

  // Sort by nearest fire time and take only the first 63
  // Prioritize overdue first, then by time
  candidates.sort((a, b) => {
    // Overdue tasks get priority
    if (a.data.type === 'overdue' && b.data.type !== 'overdue') return -1;
    if (a.data.type !== 'overdue' && b.data.type === 'overdue') return 1;
    return a.data.fireAt.getTime() - b.data.fireAt.getTime();
  });
  const capped = candidates.slice(0, MAX_TASK_NOTIFICATIONS);

  const map = new Map<number, DesiredNotification>();
  for (const c of capped) {
    map.set(c.id, c.data);
  }

  logDebug(`computed desired: ${candidates.length} candidates → ${capped.length} capped`);
  return map;
}

// ─── Permission flow ─────────────────────────────────────────────────────────

export async function getPermissionStatus(): Promise<NotificationPermissionStatus> {
  if (!Capacitor.isNativePlatform() || !Capacitor.isPluginAvailable(PLUGIN_NAME)) return 'denied';
  if (typeof LocalNotifications.checkPermissions !== 'function') return 'denied';

  // Return cached if available (avoid redundant native calls during same session)
  if (cachedPermission !== null) return cachedPermission;

  try {
    const { display } = await LocalNotifications.checkPermissions();
    cachedPermission = normalizePermission(display);
    return cachedPermission;
  } catch (error) {
    console.error('[notifications] checkPermissions error', error);
    return 'denied';
  }
}

/** Request permission — ONLY call from a direct user action (button tap) */
export async function requestPermissionFromUserAction(): Promise<NotificationPermissionRequestResult> {
  if (!Capacitor.isNativePlatform()) {
    return { status: 'denied', error: 'Not running in native app.' };
  }
  if (!Capacitor.isPluginAvailable(PLUGIN_NAME)) {
    return { status: 'denied', error: `Plugin '${PLUGIN_NAME}' not available.` };
  }
  if (typeof LocalNotifications.requestPermissions !== 'function') {
    return { status: 'denied', error: 'requestPermissions not callable.' };
  }

  try {
    log('requesting permission from user action');
    const result = await LocalNotifications.requestPermissions();
    const status = normalizePermission(result.display);
    cachedPermission = status; // Update cache
    log('permission result', { status });
    return { status, error: null };
  } catch (error) {
    const msg = formatError(error);
    console.error('[notifications] requestPermissions error', error);
    return { status: 'denied', error: msg };
  }
}

// ─── Test notification flow ──────────────────────────────────────────────────

export async function scheduleTestNotification(delaySeconds = 8): Promise<NotificationScheduleResult> {
  if (!isPluginReady()) {
    return { ok: false, error: 'Plugin not ready.', scheduledFor: null };
  }

  const fireAt = new Date(Date.now() + delaySeconds * 1000);

  try {
    await LocalNotifications.cancel({ notifications: [{ id: TEST_NOTIFICATION_ID }] });
  } catch { /* ignore */ }

  try {
    await LocalNotifications.schedule({
      notifications: [{
        id: TEST_NOTIFICATION_ID,
        title: 'spaacetime notifications enabled',
        body: `Test notification scheduled for ~${delaySeconds}s from now.`,
        schedule: { at: fireAt, allowWhileIdle: true },
        sound: 'default',
        extra: { type: 'notification-permission-test' },
      }],
    });

    log('test notification scheduled', { scheduledFor: fireAt.toISOString() });
    return { ok: true, error: null, scheduledFor: fireAt.toISOString() };
  } catch (error) {
    const msg = formatError(error);
    console.error('[notifications] test schedule error', error);
    return { ok: false, error: msg, scheduledFor: null };
  }
}

export async function clearTestNotifications(): Promise<void> {
  if (!isPluginReady()) return;
  try {
    await LocalNotifications.cancel({ notifications: [{ id: TEST_NOTIFICATION_ID }] });
  } catch { /* ignore */ }
}

// ─── Task notification sync (diff-based) ─────────────────────────────────────

/**
 * Diff-based sync: compare desired notifications against pending ones.
 * Only cancels stale and schedules missing notifications.
 *
 * Safe to call multiple times — uses fingerprint to skip no-op syncs,
 * and a mutex to prevent overlapping runs.
 *
 * Caps to 63 notifications (iOS 64 limit minus 1 test slot).
 */
export async function syncTaskNotifications(
  tasks: Task[],
  level: NotificationLevel,
  force = false,
  persistentOverdue = false,
): Promise<SyncResult> {
  if (!isPluginReady()) {
    return { scheduled: 0, canceled: 0, unchanged: 0, skipped: true, reason: 'plugin not ready' };
  }

  // Guard: no permission (use cache to avoid extra native call)
  const perm = cachedPermission ?? await getPermissionStatus();
  if (perm !== 'granted' && level !== 'off') {
    return { scheduled: 0, canceled: 0, unchanged: 0, skipped: true, reason: `permission ${perm}` };
  }

  // Guard: fingerprint unchanged
  const fp = buildFingerprint(tasks, level, persistentOverdue);
  if (!force && fp === lastSyncFingerprint) {
    logDebug('sync skipped — fingerprint unchanged');
    return { scheduled: 0, canceled: 0, unchanged: 0, skipped: true, reason: 'unchanged' };
  }

  // Guard: concurrent sync
  if (syncInFlight) {
    logDebug('sync skipped — already in flight');
    return { scheduled: 0, canceled: 0, unchanged: 0, skipped: true, reason: 'in flight' };
  }

  syncInFlight = true;

  try {
    log('sync start', { level, taskCount: tasks.length, persistentOverdue });

    // If level is off, cancel all task + overdue notifications
    if (level === 'off') {
      const pending = await LocalNotifications.getPending();
      const taskNotifs = pending.notifications.filter(
        n => (n.id >= TASK_ID_OFFSET && n.id < TASK_ID_OFFSET + 1_000_000) ||
             (n.id >= OVERDUE_ID_OFFSET && n.id < OVERDUE_ID_OFFSET + 1_000_000)
      );
      if (taskNotifs.length > 0) {
        await LocalNotifications.cancel({ notifications: taskNotifs });
      }
      lastSyncFingerprint = fp;
      log('sync result', { scheduled: 0, canceled: taskNotifs.length, unchanged: 0 });
      return { scheduled: 0, canceled: taskNotifs.length, unchanged: 0, skipped: false };
    }

    // Compute desired state (already capped to 63)
    const desired = computeDesired(tasks, level, persistentOverdue);

    // Get current pending task + overdue notifications
    const pending = await LocalNotifications.getPending();
    const currentTaskNotifIds = new Set(
      pending.notifications
        .filter(n =>
          (n.id >= TASK_ID_OFFSET && n.id < TASK_ID_OFFSET + 1_000_000) ||
          (n.id >= OVERDUE_ID_OFFSET && n.id < OVERDUE_ID_OFFSET + 1_000_000)
        )
        .map(n => n.id)
    );

    // Diff
    const toCancel: number[] = [];
    const toSchedule: number[] = [];

    // Stale: in current but not in desired
    for (const id of currentTaskNotifIds) {
      if (!desired.has(id)) {
        toCancel.push(id);
      }
    }

    // Missing: in desired but not in current
    for (const id of desired.keys()) {
      if (!currentTaskNotifIds.has(id)) {
        toSchedule.push(id);
      }
    }

    const unchanged = desired.size - toSchedule.length;

    // Cancel stale
    if (toCancel.length > 0) {
      await LocalNotifications.cancel({
        notifications: toCancel.map(id => ({ id })),
      });
      log(`canceled ${toCancel.length} stale notifications`);
    }

    // Schedule missing in batches of 50, all with sound
    if (toSchedule.length > 0) {
      const notifications = toSchedule.map(id => {
        const d = desired.get(id)!;
        return {
          id,
          title: d.title,
          body: d.body,
          schedule: { at: d.fireAt, allowWhileIdle: true },
          sound: 'default' as string,
          extra: { taskId: d.taskId, type: d.type },
        };
      });

      for (let i = 0; i < notifications.length; i += 50) {
        const batch = notifications.slice(i, i + 50);
        await LocalNotifications.schedule({ notifications: batch });
      }
    }

    lastSyncFingerprint = fp;
    log('sync result', { scheduled: toSchedule.length, canceled: toCancel.length, unchanged });

    return { scheduled: toSchedule.length, canceled: toCancel.length, unchanged, skipped: false };
  } catch (error) {
    console.error('[notifications] sync error', error);
    return { scheduled: 0, canceled: 0, unchanged: 0, skipped: true, reason: formatError(error) };
  } finally {
    syncInFlight = false;
  }
}

/** Cancel notifications for a single task without a full sync */
export async function cancelNotificationsForTask(taskId: string): Promise<void> {
  if (!isPluginReady()) return;

  const ids: { id: number }[] = [{ id: taskNotificationId(taskId) }];

  // Also cancel any overdue notifications for this task
  // We cancel a range of possible overdue IDs
  for (let offset = 0; offset <= 120; offset++) {
    ids.push({ id: overdueNotificationId(taskId, offset) });
  }

  try {
    await LocalNotifications.cancel({ notifications: ids });
    log(`canceled all notifications for task ${taskId}`);
  } catch { /* ignore */ }
  lastSyncFingerprint = '';
}

/** Force-invalidate the fingerprint (e.g. after a single-task update) */
export function invalidateSyncFingerprint(): void {
  lastSyncFingerprint = '';
}

/**
 * Read the current fingerprint. UI code that does its own forced sync
 * can call this afterward to pre-set the hook's ref, preventing a
 * duplicate sync when the hook's useEffect fires.
 */
export function getCurrentSyncFingerprint(): string {
  return lastSyncFingerprint;
}

// ─── Debug snapshot ──────────────────────────────────────────────────────────

export function getDebugSnapshotSync(): NotificationDebugSnapshot {
  const isNative = Capacitor.isNativePlatform();
  return {
    platform: Capacitor.getPlatform(),
    isNative,
    pluginAvailable: isNative ? Capacitor.isPluginAvailable(PLUGIN_NAME) : false,
    requestPermissionsCallable: typeof LocalNotifications.requestPermissions === 'function',
    checkPermissionsCallable: typeof LocalNotifications.checkPermissions === 'function',
    scheduleCallable: typeof LocalNotifications.schedule === 'function',
    permissionStatus: cachedPermission ?? (isNative ? 'prompt' : 'denied'),
    requestResult: null,
    requestError: null,
    scheduleStatus: isNative ? null : 'Notifications only work in the native mobile app.',
    scheduleError: null,
  };
}

export async function getDebugSnapshot(): Promise<NotificationDebugSnapshot> {
  const snapshot = getDebugSnapshotSync();
  if (!snapshot.isNative || !snapshot.pluginAvailable || !snapshot.checkPermissionsCallable) {
    return snapshot;
  }

  try {
    const { display } = await LocalNotifications.checkPermissions();
    cachedPermission = normalizePermission(display);
    return { ...snapshot, permissionStatus: cachedPermission };
  } catch (error) {
    const msg = formatError(error);
    return { ...snapshot, permissionStatus: 'denied', scheduleError: msg };
  }
}

// ─── Debug mode toggle ───────────────────────────────────────────────────────

export function setNotificationDebugMode(enabled: boolean): void {
  debugMode = enabled;
  log(`debug mode ${enabled ? 'enabled' : 'disabled'}`);
}

export function isNotificationDebugMode(): boolean {
  return debugMode;
}

// ─── Tap handler ─────────────────────────────────────────────────────────────

/**
 * Register a listener for notification taps. Returns a cleanup function.
 * The callback receives the taskId from the notification extra data (if any).
 */
export function setupNotificationTapListener(
  onTap: (taskId: string | null) => void,
): (() => void) | undefined {
  if (!Capacitor.isNativePlatform()) return undefined;

  const listener = LocalNotifications.addListener(
    'localNotificationActionPerformed',
    (action) => {
      const taskId = action.notification?.extra?.taskId ?? null;
      log(`notification tapped, taskId=${taskId}`);
      onTap(taskId);
    },
  );

  return () => {
    listener.then((l) => l.remove());
  };
}
