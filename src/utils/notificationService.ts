/**
 * Centralized notification service for Capacitor iOS local notifications.
 *
 * Architecture:
 *   - Permission flow: check/request only, never triggers scheduling
 *   - Test notification flow: isolated, uses dedicated ID namespace
 *   - Task notification flow: diff-based sync, idempotent, guarded against concurrent runs
 *   - Overdue notification flow: stable per-minute slots with a bounded sliding window
 *
 * iOS limit: max 64 pending local notifications.
 * We intentionally stay well below that limit to preserve headroom and avoid
 * churn near the cap.
 *
 * OVERDUE THRESHOLD: A task is overdue when current time > task START + DURATION.
 * If no duration is set, it's overdue once the start time passes.
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

const SAFE_PENDING_CAP = 50;
const MAX_TASK_NOTIFICATIONS = SAFE_PENDING_CAP;

/** Reserve this many slots exclusively for overdue + imminent (firing within 10 min) */
const RESERVED_URGENT_SLOTS = 25;

const TASK_ID_OFFSET = 1_000_000;
const OVERDUE_ID_OFFSET = 2_000_000;

const OVERDUE_WINDOW_MINUTES = 10;
const MAX_OVERDUE_PER_TASK = 10;
const MAX_OVERDUE_TOTAL = 20;
const SYNC_COALESCE_MS = 12_000;

let syncInFlight = false;
let lastSyncFingerprint = '';
let lastSyncCompletedAt = 0;
let debugMode = false;
let cachedPermission: NotificationPermissionStatus | null = null;
/** Guard: only one tap listener may be registered */
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
  try {
    return JSON.stringify(error);
  } catch {
    return String(error);
  }
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

function isTaskNotificationId(id: number): boolean {
  return id >= TASK_ID_OFFSET && id < TASK_ID_OFFSET + 1_000_000;
}

function isOverdueNotificationId(id: number): boolean {
  return id >= OVERDUE_ID_OFFSET && id < OVERDUE_ID_OFFSET + 1_000_000;
}

function isManagedNotificationId(id: number): boolean {
  return isTaskNotificationId(id) || isOverdueNotificationId(id);
}

function taskNotificationId(taskId: string): number {
  let hash = 0;
  for (let i = 0; i < taskId.length; i++) {
    hash = ((hash << 5) - hash + taskId.charCodeAt(i)) | 0;
  }
  return TASK_ID_OFFSET + (Math.abs(hash) % 1_000_000);
}

/**
 * Stable numeric ID derived from the logical slot key:
 * task:{taskId}:overdue:{absoluteMinuteSinceEpoch}
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

function getTaskStartMs(task: Task): number | null {
  if (!task.time) return null;
  const [h, m] = task.time.split(':').map(Number);
  const dt = new Date(`${task.date}T00:00:00`);
  dt.setHours(h, m, 0, 0);
  return dt.getTime();
}

/**
 * Get the task END time: start + duration.
 * If no duration, falls back to start time (task is overdue once start passes).
 */
function getTaskEndMs(task: Task): number | null {
  const startMs = getTaskStartMs(task);
  if (startMs === null) return null;
  const durationMs = (task.duration ?? 0) * 60_000;
  return startMs + durationMs;
}

function nextMinuteSlotStart(nowMs: number): number {
  return Math.floor(nowMs / 60_000) * 60_000 + 60_000;
}

function absoluteMinuteFromMs(ms: number): number {
  return Math.floor(ms / 60_000);
}

function buildTaskLookup(tasks: Task[]): Map<string, Task> {
  return new Map(tasks.map((task) => [task.id, task]));
}

function getNotificationTaskId(notification: { extra?: unknown }): string | null {
  const extra = notification.extra as { taskId?: unknown } | undefined;
  return typeof extra?.taskId === 'string' ? extra.taskId : null;
}

function getOverdueRemovalReason(task: Task | undefined, nowMs: number): string {
  if (!task) return 'task deleted';
  if (task.completed) return 'task completed';
  const endMs = getTaskEndMs(task);
  if (endMs === null) return 'task unscheduled';
  if (endMs > nowMs) return 'task not yet overdue (end time in future)';
  return 'slot outside desired overdue window';
}

/**
 * Build a fingerprint of notification-relevant task data for change detection.
 * Includes duration since overdue threshold depends on it.
 */
