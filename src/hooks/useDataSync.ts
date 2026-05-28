import { useEffect, useRef, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useTaskStore, Task, Priority, TaskType } from '@/store/taskStore';
import { useLibraryStore, LibraryTask, CategoryDef } from '@/store/libraryStore';
import { isNativePlatform } from '@/utils/nativePlatform';
import { toast } from 'sonner';
import type { User } from '@supabase/supabase-js';

type SyncTable = 'tasks' | 'library_items' | 'library_categories';

const RELOAD_DEBOUNCE_MS = 400;
const RELOAD_RETRY_MS = 600;
const TASK_SELF_ECHO_TTL_MS = 2000;

function syncLog(message: string, details?: Record<string, unknown>) {
  if (details) {
    console.log(`[Sync] ${message}`, details);
    return;
  }
  console.log(`[Sync] ${message}`);
}

function currentPlatform() {
  return isNativePlatform() ? 'native' : 'web';
}

// ─── Converters ────────────────────────────────────────

function rowToTask(row: any): Task {
  return {
    id: row.id,
    title: row.title,
    category: row.category ?? undefined,
    description: row.description ?? undefined,
    subtasks: row.subtasks ?? undefined,
    type: (row.type || 'one-time') as TaskType,
    priority: (row.priority ?? 0) as Priority,
    originalPriority: (row.original_priority ?? 0) as Priority,
    date: row.date,
    time: row.time ?? undefined,
    duration: row.duration ?? undefined,
    completed: row.completed ?? false,
    createdAt: row.created_at,
    moveCount: row.move_count ?? 0,
    recurrence: row.recurrence ?? undefined,
    recurrenceParentId: row.recurrence_parent_id ?? undefined,
    isRecurrenceInstance: row.is_recurrence_instance ?? false,
    isRoutine: row.is_routine ?? undefined,
    linked: row.linked ?? false,
    seriesId: row.series_id ?? undefined,
    linkedGroupId: row.linked_group_id ?? undefined,
    detachedFromSeries: row.detached_from_series ?? false,
    inWaitingRoom: row.in_waiting_room ?? false,
    waitingRoomCount: row.waiting_room_count ?? 0,
    dueDate: row.due_date ?? undefined,
    archivedAt: row.archived_at ?? undefined,
    archiveReason: row.archive_reason ?? undefined,
    attachments: row.attachments ?? [],
    groupId: row.group_id ?? undefined,
    preferredDuration: row.preferred_duration ?? undefined,
    groupOrder: row.group_order ?? undefined,
  };
}

export function taskToRow(task: Task, userId: string) {
  return {
    id: task.id,
    user_id: userId,
    title: task.title,
    category: task.category ?? null,
    description: task.description ?? null,
    subtasks: task.subtasks ?? [],
    type: task.type,
    priority: task.priority,
    original_priority: task.originalPriority,
    date: task.date,
    time: task.time ?? null,
    duration: task.duration ?? null,
    completed: task.completed,
    move_count: task.moveCount,
    recurrence: task.recurrence ?? null,
    recurrence_parent_id: task.recurrenceParentId ?? null,
    is_recurrence_instance: task.isRecurrenceInstance ?? false,
    is_routine: task.isRoutine ?? null,
    linked: task.linked ?? false,
    series_id: task.seriesId ?? null,
    linked_group_id: task.linkedGroupId ?? null,
    detached_from_series: task.detachedFromSeries ?? false,
    in_waiting_room: task.inWaitingRoom ?? false,
    waiting_room_count: task.waitingRoomCount ?? 0,
    due_date: task.dueDate ?? null,
    archived_at: task.archivedAt ?? null,
    archive_reason: task.archiveReason ?? null,
    attachments: task.attachments ?? [],
    group_id: task.groupId ?? null,
    preferred_duration: task.preferredDuration ?? null,
    group_order: task.groupOrder ?? null,
  } as any; // group_* columns exist in DB but the auto-generated types haven't regenerated yet
}

function rowToLibraryItem(row: any): LibraryTask {
  return {
    id: row.id,
    title: row.title,
    note: row.note ?? '',
    category: row.category === 'uncategorized' ? '' : (row.category ?? ''),
    defaultDuration: row.default_duration ?? 30,
    createdAt: row.created_at,
    isUrgent: row.is_urgent ?? false,
    isImportant: row.is_important ?? false,
    dueDate: row.due_date ?? null,
    subtasks: row.subtasks ?? [],
    attachments: row.attachments ?? [],
    completed: row.completed ?? false,
    completedAt: row.completed_at ?? null,
    deletedAt: row.deleted_at ?? null,
  };
}

function libraryItemToRow(item: LibraryTask, userId: string) {
  return {
    id: item.id,
    user_id: userId,
    title: item.title,
    note: item.note || '',
    category: item.category,
    default_duration: item.defaultDuration,
    is_urgent: item.isUrgent ?? false,
    is_important: item.isImportant ?? false,
    due_date: item.dueDate ?? null,
    subtasks: item.subtasks ?? [],
    attachments: item.attachments ?? [],
    completed: item.completed ?? false,
    completed_at: item.completedAt ?? null,
    deleted_at: item.deletedAt ?? null,
  };
}

function rowToCategory(row: any): CategoryDef {
  return { value: row.value, label: row.label, archived: row.archived ?? false };
}

