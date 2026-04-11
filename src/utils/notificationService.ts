/**
 * Centralized notification service for Capacitor iOS local notifications.
 *
 * Architecture:
 *   - Permission flow: check/request only, never triggers scheduling
 *   - Test notification flow: isolated, uses dedicated ID namespace
 *   - Task notification flow: diff-based sync, idempotent, guarded against concurrent runs
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
 * Task notification IDs use the range [1_000_000, 2_000_000).
 * Test notification uses a fixed ID outside this range.
 */
const TASK_ID_OFFSET = 1_000_000;

// ─── Internal state / guards ─────────────────────────────────────────────────

/** Prevents overlapping sync jobs */
let syncInFlight = false;

/** Last fingerprint used for sync — skip if unchanged */
let lastSyncFingerprint = '';

/** Debug mode — enable verbose per-task logging */
let debugMode = false;

// ─── Helpers ─────────────────────────────────────────────────────────────────

function log(msg: string, data?: unknown) {
  if (data !== undefined) {
    console.log(`[notifications] ${msg}`, data);
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
  // Keep in [TASK_ID_OFFSET, TASK_ID_OFFSET + 1_000_000)
  return TASK_ID_OFFSET + (Math.abs(hash) % 1_000_000);
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
function buildFingerprint(tasks: Task[], level: NotificationLevel): string {
  if (level === 'off') return 'off';
  const parts = tasks
    .filter(t => shouldNotify(t, level) && t.time && !t.completed)
    .map(t => `${t.id}:${t.date}:${t.time}:${t.priority}:${t.title}`)
    .sort();
  return `${level}:${parts.join('|')}`;
}

/** Compute desired notification map: notifId → { title, body, fireAt } */
function computeDesired(tasks: Task[], level: NotificationLevel): Map<number, { title: string; body: string; fireAt: Date; taskId: string }> {
  const map = new Map<number, { title: string; body: string; fireAt: Date; taskId: string }>();
  if (level === 'off') return map;

  const now = Date.now();

  for (const task of tasks) {
    if (!shouldNotify(task, level)) continue;
    if (!task.time || task.completed) continue;

    const [h, m] = task.time.split(':').map(Number);
    const fireAt = new Date(`${task.date}T00:00:00`);
    fireAt.setHours(h, m - LEAD_MINUTES, 0, 0);

    if (fireAt.getTime() <= now) continue;

    const id = taskNotificationId(task.id);
    map.set(id, {
      title: `${priorityLabel(task.priority)} — ${task.title}`,
      body: `Starts in ${LEAD_MINUTES} min · ${task.time}`,
      fireAt,
      taskId: task.id,
    });
  }

  return map;
}

// ─── Permission flow ─────────────────────────────────────────────────────────

export async function getPermissionStatus(): Promise<NotificationPermissionStatus> {
  if (!Capacitor.isNativePlatform() || !Capacitor.isPluginAvailable(PLUGIN_NAME)) return 'denied';
  if (typeof LocalNotifications.checkPermissions !== 'function') return 'denied';

  try {
    const { display } = await LocalNotifications.checkPermissions();
    return normalizePermission(display);
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
 */
export async function syncTaskNotifications(
  tasks: Task[],
  level: NotificationLevel,
  force = false,
): Promise<SyncResult> {
  // Guard: not on native
  if (!isPluginReady()) {
    return { scheduled: 0, canceled: 0, unchanged: 0, skipped: true, reason: 'plugin not ready' };
  }

  // Guard: no permission
  const perm = await getPermissionStatus();
  if (perm !== 'granted' && level !== 'off') {
    return { scheduled: 0, canceled: 0, unchanged: 0, skipped: true, reason: `permission ${perm}` };
  }

  // Guard: fingerprint unchanged
  const fp = buildFingerprint(tasks, level);
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
    log('sync start', { level, taskCount: tasks.length });

    // If level is off, just cancel all task notifications
    if (level === 'off') {
      const pending = await LocalNotifications.getPending();
      const taskNotifs = pending.notifications.filter(
        n => n.id >= TASK_ID_OFFSET && n.id < TASK_ID_OFFSET + 1_000_000
      );
      if (taskNotifs.length > 0) {
        await LocalNotifications.cancel({ notifications: taskNotifs });
      }
      lastSyncFingerprint = fp;
      log('sync result', { scheduled: 0, canceled: taskNotifs.length, unchanged: 0 });
      return { scheduled: 0, canceled: taskNotifs.length, unchanged: 0, skipped: false };
    }

    // Compute desired state
    const desired = computeDesired(tasks, level);

    // Get current pending task notifications
    const pending = await LocalNotifications.getPending();
    const currentTaskNotifIds = new Set(
      pending.notifications
        .filter(n => n.id >= TASK_ID_OFFSET && n.id < TASK_ID_OFFSET + 1_000_000)
        .map(n => n.id)
    );

    // Diff
    const toCancel: number[] = [];
    const toSchedule: number[] = [];

    // Find stale: in current but not in desired
    for (const id of currentTaskNotifIds) {
      if (!desired.has(id)) {
        toCancel.push(id);
      }
    }

    // Find missing: in desired but not in current
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
      logDebug(`canceled ${toCancel.length} stale notifications`);
    }

    // Schedule missing
    if (toSchedule.length > 0) {
      const notifications = toSchedule.map(id => {
        const d = desired.get(id)!;
        return {
          id,
          title: d.title,
          body: d.body,
          schedule: { at: d.fireAt, allowWhileIdle: true },
          extra: { taskId: d.taskId },
        };
      });

      // Schedule in batches of 50 to avoid overwhelming the bridge
      for (let i = 0; i < notifications.length; i += 50) {
        const batch = notifications.slice(i, i + 50);
        await LocalNotifications.schedule({ notifications: batch });
      }
      logDebug(`scheduled ${toSchedule.length} new notifications`);
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
  const id = taskNotificationId(taskId);
  try {
    await LocalNotifications.cancel({ notifications: [{ id }] });
    logDebug(`canceled notification for task ${taskId}`);
  } catch { /* ignore */ }
  // Invalidate fingerprint so next sync picks up the change
  lastSyncFingerprint = '';
}

/** Force-invalidate the fingerprint (e.g. after a single-task update) */
export function invalidateSyncFingerprint(): void {
  lastSyncFingerprint = '';
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
    permissionStatus: isNative ? 'prompt' : 'denied',
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
    return { ...snapshot, permissionStatus: normalizePermission(display) };
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