function buildFingerprint(tasks: Task[], level: NotificationLevel, persistentOverdue: boolean): string {
  if (level === 'off') return 'off';
  const nowMinute = persistentOverdue ? Math.floor(Date.now() / 60_000) : 0;
  const parts = tasks
    .filter((t) => shouldNotify(t, level) && t.time && !t.completed)
    .map((t) => `${t.id}:${t.date}:${t.time}:${t.priority}:${t.title}:${t.completed}:${t.duration ?? 0}`)
    .sort();
  return `${level}:po=${persistentOverdue}:m=${nowMinute}:${parts.join('|')}`;
}

interface DesiredNotification {
  title: string;
  body: string;
  fireAt: Date;
  taskId: string;
  type: 'reminder' | 'overdue';
  /** true if fires within 10 min of now */
  isUrgent: boolean;
}

interface DesiredComputation {
  desired: Map<number, DesiredNotification>;
  candidateCount: number;
  keptCount: number;
  overdueCandidateCount: number;
  overdueKeptCount: number;
  skippedDueToCap: number;
  overdueSkippedDueToCap: number;
  evictedFutureReminders: number;
}

function computeDesired(
  tasks: Task[],
  level: NotificationLevel,
  persistentOverdue: boolean,
): DesiredComputation {
  const empty: DesiredComputation = {
    desired: new Map(),
    candidateCount: 0,
    keptCount: 0,
    overdueCandidateCount: 0,
    overdueKeptCount: 0,
    skippedDueToCap: 0,
    overdueSkippedDueToCap: 0,
    evictedFutureReminders: 0,
  };

  if (level === 'off') return empty;

  const now = Date.now();
  const urgentThresholdMs = now + 10 * 60_000; // within 10 min = urgent

  // Collect candidates in two buckets: urgent (overdue + imminent) and future
  const urgentCandidates: { id: number; data: DesiredNotification }[] = [];
  const futureCandidates: { id: number; data: DesiredNotification }[] = [];
  let totalOverdueSlots = 0;
  let overdueCandidateCount = 0;

  /** Track which tasks already have overdue notifications to avoid duplicate reminders */
  const tasksWithOverdue = new Set<string>();

  for (const task of tasks) {
    if (!shouldNotify(task, level)) continue;
    if (!task.time || task.completed) continue;

    const taskStartMs = getTaskStartMs(task);
    if (taskStartMs === null) continue;

    const taskEndMs = getTaskEndMs(task)!; // always non-null when startMs is non-null

    // ── Overdue notifications ──
    // Overdue = current time > task END time (start + duration)
    if (persistentOverdue && taskEndMs <= now) {
      tasksWithOverdue.add(task.id);

      const availableSlots = Math.min(
        OVERDUE_WINDOW_MINUTES,
        MAX_OVERDUE_PER_TASK,
        Math.max(0, MAX_OVERDUE_TOTAL - totalOverdueSlots),
      );

      if (availableSlots <= 0) {
        logDebug('overdue task skipped due to cap', { title: task.title, taskId: task.id });
        continue;
      }

      const windowStartMs = nextMinuteSlotStart(now);

      for (let i = 0; i < availableSlots; i++) {
        const fireTimeMs = windowStartMs + i * 60_000;
        const absoluteMinute = absoluteMinuteFromMs(fireTimeMs);
        const overdueMinutesAtFire = Math.max(1, Math.floor((fireTimeMs - taskEndMs) / 60_000));

        const candidate = {
          id: overdueNotificationId(task.id, absoluteMinute),
          data: {
            title: `OVERDUE — ${task.title}`,
            body: `${overdueMinutesAtFire} min overdue · was ${task.time}`,
            fireAt: new Date(fireTimeMs),
            taskId: task.id,
            type: 'overdue' as const,
            isUrgent: true, // overdue is always urgent
          },
        };

        urgentCandidates.push(candidate);
      }

      totalOverdueSlots += availableSlots;
      overdueCandidateCount += availableSlots;
      continue; // Don't also schedule a reminder for an already-overdue task
    }

    // ── Standard 5-min-before reminder ──
    // Only schedule if task is NOT already overdue
    const reminderAtMs = taskStartMs - LEAD_MINUTES * 60_000;
    if (reminderAtMs > now) {
      const isUrgent = reminderAtMs <= urgentThresholdMs;
      const candidate = {
        id: taskNotificationId(task.id),
        data: {
          title: `${priorityLabel(task.priority)} — ${task.title}`,
          body: `Starts in ${LEAD_MINUTES} min · ${task.time}`,
          fireAt: new Date(reminderAtMs),
          taskId: task.id,
          type: 'reminder' as const,
          isUrgent,
        },
      };

      if (isUrgent) {
        urgentCandidates.push(candidate);
      } else {
        futureCandidates.push(candidate);
      }
    }
  }

  // ── Priority-based queue packing ──
  // 1. Urgent candidates get first priority (up to RESERVED_URGENT_SLOTS)
  // 2. Remaining slots go to future reminders
  // 3. If urgent exceeds reserved slots, they still get priority over future

  // Sort urgent by fire time
  urgentCandidates.sort((a, b) => a.data.fireAt.getTime() - b.data.fireAt.getTime());
  // Sort future by fire time
  futureCandidates.sort((a, b) => a.data.fireAt.getTime() - b.data.fireAt.getTime());

  const desired = new Map<number, DesiredNotification>();

  // Add all urgent first
  for (const c of urgentCandidates) {
    if (desired.size >= MAX_TASK_NOTIFICATIONS) break;
    desired.set(c.id, c.data);
  }

  const urgentCount = desired.size;

  // Fill remaining with future reminders
  let evictedFutureReminders = 0;
  for (const c of futureCandidates) {
    if (desired.size >= MAX_TASK_NOTIFICATIONS) {
      evictedFutureReminders++;
      continue;
    }
    desired.set(c.id, c.data);
  }

  const overdueKeptCount = [...desired.values()].filter((d) => d.type === 'overdue').length;
  const skippedDueToCap = Math.max(0, urgentCandidates.length + futureCandidates.length - desired.size);
  const overdueSkippedDueToCap = Math.max(0, overdueCandidateCount - overdueKeptCount);

  log('queue allocation', {
    urgentSlots: urgentCount,
    futureSlots: desired.size - urgentCount,
    totalDesired: desired.size,
    cap: MAX_TASK_NOTIFICATIONS,
    evictedFuture: evictedFutureReminders,
    overdueKept: overdueKeptCount,
    overdueSkipped: overdueSkippedDueToCap,
  });

  return {
    desired,
    candidateCount: urgentCandidates.length + futureCandidates.length,
    keptCount: desired.size,
    overdueCandidateCount,
    overdueKeptCount,
    skippedDueToCap,
    overdueSkippedDueToCap,
    evictedFutureReminders,
  };
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
  } catch {
    // ignore
  }

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
  } catch {
    // ignore
  }
}