function categoryToRow(cat: CategoryDef, userId: string) {
  return { user_id: userId, value: cat.value, label: cat.label, archived: cat.archived ?? false };
}

// ─── Validation ────────────────────────────────────────

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function isValidUUID(id: string): boolean {
  return UUID_RE.test(id);
}

// ─── Debounce timers ───────────────────────────────────

let taskSaveTimeout: ReturnType<typeof setTimeout> | null = null;
let libSaveTimeout: ReturnType<typeof setTimeout> | null = null;
let catSaveTimeout: ReturnType<typeof setTimeout> | null = null;
let taskSaveInFlight: Promise<boolean> | null = null;
let libSaveInFlight: Promise<boolean> | null = null;
let catSaveInFlight: Promise<boolean> | null = null;
let ignoreTaskReloadUntil = 0;
let ignoreLibraryReloadUntil = 0;
let ignoreCategoryReloadUntil = 0;
let pendingTaskSelfEchoIds = new Map<string, number>();

// ─── Snapshot for diffing ──────────────────────────────

let lastSyncedTaskSnapshot: string = '';
let lastSyncedLibSnapshot: string = '';
let lastSyncedCatSnapshot: string = '';

// ─── Sync status guard ─────────────────────────────────
//
// Saves are only safe to run once initial load has completed AND we are not
// in the middle of tearing down the session (sign-out / account switch).
// `signing_out` is set by useAuth.signOut BEFORE it mutates local stores so
// that the resulting transient empty state cannot fire a destructive save.

type SyncStatus = 'idle' | 'loaded' | 'signing_out';
let syncStatus: SyncStatus = 'idle';

export function markSigningOut() {
  syncStatus = 'signing_out';
  // Drop any queued debounced saves so the empty-state caused by sign-out
  // cleanup cannot reach the database.
  if (taskSaveTimeout) { clearTimeout(taskSaveTimeout); taskSaveTimeout = null; }
  if (libSaveTimeout) { clearTimeout(libSaveTimeout); libSaveTimeout = null; }
  if (catSaveTimeout) { clearTimeout(catSaveTimeout); catSaveTimeout = null; }
}

// Bulk-delete safety threshold. If a single save would remove more than this
// fraction of the previously-synced rows, abort and require the caller to go
// through an explicit bulk-delete path. Tunable, intentionally conservative.
const BULK_DELETE_RATIO = 0.5;
const BULK_DELETE_MIN = 5; // never trip the guard below a handful of rows

function validTaskIds(tasks: Task[]): string[] {
  return tasks.filter((t) => isValidUUID(t.id)).map((t) => t.id);
}

// Projection of every Task field that is actually persisted to the DB.
// Used for both the collection-level snapshot (early-exit when nothing
// changed) and per-row diffing (only upsert rows whose JSON differs).
// MUST stay in sync with `taskToRow` — any field written to the DB must
// appear here, or echo-reload from realtime can re-trigger a save loop.
export function taskSnapshotFields(t: Task) {
  return {
    id: t.id,
    title: t.title,
    category: t.category ?? null,
    description: t.description ?? null,
    subtasks: t.subtasks ?? [],
    type: t.type,
    priority: t.priority,
    originalPriority: t.originalPriority,
    date: t.date,
    time: t.time ?? null,
    duration: t.duration ?? null,
    completed: t.completed,
    moveCount: t.moveCount,
    recurrence: t.recurrence ?? null,
    recurrenceParentId: t.recurrenceParentId ?? null,
    isRecurrenceInstance: t.isRecurrenceInstance ?? false,
    isRoutine: t.isRoutine ?? null,
    linked: t.linked ?? false,
    seriesId: t.seriesId ?? null,
    linkedGroupId: t.linkedGroupId ?? null,
    detachedFromSeries: t.detachedFromSeries ?? false,
    inWaitingRoom: t.inWaitingRoom ?? false,
    waitingRoomCount: t.waitingRoomCount ?? 0,
    dueDate: t.dueDate ?? null,
    archivedAt: t.archivedAt ?? null,
    archiveReason: t.archiveReason ?? null,
    attachments: t.attachments ?? [],
    groupId: t.groupId ?? null,
    preferredDuration: t.preferredDuration ?? null,
    groupOrder: t.groupOrder ?? null,
  };
}

function snapshotTasks(tasks: Task[]): string {
  // Sort by id so the string is stable regardless of in-memory order.
  const projected = tasks
    .filter((t) => isValidUUID(t.id))
    .map(taskSnapshotFields)
    .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  return JSON.stringify(projected);
}

// Build a Map<id, json> from a snapshot string. Used to compute per-row
// diffs so we upsert only the rows that actually changed.
function parseSnapshotById(snap: string): Map<string, string> {
  const out = new Map<string, string>();
  if (!snap) return out;
  try {
    const arr = JSON.parse(snap) as Array<{ id?: string; value?: string }>;
    for (const entry of arr) {
      const key = (entry.id ?? entry.value) as string | undefined;
      if (!key) continue;
      out.set(key, JSON.stringify(entry));
    }
  } catch {
    // Corrupt snapshot — treat as empty so callers fall back to a full upsert.
  }
  return out;
}

