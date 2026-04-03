import { useEffect, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useTaskStore, Task, Priority, TaskType } from '@/store/taskStore';
import { useLibraryStore, LibraryTask } from '@/store/libraryStore';
import type { User } from '@supabase/supabase-js';

// Convert DB row → local Task
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
  };
}

// Convert local Task → DB row (for upsert)
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
  };
}

function rowToLibraryItem(row: any): LibraryTask {
  return {
    id: row.id,
    title: row.title,
    note: row.note ?? '',
    category: row.category ?? 'uncategorized',
    defaultDuration: row.default_duration ?? 30,
    createdAt: row.created_at,
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

// Validate if a string is a valid UUID
function isValidUUID(id: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);
}

let saveTimeout: ReturnType<typeof setTimeout> | null = null;
let libSaveTimeout: ReturnType<typeof setTimeout> | null = null;

export function useDataSync(user: User | null) {
  const initialLoadDone = useRef(false);
  const userIdRef = useRef<string | null>(null);

  // Load data from DB when user logs in
  useEffect(() => {
    if (!user) {
      initialLoadDone.current = false;
      userIdRef.current = null;
      return;
    }

    userIdRef.current = user.id;

    const loadData = async () => {
      try {
        // Load tasks
        const { data: taskRows } = await supabase
          .from('tasks')
          .select('*')
          .eq('user_id', user.id);

        if (taskRows && taskRows.length > 0) {
          const tasks = taskRows.map(rowToTask);
          useTaskStore.setState({ tasks });
        } else {
          // First login — push local tasks to DB, re-ID any non-UUID tasks
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
            await supabase.from('tasks').upsert(rows as any);
          }
        }

        // Load library items
        const { data: libRows } = await supabase
          .from('library_items')
          .select('*')
          .eq('user_id', user.id);

        if (libRows && libRows.length > 0) {
          const items = libRows.map(rowToLibraryItem);
          useLibraryStore.setState({ items });
        } else {
          const currentItems = useLibraryStore.getState().items;
          if (currentItems.length > 0) {
            const rows = currentItems.map(i => libraryItemToRow(i, user.id));
            await supabase.from('library_items').upsert(rows as any);
          }
        }

        initialLoadDone.current = true;
      } catch (err) {
        console.error('Data sync load error:', err);
        initialLoadDone.current = true;
      }
    };

    loadData();
  }, [user?.id]);

  // Subscribe to task store changes and save to DB (debounced)
  useEffect(() => {
    if (!user) return;

    const unsub = useTaskStore.subscribe((state) => {
      if (!initialLoadDone.current || !userIdRef.current) return;

      if (saveTimeout) clearTimeout(saveTimeout);
      saveTimeout = setTimeout(async () => {
        const userId = userIdRef.current;
        if (!userId) return;

        try {
          // Get current DB task IDs
          const { data: dbTasks } = await supabase
            .from('tasks')
            .select('id')
            .eq('user_id', userId);

          const dbIds = new Set((dbTasks || []).map((t: any) => t.id));
          const localIds = new Set(state.tasks.map(t => t.id));

          // Delete tasks that were removed locally
          const toDelete = [...dbIds].filter(id => !localIds.has(id));
          if (toDelete.length > 0) {
            await supabase.from('tasks').delete().in('id', toDelete);
          }

          // Upsert all current tasks, skipping any with invalid UUIDs
          const validTasks = state.tasks.filter(t => isValidUUID(t.id));
          if (validTasks.length > 0) {
            const rows = validTasks.map(t => taskToRow(t, userId));
            await supabase.from('tasks').upsert(rows as any);
          }
        } catch (err) {
          console.error('Task save error:', err);
        }
      }, 1000);
    });

    return () => {
      unsub();
      if (saveTimeout) clearTimeout(saveTimeout);
    };
  }, [user?.id]);

  // Subscribe to library store changes and save to DB (debounced)
  useEffect(() => {
    if (!user) return;

    const unsub = useLibraryStore.subscribe((state) => {
      if (!initialLoadDone.current || !userIdRef.current) return;

      if (libSaveTimeout) clearTimeout(libSaveTimeout);
      libSaveTimeout = setTimeout(async () => {
        const userId = userIdRef.current;
        if (!userId) return;

        try {
          const { data: dbItems } = await supabase
            .from('library_items')
            .select('id')
            .eq('user_id', userId);

          const dbIds = new Set((dbItems || []).map((i: any) => i.id));
          const localIds = new Set(state.items.map(i => i.id));

          const toDelete = [...dbIds].filter(id => !localIds.has(id));
          if (toDelete.length > 0) {
            await supabase.from('library_items').delete().in('id', toDelete);
          }

          if (state.items.length > 0) {
            const rows = state.items.map(i => libraryItemToRow(i, userId));
            await supabase.from('library_items').upsert(rows as any);
          }
        } catch (err) {
          console.error('Library save error:', err);
        }
      }, 1000);
    });

    return () => {
      unsub();
      if (libSaveTimeout) clearTimeout(libSaveTimeout);
    };
  }, [user?.id]);
}