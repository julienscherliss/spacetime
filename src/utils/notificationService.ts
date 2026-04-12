/**
 * Centralized notification service for Capacitor iOS local notifications.
 *
 * Architecture:
 *   - Permission flow: check/request only, never triggers scheduling
 *   - Test notification flow: isolated, uses dedicated ID namespace
 *   - Task notification flow: diff-based sync, idempotent, guarded against concurrent runs
 *   - Overdue notification flow: single batched overdue stream (one per minute, not per task)
 *
 * iOS limit: max 64 pending local notifications.
 * We intentionally stay well below that limit to preserve headroom and avoid
 * churn near the cap.
 *
 * OVERDUE THRESHOLD: A task is overdue when current time > task end time
 * (start time + duration). The standard reminder fires before the task STARTS.
 * These are two separate notification families that should never overlap.
 *
 * OVERDUE HEARTBEAT: Instead of pre-scheduling many future overdue notifications,
 * we maintain at most ONE pending overdue heartbeat notification at a time,
 * scheduled ~60s in the future. Each sync re-evaluates overdue state and either
 * preserves, replaces, or cancels the heartbeat. This eliminates stale overdue
 * queues and "scheduled in the past" errors.
 *
 * DETERMINISTIC IDS: Every notification ID is deterministic based on taskId +
 * type + fire-minute. This ensures:
 *   - Stable IDs across syncs (no cancel/recreate churn)
 *   - Moved tasks get new IDs (old schedule auto-canceled via diff)
 *   - No duplicates for the same task/minute/type
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
const RESERVED_URGENT_SLOTS = 25;

const REMINDER_ID_OFFSET = 1_000_000;
const OVERDUE_ID_OFFSET = 2_000_000;

/** Single fixed ID for the overdue heartbeat notification */
const OVERDUE_HEARTBEAT_ID = OVERDUE_ID_OFFSET + 999_999;
const OVERDUE_HEARTBEAT_DELAY_MS = 60_000;
const SYNC_COALESCE_MS = 12_000;

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

/**
 * Deterministic hash → numeric ID within a range.
 * Same input string always produces the same output.
 */
function deterministicId(key: string, offset: number): number {
  let hash = 0;
  for (let i = 0; i < key.length; i++) {
    hash = ((hash << 5) - hash + key.charCodeAt(i)) | 0;
  }
  return offset + (Math.abs(hash) % 1_000_000);
}

/**
 * Deterministic reminder notification ID based on taskId + fire minute.
 * When a task moves, the fire minute changes → different ID → old one gets
 * canceled via diff, new one gets scheduled.
 */
function reminderNotificationId(taskId: string, absoluteMinute: number): number {
  return deterministicId(`${taskId}:reminder:${absoluteMinute}`, REMINDER_ID_OFFSET);
}

// Overdue heartbeat uses a single fixed ID — no per-minute or per-task IDs

function isReminderNotificationId(id: number): boolean {
  return id >= REMINDER_ID_OFFSET && id < REMINDER_ID_OFFSET + 1_000_000;
}

function isOverdueNotificationId(id: number): boolean {
  return id >= OVERDUE_ID_OFFSET && id < OVERDUE_ID_OFFSET + 1_000_000;
}

