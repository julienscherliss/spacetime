/**
 * Centralized notification service for Capacitor iOS local notifications.
 *
 * Architecture:
 *   - Only the next 3 upcoming tasks of the current day get reminders
 *   - Each eligible task gets up to 7 notifications:
 *       1. 5 minutes before start
 *       2. At task end
 *       3-7. 1–5 minutes after task end
 *   - Diff-based sync: only cancel/schedule what changed
 *   - Deterministic IDs based on taskId + reminder type
 *   - No global overdue heartbeat or per-task overdue queue
 *
 * iOS limit: max 64 pending local notifications.
 * We stay well below that (max ~21 for 3 tasks × 7 slots).
 *
 * All native plugin interactions go through this module.
 * UI components should never call LocalNotifications directly.
 */

import { Capacitor } from '@capacitor/core';
import { LocalNotifications } from '@capacitor/local-notifications';
import type { Task, Priority } from '@/store/taskStore';

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

const LEAD_MINUTES = 5;
const TEST_NOTIFICATION_ID = 984251;
const PLUGIN_NAME = 'LocalNotifications';
const MAX_UPCOMING_TASKS = 3;

const SAFE_PENDING_CAP = 50;
const REMINDER_ID_OFFSET = 1_000_000;

// Reminder slot types for deterministic IDs
const SLOT_TYPES = [
  'startminus5',
  'end',
  'endplus1',
  'endplus2',
  'endplus3',
  'endplus4',
  'endplus5',
] as const;
type SlotType = typeof SLOT_TYPES[number];

let syncInFlight = false;
let queuedSyncRequest: {
  tasks: Task[];
  level: NotificationLevel;
  force: boolean;
  persistentOverdue: boolean;
} | null = null;
let lastSyncFingerprint = '';
let lastSyncCompletedAt = 0;
let syncGeneration = 0;
let debugMode = false;
let cachedPermission: NotificationPermissionStatus | null = null;
let tapListenerRegistered = false;

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

/**
 * Deterministic hash → numeric ID.
 */
function deterministicId(key: string): number {
  let hash = 0;
  for (let i = 0; i < key.length; i++) {
    hash = ((hash << 5) - hash + key.charCodeAt(i)) | 0;
  }
  return REMINDER_ID_OFFSET + (Math.abs(hash) % 1_000_000);
}

function slotNotificationId(taskId: string, slotType: SlotType, fireMs: number): number {
  const minuteKey = Math.floor(fireMs / 60_000);
  return deterministicId(`task:${taskId}:${slotType}:${minuteKey}`);
}