// Parsed form of `parseSnapshotById` — keeps the projected fields as-is so
// per-field diffing can compare individual keys without re-parsing JSON.
function parseSnapshotObjectsById(snap: string): Map<string, Record<string, any>> {
  const out = new Map<string, Record<string, any>>();
  if (!snap) return out;
  try {
    const arr = JSON.parse(snap) as Array<Record<string, any>>;
    for (const entry of arr) {
      const key = entry?.id as string | undefined;
      if (!key) continue;
      out.set(key, entry);
    }
  } catch {
    // Corrupt snapshot — caller falls back to treating every task as new.
  }
  return out;
}

// Mapping from the camelCase keys in `taskSnapshotFields` to the snake_case
// DB column names produced by `taskToRow`. MUST stay in sync with both.
// `id` is added separately and is always present in every upsert payload.
export const TASK_KEY_TO_COLUMN: Record<string, string> = {
  title: 'title',
  category: 'category',
  description: 'description',
  subtasks: 'subtasks',
  type: 'type',
  priority: 'priority',
  originalPriority: 'original_priority',
  date: 'date',
  time: 'time',
  duration: 'duration',
  completed: 'completed',
  moveCount: 'move_count',
  recurrence: 'recurrence',
  recurrenceParentId: 'recurrence_parent_id',
  isRecurrenceInstance: 'is_recurrence_instance',
  isRoutine: 'is_routine',
  linked: 'linked',
  seriesId: 'series_id',
  linkedGroupId: 'linked_group_id',
  detachedFromSeries: 'detached_from_series',
  inWaitingRoom: 'in_waiting_room',
  waitingRoomCount: 'waiting_room_count',
  dueDate: 'due_date',
  archivedAt: 'archived_at',
  archiveReason: 'archive_reason',
  attachments: 'attachments',
  groupId: 'group_id',
  preferredDuration: 'preferred_duration',
  groupOrder: 'group_order',
};

// Build a partial DB row containing only the columns whose projected values
// differ between `current` (taskSnapshotFields(task)) and `previous`
// (the same projection from the last synced snapshot). The returned row is
// safe to upsert: PostgREST's ON CONFLICT DO UPDATE only writes the columns
// present in the payload, so omitted columns retain their server value.
//
// Always includes `id` + `user_id` so the upsert can locate / authorize the
// row. Returns null if nothing changed (caller skips this row).
type TaskWrite =
  | { kind: 'new'; row: Record<string, any> }
  | { kind: 'update'; row: Record<string, any> };

// Determine how a task should be persisted:
//  - `new`: no previous snapshot entry → send the FULL row via upsert/insert
//    so Postgres can fill every NOT NULL column (e.g. title).
//  - `update`: previous snapshot exists and the projection changed → send a
//    PARTIAL patch (only the changed columns) via `.update()`. Using update
//    (not upsert) means PostgREST never attempts an insert, so omitting
//    NOT NULL columns is safe and unrelated/protective fields are preserved.
// Returns null if an existing task is unchanged (caller skips it).
function buildTaskWrite(
  task: Task,
  userId: string,
  previous: Record<string, any> | undefined,
): TaskWrite | null {
  // No previous snapshot for this id → treat as a brand-new row and send the
  // full taskToRow payload so INSERT fills every NOT NULL column.
  if (!previous) return { kind: 'new', row: taskToRow(task, userId) };

  const current = taskSnapshotFields(task) as Record<string, any>;
  const patch: Record<string, any> = {};
  let changed = false;
  const fullRow = taskToRow(task, userId) as Record<string, any>;
  for (const key of Object.keys(TASK_KEY_TO_COLUMN)) {
    const a = current[key];
    const b = previous[key];
    // Deep-equal via JSON for the few object/array fields (subtasks,
    // recurrence, attachments). Cheap and matches how the snapshot is built.
    const same =
      a === b ||
      (a !== null && b !== null && typeof a === 'object' && typeof b === 'object'
        ? JSON.stringify(a) === JSON.stringify(b)
        : false);
    if (!same) {
      const col = TASK_KEY_TO_COLUMN[key];
      patch[col] = fullRow[col];
      changed = true;
    }
  }
  return changed ? { kind: 'update', row: patch } : null;
}

function snapshotLib(items: LibraryTask[]): string {
  const projected = items
    .filter((i) => isValidUUID(i.id))
    .slice()
    .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  return JSON.stringify(projected);
}

function snapshotCats(cats: CategoryDef[]): string {
  return JSON.stringify(cats);
}

async function fetchAllRows(table: 'tasks' | 'library_items' | 'library_categories', userId: string) {
  const pageSize = 1000;
  const rows: any[] = [];
  let from = 0;

  while (true) {
    const { data, error } = await supabase
      .from(table)
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: true })
      .range(from, from + pageSize - 1);

    if (error) return { data: null, error };

    const batch = data || [];
    rows.push(...batch);
    if (batch.length < pageSize) break;
    from += pageSize;
  }

  return { data: rows, error: null };
}

// ─── Clear all user-scoped state ───────────────────────

function clearAllUserState() {
  useTaskStore.setState({ tasks: [], editingTaskId: null, focusTaskId: null });
  useLibraryStore.setState({ items: [], categories: [] });
  try {
    localStorage.removeItem('do-task-store');
    localStorage.removeItem('task-storage');
    localStorage.removeItem('do-library-store');
  } catch (_) {}
  if (taskSaveTimeout) { clearTimeout(taskSaveTimeout); taskSaveTimeout = null; }
  if (libSaveTimeout) { clearTimeout(libSaveTimeout); libSaveTimeout = null; }
  if (catSaveTimeout) { clearTimeout(catSaveTimeout); catSaveTimeout = null; }
  lastSyncedTaskSnapshot = '';
  lastSyncedLibSnapshot = '';
  lastSyncedCatSnapshot = '';
  syncStatus = 'idle';
}