function isManagedNotificationId(id: number): boolean {
  return isReminderNotificationId(id) || isOverdueNotificationId(id);
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

/** Task START time in ms — used for standard reminders ("starts in 5 min") */
function getTaskStartMs(task: Task): number | null {
  if (!task.time) return null;
  const [h, m] = task.time.split(':').map(Number);
  const dt = new Date(`${task.date}T00:00:00`);
  dt.setHours(h, m, 0, 0);
  return dt.getTime();
}

/** Task END time (= overdue threshold) = start + duration.
 *  If no duration, defaults to 30 min. */
function getTaskDueMs(task: Task): number | null {
  const startMs = getTaskStartMs(task);
  if (startMs === null) return null;
  const durationMin = (task.duration && task.duration > 0) ? task.duration : 30;
  return startMs + durationMin * 60_000;
}

function absoluteMinuteFromMs(ms: number): number {
  return Math.floor(ms / 60_000);
}

function getNotificationTaskId(notification: { extra?: unknown }): string | null {
  const extra = notification.extra as { taskId?: unknown } | undefined;
  return typeof extra?.taskId === 'string' ? extra.taskId : null;
}

function buildFingerprint(tasks: Task[], level: NotificationLevel, persistentOverdue: boolean): string {
  if (level === 'off') return 'off';
  const nowMinute = persistentOverdue ? Math.floor(Date.now() / 60_000) : 0;
  const parts = tasks
    .filter((t) => shouldNotify(t, level) && t.time && !t.completed)
    .map((t) => `${t.id}:${t.date}:${t.time}:${t.duration}:${t.priority}:${t.title}:${t.completed}`)
    .sort();
  return `${level}:po=${persistentOverdue}:m=${nowMinute}:${parts.join('|')}`;
}

interface DesiredNotification {
  title: string;
  body: string;
  fireAt: Date;
  taskId: string;
  type: 'reminder' | 'overdue';
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
  const urgentThresholdMs = now + 10 * 60_000;
  const urgentCandidates: { id: number; data: DesiredNotification }[] = [];
  const futureCandidates: { id: number; data: DesiredNotification }[] = [];
  const seenSlots = new Set<string>();

  // Next future minute — guarantees all scheduled slots are strictly in the future
  const nextFutureMinuteMs = (Math.floor(now / 60_000) + 1) * 60_000;

  // ── Collect overdue eligible tasks ──
  const overdueTasks: Task[] = [];

  // Today string for date filtering
  const todayStr = new Date(now).toISOString().slice(0, 10);

  for (const task of tasks) {
    if (!shouldNotify(task, level)) continue;
    if (!task.time || task.completed) continue;
    // Filter out archived, waiting room, and non-today tasks
    if (task.archivedAt) continue;
    if (task.inWaitingRoom) continue;

    const taskStartMs = getTaskStartMs(task);
    const taskDueMs = getTaskDueMs(task);
    if (taskStartMs === null || taskDueMs === null) continue;

    const isOverdue = now > taskDueMs;

    if (isOverdue && persistentOverdue) {
      // Only consider today's tasks as overdue-eligible
      if (task.date === todayStr) {
        overdueTasks.push(task);
      }
      // Skip standard reminder for overdue tasks either way
      continue;
    }

    // ── FAMILY A: Standard reminder (fires before task START) ──
    const reminderAtMs = taskStartMs - LEAD_MINUTES * 60_000;
    if (reminderAtMs > now) {
      const absoluteMinute = absoluteMinuteFromMs(reminderAtMs);
      const dedupKey = `reminder:${task.id}:${absoluteMinute}`;
      if (seenSlots.has(dedupKey)) continue;
      seenSlots.add(dedupKey);

      const isUrgent = reminderAtMs <= urgentThresholdMs;
      const nId = reminderNotificationId(task.id, absoluteMinute);
      const candidate = {
        id: nId,
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

  // ── FAMILY B: Batched overdue stream ──
  let overdueCandidateCount = 0;
  if (overdueTasks.length > 0 && persistentOverdue) {
    // Build summary title
    const sortedOverdue = [...overdueTasks].sort((a, b) => (a.priority as number) - (b.priority as number)).reverse();
    const firstName = sortedOverdue[0].title;
    const count = sortedOverdue.length;
    const summaryTitle = count === 1
      ? `${firstName} is overdue`
      : `${firstName} and ${count - 1} more overdue`;
    const summaryBody = count === 1
      ? `Was scheduled for ${sortedOverdue[0].time}`
      : sortedOverdue.map(t => t.title).join(', ');
    const overdueTaskIds = sortedOverdue.map(t => t.id).join(',');

    log('overdue batch eligible tasks', {
      count,
      taskIds: sortedOverdue.map(t => t.id),
      titles: sortedOverdue.map(t => t.title),
    });

    const availableSlots = Math.min(OVERDUE_WINDOW_MINUTES, MAX_OVERDUE_TOTAL);

    for (let i = 0; i < availableSlots; i++) {
      const fireTimeMs = nextFutureMinuteMs + i * 60_000;

      const absoluteMinute = absoluteMinuteFromMs(fireTimeMs);
      const nId = overdueBatchNotificationId(absoluteMinute);

      urgentCandidates.push({
        id: nId,
        data: {
          title: `OVERDUE — ${summaryTitle}`,
          body: summaryBody,
          fireAt: new Date(fireTimeMs),
          taskId: overdueTaskIds,
          type: 'overdue',
          isUrgent: true,
        },
      });
      overdueCandidateCount++;
    }
  }

  urgentCandidates.sort((a, b) => a.data.fireAt.getTime() - b.data.fireAt.getTime());
  futureCandidates.sort((a, b) => a.data.fireAt.getTime() - b.data.fireAt.getTime());

  const desired = new Map<number, DesiredNotification>();

  for (const candidate of urgentCandidates) {
    if (desired.size >= MAX_TASK_NOTIFICATIONS) break;
    desired.set(candidate.id, candidate.data);
  }

  const urgentCount = desired.size;
  let evictedFutureReminders = 0;

  for (const candidate of futureCandidates) {
    if (desired.size >= MAX_TASK_NOTIFICATIONS) {
      evictedFutureReminders++;
      continue;
    }
    desired.set(candidate.id, candidate.data);
  }

  const overdueKeptCount = [...desired.values()].filter((item) => item.type === 'overdue').length;
  const skippedDueToCap = Math.max(0, urgentCandidates.length + futureCandidates.length - desired.size);
  const overdueSkippedDueToCap = Math.max(0, overdueCandidateCount - overdueKeptCount);

  log('queue allocation', {
    reservedUrgentSlots: RESERVED_URGENT_SLOTS,
    urgentSlots: urgentCount,
    futureSlots: desired.size - urgentCount,
    totalDesired: desired.size,
    cap: MAX_TASK_NOTIFICATIONS,
    evictedFuture: evictedFutureReminders,
    overdueKept: overdueKeptCount,
    overdueSkipped: overdueSkippedDueToCap,
    overdueBatchMode: true,
    overdueEligibleTasks: overdueTasks.length,
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

  if (!force && fp === lastSyncFingerprint) {
    logDebug('sync skipped — fingerprint unchanged');
    return { scheduled: 0, canceled: 0, unchanged: 0, skipped: true, reason: 'unchanged' };
  }

  if (!force && fp === lastSyncFingerprint && now - lastSyncCompletedAt < SYNC_COALESCE_MS) {
    logDebug('sync skipped — fingerprint unchanged and recent');
    return { scheduled: 0, canceled: 0, unchanged: 0, skipped: true, reason: 'unchanged' };
  }

  if (syncInFlight) {
    queuedSyncRequest = { tasks, level, force, persistentOverdue };
    log('sync queued', { reason: 'sync already in flight' });
    return { scheduled: 0, canceled: 0, unchanged: 0, skipped: true, reason: 'queued' };
  }

  syncInFlight = true;
  const startGeneration = syncGeneration;

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

    if (startGeneration !== syncGeneration) {
      log('sync aborted as stale before compute', { startGeneration, currentGeneration: syncGeneration });
      return { scheduled: 0, canceled: 0, unchanged: 0, skipped: true, reason: 'stale' };
    }

    const desiredResult = computeDesired(tasks, level, persistentOverdue);
    const desired = desiredResult.desired;
    const desiredIds = new Set(desired.keys());
    const currentIds = new Set(managedPending.map((n) => n.id));

    // DIFF: cancel only notifications NOT in desired set
    const toCancel = managedPending
      .filter((n) => !desiredIds.has(n.id))
      .map((n) => n.id);

    // DIFF: schedule only notifications NOT already pending
    const toSchedule = [...desiredIds].filter((id) => !currentIds.has(id));
    const unchanged = desired.size - toSchedule.length;

    if (debugMode) {
      // Log preserved vs new vs canceled for overdue specifically
      const overduePreserved = [...desiredIds].filter(id => isOverdueNotificationId(id) && currentIds.has(id)).length;
      const overdueNew = toSchedule.filter(id => isOverdueNotificationId(id)).length;
      const overdueCanceled = toCancel.filter(id => isOverdueNotificationId(id)).length;
      log('overdue diff detail', { preserved: overduePreserved, added: overdueNew, canceled: overdueCanceled });

      // Log per-task reconciliation
      const taskMap = new Map(tasks.map(t => [t.id, t]));
      for (const cancelId of toCancel) {
        const pending_n = managedPending.find(n => n.id === cancelId);
        const tId = pending_n ? getNotificationTaskId(pending_n) : null;
        const task = tId ? taskMap.get(tId) : null;
        logDebug('canceled obsolete notification', {
          id: cancelId,
          taskId: tId,
          taskTitle: task?.title ?? 'unknown',
          isOverdue: isOverdueNotificationId(cancelId),
        });
      }
      for (const schedId of toSchedule) {
        const item = desired.get(schedId)!;
        logDebug('scheduled missing notification', {
          id: schedId,
          taskId: item.taskId,
          type: item.type,
          fireAt: item.fireAt.toISOString(),
        });
      }

      // Duplicate detection
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

    if (startGeneration !== syncGeneration) {
      log('sync aborted as stale before cancel/schedule', { startGeneration, currentGeneration: syncGeneration });
      return { scheduled: 0, canceled: 0, unchanged: 0, skipped: true, reason: 'stale' };
    }

    if (toCancel.length > 0) {
      await LocalNotifications.cancel({
        notifications: toCancel.map((id) => ({ id })),
      });
    }

    if (startGeneration !== syncGeneration) {
      log('sync aborted as stale after cancel', { startGeneration, currentGeneration: syncGeneration });
      return { scheduled: 0, canceled: toCancel.length, unchanged: 0, skipped: true, reason: 'stale' };
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
          extra: { taskId: item.taskId, type: item.type },
        };
      })
      .filter((item, index, arr) => arr.findIndex((candidate) => candidate.id === item.id) === index)
      // Final safety: never schedule in the past
      .filter((item) => {
        const fireMs = item.schedule.at.getTime();
        if (fireMs <= scheduleNow) {
          log('skipped past-time notification', { id: item.id, fireAt: item.schedule.at.toISOString(), now: new Date(scheduleNow).toISOString() });
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

    const overdueCanceled = toCancel.filter((id) => isOverdueNotificationId(id)).length;
    const overdueScheduled = notificationsToSchedule.filter((item) => isOverdueNotificationId(item.id)).length;

    lastSyncFingerprint = fp;
    lastSyncCompletedAt = Date.now();

    log('sync result', {
      scheduled: notificationsToSchedule.length,
      canceled: toCancel.length,
      unchanged,
      overdueScheduled,
      overdueCanceled,
      queueAfter: desired.size,
      evictedFuture: desiredResult.evictedFutureReminders,
      reservedUrgentSlots: RESERVED_URGENT_SLOTS,
      cap: MAX_TASK_NOTIFICATIONS,
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
        void syncTaskNotifications(
          nextRequest.tasks,
          nextRequest.level,
          true,
          nextRequest.persistentOverdue,
        );
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

    // Match by extra.taskId — catches both reminder and overdue IDs
    const matching = pending.notifications.filter((notification) => {
      if (!isManagedNotificationId(notification.id)) return false;
      if (getNotificationTaskId(notification) === taskId) return true;
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
      syncGeneration,
    });
  } catch {
    // ignore
  }
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
