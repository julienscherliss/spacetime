import { useEffect, useRef, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useTaskStore, Task, Priority, TaskType } from '@/store/taskStore';
import { useLibraryStore, LibraryTask, CategoryDef } from '@/store/libraryStore';
import { toast } from 'sonner';
import type { User } from '@supabase/supabase-js';

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

function taskToRow(task: Task, userId: string) {
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

// ─── Snapshot for diffing ──────────────────────────────

let lastSyncedTaskSnapshot: string = '';
let lastSyncedLibSnapshot: string = '';
let lastSyncedCatSnapshot: string = '';

function snapshotTasks(tasks: Task[]): string {
  return JSON.stringify(tasks.filter(t => isValidUUID(t.id)).map(t => ({
    id: t.id, title: t.title, category: t.category, description: t.description,
    subtasks: t.subtasks, type: t.type, priority: t.priority, originalPriority: t.originalPriority,
    date: t.date, time: t.time, duration: t.duration, completed: t.completed,
    moveCount: t.moveCount, recurrence: t.recurrence, recurrenceParentId: t.recurrenceParentId,
    isRecurrenceInstance: t.isRecurrenceInstance, isRoutine: t.isRoutine, linked: t.linked,
    seriesId: t.seriesId, linkedGroupId: t.linkedGroupId, detachedFromSeries: t.detachedFromSeries,
    inWaitingRoom: t.inWaitingRoom, waitingRoomCount: t.waitingRoomCount,
    dueDate: t.dueDate, archivedAt: t.archivedAt, archiveReason: t.archiveReason,
  })));
}

function snapshotLib(items: LibraryTask[]): string {
  return JSON.stringify(items.filter(i => isValidUUID(i.id)));
}

function snapshotCats(cats: CategoryDef[]): string {
  return JSON.stringify(cats);
}

// ─── Clear all user-scoped state ───────────────────────

function clearAllUserState() {
  useTaskStore.setState({ tasks: [], editingTaskId: null, focusTaskId: null });
  useLibraryStore.setState({ items: [], categories: [] });
  try {
    localStorage.removeItem('do-task-store');
    localStorage.removeItem('do-library-store');
  } catch (_) {}
  if (taskSaveTimeout) { clearTimeout(taskSaveTimeout); taskSaveTimeout = null; }
  if (libSaveTimeout) { clearTimeout(libSaveTimeout); libSaveTimeout = null; }
  if (catSaveTimeout) { clearTimeout(catSaveTimeout); catSaveTimeout = null; }
  lastSyncedTaskSnapshot = '';
  lastSyncedLibSnapshot = '';
  lastSyncedCatSnapshot = '';
}

// ─── Write-through save functions ──────────────────────

async function saveTasksNow(userId: string): Promise<boolean> {
  const state = useTaskStore.getState();
  const validTasks = state.tasks.filter(t => isValidUUID(t.id));
  const snap = snapshotTasks(state.tasks);

  // Skip if nothing changed
  if (snap === lastSyncedTaskSnapshot) return true;

  try {
    // Get current DB IDs to detect deletions
    const { data: dbTasks, error: fetchErr } = await supabase
      .from('tasks')
      .select('id')
      .eq('user_id', userId);

    if (fetchErr) {
      console.error('[Sync] Failed to fetch task IDs:', fetchErr);
      toast.error('Sync failed — changes may not persist across devices.');
      return false;
    }

    const localIds = new Set(state.tasks.map(t => t.id));
    const toDelete = (dbTasks || []).map((t: any) => t.id).filter((id: string) => !localIds.has(id));

    if (toDelete.length > 0) {
      const { error: delErr } = await supabase.from('tasks').delete().in('id', toDelete);
      if (delErr) {
        console.error('[Sync] Failed to delete tasks:', delErr);
        toast.error('Failed to sync deleted tasks.');
        return false;
      }
    }

    if (validTasks.length > 0) {
      const rows = validTasks.map(t => taskToRow(t, userId));
      const { error: upsertErr } = await supabase.from('tasks').upsert(rows as any);
      if (upsertErr) {
        console.error('[Sync] Failed to save tasks:', upsertErr);
        toast.error('Failed to save tasks — changes may not persist.');
        return false;
      }
    }

    lastSyncedTaskSnapshot = snap;
    return true;
  } catch (err) {
    console.error('[Sync] Task save error:', err);
    toast.error('Sync error — please check your connection.');
    return false;
  }
}

async function saveLibraryNow(userId: string): Promise<boolean> {
  const state = useLibraryStore.getState();
  const validItems = state.items.filter(i => isValidUUID(i.id));
  const snap = snapshotLib(state.items);

  if (snap === lastSyncedLibSnapshot) return true;

  try {
    const { data: dbItems, error: fetchErr } = await supabase
      .from('library_items')
      .select('id')
      .eq('user_id', userId);

    if (fetchErr) {
      console.error('[Sync] Failed to fetch library IDs:', fetchErr);
      return false;
    }

    const localIds = new Set(state.items.map(i => i.id));
    const toDelete = (dbItems || []).map((i: any) => i.id).filter((id: string) => !localIds.has(id));

    if (toDelete.length > 0) {
      await supabase.from('library_items').delete().in('id', toDelete);
    }

    if (validItems.length > 0) {
      const rows = validItems.map(i => libraryItemToRow(i, userId));
      const { error } = await supabase.from('library_items').upsert(rows as any);
      if (error) {
        console.error('[Sync] Failed to save library:', error);
        toast.error('Failed to save library items.');
        return false;
      }
    }

    lastSyncedLibSnapshot = snap;
    return true;
  } catch (err) {
    console.error('[Sync] Library save error:', err);
    return false;
  }
}

async function saveCategoriesNow(userId: string): Promise<boolean> {
  const state = useLibraryStore.getState();
  const snap = snapshotCats(state.categories);

  if (snap === lastSyncedCatSnapshot) return true;

  try {
    const { data: dbCats, error: fetchErr } = await supabase
      .from('library_categories')
      .select('value')
      .eq('user_id', userId);

    if (fetchErr) return false;

    const localValues = new Set(state.categories.map(c => c.value));
    const toDelete = (dbCats || []).map((c: any) => c.value).filter((v: string) => !localValues.has(v));

    if (toDelete.length > 0) {
      await supabase.from('library_categories').delete().eq('user_id', userId).in('value', toDelete);
    }

    if (state.categories.length > 0) {
      const rows = state.categories.map(c => categoryToRow(c, userId));
      await supabase.from('library_categories').upsert(rows as any, { onConflict: 'user_id,value' });
    }

    lastSyncedCatSnapshot = snap;
    return true;
  } catch (_) {
    return false;
  }
}

// ─── Load from DB (source of truth) ───────────────────

async function loadFromDB(userId: string): Promise<boolean> {
  try {
    const [taskRes, libRes, catRes] = await Promise.all([
      supabase.from('tasks').select('*').eq('user_id', userId),
      supabase.from('library_items').select('*').eq('user_id', userId),
      supabase.from('library_categories').select('*').eq('user_id', userId),
    ]);

    if (taskRes.error) {
      console.error('[Sync] Failed to load tasks:', taskRes.error);
      toast.error('Failed to load tasks. Please refresh.');
      return false;
    }

    const tasks = (taskRes.data || []).map(rowToTask);
    useTaskStore.setState({ tasks });
    lastSyncedTaskSnapshot = snapshotTasks(tasks);

    if (!libRes.error) {
      const items = (libRes.data || []).map(rowToLibraryItem);
      useLibraryStore.setState({ items });
      lastSyncedLibSnapshot = snapshotLib(items);
    }

    if (!catRes.error) {
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

export function useDataSync(user: User | null) {
  const initialLoadDone = useRef(false);
  const userIdRef = useRef<string | null>(null);
  const prevUserIdRef = useRef<string | null>(null);
  const accessTokenRef = useRef<string | null>(null);

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
      userIdRef.current = null;
      prevUserIdRef.current = null;
      return;
    }

    if (prevUserIdRef.current && prevUserIdRef.current !== user.id) {
      clearAllUserState();
      initialLoadDone.current = false;
    }

    userIdRef.current = user.id;
    prevUserIdRef.current = user.id;

    // Clear localStorage-cached data BEFORE loading from DB
    // This prevents stale local data from flashing or being pushed back
    useTaskStore.setState({ tasks: [] });
    useLibraryStore.setState({ items: [] });

    loadFromDB(user.id).then((ok) => {
      if (ok && userIdRef.current === user.id) {
        initialLoadDone.current = true;

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
      if (taskSaveTimeout || libSaveTimeout || catSaveTimeout) {
        if (reloadTimeout) clearTimeout(reloadTimeout);
        reloadTimeout = setTimeout(scheduleReload, 600);
        return;
      }
      if (reloadTimeout) clearTimeout(reloadTimeout);
      reloadTimeout = setTimeout(() => {
        if (userIdRef.current === user.id) {
          console.log('[Sync] Realtime change detected — refetching');
          loadFromDB(user.id);
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
      try {
        if (taskSaveTimeout) {
          clearTimeout(taskSaveTimeout);
          taskSaveTimeout = null;
          await saveTasksNow(user.id);
        }
        if (libSaveTimeout) {
          clearTimeout(libSaveTimeout);
          libSaveTimeout = null;
          await saveLibraryNow(user.id);
        }
        if (catSaveTimeout) {
          clearTimeout(catSaveTimeout);
          catSaveTimeout = null;
          await saveCategoriesNow(user.id);
        }

        // Also flush any local-only edits the snapshot diff might have missed
        // (e.g. saves that were scheduled while the tab was hidden and the
        // setTimeout never fired). Compare snapshots and push if dirty.
        const taskState = useTaskStore.getState();
        if (snapshotTasks(taskState.tasks) !== lastSyncedTaskSnapshot) {
          await saveTasksNow(user.id);
        }
        const libState = useLibraryStore.getState();
        if (snapshotLib(libState.items) !== lastSyncedLibSnapshot) {
          await saveLibraryNow(user.id);
        }
        if (snapshotCats(libState.categories) !== lastSyncedCatSnapshot) {
          await saveCategoriesNow(user.id);
        }
      } catch (err) {
        console.error('[Sync] Error flushing pending writes on foreground:', err);
      }

      if (userIdRef.current !== user.id) return;
      console.log('[Sync] App became visible — refetching from DB');
      await loadFromDB(user.id);
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
  }, [user?.id]);
}