// ─── Write-through save functions ──────────────────────

export async function saveTasksNow(userId: string): Promise<boolean> {
  if (taskSaveInFlight) return taskSaveInFlight;
  if (syncStatus === 'signing_out') {
    console.warn('[Sync] Skipping task save — session is signing out.');
    return false;
  }

  const run = async (): Promise<boolean> => {
  const state = useTaskStore.getState();
  const validTasks = state.tasks.filter(t => isValidUUID(t.id));
  const snap = snapshotTasks(state.tasks);
  const previousIds = new Set(
    lastSyncedTaskSnapshot
      ? (JSON.parse(lastSyncedTaskSnapshot) as Array<{ id: string }>).map((task) => task.id)
      : [],
  );

  // Skip if nothing changed
  if (snap === lastSyncedTaskSnapshot) return true;

  try {
    const localIds = new Set(validTaskIds(state.tasks));
    const toDelete = Array.from(previousIds).filter((id) => !localIds.has(id));

    // SAFETY: refuse to push an empty tasks state when the previous synced
    // snapshot was non-trivially populated. Blocks the historical wipe
    // pattern (sign-out / account-switch / failed-load briefly clears the
    // store, debounced save then deletes every row). Small stores can still
    // legitimately go to 0 — those fall through to the bulk-delete check.
    if (validTasks.length === 0 && previousIds.size >= BULK_DELETE_MIN) {
      console.warn('[Sync] Refusing to save empty tasks — likely transient state, not a real wipe.');
      return false;
    }

    // SAFETY: a single save should not delete a large fraction of rows.
    // Genuine bulk deletes go through an explicit per-row deletion path that
    // updates the snapshot incrementally, so this guard does not block them.
    if (
      previousIds.size >= BULK_DELETE_MIN &&
      toDelete.length / previousIds.size >= BULK_DELETE_RATIO
    ) {
      console.warn(
        `[Sync] Refusing bulk task delete (${toDelete.length}/${previousIds.size}) — looks unintentional.`,
      );
      return false;
    }

    // SAFETY: the app no longer hard-deletes user data. Items are archived
    // (archivedAt + archiveReason) instead, so any local-only disappearance
    // is treated as drift, not a delete. The server also enforces this via
    // a trigger that rejects DELETEs from non-service-role callers.
    if (toDelete.length > 0) {
      console.warn('[Sync] Ignoring', toDelete.length, 'tasks missing from local state — hard delete is disabled.');
    }

    // PER-ROW DIFF: upsert only the tasks whose persisted projection has
    // changed since the last successful sync. A 200-task user toggling one
    // task should produce 1 realtime message, not 200.
    if (validTasks.length > 0) {
      // PER-FIELD DIFF: for every task whose projection changed, build a
      // partial row containing ONLY the columns that actually changed
      // (plus id + user_id). This prevents a stale device from clobbering
      // unrelated fields — including protective fields like archived_at,
      // archive_reason, completed, priority, group_order — that another
      // device has updated since this device's snapshot was taken.
      //
      // PostgREST upsert (ON CONFLICT DO UPDATE) only writes the columns
      // present in the payload; omitted columns retain their server value.
      // Brand-new tasks (id not in previous snapshot) still receive the
      // full taskToRow payload via buildTaskPatch so INSERT can fill every
      // NOT NULL column with the correct values.
      const previousObjectsById = parseSnapshotObjectsById(lastSyncedTaskSnapshot);
      const newRows: Record<string, any>[] = [];
      const updates: Array<{ id: string; patch: Record<string, any> }> = [];
      for (const task of validTasks) {
        const write = buildTaskWrite(task, userId, previousObjectsById.get(task.id));
        if (!write) continue;
        if (write.kind === 'new') newRows.push(write.row);
        else updates.push({ id: task.id, patch: write.row });
      }

      // New tasks: full-row upsert so every NOT NULL column is populated.
      if (newRows.length > 0) {
        syncLog('saveTasksNow writing new task rows', {
          platform: currentPlatform(),
          method: 'upsert',
          rowKind: 'new',
          count: newRows.length,
          patchKeys: newRows.map((r) => Object.keys(r)),
        });
        const { error: insertErr } = await supabase.from('tasks').upsert(newRows as any);
        if (insertErr) {
          console.error('[Sync] Failed to save tasks:', {
            method: 'upsert',
            rowKind: 'new',
            count: newRows.length,
            patchKeys: newRows.map((r) => Object.keys(r)),
            error: insertErr,
          });
          toast.error('Failed to save tasks — changes may not persist.');
          return false;
        }
      }

      // Existing tasks: partial UPDATE (never upsert) so omitting NOT NULL
      // columns is safe and unrelated/protective fields keep their server value.
      for (const { id, patch } of updates) {
        syncLog('saveTasksNow writing task patch', {
          platform: currentPlatform(),
          method: 'update',
          rowKind: 'existing',
          id,
          patchKeys: Object.keys(patch),
        });
        const { error: updateErr } = await supabase
          .from('tasks')
          .update(patch as any)
          .eq('id', id)
          .eq('user_id', userId);
        if (updateErr) {
          console.error('[Sync] Failed to save tasks:', {
            method: 'update',
            rowKind: 'existing',
            id,
            patchKeys: Object.keys(patch),
            error: updateErr,
          });
          toast.error('Failed to save tasks — changes may not persist.');
          return false;
        }
      }
    }

    lastSyncedTaskSnapshot = snap;
    syncLog('lastSyncedTaskSnapshot reset after save', {
      platform: currentPlatform(),
      taskCount: validTasks.length,
    });
    const echoExpiresAt = Date.now() + TASK_SELF_ECHO_TTL_MS;
    ignoreTaskReloadUntil = echoExpiresAt;
    pendingTaskSelfEchoIds = new Map(validTasks.map((task) => [task.id, echoExpiresAt]));
    return true;
  } catch (err) {
    console.error('[Sync] Task save error:', err);
    toast.error('Sync error — please check your connection.');
    return false;
  }
  };

  taskSaveInFlight = run().finally(() => {
    taskSaveInFlight = null;
  });

  return taskSaveInFlight;
}

