import { useEffect, useRef, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useTaskStore, Task, Priority, TaskType } from '@/store/taskStore';
import { useLibraryStore, LibraryTask } from '@/store/libraryStore';
import { toast } from 'sonner';
import type { User } from '@supabase/supabase-js';

// ─── Converters ────────────────────────────────────────

function rowToTask(row: any): Task {
  return {
    id: row.id,
    title: row.title,
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
  };
}

function taskToRow(task: Task, userId: string) {
  return {
    id: task.id,
    user_id: userId,
    title: task.title,
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
  };
}

function rowToLibraryItem(row: any): LibraryTask {
  return {
    id: row.id,
    title: row.title,
    note: row.note ?? '',
    category: row.category === 'uncategorized' ? '' : (row.category ?? ''),
    defaultDuration: row.default_duration ?? 30,
    createdAt: row.created_at,
    isUrgent: false,
    isImportant: false,
    dueDate: null,
    subtasks: [],
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
  };
}

// ─── Validation ────────────────────────────────────────

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function isValidUUID(id: string): boolean {
  return UUID_RE.test(id);
}

// ─── Module-level debounce timers ──────────────────────

let saveTimeout: ReturnType<typeof setTimeout> | null = null;
let libSaveTimeout: ReturnType<typeof setTimeout> | null = null;

// ─── Clear all user-scoped state ───────────────────────

function clearAllUserState() {
  // Clear zustand in-memory state
  useTaskStore.setState({ tasks: [], editingTaskId: null, focusTaskId: null });
  useLibraryStore.setState({ items: [] });
  
  // Clear persisted localStorage so stale data never leaks across accounts
  try {
    localStorage.removeItem('do-task-store');
    localStorage.removeItem('do-library-store');
  } catch (_) {
    // localStorage may not be available
  }

  // Kill any pending saves
  if (saveTimeout) { clearTimeout(saveTimeout); saveTimeout = null; }
  if (libSaveTimeout) { clearTimeout(libSaveTimeout); libSaveTimeout = null; }
}

// ─── Hook ──────────────────────────────────────────────