export async function syncTaskNotifications(
  tasks: Task[],
  level: NotificationLevel,
  force = false,
  persistentOverdue = false,
): Promise<SyncResult> {
  if (!isPluginReady()) {
    return { scheduled: 0, canceled: 0, unchanged: 0, skipped: true, reason: 'plugin not ready' };
  }

  const perm = cachedPermission ?? await getPermissionStatus();
  if (perm !== 'granted' && level !== 'off') {
    return { scheduled: 0, canceled: 0, unchanged: 0, skipped: true, reason: `permission ${perm}` };
  }

  const now = Date.now();
  const fp = buildFingerprint(tasks, level, persistentOverdue);

  // Skip if fingerprint unchanged (unless forced)
  if (!force && fp === lastSyncFingerprint) {
    logDebug('sync skipped — fingerprint unchanged');
    return { scheduled: 0, canceled: 0, unchanged: 0, skipped: true, reason: 'unchanged' };
  }

  // Coalesce rapid identical syncs
  if (!force && fp === lastSyncFingerprint && now - lastSyncCompletedAt < SYNC_COALESCE_MS) {
    log('sync coalesced', { reason: 'recent identical sync', msSinceLastSync: now - lastSyncCompletedAt });
    return { scheduled: 0, canceled: 0, unchanged: 0, skipped: true, reason: 'coalesced' };
  }

  // Prevent concurrent syncs
  if (syncInFlight) {
    log('sync coalesced', { reason: 'sync already in flight' });
    return { scheduled: 0, canceled: 0, unchanged: 0, skipped: true, reason: 'in flight' };
  }

  syncInFlight = true;

  try {
    const pending = await LocalNotifications.getPending();
    const managedPending = pending.notifications.filter((n) => isManagedNotificationId(n.id));

    log('sync start', {
      level,
      taskCount: tasks.length,
      persistentOverdue,
      queueBefore: managedPending.length,
      cap: MAX_TASK_NOTIFICATIONS,
    });

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

    const desiredResult = computeDesired(tasks, level, persistentOverdue);
    const desired = desiredResult.desired;
    const desiredIds = new Set(desired.keys());
    const currentIds = new Set(managedPending.map((n) => n.id));

    // Cancel managed notifications that are no longer desired
    const toCancel = managedPending
      .filter((n) => !desiredIds.has(n.id))
      .map((n) => n.id);

    // Schedule only new desired notifications not already pending
    const toSchedule = [...desiredIds].filter((id) => !currentIds.has(id));
    const unchanged = desired.size - toSchedule.length;

    // ── Duplicate detection diagnostic ──
    if (debugMode) {
      // Check for same-task notifications firing within the same minute
      const byTaskMinute = new Map<string, { id: number; type: string; at: string }[]>();
      for (const [id, item] of desired.entries()) {
        const minuteKey = `${item.taskId}:${absoluteMinuteFromMs(item.fireAt.getTime())}`;
        const list = byTaskMinute.get(minuteKey) ?? [];
        list.push({ id, type: item.type, at: item.fireAt.toISOString() });
        byTaskMinute.set(minuteKey, list);
      }
      for (const [key, items] of byTaskMinute.entries()) {
        if (items.length > 1) {
          log('DUPLICATE DETECTION — same task/minute', { key, items });
        }
      }
    }

    if (toCancel.length > 0) {
      await LocalNotifications.cancel({
        notifications: toCancel.map((id) => ({ id })),
      });
    }

    const notificationsToSchedule = toSchedule.map((id) => {
      const item = desired.get(id)!;
      return {
        id,
        title: item.title,
        body: item.body,
        schedule: { at: item.fireAt, allowWhileIdle: true },
        sound: 'default' as string,
        extra: { taskId: item.taskId, type: item.type },
      };
    });

    if (notificationsToSchedule.length > 0) {
      for (let i = 0; i < notificationsToSchedule.length; i += 25) {
        await LocalNotifications.schedule({
          notifications: notificationsToSchedule.slice(i, i + 25),
        });
      }
    }

    const overdueCanceled = toCancel.filter((id) => isOverdueNotificationId(id)).length;
    const overdueScheduled = toSchedule.filter((id) => isOverdueNotificationId(id)).length;

    lastSyncFingerprint = fp;
    lastSyncCompletedAt = Date.now();

    log('sync result', {
      scheduled: toSchedule.length,
      canceled: toCancel.length,
      unchanged,
      overdueScheduled,
      overdueCanceled,
      queueAfter: desired.size,
      evictedFuture: desiredResult.evictedFutureReminders,
      cap: MAX_TASK_NOTIFICATIONS,
    });

    return { scheduled: toSchedule.length, canceled: toCancel.length, unchanged, skipped: false };
  } catch (error) {
    console.error('[notifications] sync error', error);
    return { scheduled: 0, canceled: 0, unchanged: 0, skipped: true, reason: formatError(error) };
  } finally {
    syncInFlight = false;
  }
}