async function saveLibraryNow(userId: string): Promise<boolean> {
  if (libSaveInFlight) return libSaveInFlight;
  if (syncStatus === 'signing_out') {
    console.warn('[Sync] Skipping library save — session is signing out.');
    return false;
  }

  const run = async (): Promise<boolean> => {
  const state = useLibraryStore.getState();
  const validItems = state.items.filter(i => isValidUUID(i.id));
  const snap = snapshotLib(state.items);

  if (snap === lastSyncedLibSnapshot) return true;

  try {
    // SAFETY: derive deletions from the last successfully-synced snapshot,
    // NOT from a fresh DB fetch. A live DB fetch combined with a transiently
    // empty local `items` array (e.g. during sign-out, user switch, or before
    // initial load completes) previously wiped every row from `library_items`.
    // Mirror the pattern used by saveTasksNow.
    const previousIds = new Set(
      lastSyncedLibSnapshot
        ? (JSON.parse(lastSyncedLibSnapshot) as Array<{ id: string }>).map((i) => i.id)
        : [],
    );
    const localIds = new Set(state.items.map(i => i.id));
    const toDelete = Array.from(previousIds).filter((id) => !localIds.has(id));

    // Extra belt-and-braces guard: refuse to wipe everything if local somehow
    // emptied without an explicit removal having been observed against a
    // populated previous snapshot. Saves with zero local items only proceed
    // if the previous snapshot was also empty (genuinely nothing to sync).
    if (validItems.length === 0 && previousIds.size >= BULK_DELETE_MIN) {
      console.warn('[Sync] Refusing to save empty library — looks like a transient state, not a real deletion of all items.');
      return false;
    }

    if (
      previousIds.size >= BULK_DELETE_MIN &&
      toDelete.length / previousIds.size >= BULK_DELETE_RATIO
    ) {
      console.warn(
        `[Sync] Refusing bulk library delete (${toDelete.length}/${previousIds.size}) — looks unintentional.`,
      );
      return false;
    }

    if (toDelete.length > 0) {
      console.warn('[Sync] Ignoring', toDelete.length, 'library items missing from local state — hard delete is disabled.');
    }

    if (validItems.length > 0) {
      const previousById = parseSnapshotById(lastSyncedLibSnapshot);
      const changed = validItems.filter(
        (i) => previousById.get(i.id) !== JSON.stringify(i),
      );
      if (changed.length > 0) {
        const rows = changed.map((i) => libraryItemToRow(i, userId));
        const { error } = await supabase.from('library_items').upsert(rows as any);
        if (error) {
          console.error('[Sync] Failed to save library:', error);
          toast.error('Failed to save library items.');
          return false;
        }
      }
    }

    lastSyncedLibSnapshot = snap;
    ignoreLibraryReloadUntil = Date.now() + 5000;
    return true;
  } catch (err) {
    console.error('[Sync] Library save error:', err);
    return false;
  }
  };

  libSaveInFlight = run().finally(() => {
    libSaveInFlight = null;
  });

  return libSaveInFlight;
}

async function saveCategoriesNow(userId: string): Promise<boolean> {
  if (catSaveInFlight) return catSaveInFlight;
  if (syncStatus === 'signing_out') {
    console.warn('[Sync] Skipping category save — session is signing out.');
    return false;
  }

  const run = async (): Promise<boolean> => {
  const state = useLibraryStore.getState();
  const snap = snapshotCats(state.categories);

  if (snap === lastSyncedCatSnapshot) return true;

  try {
    // SAFETY: derive deletions from the last successfully-synced snapshot,
    // not from a fresh DB fetch (see saveLibraryNow for the wipe-bug history).
    const previousValues = new Set(
      lastSyncedCatSnapshot
        ? (JSON.parse(lastSyncedCatSnapshot) as Array<{ value: string }>).map((c) => c.value)
        : [],
    );
    const localValues = new Set(state.categories.map(c => c.value));
    const toDelete = Array.from(previousValues).filter((v) => !localValues.has(v));

    if (state.categories.length === 0 && previousValues.size >= BULK_DELETE_MIN) {
      console.warn('[Sync] Refusing to save empty categories — likely transient state, not a real wipe.');
      return false;
    }

    if (
      previousValues.size >= BULK_DELETE_MIN &&
      toDelete.length / previousValues.size >= BULK_DELETE_RATIO
    ) {
      console.warn(
        `[Sync] Refusing bulk category delete (${toDelete.length}/${previousValues.size}) — looks unintentional.`,
      );
      return false;
    }

    if (toDelete.length > 0) {
      console.warn('[Sync] Ignoring', toDelete.length, 'categories missing from local state — hard delete is disabled.');
    }

    if (state.categories.length > 0) {
      // Categories are keyed by `value` (unique with user_id). Diff per row.
      const previousByValue = parseSnapshotById(lastSyncedCatSnapshot);
      const changed = state.categories.filter(
        (c) => previousByValue.get(c.value) !== JSON.stringify(c),
      );
      if (changed.length > 0) {
        const rows = changed.map((c) => categoryToRow(c, userId));
        await supabase.from('library_categories').upsert(rows as any, { onConflict: 'user_id,value' });
      }
    }

    lastSyncedCatSnapshot = snap;
    ignoreCategoryReloadUntil = Date.now() + 5000;
    return true;
  } catch (_) {
    return false;
  }
  };

  catSaveInFlight = run().finally(() => {
    catSaveInFlight = null;
  });

  return catSaveInFlight;
}