function isManagedNotificationId(id: number): boolean {
  return id >= REMINDER_ID_OFFSET && id < REMINDER_ID_OFFSET + 1_000_000;
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

function getTaskStartMs(task: Task): number | null {
  if (!task.time) return null;
  const [h, m] = task.time.split(':').map(Number);
  const dt = new Date(`${task.date}T00:00:00`);
  dt.setHours(h, m, 0, 0);
  return dt.getTime();
}

function getTaskEndMs(task: Task): number | null {
  const startMs = getTaskStartMs(task);
  if (startMs === null) return null;
  const durationMin = (task.duration && task.duration > 0) ? task.duration : 30;
  return startMs + durationMin * 60_000;
}

function getTodayStr(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function getNotificationTaskId(notification: { extra?: unknown }): string | null {
  const extra = notification.extra as { taskId?: unknown } | undefined;
  return typeof extra?.taskId === 'string' ? extra.taskId : null;
}

function buildFingerprint(tasks: Task[], level: NotificationLevel): string {
  if (level === 'off') return 'off';
  const today = getTodayStr();
  const parts = tasks
    .filter((t) => shouldNotify(t, level) && t.time && !t.completed && t.date === today)
    .map((t) => `${t.id}:${t.date}:${t.time}:${t.duration}:${t.priority}:${t.title}:${t.completed}`)
    .sort();
  return `${level}:${parts.join('|')}`;
}

interface DesiredNotification {
  title: string;
  body: string;
  fireAt: Date;
  taskId: string;
  slotType: SlotType;
}

function computeDesired(
  tasks: Task[],
  level: NotificationLevel,
): Map<number, DesiredNotification> {
  const desired = new Map<number, DesiredNotification>();
  if (level === 'off') return desired;

  const now = Date.now();
  const today = getTodayStr();

  // Find eligible tasks: today, incomplete, has time, not archived/waiting
  const eligible = tasks.filter((t) => {
    if (t.date !== today) return false;
    if (t.completed) return false;
    if (t.archivedAt) return false;
    if (t.inWaitingRoom) return false;
    if (!t.time) return false;
    if (!shouldNotify(t, level)) return false;
    return true;
  });

  // Sort by start time, pick next 3 upcoming (start time >= now - 5min buffer, or end time in future)
  const withTimes = eligible
    .map((t) => ({ task: t, startMs: getTaskStartMs(t)!, endMs: getTaskEndMs(t)! }))
    .filter(({ endMs }) => {
      // Task is still "upcoming" if its end + 5min is in the future
      return endMs + 5 * 60_000 > now;
    })
    .sort((a, b) => a.startMs - b.startMs);

  const top3 = withTimes.slice(0, MAX_UPCOMING_TASKS);

  log('top 3 upcoming tasks', {
    today,
    now: new Date(now).toISOString(),
    eligibleCount: eligible.length,
    top3: top3.map(({ task, startMs, endMs }) => ({
      id: task.id,
      title: task.title,
      time: task.time,
      duration: task.duration,
      startMs,
      endMs,
    })),
  });

  for (const { task, startMs, endMs } of top3) {
    const slots: { type: SlotType; fireMs: number; title: string; body: string }[] = [
      {
        type: 'startminus5',
        fireMs: startMs - LEAD_MINUTES * 60_000,
        title: `${priorityLabel(task.priority)} — ${task.title}`,
        body: `Starts in ${LEAD_MINUTES} min · ${task.time}`,
      },
      {
        type: 'end',
        fireMs: endMs,
        title: `${task.title} — time's up`,
        body: 'Task time has ended',
      },
      {
        type: 'endplus1',
        fireMs: endMs + 1 * 60_000,
        title: `${task.title} — 1 min overdue`,
        body: 'Task ended 1 minute ago',
      },
      {
        type: 'endplus2',
        fireMs: endMs + 2 * 60_000,
        title: `${task.title} — 2 min overdue`,
        body: 'Task ended 2 minutes ago',
      },
      {
        type: 'endplus3',
        fireMs: endMs + 3 * 60_000,
        title: `${task.title} — 3 min overdue`,
        body: 'Task ended 3 minutes ago',
      },
      {
        type: 'endplus4',
        fireMs: endMs + 4 * 60_000,
        title: `${task.title} — 4 min overdue`,
        body: 'Task ended 4 minutes ago',
      },
      {
        type: 'endplus5',
        fireMs: endMs + 5 * 60_000,
        title: `${task.title} — 5 min overdue`,
        body: 'Task ended 5 minutes ago',
      },
    ];

    for (const slot of slots) {
      if (slot.fireMs <= now) {
        logDebug('skipped past slot', {
          taskId: task.id,
          slotType: slot.type,
          fireAt: new Date(slot.fireMs).toISOString(),
          now: new Date(now).toISOString(),
        });
        continue;
      }

      const id = slotNotificationId(task.id, slot.type, slot.fireMs);
      desired.set(id, {
        title: slot.title,
        body: slot.body,
        fireAt: new Date(slot.fireMs),
        taskId: task.id,
        slotType: slot.type,
      });
    }
  }

  log('desired reminders computed', {
    totalSlots: desired.size,
    perTask: top3.map(({ task }) => ({
      id: task.id,
      title: task.title,
      slots: [...desired.values()].filter(d => d.taskId === task.id).map(d => d.slotType),
    })),
  });

  return desired;
}

export async function getPermissionStatus(): Promise<NotificationPermissionStatus> {
  if (!Capacitor.isNativePlatform() || !Capacitor.isPluginAvailable(PLUGIN_NAME)) return 'denied';
  if (typeof LocalNotifications.checkPermissions !== 'function') return 'denied';
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
    cachedPermission = status;
    log('permission result', { status });
    return { status, error: null };
  } catch (error) {
    const msg = formatError(error);
    console.error('[notifications] requestPermissions error', error);
    return { status: 'denied', error: msg };
  }
}

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

export async function syncTaskNotifications(
  tasks: Task[],
  level: NotificationLevel,
  force = false,
  _persistentOverdue = false, // kept for API compat, no longer used
): Promise<SyncResult> {
  if (!isPluginReady()) {
    return { scheduled: 0, canceled: 0, unchanged: 0, skipped: true, reason: 'plugin not ready' };
  }

  const perm = cachedPermission ?? await getPermissionStatus();
  if (perm !== 'granted' && level !== 'off') {
    return { scheduled: 0, canceled: 0, unchanged: 0, skipped: true, reason: `permission ${perm}` };
  }

  const fp = buildFingerprint(tasks, level);

  if (!force && fp === lastSyncFingerprint) {
    logDebug('sync skipped — fingerprint unchanged');
    return { scheduled: 0, canceled: 0, unchanged: 0, skipped: true, reason: 'unchanged' };
  }

  if (syncInFlight) {
    queuedSyncRequest = { tasks, level, force, persistentOverdue: false };
    log('sync queued', { reason: 'sync already in flight' });
    return { scheduled: 0, canceled: 0, unchanged: 0, skipped: true, reason: 'queued' };
  }

  syncInFlight = true;
  const startGeneration = syncGeneration;

  try {
    const pending = await LocalNotifications.getPending();
    const managedPending = pending.notifications.filter((n) => isManagedNotificationId(n.id));

    log('sync start', { level, taskCount: tasks.length, queueBefore: managedPending.length });

    if (level === 'off') {
      if (managedPending.length > 0) {
        await LocalNotifications.cancel({
          notifications: managedPending.map((n) => ({ id: n.id })),
        });
      }
      lastSyncFingerprint = fp;
      lastSyncCompletedAt = Date.now();
      log('sync result — all off', { canceled: managedPending.length });
      return { scheduled: 0, canceled: managedPending.length, unchanged: 0, skipped: false };
    }

    if (startGeneration !== syncGeneration) {
      return { scheduled: 0, canceled: 0, unchanged: 0, skipped: true, reason: 'stale' };
    }

    const desired = computeDesired(tasks, level);
    const desiredIds = new Set(desired.keys());
    const currentIds = new Set(managedPending.map((n) => n.id));

    // DIFF
    const toCancel = managedPending.filter((n) => !desiredIds.has(n.id)).map((n) => n.id);
    const toSchedule = [...desiredIds].filter((id) => !currentIds.has(id));
    const unchanged = desired.size - toSchedule.length;

    if (debugMode) {
      for (const cancelId of toCancel) {
        const pn = managedPending.find(n => n.id === cancelId);
        logDebug('canceling', { id: cancelId, taskId: pn ? getNotificationTaskId(pn) : null });
      }
      for (const schedId of toSchedule) {
        const item = desired.get(schedId)!;
        logDebug('scheduling', { id: schedId, taskId: item.taskId, slot: item.slotType, fireAt: item.fireAt.toISOString() });
      }
    }

    if (startGeneration !== syncGeneration) {
      return { scheduled: 0, canceled: 0, unchanged: 0, skipped: true, reason: 'stale' };
    }

    if (toCancel.length > 0) {
      await LocalNotifications.cancel({ notifications: toCancel.map((id) => ({ id })) });
    }

    const scheduleNow = Date.now();
    const notificationsToSchedule = toSchedule
      .map((id) => {
        const item = desired.get(id)!;
        return {
          id,
          title: item.title,
          body: item.body,
          schedule: { at: item.fireAt, allowWhileIdle: true },
          sound: 'default' as string,
          extra: { taskId: item.taskId, slotType: item.slotType },
        };
      })
      .filter((item) => {
        if (item.schedule.at.getTime() <= scheduleNow) {
          log('skipped past-time notification at schedule', { id: item.id, fireAt: item.schedule.at.toISOString() });
          return false;
        }
        return true;
      });

    if (notificationsToSchedule.length > 0) {
      for (let i = 0; i < notificationsToSchedule.length; i += 25) {
        await LocalNotifications.schedule({
          notifications: notificationsToSchedule.slice(i, i + 25),
        });
      }
    }

    lastSyncFingerprint = fp;
    lastSyncCompletedAt = Date.now();

    log('sync result', {
      scheduled: notificationsToSchedule.length,
      canceled: toCancel.length,
      unchanged,
      desiredTotal: desired.size,
    });

    return { scheduled: notificationsToSchedule.length, canceled: toCancel.length, unchanged, skipped: false };
  } catch (error) {
    console.error('[notifications] sync error', error);
    return { scheduled: 0, canceled: 0, unchanged: 0, skipped: true, reason: formatError(error) };
  } finally {
    syncInFlight = false;

    if (queuedSyncRequest) {
      const nextRequest = queuedSyncRequest;
      queuedSyncRequest = null;
      queueMicrotask(() => {
        void syncTaskNotifications(nextRequest.tasks, nextRequest.level, true, false);
      });
    }
  }
}

export async function cancelNotificationsForTask(taskId: string): Promise<void> {
  if (!isPluginReady()) return;

  syncGeneration += 1;
  lastSyncFingerprint = '';
  lastSyncCompletedAt = 0;

  try {
    const pending = await LocalNotifications.getPending();
    const matching = pending.notifications.filter((n) => {
      if (!isManagedNotificationId(n.id)) return false;
      return getNotificationTaskId(n) === taskId;
    });

    if (matching.length > 0) {
      await LocalNotifications.cancel({ notifications: matching.map((n) => ({ id: n.id })) });
    }

    log('canceled all notifications for task', { taskId, count: matching.length });
  } catch { /* ignore */ }
}

export function invalidateSyncFingerprint(): void {
  syncGeneration += 1;
  lastSyncFingerprint = '';
  lastSyncCompletedAt = 0;
}

export function getCurrentSyncFingerprint(): string {
  return lastSyncFingerprint;
}

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

export function setNotificationDebugMode(enabled: boolean): void {
  debugMode = enabled;
  log(`debug mode ${enabled ? 'enabled' : 'disabled'}`);
}

export function isNotificationDebugMode(): boolean {
  return debugMode;
}

export function setupNotificationTapListener(
  onTap: (taskId: string | null) => void,
): (() => void) {
  // Always remove previous listener if any, then register fresh
  if (tapListenerRegistered) {
    log('tap listener already registered — replacing');
  }

  tapListenerRegistered = true;

  const listener = LocalNotifications.addListener('localNotificationActionPerformed', (action) => {
    const taskId = (action.notification?.extra as { taskId?: string } | undefined)?.taskId ?? null;
    log(`notification tapped, taskId=${taskId}`);
    onTap(taskId);
  });

  return () => {
    tapListenerRegistered = false;
    listener.then((l) => l.remove());
  };
}
