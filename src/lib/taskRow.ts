import type { Task, Priority, TaskType } from '@/store/taskStore';
import type { Database } from '@/integrations/supabase/types';
type TaskRow = Database['public']['Tables']['tasks']['Row'];

export function rowToTask(row: Partial<TaskRow> & Pick<TaskRow, 'id' | 'title' | 'date' | 'created_at'>): Task {
  return {
    sourceCalendarId: row.source_calendar_id ?? undefined,
    sourceCalendarEventId: row.source_calendar_event_id ?? undefined,
    id: row.id,
    title: row.title,
    category: row.category ?? undefined,
    description: row.description ?? undefined,
    subtasks: (row.subtasks ?? undefined) as unknown as Task['subtasks'],
    type: (row.type || 'one-time') as TaskType,
    priority: (row.priority ?? 0) as Priority,
    originalPriority: (row.original_priority ?? 0) as Priority,
    date: row.date,
    time: row.time ?? undefined,
    duration: row.duration ?? undefined,
    completed: row.completed ?? false,
    createdAt: row.created_at,
    moveCount: row.move_count ?? 0,
    originalDate: row.original_date ?? undefined,
    recurrenceExceptions: row.recurrence_exceptions ?? [],
    recurrence: (row.recurrence ?? undefined) as Task['recurrence'],
    recurrenceParentId: row.recurrence_parent_id ?? undefined,
    isRecurrenceInstance: row.is_recurrence_instance ?? false,
    isRoutine: row.is_routine ?? undefined,
    linked: row.linked ?? false,
    seriesId: row.series_id ?? undefined,
    linkedGroupId: row.linked_group_id ?? undefined,
    detachedFromSeries: row.detached_from_series ?? false,
    // Overdue Limbo tasks retain their former schedule. Preserve their explicit
    // status; only completed scheduled tasks have a stale waiting-room flag.
    inWaitingRoom: (row.in_waiting_room ?? false) && !(row.completed && row.date && row.time),
    waitingRoomCount: row.waiting_room_count ?? 0,
    dueDate: row.due_date ?? undefined,
    archivedAt: row.archived_at ?? undefined,
    archiveReason: (row.archive_reason ?? undefined) as Task['archiveReason'],
    attachments: (row.attachments ?? []) as Task['attachments'],
    groupId: row.group_id ?? undefined,
    preferredDuration: row.preferred_duration ?? undefined,
    groupOrder: row.group_order ?? undefined,
    icon: row.icon ?? undefined,
  };
}