export function useDataSync(user: User | null) {
  const initialLoadDone = useRef(false);
  const userIdRef = useRef<string | null>(null);
  const prevUserIdRef = useRef<string | null>(null);

  // Clear state on logout or user change
  useEffect(() => {
    if (!user) {
      // User logged out — wipe everything
      clearAllUserState();
      initialLoadDone.current = false;
      userIdRef.current = null;
      prevUserIdRef.current = null;
      return;
    }

    // Different user logged in — clear previous user's data first
    if (prevUserIdRef.current && prevUserIdRef.current !== user.id) {
      clearAllUserState();
      initialLoadDone.current = false;
    }

    userIdRef.current = user.id;
    prevUserIdRef.current = user.id;

    const loadData = async () => {
      try {
        // Load tasks — always from DB, never trust local cache
        const { data: taskRows, error: taskError } = await supabase
          .from('tasks')
          .select('*')
          .eq('user_id', user.id);

        if (taskError) {
          console.error('[DataSync] Failed to load tasks:', taskError);
          toast.error('Failed to load tasks. Please refresh.');
          initialLoadDone.current = true;
          return;
        }

        // Guard: make sure we're still the active user
        if (userIdRef.current !== user.id) return;

        if (taskRows && taskRows.length > 0) {
          const tasks = taskRows.map(rowToTask);
          useTaskStore.setState({ tasks });
        } else {
          // First login — push local tasks to DB if any exist with valid UUIDs
          const currentTasks = useTaskStore.getState().tasks;
          if (currentTasks.length > 0) {
            const fixedTasks = currentTasks.map(t => {
              if (!isValidUUID(t.id)) {
                return { ...t, id: crypto.randomUUID() };
              }
              return t;
            });
            useTaskStore.setState({ tasks: fixedTasks });
            const rows = fixedTasks.map(t => taskToRow(t, user.id));
            const { error: upsertErr } = await supabase.from('tasks').upsert(rows as any);
            if (upsertErr) {
              console.error('[DataSync] Failed to push initial tasks:', upsertErr);
            }
          } else {
            // Ensure store is empty for a new account
            useTaskStore.setState({ tasks: [] });
          }
        }

        // Load library items
        const { data: libRows, error: libError } = await supabase
          .from('library_items')
          .select('*')
          .eq('user_id', user.id);

        if (libError) {
          console.error('[DataSync] Failed to load library:', libError);
        }

        // Guard again
        if (userIdRef.current !== user.id) return;

        if (libRows && libRows.length > 0) {
          const items = libRows.map(rowToLibraryItem);
          useLibraryStore.setState({ items });
        } else {
          const currentItems = useLibraryStore.getState().items;
          if (currentItems.length > 0) {
            // Fix any non-UUID library IDs before pushing
            const fixedItems = currentItems.map(i => {
              if (!isValidUUID(i.id)) {
                return { ...i, id: crypto.randomUUID() };
              }
              return i;
            });
            useLibraryStore.setState({ items: fixedItems });
            const rows = fixedItems.map(i => libraryItemToRow(i, user.id));
            const { error: libUpsertErr } = await supabase.from('library_items').upsert(rows as any);
            if (libUpsertErr) {
              console.error('[DataSync] Failed to push initial library items:', libUpsertErr);
            }
          } else {
            useLibraryStore.setState({ items: [] });
          }
        }

        initialLoadDone.current = true;
      } catch (err) {
        console.error('[DataSync] Load error:', err);
        toast.error('Error loading data. Please refresh.');
        initialLoadDone.current = true;
      }
    };

    loadData();
  }, [user?.id]);

  // Subscribe to task store changes → save to DB (debounced)
  useEffect(() => {
    if (!user) return;

    const unsub = useTaskStore.subscribe((state) => {
      if (!initialLoadDone.current || !userIdRef.current) return;
      // Safety: don't save if the user changed
      if (userIdRef.current !== user.id) return;

      if (saveTimeout) clearTimeout(saveTimeout);
      saveTimeout = setTimeout(async () => {
        const userId = userIdRef.current;
        if (!userId || userId !== user.id) return;

        try {
          // Get current DB task IDs
          const { data: dbTasks, error: fetchErr } = await supabase
            .from('tasks')
            .select('id')
            .eq('user_id', userId);

          if (fetchErr) {
            console.error('[DataSync] Failed to fetch task IDs for sync:', fetchErr);
            return;
          }

          // Re-check user hasn't changed during async gap
          if (userIdRef.current !== userId) return;

          const currentState = useTaskStore.getState();
          const dbIds = new Set((dbTasks || []).map((t: any) => t.id));
          const localIds = new Set(currentState.tasks.map(t => t.id));

          // Delete tasks removed locally
          const toDelete = [...dbIds].filter(id => !localIds.has(id));
          if (toDelete.length > 0) {
            const { error: delErr } = await supabase.from('tasks').delete().in('id', toDelete);
            if (delErr) console.error('[DataSync] Failed to delete tasks:', delErr);
          }

          // Upsert valid tasks
          const validTasks = currentState.tasks.filter(t => isValidUUID(t.id));
          if (validTasks.length > 0) {
            const rows = validTasks.map(t => taskToRow(t, userId));
            const { error: upsertErr } = await supabase.from('tasks').upsert(rows as any);
            if (upsertErr) {
              console.error('[DataSync] Failed to save tasks:', upsertErr);
              toast.error('Failed to save tasks. Your changes may not persist.');
            }
          }

          // Warn about invalid-ID tasks that couldn't be saved
          const invalidTasks = currentState.tasks.filter(t => !isValidUUID(t.id));
          if (invalidTasks.length > 0) {
            console.warn('[DataSync] Skipped saving tasks with invalid IDs:', invalidTasks.map(t => t.id));
          }
        } catch (err) {
          console.error('[DataSync] Task save error:', err);
        }
      }, 1000);
    });

    return () => {
      unsub();
      if (saveTimeout) { clearTimeout(saveTimeout); saveTimeout = null; }
    };
  }, [user?.id]);

  // Subscribe to library store changes → save to DB (debounced)
  useEffect(() => {
    if (!user) return;

    const unsub = useLibraryStore.subscribe((state) => {
      if (!initialLoadDone.current || !userIdRef.current) return;
      if (userIdRef.current !== user.id) return;

      if (libSaveTimeout) clearTimeout(libSaveTimeout);
      libSaveTimeout = setTimeout(async () => {
        const userId = userIdRef.current;
        if (!userId || userId !== user.id) return;

        try {
          const { data: dbItems, error: fetchErr } = await supabase
            .from('library_items')
            .select('id')
            .eq('user_id', userId);

          if (fetchErr) {
            console.error('[DataSync] Failed to fetch library IDs for sync:', fetchErr);
            return;
          }

          if (userIdRef.current !== userId) return;

          const currentState = useLibraryStore.getState();
          const dbIds = new Set((dbItems || []).map((i: any) => i.id));
          const localIds = new Set(currentState.items.map(i => i.id));

          const toDelete = [...dbIds].filter(id => !localIds.has(id));
          if (toDelete.length > 0) {
            const { error: delErr } = await supabase.from('library_items').delete().in('id', toDelete);
            if (delErr) console.error('[DataSync] Failed to delete library items:', delErr);
          }

          // Fix and upsert library items
          const validItems = currentState.items.filter(i => isValidUUID(i.id));
          if (validItems.length > 0) {
            const rows = validItems.map(i => libraryItemToRow(i, userId));
            const { error: upsertErr } = await supabase.from('library_items').upsert(rows as any);
            if (upsertErr) {
              console.error('[DataSync] Failed to save library items:', upsertErr);
              toast.error('Failed to save library. Your changes may not persist.');
            }
          }

          const invalidItems = currentState.items.filter(i => !isValidUUID(i.id));
          if (invalidItems.length > 0) {
            console.warn('[DataSync] Skipped saving library items with invalid IDs:', invalidItems.map(i => i.id));
          }
        } catch (err) {
          console.error('[DataSync] Library save error:', err);
        }
      }, 1000);
    });

    return () => {
      unsub();
      if (libSaveTimeout) { clearTimeout(libSaveTimeout); libSaveTimeout = null; }
    };
  }, [user?.id]);
}