// ─── Load from DB (source of truth) ───────────────────

export async function loadFromDB(
  userId: string,
  options: { skipTasks?: boolean; skipLibrary?: boolean; skipCategories?: boolean } = {}
): Promise<boolean> {
  try {
    const [taskRes, libRes, catRes] = await Promise.all([
      options.skipTasks ? Promise.resolve({ data: null, error: null } as any) : fetchAllRows('tasks', userId),
      options.skipLibrary ? Promise.resolve({ data: null, error: null } as any) : fetchAllRows('library_items', userId),
      options.skipCategories ? Promise.resolve({ data: null, error: null } as any) : fetchAllRows('library_categories', userId),
    ]);

    if (!options.skipTasks && taskRes.error) {
      console.error('[Sync] Failed to load tasks:', taskRes.error);
      toast.error('Failed to load tasks. Please refresh.');
      return false;
    }

    if (!options.skipTasks) {
      const tasks = (taskRes.data || []).map(rowToTask);
      useTaskStore.setState({ tasks });
      lastSyncedTaskSnapshot = snapshotTasks(tasks);
    }

    if (!options.skipLibrary && !libRes.error) {
      const items = (libRes.data || []).map(rowToLibraryItem);
      // RECOVERY: if the DB has zero library items but the localStorage cache
      // for this device still holds some, restore them rather than treating
      // the empty DB as authoritative. This protects against the historical
      // "wipe on sign-out" bug — any device that still has the cache will
      // push the library back up on next login.
      let restored = false;
      if (items.length === 0) {
        try {
          const cached = localStorage.getItem('do-library-store');
          if (cached) {
            const parsed = JSON.parse(cached);
            const cachedItems: any[] = parsed?.state?.items || [];
            const validCached = cachedItems.filter((i) => i && isValidUUID(i.id));
            if (validCached.length > 0) {
              console.warn('[Sync] DB library was empty but localStorage cache has', validCached.length, 'items — restoring from cache.');
              const restoredItems = validCached.map((i: any) => ({
                id: i.id,
                title: i.title || 'Untitled',
                note: i.note ?? '',
                category: i.category ?? '',
                defaultDuration: i.defaultDuration ?? 30,
                createdAt: i.createdAt || new Date().toISOString(),
                isUrgent: i.isUrgent ?? false,
                isImportant: i.isImportant ?? false,
                dueDate: i.dueDate ?? null,
                subtasks: i.subtasks ?? [],
                attachments: i.attachments ?? [],
                completed: i.completed ?? false,
                completedAt: i.completedAt ?? null,
                deletedAt: i.deletedAt ?? null,
              }));
              useLibraryStore.setState({ items: restoredItems });
              // Seed snapshot as if DB already had these so saveLibraryNow
              // treats the upsert as a pure insert, not a delete-diff.
              lastSyncedLibSnapshot = snapshotLib([]);
              // Push to DB immediately.
              const rows = restoredItems.map((i) => libraryItemToRow(i, userId));
              const { error: upErr } = await supabase.from('library_items').upsert(rows as any);
              if (!upErr) {
                lastSyncedLibSnapshot = snapshotLib(restoredItems);
                try { toast.success(`Restored ${restoredItems.length} library item${restoredItems.length === 1 ? '' : 's'} from this device's cache.`); } catch {}
                restored = true;
              } else {
                console.error('[Sync] Failed to restore library from cache:', upErr);
              }
            }
          }
        } catch (err) {
          console.error('[Sync] Library restore-from-cache failed:', err);
        }
      }
      if (!restored) {
        useLibraryStore.setState({ items });
        lastSyncedLibSnapshot = snapshotLib(items);
      }
    }

    if (!options.skipCategories && !catRes.error) {
      const categories = (catRes.data || []).map(rowToCategory);
      useLibraryStore.setState({ categories });
      lastSyncedCatSnapshot = snapshotCats(categories);
    }

    return true;
  } catch (err) {
    console.error('[Sync] Load error:', err);
    toast.error('Error loading data. Please refresh.');
    return false;
  }
}

// ─── Hook ──────────────────────────────────────────────

/** Module-level flag flipped to true once initial backend sync completes. */
let initialSyncComplete = false;
export function isInitialSyncComplete() {
  return initialSyncComplete;
}