export async function cancelNotificationsForTask(taskId: string): Promise<void> {
  if (!isPluginReady()) return;

  try {
    const pending = await LocalNotifications.getPending();

    // Build a set of all possible overdue IDs for this task in a wide window
    const nowMinute = Math.floor(Date.now() / 60_000);
    const possibleOverdueIds = new Set<number>();
    for (let m = nowMinute - 1440; m <= nowMinute + 30; m++) {
      possibleOverdueIds.add(overdueNotificationId(taskId, m));
    }

    const matching = pending.notifications.filter((notification) => {
      if (!isManagedNotificationId(notification.id)) return false;
      if (notification.id === taskNotificationId(taskId)) return true;
      if (getNotificationTaskId(notification) === taskId) return true;
      if (possibleOverdueIds.has(notification.id)) return true;
      return false;
    });

    if (matching.length > 0) {
      await LocalNotifications.cancel({
        notifications: matching.map((notification) => ({ id: notification.id })),
      });
    }

    log('canceled all notifications for task', {
      taskId,
      count: matching.length,
      overdueIdsChecked: possibleOverdueIds.size,
    });
  } catch {
    // ignore
  }

  lastSyncFingerprint = '';
  lastSyncCompletedAt = 0;
}

export function invalidateSyncFingerprint(): void {
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

/**
 * Register the notification tap listener ONCE. Subsequent calls are no-ops.
 * Returns a cleanup function on first registration, undefined on subsequent calls.
 */
export function setupNotificationTapListener(
  onTap: (taskId: string | null) => void,
): (() => void) | undefined {
  if (!Capacitor.isNativePlatform()) return undefined;

  if (tapListenerRegistered) {
    log('tap listener already registered — skipping duplicate');
    return undefined;
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