export function useDataSync(user: User | null) {
  const initialLoadDone = useRef(false);
  const userIdRef = useRef<string | null>(null);
  const prevUserIdRef = useRef<string | null>(null);
  const accessTokenRef = useRef<string | null>(null);
  const flushPendingWrites = useCallback(async (activeUserId: string) => {
    try {
      if (taskSaveTimeout) {
        clearTimeout(taskSaveTimeout);
        taskSaveTimeout = null;
        await saveTasksNow(activeUserId);
      }
      if (libSaveTimeout) {
        clearTimeout(libSaveTimeout);
        libSaveTimeout = null;
        await saveLibraryNow(activeUserId);
      }
      if (catSaveTimeout) {
        clearTimeout(catSaveTimeout);
        catSaveTimeout = null;
        await saveCategoriesNow(activeUserId);
      }

      const taskState = useTaskStore.getState();
      if (snapshotTasks(taskState.tasks) !== lastSyncedTaskSnapshot) {
        await saveTasksNow(activeUserId);
      }
      const libState = useLibraryStore.getState();
      if (snapshotLib(libState.items) !== lastSyncedLibSnapshot) {
        await saveLibraryNow(activeUserId);
      }
      if (snapshotCats(libState.categories) !== lastSyncedCatSnapshot) {
        await saveCategoriesNow(activeUserId);
      }
    } catch (err) {
      console.error('[Sync] Error flushing pending writes:', err);
    }
  }, []);

  // Keep access token up to date for beforeunload
  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      accessTokenRef.current = session?.access_token ?? null;
    });
    supabase.auth.getSession().then(({ data: { session } }) => {
      accessTokenRef.current = session?.access_token ?? null;
    });
    return () => subscription.unsubscribe();
  }, []);

  // ─── Initial load & user change ──────────────────────
  useEffect(() => {
    if (!user) {
      clearAllUserState();
      initialLoadDone.current = false;
      initialSyncComplete = false;
      userIdRef.current = null;
      prevUserIdRef.current = null;
      return;
    }

    if (prevUserIdRef.current && prevUserIdRef.current !== user.id) {
      clearAllUserState();
      initialLoadDone.current = false;
      initialSyncComplete = false;
    }

    userIdRef.current = user.id;
    prevUserIdRef.current = user.id;
    initialSyncComplete = false;

    // Clear localStorage-cached data BEFORE loading from DB
    // This prevents stale local data from flashing or being pushed back
    useTaskStore.setState({ tasks: [] });
    useLibraryStore.setState({ items: [] });

    loadFromDB(user.id).then((ok) => {
      if (ok && userIdRef.current === user.id) {
        initialLoadDone.current = true;
        initialSyncComplete = true;
        // Only allow saves once the source-of-truth load has succeeded.
        // A failed load leaves status at 'idle' so a debounced save cannot
        // push a half-empty store back at the database.
        if (syncStatus !== 'signing_out') syncStatus = 'loaded';
        try { window.dispatchEvent(new CustomEvent('data-sync:initial-loaded')); } catch {}

        // If DB had zero tasks but localStorage had some (first-time migration),
        // push them up. This only matters on the very first login.
        const currentTasks = useTaskStore.getState().tasks;
        if (currentTasks.length === 0) {
          // Check if localStorage had tasks before we cleared
          try {
            const cached = localStorage.getItem('do-task-store');
            if (cached) {
              const parsed = JSON.parse(cached);
              if (parsed?.state?.tasks?.length > 0) {
                const fixedTasks = parsed.state.tasks.map((t: any) => ({
                  ...t,
                  id: isValidUUID(t.id) ? t.id : crypto.randomUUID(),
                }));
                useTaskStore.setState({ tasks: fixedTasks });
                saveTasksNow(user.id);
              }
            }
          } catch (_) {}
        }
      }
    });
  }, [user?.id]);

  // ─── Subscribe to task store → write-through save ────
  useEffect(() => {
    if (!user) return;

    const unsub = useTaskStore.subscribe(() => {
      if (!initialLoadDone.current || !userIdRef.current) return;
      if (userIdRef.current !== user.id) return;
      const userId = userIdRef.current;

      // Debounce at 300ms (short enough to catch most actions before app switch)
      if (taskSaveTimeout) clearTimeout(taskSaveTimeout);
      taskSaveTimeout = setTimeout(() => saveTasksNow(userId), 300);
    });

    return () => {
      unsub();
      // Flush pending save immediately on cleanup
      if (taskSaveTimeout && userIdRef.current) {
        clearTimeout(taskSaveTimeout);
        taskSaveTimeout = null;
        saveTasksNow(userIdRef.current);
      }
    };
  }, [user?.id]);

  // ─── Subscribe to library store → write-through save ─
  useEffect(() => {
    if (!user) return;

    const unsub = useLibraryStore.subscribe(() => {
      if (!initialLoadDone.current || !userIdRef.current) return;
      if (userIdRef.current !== user.id) return;
      const userId = userIdRef.current;

      if (libSaveTimeout) clearTimeout(libSaveTimeout);
      libSaveTimeout = setTimeout(() => saveLibraryNow(userId), 300);

      if (catSaveTimeout) clearTimeout(catSaveTimeout);
      catSaveTimeout = setTimeout(() => saveCategoriesNow(userId), 300);
    });

    return () => {
      unsub();
      if (libSaveTimeout && userIdRef.current) {
        clearTimeout(libSaveTimeout);
        libSaveTimeout = null;
        saveLibraryNow(userIdRef.current);
      }
      if (catSaveTimeout && userIdRef.current) {
        clearTimeout(catSaveTimeout);
        catSaveTimeout = null;
        saveCategoriesNow(userIdRef.current);
      }
    };
  }, [user?.id]);

  // ─── Realtime: live updates from other devices ───────
  useEffect(() => {
    if (!user) return;

    let reloadTimeout: ReturnType<typeof setTimeout> | null = null;
    const scheduleReload = () => {
      if (!initialLoadDone.current || userIdRef.current !== user.id) return;
      // If a local save is pending, wait for it to flush so we don't clobber in-flight edits
      if (taskSaveTimeout || libSaveTimeout || catSaveTimeout || taskSaveInFlight || libSaveInFlight || catSaveInFlight) {
        if (reloadTimeout) clearTimeout(reloadTimeout);
        reloadTimeout = setTimeout(scheduleReload, 600);
        return;
      }
      if (reloadTimeout) clearTimeout(reloadTimeout);
      reloadTimeout = setTimeout(() => {
        if (userIdRef.current === user.id) {
          console.log('[Sync] Realtime change detected — refetching');
          const now = Date.now();
          loadFromDB(user.id, {
            skipTasks: now < ignoreTaskReloadUntil,
            skipLibrary: now < ignoreLibraryReloadUntil,
            skipCategories: now < ignoreCategoryReloadUntil,
          });
        }
      }, 400);
    };

    const channel = supabase
      .channel(`user-data-${user.id}`)
      .on('postgres_changes' as any, { event: '*', schema: 'public', table: 'tasks', filter: `user_id=eq.${user.id}` }, scheduleReload)
      .on('postgres_changes' as any, { event: '*', schema: 'public', table: 'library_items', filter: `user_id=eq.${user.id}` }, scheduleReload)
      .on('postgres_changes' as any, { event: '*', schema: 'public', table: 'library_categories', filter: `user_id=eq.${user.id}` }, scheduleReload)
      .subscribe();

    return () => {
      if (reloadTimeout) clearTimeout(reloadTimeout);
      supabase.removeChannel(channel);
    };
  }, [user?.id]);

  // ─── Refetch on visibility change (tab/app foreground) ─
  useEffect(() => {
    if (!user) return;

    const handleVisibility = async () => {
      if (document.visibilityState !== 'visible' || userIdRef.current !== user.id) return;

      // CRITICAL: Flush any pending local writes BEFORE refetching from DB.
      // On mobile, the app may have been backgrounded mid-debounce — if we
      // refetch first, we'd overwrite unsaved local tasks with stale DB rows.
      await flushPendingWrites(user.id);

      if (userIdRef.current !== user.id) return;
      console.log('[Sync] App became visible — refetching from DB');
      const now = Date.now();
      await loadFromDB(user.id, {
        skipTasks: now < ignoreTaskReloadUntil,
        skipLibrary: now < ignoreLibraryReloadUntil,
        skipCategories: now < ignoreCategoryReloadUntil,
      });
      initialLoadDone.current = true;
    };

    document.addEventListener('visibilitychange', handleVisibility);

    // Also flush on beforeunload
    const handleBeforeUnload = () => {
      if (userIdRef.current) {
        // Cancel debounce and save synchronously via sendBeacon as best-effort
        if (taskSaveTimeout) { clearTimeout(taskSaveTimeout); taskSaveTimeout = null; }
        if (libSaveTimeout) { clearTimeout(libSaveTimeout); libSaveTimeout = null; }

        // sendBeacon needs auth header — use REST API with apikey
        const url = import.meta.env.VITE_SUPABASE_URL;
        const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
        if (!url || !key) return;

        const state = useTaskStore.getState();
        const validTasks = state.tasks.filter(t => isValidUUID(t.id));
        if (validTasks.length > 0 && snapshotTasks(state.tasks) !== lastSyncedTaskSnapshot) {
          const rows = validTasks.map(t => taskToRow(t, userIdRef.current!));
          try {
            // Use fetch with keepalive instead of sendBeacon for auth headers
            fetch(`${url}/rest/v1/tasks?on_conflict=id`, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'apikey': key,
                'Authorization': `Bearer ${accessTokenRef.current || key}`,
                'Prefer': 'resolution=merge-duplicates',
              },
              body: JSON.stringify(rows),
              keepalive: true,
            }).catch(() => {});
          } catch (_) {}
        }
      }
    };

    window.addEventListener('beforeunload', handleBeforeUnload);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibility);
      window.removeEventListener('beforeunload', handleBeforeUnload);
    };
  }, [flushPendingWrites, user?.id]);

  useEffect(() => {
    if (!user || !isNativePlatform()) return;

    let removeListener: (() => void) | undefined;

    (async () => {
      const { App } = await import('@capacitor/app');
      const listener = await App.addListener('appStateChange', async ({ isActive }) => {
        if (!userIdRef.current || userIdRef.current !== user.id) return;
        if (!isActive) {
          await flushPendingWrites(user.id);
        }
      });

      removeListener = () => {
        listener.remove();
      };
    })();

    return () => {
      removeListener?.();
    };
  }, [flushPendingWrites, user?.id]);
}
