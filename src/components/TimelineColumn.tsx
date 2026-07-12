import { useRef, useState, useCallback, useEffect, Fragment, useMemo } from 'react';
import { TagAutocomplete } from '@/components/TagAutocomplete';
import { DateAutocomplete } from '@/components/DateAutocomplete';
import { CategoryDef } from '@/store/libraryStore';
import { useEntryHint, incrementEntryCount } from '@/hooks/useEntryHint';
import { useTaskStore, Task } from '@/store/taskStore';
import { useCalendarStore, CalendarEvent, eventSpansDate } from '@/store/calendarStore';
import { useLibraryStore } from '@/store/libraryStore';
import { useTouchDragStore } from '@/store/touchDragStore';
import { useLibraryDragStore } from '@/store/libraryDragStore';
import { useTimezoneStore, getTodayInTz } from '@/store/timezoneStore';
import { useScheduledDragStore } from '@/store/scheduledDragStore';
import { useCarryStore, isInScrollCooldown, isInDropCooldown, roundCarriedDuration } from '@/store/carryStore';
import { PriorityBadge } from '@/components/PriorityBadge';
import { TimelineTaskBlock } from '@/components/TimelineTaskBlock';
import { GroupTimelineBlock } from '@/components/GroupTimelineBlock';
import { GroupNamePrompt } from '@/components/GroupNamePrompt';
import { CondensedTaskBlock } from '@/components/CondensedTaskBlock';
import { timeToMinutes, minutesToTime, snapTo15, formatTime12h, formatHour12h } from '@/hooks/useCurrentTime';
import { Calendar as CalIcon, Check, Copy, Unlink, Link, XCircle, Info } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { getOccupiedSlots, findValidPosition, clampResize, wouldOverlap, getRoutineConflicts, getCalendarConflicts } from '@/utils/collisionDetection';
import { clusterTasks, TaskCluster, getZoomForCluster } from '@/utils/taskClustering';
import { requestPendingMove } from '@/store/reflectionStore';
import { getIconByName } from '@/lib/iconLibrary';
import { getTaskScheduleTime } from '@/utils/taskVisibility';

// ---------------------------------------------------------------------------
// Lane assignment for overlapping timed tasks.
// When two or more tasks overlap in time, we split the column into vertical
// lanes so they render SIDE-BY-SIDE instead of stacking on top of each other.
// This keeps the "conflict" badge meaningful (overlap is still discouraged
// and flagged) while making the overlap visually explicit.
// ---------------------------------------------------------------------------
function computeTaskLanes(tasks: Task[]): Map<string, { lane: number; count: number }> {
  const result = new Map<string, { lane: number; count: number }>();
  const timed = tasks
    .filter((t) => !!t.time)
    .map((t) => ({
      id: t.id,
      start: timeToMinutes(t.time!),
      end: timeToMinutes(t.time!) + (t.duration || 30),
    }))
    .sort((a, b) => a.start - b.start || a.end - b.end);

  let group: typeof timed = [];
  let groupEnd = -Infinity;

  const flush = () => {
    if (group.length === 0) return;
    if (group.length === 1) {
      result.set(group[0].id, { lane: 0, count: 1 });
      return;
    }
    const laneEnds: number[] = [];
    const assigned: Array<{ id: string; lane: number }> = [];
    for (const item of group) {
      let lane = laneEnds.findIndex((end) => end <= item.start);
      if (lane === -1) {
        lane = laneEnds.length;
        laneEnds.push(item.end);
      } else {
        laneEnds[lane] = item.end;
      }
      assigned.push({ id: item.id, lane });
    }
    const count = laneEnds.length;
    for (const a of assigned) result.set(a.id, { lane: a.lane, count });
  };

  for (const item of timed) {
    if (item.start < groupEnd) {
      group.push(item);
      groupEnd = Math.max(groupEnd, item.end);
    } else {
      flush();
      group = [item];
      groupEnd = item.end;
    }
  }
  flush();

  return result;
}

export const DEFAULT_HOUR_HEIGHT = 56;
export const HOUR_HEIGHT = DEFAULT_HOUR_HEIGHT;
// Day window is user-configurable via Settings → Advanced. These exports are
// live bindings — they update whenever the store changes, and components that
// subscribe to `dayStartHour`/`dayEndHour` will re-render with fresh values.
export let START_HOUR = 6;
export let END_HOUR = 21;
export let HOURS: number[] = Array.from({ length: END_HOUR - START_HOUR }, (_, i) => START_HOUR + i);

function _syncHoursFromStore(s: { dayStartHour: number; dayEndHour: number }) {
  START_HOUR = s.dayStartHour;
  END_HOUR = s.dayEndHour;
  HOURS = Array.from({ length: Math.max(0, END_HOUR - START_HOUR) }, (_, i) => START_HOUR + i);
}
_syncHoursFromStore(useTaskStore.getState());
useTaskStore.subscribe((state, prev) => {
  if (state.dayStartHour !== prev.dayStartHour || state.dayEndHour !== prev.dayEndHour) {
    _syncHoursFromStore(state);
  }
});

interface TimelineColumnProps {
  date: string;
  tasks: Task[];
  nowMinutes: number;
  isToday: boolean;
  showTimeLabels?: boolean;
  hourHeight?: number;
  onZoomToCluster?: (cluster: TaskCluster, targetHourHeight: number, scrollToMin: number) => void;
}

function formatDuration(mins: number): string {
  if (mins < 60) return `${mins}m`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
}

function CalendarEventBlocks({ date, hourHeight, showTimeLabels }: { date: string; hourHeight: number; showTimeLabels: boolean }) {
  const allEvents = useCalendarStore((s) => s.events);
  const calendars = useCalendarStore((s) => s.calendars);
  const completedEventIds = useCalendarStore((s) => s.completedEventIds);
  const deletedEventIds = useCalendarStore((s) => s.deletedEventIds);
  const eventCategories = useCalendarStore((s) => s.eventCategories);
  const completeEvent = useCalendarStore((s) => s.completeEvent);
  const setEditingEvent = useCalendarStore((s) => s.setEditingEvent);
  const visibleCalIds = new Set(calendars.filter(c => c.visible).map(c => c.google_calendar_id));
  const events = allEvents.filter(e => !deletedEventIds.includes(e.id) && visibleCalIds.has(e.calendarId) && eventSpansDate(e, date));
  const timeLabelsLeft = showTimeLabels ? '3.25rem' : '2px';
  const clickTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [flashId, setFlashId] = useState<string | null>(null);

  if (events.length === 0) return null;

  const handleClick = (eventId: string) => {
    if (clickTimerRef.current) {
      clearTimeout(clickTimerRef.current);
      clickTimerRef.current = null;
      // Double click — complete
      completeEvent(eventId);
      setFlashId(eventId);
      if (navigator.vibrate) navigator.vibrate(20);
      setTimeout(() => setFlashId(null), 600);
    } else {
      clickTimerRef.current = setTimeout(() => {
        clickTimerRef.current = null;
        setEditingEvent(eventId);
      }, 250);
    }
  };

  return (
    <>
      {events.filter(e => e.time && !e.isAllDay).map((event) => {
        const mins = timeToMinutes(event.time!);
        const top = ((mins - START_HOUR * 60) / 60) * hourHeight;
        const height = Math.max(((event.duration || 30) / 60) * hourHeight, 14);
        const cal = calendars.find(c => c.google_calendar_id === event.calendarId);
        const color = cal?.color || '#4285f4';
        const isCompleted = completedEventIds.includes(event.id);
        const category = eventCategories[event.id];

        return (
          <div
            key={`gcal-${event.id}-${date}`}
            data-task-block
            className="absolute right-1 z-[5] cursor-default group select-none"
            style={{ top, height, left: timeLabelsLeft }}
            onClick={() => handleClick(event.id)}
          >
            <div
              className={`h-full rounded-[2px] overflow-hidden transition-colors shadow-sm ${
                isCompleted ? 'opacity-50' : ''
              }`}
              style={{
                backgroundColor: isCompleted ? undefined : 'hsl(var(--locked-fill))',
                border: '1.5px solid hsl(var(--locked-fill))',
                boxShadow: '0 1px 2px 0 hsl(var(--foreground) / 0.04)',
              }}
            >
              <div className="flex items-start h-full px-2 py-1 overflow-hidden relative">
                <div className="flex-1 min-w-0">
                  <div
                    className={`font-mono leading-tight truncate font-medium ${
                      isCompleted ? 'line-through text-muted-foreground/40' : ''
                    }`}
                    style={{
                      fontSize: 'var(--ui-task-title)',
                      lineHeight: 'var(--ui-leading-tight)',
                      ...(isCompleted ? {} : { color: 'hsl(var(--locked-text))' }),
                    }}
                  >
                    {event.title}
                  </div>
                  {height > 24 && (
                    <div className="flex items-center gap-1 mt-0.5">
                      <span
                        className="font-mono"
                        style={{
                          fontSize: 'var(--ui-task-meta)',
                          color: isCompleted ? undefined : 'hsl(var(--locked-text) / 0.7)',
                          opacity: isCompleted ? 0.5 : 1,
                        }}
                      >
                        {formatTime12h(event.time!)}
                      </span>
                      <CalIcon size={9} style={{ color: isCompleted ? undefined : 'hsl(var(--locked-text) / 0.6)' }} />
                      {category && (
                        <span
                          className="font-mono tracking-wider uppercase"
                          style={{
                            fontSize: 'var(--ui-task-badge)',
                            color: isCompleted ? undefined : 'hsl(var(--locked-text) / 0.7)',
                          }}
                        >
                          {category}
                        </span>
                      )}
                    </div>
                  )}
                </div>
                <AnimatePresence>
                  {flashId === event.id && (
                    <motion.div
                      initial={{ opacity: 0, scale: 0.5 }}
                      animate={{ opacity: 1, scale: 1 }}
                      exit={{ opacity: 0, scale: 0.5 }}
                      className="absolute inset-0 flex items-center justify-center bg-primary/10 rounded-[2px]"
                    >
                      <Check size={18} className="text-primary" strokeWidth={2.5} />
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            </div>
          </div>
        );
      })}
    </>
  );
}

function CompletedTaskBlock({ task, top, height, showTimeLabels, laneIndex = 0, laneCount = 1 }: {
  task: Task; top: number; height: number; showTimeLabels: boolean; laneIndex?: number; laneCount?: number;
}) {
  const { setEditingTask, uncompleteTask } = useTaskStore();
  const clickTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [flash, setFlash] = useState(false);

  const handleClick = useCallback(() => {
    if (clickTimerRef.current) {
      clearTimeout(clickTimerRef.current);
      clickTimerRef.current = null;
      setFlash(true);
      if (navigator.vibrate) navigator.vibrate(20);
      setTimeout(() => {
        uncompleteTask(task.id);
        setFlash(false);
      }, 400);
    } else {
      clickTimerRef.current = setTimeout(() => {
        clickTimerRef.current = null;
        setEditingTask(task.id);
      }, 250);
    }
  }, [task.id, setEditingTask, uncompleteTask]);

  return (
    <div
      data-task-block
      className={`absolute ${laneCount > 1 ? '' : 'right-1'} z-[18] pointer-events-auto cursor-pointer`}
      style={(() => {
        const leftBase = showTimeLabels ? '3.25rem' : '2px';
        const rightBase = '0.25rem';
        const laneGapPx = 3;
        const base: React.CSSProperties = { top, height, left: leftBase };
        if (laneCount > 1) {
          const laneWidthExpr = `((100% - ${leftBase} - ${rightBase}) / ${laneCount})`;
          base.left = `calc(${leftBase} + ${laneIndex} * ${laneWidthExpr})`;
          base.width = `calc(${laneWidthExpr} - ${laneGapPx}px)`;
          base.right = 'auto';
        }
        return base;
      })()}
      onClick={handleClick}
    >
      <div
        className="h-full rounded-[3px] border px-2 py-1 overflow-hidden relative"
        style={{
          backgroundColor: 'hsl(var(--background))',
          border: '1px solid hsl(var(--border) / 0.9)',
          boxShadow: 'inset 0 1px 2px hsl(var(--foreground) / 0.10), inset 0 2px 6px hsl(var(--foreground) / 0.08), inset 0 8px 14px -4px hsl(var(--foreground) / 0.06), inset 0 -1px 1px hsl(0 0% 100% / 0.7)',
        }}
      >
        <div className="flex items-center gap-1.5">
          <Check size={10} className="text-muted-foreground/70 shrink-0" />
          <span className="font-mono text-muted-foreground/80 line-through truncate" style={{ fontSize: 'var(--ui-task-meta)' }}>
            {task.title}
          </span>
        </div>
        {height > 28 && task.time && (
          <div className="font-mono text-muted-foreground/60 mt-0.5 line-through" style={{ fontSize: 'var(--ui-text-xs)' }}>
            {formatTime12h(task.time)} · {formatDuration(task.duration || 30)}
          </div>
        )}
        <AnimatePresence>
          {flash && (
            <motion.div
              initial={{ opacity: 0, scale: 0.5 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.5 }}
              className="absolute inset-0 flex items-center justify-center bg-primary/10 rounded-[3px]"
            >
              <XCircle size={16} className="text-primary" strokeWidth={2} />
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}

export function TimelineColumn({
  date,
  tasks,
  nowMinutes,
  isToday,
  showTimeLabels = true,
  hourHeight: hourHeightProp,
  onZoomToCluster,
}: TimelineColumnProps) {
  const HOUR_HEIGHT = hourHeightProp ?? DEFAULT_HOUR_HEIGHT;
  // Subscribe so the column re-renders when the day window changes.
  useTaskStore((s) => s.dayStartHour);
  useTaskStore((s) => s.dayEndHour);
  const { setEditingTask, reorderTask, moveTask, resizeTask, completeTask, canMoveTask, addTask, routinesEnabled, createEmptyGroup } = useTaskStore();
  const allStoreTasks = useTaskStore((s) => s.tasks);
  const colRef = useRef<HTMLDivElement>(null);
  const [columnWidthPx, setColumnWidthPx] = useState<number | undefined>(undefined);
  const [dragOverTime, setDragOverTime] = useState<string | null>(null);
  const [dragOverDuration, setDragOverDuration] = useState<number>(30);
  const [dragValid, setDragValid] = useState(true);
  const [dragMsg, setDragMsg] = useState('');
  const [dragMsgTop, setDragMsgTop] = useState<number | null>(null);

  const didDragRef = useRef(false);
  const dragOffsetRef = useRef(0);

  const [resizing, setResizing] = useState<{
    id: string;
    edge: 'top' | 'bottom';
    startY: number;
    origTime: string;
    origDuration: number;
  } | null>(null);

  const [resizePreview, setResizePreview] = useState<{
    time: string;
    duration: number;
  } | null>(null);

  const [creating, setCreating] = useState<{
    startMin: number;
    currentMin: number;
  } | null>(null);
  const [newTaskInput, setNewTaskInput] = useState<{
    time: string;
    duration: number;
    top: number;
    height: number;
  } | null>(null);
  const [newTaskTitle, setNewTaskTitle] = useState('');
  const [newTaskCategory, setNewTaskCategory] = useState<string | undefined>();
  const [newTaskDueDate, setNewTaskDueDate] = useState<string | undefined>();
  // Refs mirror the latest category/dueDate/title so handleNewTaskSubmit can
  // read them synchronously even when invoked right after a setState (e.g. from
  // TagAutocomplete's Enter-to-select path) before React has committed.
  const newTaskTitleRef = useRef('');
  const newTaskCategoryRef = useRef<string | undefined>();
  const newTaskDueDateRef = useRef<string | undefined>();
  const newTaskRef = useRef<HTMLInputElement>(null);
  const proxyInputRef = useRef<HTMLInputElement>(null);
  const { hint: entryHint } = useEntryHint();

  // Hold-to-create-Group: 1.5s pointer hold on empty timeline opens a name prompt.
  const [groupPromptSlot, setGroupPromptSlot] = useState<{ time: string; duration: number } | null>(null);
  const groupHoldTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const groupHoldStartRef = useRef<{ x: number; y: number; startMin: number } | null>(null);

  const cancelGroupHoldTimer = useCallback(() => {
    if (groupHoldTimerRef.current) {
      clearTimeout(groupHoldTimerRef.current);
      groupHoldTimerRef.current = null;
    }
    groupHoldStartRef.current = null;
  }, []);

  // When the real input mounts, steal focus from the proxy input
  useEffect(() => {
    if (newTaskInput && newTaskRef.current) {
      newTaskRef.current.focus();
    }
  }, [newTaskInput]);

  // Keep refs in sync with state for synchronous reads inside handleNewTaskSubmit
  // (e.g. when TagAutocomplete fires submit immediately after setState).
  useEffect(() => { newTaskTitleRef.current = newTaskTitle; }, [newTaskTitle]);
  useEffect(() => { newTaskCategoryRef.current = newTaskCategory; }, [newTaskCategory]);
  useEffect(() => { newTaskDueDateRef.current = newTaskDueDate; }, [newTaskDueDate]);

  const showCompletedTasks = useTimezoneStore((s) => s.showCompletedTasks);
  const timezone = useTimezoneStore((s) => s.timezone);
  const todayStr = getTodayInTz(timezone);
  const isPastDay = date < todayStr;

  const activeTasks = tasks.filter((t) => !t.completed && t.time);
  const completedTasks = showCompletedTasks ? tasks.filter((t) => t.completed && getTaskScheduleTime(t)) : [];
  const nowTop = ((nowMinutes - START_HOUR * 60) / 60) * HOUR_HEIGHT;

  // Count tasks in waiting room for past days (these are filtered out of `tasks` prop)
  const waitingRoomCount = isPastDay
    ? allStoreTasks.filter(t => t.inWaitingRoom && t.date === date && !t.archivedAt).length
    : 0;

  // Compute routine conflict IDs when routines are enabled
  const routineConflictIds = useMemo(() => {
    if (!routinesEnabled) return new Set<string>();
    return getRoutineConflicts(allStoreTasks, date);
  }, [allStoreTasks, date, routinesEnabled]);

  // Compute calendar conflict IDs — tasks overlapping timed Google Calendar events
  const allCalendarEvents = useCalendarStore((s) => s.events);
  const visibleCalendars = useCalendarStore((s) => s.calendars);
  const deletedCalendarEventIds = useCalendarStore((s) => s.deletedEventIds);
  const calendarConflictIds = useMemo(() => {
    const visibleIds = new Set(visibleCalendars.filter(c => c.visible).map(c => c.google_calendar_id));
    const visibleEvents = allCalendarEvents.filter(e =>
      visibleIds.has(e.calendarId) && !deletedCalendarEventIds.includes(e.id)
    );
    return getCalendarConflicts(allStoreTasks, visibleEvents, date);
  }, [allStoreTasks, allCalendarEvents, visibleCalendars, deletedCalendarEventIds, date]);

  const activeTaskId = isToday
    ? activeTasks.find((t) => {
        if (!t.time) return false;
        const start = timeToMinutes(t.time);
        const end = start + (t.duration || 30);
        return nowMinutes >= start && nowMinutes < end;
      })?.id || null
    : null;

  const getMinutesFromY = useCallback((clientY: number) => {
    if (!colRef.current) return 0;
    const rect = colRef.current.getBoundingClientRect();
    const y = clientY - rect.top;
    return START_HOUR * 60 + (y / HOUR_HEIGHT) * 60;
  }, [HOUR_HEIGHT]);

  useEffect(() => {
    const el = colRef.current;
    if (!el) return;

    const measure = () => {
      const rect = el.getBoundingClientRect();
      const leftInset = showTimeLabels ? 52 : 2;
      setColumnWidthPx(Math.max(rect.width - leftInset - 4, 0));
    };

    measure();

    const observer = new ResizeObserver(measure);
    observer.observe(el);

    return () => observer.disconnect();
  }, [showTimeLabels]);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    const mins = getMinutesFromY(e.clientY - dragOffsetRef.current);
    const snapped = snapTo15(mins);
    const taskDurationStr = e.dataTransfer.types.includes('taskduration') ? '30' : '30';
    const duration = parseInt(taskDurationStr, 10);
    const allTasks = useTaskStore.getState().tasks;
    const occupiedSlots = getOccupiedSlots(allTasks, date, undefined, routinesEnabled);
    const overlap = wouldOverlap(snapped, duration, occupiedSlots);
    setDragOverTime(minutesToTime(snapped));
    setDragValid(!overlap);
  }, [getMinutesFromY, date]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    const taskId = e.dataTransfer.getData('taskId');
    const taskDuration = parseInt(e.dataTransfer.getData('taskDuration') || '30', 10);
    const libraryTaskId = e.dataTransfer.getData('libraryTaskId');
    const sourceDate = e.dataTransfer.getData('sourceDate');

    // ── Drop INTO a Group (Library + scheduled task path) ──
    const dropTargetEl = document.elementFromPoint(e.clientX, e.clientY) as HTMLElement | null;
    const groupEl = dropTargetEl?.closest('[data-group-block]') as HTMLElement | null;
    const dropGroupId = groupEl?.getAttribute('data-group-id') || null;

    if (dropGroupId && dropGroupId !== taskId) {
      const { addTaskToGroup } = useTaskStore.getState();
      if (libraryTaskId) {
        const title = e.dataTransfer.getData('libraryTitle');
        const dur = parseInt(e.dataTransfer.getData('libraryDuration') || '30', 10);
        const newId = addTask({
          title,
          date,
          time: '09:00',
          duration: dur,
          priority: 0,
          type: 'one-time',
        });
        const ok = addTaskToGroup(newId, dropGroupId);
        if (!ok) {
          // Revert by removing the just-created task
          useTaskStore.getState().deleteTask(newId);
        } else {
          useLibraryStore.getState().removeItem(libraryTaskId);
        }
        setDragOverTime(null);
        return;
      }
      if (taskId) {
        const ok = addTaskToGroup(taskId, dropGroupId);
        if (!ok) {
          setDragMsg("Couldn't add to Group");
          setTimeout(() => setDragMsg(''), 2000);
        }
        setDragOverTime(null);
        return;
      }
    }

    const mins = getMinutesFromY(e.clientY - dragOffsetRef.current);
    const snapped = snapTo15(mins);

    // Collision check
    const allTasks = useTaskStore.getState().tasks;
    const excludeId = taskId || undefined;
    const occupiedSlots = getOccupiedSlots(allTasks, date, excludeId, routinesEnabled);
    const duration = libraryTaskId
      ? parseInt(e.dataTransfer.getData('libraryDuration') || '30', 10)
      : taskDuration;
    const { startMin, blocked } = findValidPosition(snapped, duration, occupiedSlots);

    if (blocked) {
      setDragMsg('No space available');
      setDragValid(false);
      setTimeout(() => { setDragMsg(''); setDragValid(true); }, 2000);
      setDragOverTime(null);
      return;
    }

    const newTime = minutesToTime(startMin);

    if (libraryTaskId) {
      const title = e.dataTransfer.getData('libraryTitle');
      addTask({
        title,
        date,
        time: newTime,
        duration,
        priority: 0,
        type: 'one-time',
      });
      // Remove from library after scheduling
      useLibraryStore.getState().removeItem(libraryTaskId);
      setDragOverTime(null);
      return;
    }

    if (!taskId) { setDragOverTime(null); return; }

    if (sourceDate && sourceDate !== date) {
      const validation = canMoveTask(taskId, date, newTime);
      if (!validation.allowed) {
        const violation = 'reason' in validation ? validation.reason : 'Cannot move';
        const opened = requestPendingMove({ taskId, newDate: date, newTime, violation });
        if (!opened) {
          // Another prompt was already open — silently swallow this attempt.
        }
        setDragOverTime(null);
        return;
      }
      moveTask(taskId, date, newTime);
    } else {
      reorderTask(taskId, newTime);
    }
    setDragOverTime(null);
  }, [date, getMinutesFromY, canMoveTask, moveTask, reorderTask, addTask]);

  // Resize — completely silent, no dialogs.
  // LOCKED tasks are allowed to resize via the timing handles (duration only);
  // this never triggers the Reflection prompt because resizeTask bypasses it.
  const handleResizeStart = useCallback((e: React.MouseEvent | React.TouchEvent, task: Task, edge: 'top' | 'bottom') => {
    e.preventDefault();
    e.stopPropagation();
    didDragRef.current = true;
    const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY;
    setResizing({
      id: task.id,
      edge,
      startY: clientY,
      origTime: task.time || '09:00',
      origDuration: task.duration || 30,
    });
  }, []);

  useEffect(() => {
    if (!resizing) return;
    const handleMove = (clientY: number) => {
      const deltaY = clientY - resizing.startY;
      const deltaMinutes = (deltaY / HOUR_HEIGHT) * 60;

      // Get collision bounds. When resizing a Group container, its own children
      // should not block the resize because they live inside that container.
      const allTasks = useTaskStore.getState().tasks;
      const resizingTask = allTasks.find((t) => t.id === resizing.id);
      const occupiedSlots = getOccupiedSlots(allTasks, date, resizing.id, routinesEnabled).filter((slot) => {
        if (resizingTask?.type !== 'group') return true;
        const child = allTasks.find((t) => t.id === slot.id);
        return child?.groupId !== resizing.id;
      });
      const origStartMin = timeToMinutes(resizing.origTime);
      const origEndMin = origStartMin + resizing.origDuration;
      const bounds = clampResize(resizing.id, resizing.edge, origStartMin, origEndMin, occupiedSlots);

      if (resizing.edge === 'bottom') {
        const newDuration = snapTo15(resizing.origDuration + deltaMinutes);
        const clamped = Math.max(15, newDuration);
        // Clamp end to not exceed next task
        const newEnd = origStartMin + clamped;
        const clampedEnd = Math.min(newEnd, bounds.maxEnd);
        const finalDuration = Math.max(15, clampedEnd - origStartMin);
        resizeTask(resizing.id, resizing.origTime, finalDuration);
        setResizePreview({ time: resizing.origTime, duration: finalDuration });
      } else {
        const origStart = timeToMinutes(resizing.origTime);
        const newStart = snapTo15(origStart + deltaMinutes);
        // Clamp start to not go past previous task
        const clampedStart = Math.max(newStart, bounds.minStart);
        const newDuration = resizing.origDuration + (origStart - clampedStart);
        if (newDuration >= 15) {
          resizeTask(resizing.id, minutesToTime(clampedStart), newDuration);
          setResizePreview({ time: minutesToTime(clampedStart), duration: newDuration });
        }
      }
    };
    const handleMouseMove = (e: MouseEvent) => handleMove(e.clientY);
    const handleTouchMove = (e: TouchEvent) => { e.preventDefault(); handleMove(e.touches[0].clientY); };
    const handleUp = () => {
      setResizing(null);
      setResizePreview(null);
      setTimeout(() => { didDragRef.current = false; }, 50);
    };
    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleUp);
    window.addEventListener('touchmove', handleTouchMove, { passive: false });
    window.addEventListener('touchend', handleUp);
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleUp);
      window.removeEventListener('touchmove', handleTouchMove);
      window.removeEventListener('touchend', handleUp);
    };
  }, [resizing, resizeTask, HOUR_HEIGHT, date]);

  // Drag-to-create: mouse handlers
  const handleCreateMouseDown = useCallback((e: React.MouseEvent) => {
    if ((e.target as HTMLElement).closest('[data-task-block]') || (e.target as HTMLElement).closest('[data-cluster-block]')) return;
    if (newTaskInput) return;
    if (useCarryStore.getState().carried) return;
    if (isInDropCooldown()) return;
    const mins = getMinutesFromY(e.clientY);
    const snapped = snapTo15(mins);
    setCreating({ startMin: snapped, currentMin: snapped });

    // Arm the hold-to-create-Group timer. If the user holds for 1.5s without
    // dragging more than 4px in any direction, we promote the gesture to a
    // "new Group" prompt instead of a normal task drag-create.
    cancelGroupHoldTimer();
    groupHoldStartRef.current = { x: e.clientX, y: e.clientY, startMin: snapped };
    groupHoldTimerRef.current = setTimeout(() => {
      const start = groupHoldStartRef.current;
      groupHoldTimerRef.current = null;
      if (!start) return;
      // Default Group span: 60 min, snapped to the slot the user pressed on.
      const time = minutesToTime(start.startMin);
      setCreating(null);
      setGroupPromptSlot({ time, duration: 60 });
      if (navigator.vibrate) navigator.vibrate(20);
    }, 1500);
  }, [getMinutesFromY, newTaskInput, cancelGroupHoldTimer]);

  // Drag-to-create: touch handlers
  // Strategy: require a 500ms hold before activating create mode.
  // If the finger moves >8px before the timer fires, it's a scroll — cancel.
  const createTouchRef = useRef<{ startMin: number; startY: number; startX: number; activated: boolean } | null>(null);
  const createTouchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Use native (non-passive) touch listeners for drag-to-create so we can
  // call preventDefault() once the hold activates and stop the page from scrolling.
  useEffect(() => {
    const el = colRef.current;
    if (!el) return;

    // We read these from refs so the listeners don't need to be re-attached on every state change.
    const getMinutes = getMinutesFromY;

    const onTouchStart = (e: TouchEvent) => {
      // Ignore multi-touch (pinch zoom)
      if (e.touches.length > 1) {
        if (createTouchTimer.current) clearTimeout(createTouchTimer.current);
        createTouchTimer.current = null;
        createTouchRef.current = null;
        setCreating(null);
        return;
      }
      const target = e.target as HTMLElement;
      if (target.closest('[data-task-block]') || target.closest('[data-cluster-block]') || target.closest('input') || target.closest('button')) return;
      if (useCarryStore.getState().carried) return;
      if (isInDropCooldown()) return;
      const touch = e.touches[0];
      // Offset touch point upward slightly — iOS reports contact below visual tap point
      const mins = getMinutes(touch.clientY - 8);
      const snapped = snapTo15(mins);
      createTouchRef.current = { startMin: snapped, startY: touch.clientY, startX: touch.clientX, activated: false };
      createTouchTimer.current = setTimeout(() => {
        if (createTouchRef.current) {
          createTouchRef.current.activated = true;
          setCreating({ startMin: createTouchRef.current.startMin, currentMin: createTouchRef.current.startMin });
        }
      }, 500);
    };

    const onTouchMove = (e: TouchEvent) => {
      // Cancel on multi-touch (pinch zoom)
      if (e.touches.length > 1) {
        if (createTouchTimer.current) clearTimeout(createTouchTimer.current);
        createTouchTimer.current = null;
        createTouchRef.current = null;
        setCreating(null);
        return;
      }
      if (!createTouchRef.current) return;
      const touch = e.touches[0];
      const dx = Math.abs(touch.clientX - createTouchRef.current.startX);
      const dy = Math.abs(touch.clientY - createTouchRef.current.startY);

      if (!createTouchRef.current.activated) {
        if (dx > 8 || dy > 8) {
          if (createTouchTimer.current) clearTimeout(createTouchTimer.current);
          createTouchTimer.current = null;
          createTouchRef.current = null;
          setCreating(null);
        }
        return; // allow native scroll
      }

      // Activated — horizontal swipe cancels
      if (dx > dy && dx > 15) {
        createTouchRef.current = null;
        setCreating(null);
        return;
      }

      // ** Block scrolling now that we're in create mode **
      e.preventDefault();
      const mins = getMinutes(touch.clientY);
      const snapped = snapTo15(mins);
      (createTouchRef.current as any).lastMin = snapped;
      setCreating({ startMin: createTouchRef.current.startMin, currentMin: snapped });
    };

    const onTouchEnd = () => {
      if (createTouchTimer.current) {
        clearTimeout(createTouchTimer.current);
        createTouchTimer.current = null;
      }
      if (!createTouchRef.current) return;
      if (createTouchRef.current.activated) {
        // We need the latest creating state — read from the DOM-schedule ref workaround:
        // Since we can't read React state here reliably, compute from the ref.
        const ref = createTouchRef.current;
        // The creating state was set in onTouchMove; the last currentMin came from there.
        // We'll use a small trick: store currentMin on the ref too.
        const startMin = Math.min(ref.startMin, (ref as any).lastMin ?? ref.startMin);
        const endMin = Math.max(ref.startMin, (ref as any).lastMin ?? ref.startMin);
        const duration = Math.max(15, endMin - startMin);
        const time = minutesToTime(startMin);
        const top = ((startMin - START_HOUR * 60) / 60) * HOUR_HEIGHT;
        const height = (duration / 60) * HOUR_HEIGHT;
        setCreating(null);
        setNewTaskTitle('');
        setNewTaskCategory(undefined);
        setNewTaskInput({ time, duration, top, height });
        // Focus proxy input synchronously within touchend to open iOS keyboard
        proxyInputRef.current?.focus();
      } else {
        setCreating(null);
      }
      createTouchRef.current = null;
    };

    // Attach with { passive: false } so preventDefault() works on touchmove
    el.addEventListener('touchstart', onTouchStart, { passive: true });
    el.addEventListener('touchmove', onTouchMove, { passive: false });
    el.addEventListener('touchend', onTouchEnd, { passive: true });

    return () => {
      el.removeEventListener('touchstart', onTouchStart);
      el.removeEventListener('touchmove', onTouchMove);
      el.removeEventListener('touchend', onTouchEnd);
    };
  }, [getMinutesFromY, HOUR_HEIGHT]);

  useEffect(() => {
    if (!creating) return;
    const handleMouseMove = (e: MouseEvent) => {
      const mins = getMinutesFromY(e.clientY);
      const snapped = snapTo15(mins);
      // Any meaningful movement cancels the hold-to-create-Group timer.
      const start = groupHoldStartRef.current;
      if (start) {
        const dx = Math.abs(e.clientX - start.x);
        const dy = Math.abs(e.clientY - start.y);
        if (dx > 4 || dy > 4) cancelGroupHoldTimer();
      }
      setCreating(prev => prev ? { ...prev, currentMin: snapped } : null);
    };
    const handleMouseUp = () => {
      cancelGroupHoldTimer();
      if (!creating) return;
      const startMin = Math.min(creating.startMin, creating.currentMin);
      const endMin = Math.max(creating.startMin, creating.currentMin);
      const duration = Math.max(15, endMin - startMin);
      const time = minutesToTime(startMin);
      const top = ((startMin - START_HOUR * 60) / 60) * HOUR_HEIGHT;
      const height = (duration / 60) * HOUR_HEIGHT;
      setCreating(null);
      setNewTaskTitle('');
      setNewTaskCategory(undefined);
      setNewTaskInput({ time, duration, top, height });
      proxyInputRef.current?.focus();
    };
    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [creating, getMinutesFromY, HOUR_HEIGHT, cancelGroupHoldTimer]);

  const handleNewTaskSubmit = useCallback(() => {
    // Read from refs so values set synchronously (e.g. by TagAutocomplete just
    // before invoking submit) are visible even if React hasn't re-rendered yet.
    const rawTitle = newTaskTitleRef.current || newTaskTitle;
    const cleanTitle = rawTitle.replace(/#\S*$/, '').replace(/\/\/\S*$/, '').replace(/@\S*$/, '').trim();
    if (!newTaskInput || !cleanTitle) {
      setNewTaskInput(null);
      setNewTaskCategory(undefined);
      setNewTaskDueDate(undefined);
      return;
    }

    const category = newTaskCategoryRef.current || newTaskCategory || undefined;
    const dueDate = newTaskDueDateRef.current || newTaskDueDate || undefined;

    // Collision check before creating
    const allTasks = useTaskStore.getState().tasks;
    const occupiedSlots = getOccupiedSlots(allTasks, date, undefined, routinesEnabled);
    const startMin = timeToMinutes(newTaskInput.time);
    if (wouldOverlap(startMin, newTaskInput.duration, occupiedSlots)) {
      const { startMin: validStart, blocked } = findValidPosition(startMin, newTaskInput.duration, occupiedSlots);
      if (blocked) {
        setDragMsg('No space available');
        setTimeout(() => setDragMsg(''), 2000);
        setNewTaskInput(null);
        setNewTaskCategory(undefined);
        setNewTaskDueDate(undefined);
        return;
      }
      addTask({
        title: cleanTitle,
        date,
        time: minutesToTime(validStart),
        duration: newTaskInput.duration,
        priority: 0,
        type: 'one-time',
        category,
        dueDate,
      });
    } else {
      addTask({
        title: cleanTitle,
        date,
        time: newTaskInput.time,
        duration: newTaskInput.duration,
        priority: 0,
        type: 'one-time',
        category,
        dueDate,
      });
    }
    incrementEntryCount();
    setNewTaskInput(null);
    setNewTaskTitle('');
    setNewTaskCategory(undefined);
    setNewTaskDueDate(undefined);
  }, [newTaskInput, newTaskTitle, newTaskCategory, newTaskDueDate, date, addTask]);

  const creatingPreview = creating ? (() => {
    const startMin = Math.min(creating.startMin, creating.currentMin);
    const endMin = Math.max(creating.startMin, creating.currentMin);
    const duration = Math.max(15, endMin - startMin);
    const top = ((startMin - START_HOUR * 60) / 60) * HOUR_HEIGHT;
    const height = (duration / 60) * HOUR_HEIGHT;
    return { top, height, time: minutesToTime(startMin), duration };
  })() : null;

  const timeLabelsWidth = showTimeLabels ? '3.25rem' : '0';

  const handleTaskClick = useCallback((taskId: string) => {
    if (didDragRef.current) return;
    // Don't open edit panel if in carry mode
    if (useCarryStore.getState().carried) return;
    setEditingTask(taskId);
  }, [setEditingTask]);

  // --- Tap-to-drop for carry mode ---
  const carryTapRef = useRef<{ x: number; y: number } | null>(null);

  const handleCarryPointerDown = useCallback((e: React.PointerEvent) => {
    if (!useCarryStore.getState().carried) return;
    carryTapRef.current = { x: e.clientX, y: e.clientY };
  }, []);

  const handleCarryPointerUp = useCallback((e: React.PointerEvent) => {
    const carried = useCarryStore.getState().carried;
    if (!carried || !carryTapRef.current) {
      carryTapRef.current = null;
      return;
    }

    // Check it's a clean tap (not scroll)
    const dx = Math.abs(e.clientX - carryTapRef.current.x);
    const dy = Math.abs(e.clientY - carryTapRef.current.y);
    carryTapRef.current = null;

    if (dx > 10 || dy > 10) return; // finger moved too much
    if (isInScrollCooldown()) return; // just finished scrolling

    // Calculate target time from tap position
    const mins = getMinutesFromY(e.clientY);
    const snapped = snapTo15(mins);

    // Round carried duration to nearest 15-min (≥15) so dropped tasks always
    // land on a clean grid increment, regardless of where they came from.
    const dropDuration = roundCarriedDuration(carried.duration);

    // Collision check for carry drop
    const allTasks = useTaskStore.getState().tasks;
    const excludeId = carried.fromLibrary ? undefined : carried.taskId;
    const occupiedSlots = getOccupiedSlots(allTasks, date, excludeId, routinesEnabled);
    const { startMin, blocked } = findValidPosition(snapped, dropDuration, occupiedSlots);

    if (blocked) {
      setDragMsg('No space available');
      setTimeout(() => setDragMsg(''), 2000);
      return;
    }

    const newTime = minutesToTime(startMin);

    // Perform the drop
    const dropped = useCarryStore.getState().drop();
    if (!dropped) return;

    if (dropped.fromLibrary && dropped.libraryItemId) {
      const libItem = useLibraryStore.getState().items.find(i => i.id === dropped.libraryItemId);
      addTask({
        title: dropped.title,
        date,
        time: newTime,
        duration: dropDuration,
        priority: 0,
        type: 'one-time',
        ...(libItem ? {
          dueDate: libItem.dueDate ?? undefined,
          description: libItem.note || undefined,
          category: libItem.category || undefined,
          icon: libItem.icon || undefined,
          subtasks: libItem.subtasks,
          attachments: libItem.attachments,
        } : {}),
      } as any);
      // Remove from library after placing on schedule
      useLibraryStore.getState().removeItem(dropped.libraryItemId);
      window.dispatchEvent(new CustomEvent('tutorial:task-scheduled'));
    } else if (dropped.fromWaitingRoom) {
      const { updateTask } = useTaskStore.getState();
      updateTask(dropped.taskId, {
        inWaitingRoom: false,
        date,
        time: newTime,
        duration: dropDuration,
      } as any);
    } else {
      // Regular scheduled task (incl. tasks picked up from a Group)
      if (dropped.fromDate !== date) {
        const validation = canMoveTask(dropped.taskId, date, newTime);
        if (!validation.allowed) {
          const violation = 'reason' in validation ? validation.reason : 'Cannot move';
          requestPendingMove({ taskId: dropped.taskId, newDate: date, newTime, violation });
          // Apply duration immediately so the deferred move uses it.
          useTaskStore.getState().updateTask(dropped.taskId, { duration: dropDuration } as any);
          return;
        }
        moveTask(dropped.taskId, date, newTime);
        useTaskStore.getState().updateTask(dropped.taskId, { duration: dropDuration } as any);
      } else {
        reorderTask(dropped.taskId, newTime);
        useTaskStore.getState().updateTask(dropped.taskId, { duration: dropDuration, time: newTime } as any);
      }
    }
  }, [date, getMinutesFromY, addTask, canMoveTask, moveTask, reorderTask]);

  // Touch drop handler — listens for touchend globally when a touch drag is active
  useEffect(() => {
    const handleGlobalTouchEnd = (e: TouchEvent) => {
      const { dragging } = useTouchDragStore.getState();
      if (!dragging || !colRef.current) return;

      const touch = e.changedTouches[0];
      const rect = colRef.current.getBoundingClientRect();

      // Check if the finger ended over this column
      if (
        touch.clientX >= rect.left &&
        touch.clientX <= rect.right &&
        touch.clientY >= rect.top &&
        touch.clientY <= rect.bottom
      ) {
        // ── Drop INTO a Group? ──
        const dropEl = document.elementFromPoint(touch.clientX, touch.clientY) as HTMLElement | null;
        const groupEl = dropEl?.closest('[data-group-block]') as HTMLElement | null;
        const dropGroupId = groupEl?.getAttribute('data-group-id') || null;

        if (dropGroupId && (dragging.type !== 'task' || dropGroupId !== dragging.id)) {
          const { addTaskToGroup } = useTaskStore.getState();
          if (dragging.type === 'library') {
            const newId = addTask({
              title: dragging.title,
              date,
              time: '09:00',
              duration: dragging.duration,
              priority: 0,
              type: 'one-time',
            });
            const ok = addTaskToGroup(newId, dropGroupId);
            if (!ok) {
              useTaskStore.getState().deleteTask(newId);
            } else if (dragging.id) {
              useLibraryStore.getState().removeItem(dragging.id);
            }
          } else if (dragging.type === 'waitingRoom') {
            const { updateTask } = useTaskStore.getState();
            updateTask(dragging.id, { inWaitingRoom: false, date, time: '09:00' } as any);
            const ok = addTaskToGroup(dragging.id, dropGroupId);
            if (!ok) {
              setDragMsg("Couldn't add to Group");
              setTimeout(() => setDragMsg(''), 2000);
            }
          } else if (dragging.type === 'task') {
            const ok = addTaskToGroup(dragging.id, dropGroupId);
            if (!ok) {
              setDragMsg("Couldn't add to Group");
              setTimeout(() => setDragMsg(''), 2000);
            }
          }
          useTouchDragStore.getState().endDrag();
          return;
        }

        // Use dragOffset to place task at its top edge, not finger position
        const y = touch.clientY - rect.top - dragOffsetRef.current;
        const mins = START_HOUR * 60 + (y / HOUR_HEIGHT) * 60;
        const snapped = snapTo15(mins);

        // Collision check for touch drop
        const allTasks = useTaskStore.getState().tasks;
        const excludeId = dragging.type === 'task' ? dragging.id : undefined;
        const duration = dragging.duration || 30;
        const occupiedSlots = getOccupiedSlots(allTasks, date, excludeId, routinesEnabled);
        const { startMin, blocked } = findValidPosition(snapped, duration, occupiedSlots);

        if (blocked) {
          setDragMsg('No space available');
          setDragValid(false);
          setTimeout(() => { setDragMsg(''); setDragValid(true); }, 2000);
          useTouchDragStore.getState().endDrag();
          return;
        }

        const newTime = minutesToTime(startMin);

        if (dragging.type === 'library') {
          addTask({
            title: dragging.title,
            date,
            time: newTime,
            duration: dragging.duration,
            priority: 0,
            type: 'one-time',
          });
          // Remove from library after scheduling
          if (dragging.id) useLibraryStore.getState().removeItem(dragging.id);
        } else if (dragging.type === 'waitingRoom') {
          const { updateTask } = useTaskStore.getState();
          updateTask(dragging.id, {
            inWaitingRoom: false,
            date,
            time: newTime,
          } as any);
        } else if (dragging.type === 'task') {
          if (dragging.sourceDate && dragging.sourceDate !== date) {
            const validation = canMoveTask(dragging.id, date, newTime);
            if (!validation.allowed) {
              const violation = 'reason' in validation ? validation.reason : 'Cannot move';
              requestPendingMove({ taskId: dragging.id, newDate: date, newTime, violation });
            } else {
              moveTask(dragging.id, date, newTime);
            }
          } else {
            reorderTask(dragging.id, newTime);
          }
        }

        useTouchDragStore.getState().endDrag();
      }
    };

    window.addEventListener('touchend', handleGlobalTouchEnd);
    return () => window.removeEventListener('touchend', handleGlobalTouchEnd);
  }, [date, HOUR_HEIGHT, addTask, canMoveTask, moveTask, reorderTask]);

  // Track touch drag ghost position over this column for live drop preview
  const touchDragging = useTouchDragStore((s) => s.dragging);
  const touchGhostPos = useTouchDragStore((s) => s.ghostPos);

  const touchDropPreview = (() => {
    if (!touchDragging || !touchGhostPos || !colRef.current) return null;
    const rect = colRef.current.getBoundingClientRect();
    if (touchGhostPos.x < rect.left || touchGhostPos.x > rect.right) return null;
    const y = touchGhostPos.y - rect.top - dragOffsetRef.current;
    const mins = START_HOUR * 60 + (y / HOUR_HEIGHT) * 60;
    const snapped = snapTo15(mins);
    const duration = touchDragging.duration || 30;
    const top = ((snapped - START_HOUR * 60) / 60) * HOUR_HEIGHT;
    const height = Math.max((duration / 60) * HOUR_HEIGHT, 22);
    return { top, height, time: minutesToTime(snapped), duration };
  })();

  // ─── Library drag preview ─────────────────────────────────
  // When the user click-and-drags a Library item over this timeline column,
  // render a styled task-block-shaped preview at the snapped slot so they can
  // see exactly where the task will land before releasing.
  const libDragActive = useLibraryDragStore((s) => s.active);
  const libDragItem = useLibraryDragStore((s) => s.item);
  const libDragX = useLibraryDragStore((s) => s.x);
  const libDragY = useLibraryDragStore((s) => s.y);

  const libraryDropPreview = (() => {
    if (!libDragActive || !libDragItem || !colRef.current) return null;
    const rect = colRef.current.getBoundingClientRect();
    if (libDragX < rect.left || libDragX > rect.right) return null;
    if (libDragY < rect.top || libDragY > rect.bottom) return null;
    const y = libDragY - rect.top;
    const mins = START_HOUR * 60 + (y / HOUR_HEIGHT) * 60;
    const duration = Math.max(15, libDragItem.duration || 30);
    // Anchor the block's START at the pointer (matches the actual drop logic,
    // which uses snapTo15(mins) as the start time).
    const snapped = snapTo15(mins);
    const top = ((snapped - START_HOUR * 60) / 60) * HOUR_HEIGHT;
    const height = Math.max((duration / 60) * HOUR_HEIGHT, 22);
    // Collision check
    const occupied = getOccupiedSlots(useTaskStore.getState().tasks, date);
    const { blocked } = findValidPosition(snapped, duration, occupied);
    return {
      top,
      height,
      time: minutesToTime(snapped),
      duration,
      title: libDragItem.title,
      blocked,
      Icon: getIconByName(libDragItem.icon) || null,
    };
  })();

  // Scheduled drag: handle drop when pointer is released
  const scheduledDragActive = useScheduledDragStore((s) => s.active);
  const scheduledDragTaskId = useScheduledDragStore((s) => s.taskId);
  const scheduledDragMinutes = useScheduledDragStore((s) => s.currentMinutes);
  const scheduledDragDuration = useScheduledDragStore((s) => s.duration);
  const scheduledDragTargetDate = useScheduledDragStore((s) => s.targetDate);
  const scheduledDragUnlinkMode = useScheduledDragStore((s) => s.unlinkMode);
  const scheduledDragIsLinked = useScheduledDragStore((s) => s.isLinkedTask);
  const scheduledDragBlocked = useScheduledDragStore((s) => s.blocked);
  const scheduledDragCopyMode = useScheduledDragStore((s) => s.copyMode);
  const scheduledDragRelinkMode = useScheduledDragStore((s) => s.relinkMode);
  const scheduledDragRelinkTargetId = useScheduledDragStore((s) => s.relinkTargetId);

  // Track whether the active drag is hovering over any Group block (drop-to-add)
  useEffect(() => {
    if (!scheduledDragActive) return;
    const handleMove = (e: PointerEvent) => {
      const s = useScheduledDragStore.getState();
      if (!s.active || !s.taskId) return;
      const el = document.elementFromPoint(e.clientX, e.clientY) as HTMLElement | null;
      const groupEl = el?.closest('[data-group-block]') as HTMLElement | null;
      const groupId = groupEl?.getAttribute('data-group-id') || null;
      // Don't treat the dragged group itself as a drop target
      const validGroupId = groupId && groupId !== s.taskId ? groupId : null;
      if (s.dropTargetGroupId !== validGroupId) {
        useScheduledDragStore.getState().setDropTargetGroup(validGroupId);
      }
    };
    window.addEventListener('pointermove', handleMove);
    return () => window.removeEventListener('pointermove', handleMove);
  }, [scheduledDragActive]);

  // Scheduled drag: single global drop handler — only the column matching targetDate processes it
  useEffect(() => {
    if (!scheduledDragActive) return;
    const handleUp = () => {
      const state = useScheduledDragStore.getState();
      if (!state.active || state.currentMinutes === null || !state.taskId) {
        return; // let another column or cancel handle it
      }

      // ── Drop INTO a Group ────────────────────────────────────────────────
      // If the pointer is currently over a Group block, add the dragged task
      // to that Group instead of repositioning it on the timeline.
      if (state.dropTargetGroupId && state.dropTargetGroupId !== state.taskId) {
        const groupId = state.dropTargetGroupId;
        // Only one column should handle this — the one whose date matches the group's date.
        const group = useTaskStore.getState().tasks.find((t) => t.id === groupId);
        if (!group || group.date !== date) return;
        const ok = useTaskStore.getState().addTaskToGroup(state.taskId, groupId);
        if (!ok && state.currentMinutes !== null) {
          setDragMsgTop(((state.currentMinutes - START_HOUR * 60) / 60) * HOUR_HEIGHT);
          setDragMsg("Couldn't add to Group");
          setTimeout(() => { setDragMsg(''); setDragMsgTop(null); }, 2000);
        }
        useScheduledDragStore.getState().endDrag();
        return;
      }

      // Only the column that matches targetDate should process the drop
      if (state.targetDate !== date) return;

      // Block drop if collision detected
      if (state.blocked) {
        // Distinguish constraint violation (priority) from physical collision.
        if (state.sourceDate && state.sourceDate !== state.targetDate) {
          const validation = canMoveTask(state.taskId, state.targetDate, state.currentMinutes !== null ? minutesToTime(state.currentMinutes) : undefined);
          if (!validation.allowed && state.currentMinutes !== null) {
            const violation = 'reason' in validation ? validation.reason : 'Cannot move';
            const newTime = minutesToTime(state.currentMinutes);
            requestPendingMove({ taskId: state.taskId, newDate: state.targetDate, newTime, violation });
            useScheduledDragStore.getState().endDrag();
            return;
          }
        }
        if (state.currentMinutes !== null) {
          setDragMsgTop(((state.currentMinutes - START_HOUR * 60) / 60) * HOUR_HEIGHT);
        }
        setDragMsg('No space available');
        setTimeout(() => { setDragMsg(''); setDragMsgTop(null); }, 2000);
        useScheduledDragStore.getState().cancel();
        return;
      }

      const newTime = minutesToTime(state.currentMinutes);

      // Copy mode: duplicate the task at the new position instead of moving
      if (state.copyMode) {
        const sourceTask = useTaskStore.getState().tasks.find(t => t.id === state.taskId);
        if (sourceTask) {
          addTask({
            title: sourceTask.title,
            date: state.targetDate || sourceTask.date,
            time: newTime,
            duration: sourceTask.duration || 30,
            priority: sourceTask.priority as any,
            type: sourceTask.type,
            category: sourceTask.category,
            description: sourceTask.description,
            subtasks: sourceTask.subtasks,
            recurrence: sourceTask.recurrence,
            isRoutine: sourceTask.isRoutine,
            dueDate: sourceTask.dueDate,
          });
        }
        useScheduledDragStore.getState().endDrag();
        return;
      }

      // If unlink mode is active, detach this single occurrence before moving
      if (state.unlinkMode) {
        const { updateTask } = useTaskStore.getState();
        updateTask(state.taskId, {
          linked: false,
          linkedGroupId: undefined,
          detachedFromSeries: true,
          recurrence: undefined,
          type: 'one-time',
          isRecurrenceInstance: false,
          recurrenceParentId: undefined,
          seriesId: undefined,
          isRoutine: false,
        });
      }

      // Relink mode: adopt target's series/group, keep original position
      if (state.relinkMode && state.relinkTargetId) {
        const targetTask = useTaskStore.getState().tasks.find(t => t.id === state.relinkTargetId);
        const { updateTask } = useTaskStore.getState();
        if (targetTask) {
          const groupId = targetTask.linkedGroupId || targetTask.seriesId || targetTask.id;
          const sId = targetTask.seriesId || targetTask.id;
          updateTask(state.taskId, {
            linked: true,
            linkedGroupId: groupId,
            seriesId: sId,
            detachedFromSeries: false,
            recurrence: targetTask.recurrence,
            type: targetTask.type || 'recurring',
            recurrenceParentId: targetTask.recurrenceParentId || targetTask.id,
            isRecurrenceInstance: true,
            isRoutine: targetTask.isRoutine || false,
          });
          // Also ensure target is linked with same group
          if (!targetTask.linkedGroupId) {
            updateTask(targetTask.id, {
              linked: true,
              linkedGroupId: groupId,
            });
          }
        }
        useScheduledDragStore.getState().endDrag();
        return;
      }

      if (state.sourceDate && state.sourceDate !== state.targetDate) {
        const validation = canMoveTask(state.taskId, state.targetDate, state.currentMinutes !== null ? minutesToTime(state.currentMinutes) : undefined);
        if (!validation.allowed) {
          const violation = 'reason' in validation ? validation.reason : 'Cannot move';
          requestPendingMove({ taskId: state.taskId, newDate: state.targetDate, newTime, violation });
          useScheduledDragStore.getState().endDrag();
          return;
        }
        moveTask(state.taskId, state.targetDate, newTime);
      } else {
        reorderTask(state.taskId, newTime);
      }
      useScheduledDragStore.getState().endDrag();
    };
    window.addEventListener('pointerup', handleUp);
    return () => window.removeEventListener('pointerup', handleUp);
  }, [scheduledDragActive, date, canMoveTask, moveTask, reorderTask]);

  return (
    <div
      ref={colRef}
      data-timeline-column
      data-column-date={date}
      className="relative select-none"
      style={{ height: HOURS.length * HOUR_HEIGHT, WebkitUserSelect: 'none', WebkitTouchCallout: 'none' } as React.CSSProperties}
      onDragOver={handleDragOver}
      onDragLeave={() => setDragOverTime(null)}
      onDrop={handleDrop}
      onMouseDown={handleCreateMouseDown}
      onPointerDown={handleCarryPointerDown}
      onPointerUp={handleCarryPointerUp}
      /* touch create handlers are native — see useEffect above */
    >
      {/* Hour grid lines + labels */}
      {HOURS.map((hour, i) => (
        <div
          key={hour}
          className="absolute left-0 right-0 flex items-start"
          style={{ top: i * HOUR_HEIGHT }}
        >
          {showTimeLabels && (
            <div className="w-[3.25rem] shrink-0 font-mono text-muted-foreground/70 font-medium -mt-2 text-right pr-2 select-none" style={{ fontSize: 'var(--ui-text-base)' }}>
              {formatHour12h(hour)}
            </div>
          )}
          <div className="flex-1 border-t border-border/50" />
        </div>
      ))}

      {/* 30-min: grid line + gutter marker — fade in 36–56px */}
      {HOUR_HEIGHT >= 36 && HOURS.map((hour, i) => {
        const t = Math.min(1, (HOUR_HEIGHT - 36) / 20);
        const lineOpacity = t * 0.25;
        const markerOpacity = t * 0.4;
        const topPos = i * HOUR_HEIGHT + HOUR_HEIGHT / 2;
        return (
          <Fragment key={`h30-${hour}`}>
            {/* Full-width grid line */}
            <div
              className="absolute right-0 border-t border-border"
              style={{ top: topPos, left: timeLabelsWidth, opacity: lineOpacity, transition: 'opacity 0.15s ease' }}
            />
            {/* Gutter marker — right-aligned to time label column */}
            {showTimeLabels && (
              <div
                className="absolute border-t border-muted-foreground/70"
                style={{ top: topPos, left: 'calc(3.25rem - 16px)', width: 12, opacity: markerOpacity, transition: 'opacity 0.15s ease' }}
              />
            )}
          </Fragment>
        );
      })}

      {/* 15-min: grid lines + gutter markers — fade in 64–96px */}
      {HOUR_HEIGHT >= 64 && HOURS.map((hour, i) => {
        const t = Math.min(1, (HOUR_HEIGHT - 64) / 32);
        const lineOpacity = t * 0.15;
        const markerOpacity = t * 0.3;
        return (
          <Fragment key={`q-${hour}`}>
            {[1, 3].map((q) => {
              const topPos = i * HOUR_HEIGHT + (HOUR_HEIGHT * q) / 4;
              return (
                <Fragment key={q}>
                  {/* Full-width grid line */}
                  <div
                    className="absolute right-0 border-t border-border"
                    style={{ top: topPos, left: timeLabelsWidth, opacity: lineOpacity, transition: 'opacity 0.15s ease' }}
                  />
                  {/* Gutter marker */}
                  {showTimeLabels && (
                    <div
                      className="absolute border-t border-muted-foreground/70"
                      style={{ top: topPos, left: 'calc(3.25rem - 12px)', width: 8, opacity: markerOpacity, transition: 'opacity 0.15s ease' }}
                    />
                  )}
                </Fragment>
              );
            })}
          </Fragment>
        );
      })}

      {/* Now line */}
      {isToday && nowTop > 0 && nowTop < HOURS.length * HOUR_HEIGHT && (
        <div
          className="absolute right-0 z-30 pointer-events-none"
          style={{ top: nowTop, left: timeLabelsWidth }}
        >
          <div className="h-[1.5px] bg-primary" />
          <div className="absolute -left-[3px] -top-[2.5px] w-[6px] h-[6px] rounded-full bg-primary" />
        </div>
      )}

      {/* Drop target indicator — shows a preview block */}
      {dragOverTime && (
        <div
          className="absolute right-1 z-20 pointer-events-none"
          style={{
            top: ((timeToMinutes(dragOverTime) - START_HOUR * 60) / 60) * HOUR_HEIGHT,
            height: Math.max((dragOverDuration / 60) * HOUR_HEIGHT, 22),
            left: showTimeLabels ? '3.25rem' : '2px',
          }}
        >
          <div className={`h-full rounded-[2px] border border-dashed ${dragValid ? 'border-primary/40 bg-primary/[0.06]' : 'border-destructive/40 bg-destructive/[0.04]'}`}>
            <div className="px-2 py-1">
              <span className={`text-[10px] font-mono tracking-wider ${dragValid ? 'text-primary/50' : 'text-destructive/60'}`}>
                {formatTime12h(dragOverTime)} · {formatDuration(dragOverDuration)}
              </span>
            </div>
          </div>
        </div>
      )}

      {/* Touch drag drop preview */}
      {touchDropPreview && (
        <div
          className="absolute right-1 z-20 pointer-events-none"
          style={{
            top: touchDropPreview.top,
            height: touchDropPreview.height,
            left: showTimeLabels ? '3.25rem' : '2px',
          }}
        >
          <div className="h-full rounded-[2px] border border-dashed border-primary/40 bg-primary/[0.06]">
            <div className="px-2 py-1">
              <span className="text-[10px] font-mono text-primary/50">
                {formatTime12h(touchDropPreview.time)} · {formatDuration(touchDropPreview.duration)}
              </span>
            </div>
          </div>
        </div>
      )}

      {/* Library click-and-drag drop preview — styled like a real task block */}
      {libraryDropPreview && (
        <div
          className="absolute right-1 z-30 pointer-events-none"
          style={{
            top: libraryDropPreview.top,
            height: libraryDropPreview.height,
            left: showTimeLabels ? '3.25rem' : '2px',
          }}
        >
          <div
            className={`h-full rounded-[3px] border-2 border-dashed flex items-center gap-1.5 px-2 py-1 backdrop-blur-sm ${
              libraryDropPreview.blocked
                ? 'border-destructive/60 bg-destructive/[0.08]'
                : 'border-primary/70 bg-primary/[0.12]'
            }`}
          >
            {libraryDropPreview.Icon && (
              <libraryDropPreview.Icon
                size={12}
                className={libraryDropPreview.blocked ? 'text-destructive/70 shrink-0' : 'text-primary/80 shrink-0'}
              />
            )}
            <div className="flex-1 min-w-0">
              <div
                className={`text-[11px] font-mono font-medium truncate leading-tight ${
                  libraryDropPreview.blocked ? 'text-destructive/80' : 'text-primary'
                }`}
              >
                {libraryDropPreview.title}
              </div>
              <div
                className={`text-[9px] font-mono tracking-wider truncate ${
                  libraryDropPreview.blocked ? 'text-destructive/60' : 'text-primary/60'
                }`}
              >
                {formatTime12h(libraryDropPreview.time)} · {formatDuration(libraryDropPreview.duration)}
              </div>
            </div>
          </div>
        </div>
      )}

      {dragMsg && (
        <div
          className="absolute left-1/2 -translate-x-1/2 z-40 px-3 py-1.5 rounded-sm bg-card border border-destructive/20 shadow-sm flex items-center gap-2"
          style={{ top: dragMsgTop != null ? Math.max(0, dragMsgTop - 20) : 12 }}
        >
          <span className="text-[10px] font-mono text-destructive tracking-wider">{dragMsg}</span>
          {(dragMsg.includes('Cannot move') || dragMsg.includes('locked') || dragMsg.includes('outside')) && (
            <button
              onClick={() => {
                // Open help panel to task-mobility section
                const event = new CustomEvent('open-help', { detail: { section: 'task-mobility' } });
                window.dispatchEvent(event);
              }}
              className="text-destructive/50 hover:text-destructive transition-colors shrink-0"
            >
              <Info size={12} strokeWidth={2} />
            </button>
          )}
        </div>
      )}

      {/* Task blocks — cluster-aware rendering */}
      {(() => {
        const sortedTasks = activeTasks
          .slice()
          .sort((a, b) => {
            const aIsRoutine = a.isRoutine !== false && a.type === 'recurring';
            const bIsRoutine = b.isRoutine !== false && b.type === 'recurring';
            if (aIsRoutine && !bIsRoutine) return -1;
            if (!aIsRoutine && bIsRoutine) return 1;
            return 0;
          });

        const comfortMode = useTimezoneStore.getState().comfortMode;
        const clusters = clusterTasks(sortedTasks, HOUR_HEIGHT, routineConflictIds, {
          comfortMode,
          columnWidthPx,
        });

        // Lane assignment for side-by-side rendering of overlapping tasks.
        // Include completed tasks (rendered separately below) so a completed
        // block overlapping an active — or another completed — block also
        // splits into a lane instead of stacking.
        const completedForLanes = completedTasks
          .map((t) => {
            const displayTime = getTaskScheduleTime(t);
            return displayTime ? ({ ...t, time: displayTime } as Task) : null;
          })
          .filter((t): t is Task => !!t);
        const laneMap = computeTaskLanes([...sortedTasks, ...completedForLanes]);

        return clusters.map((cluster, ci) => {
          if (cluster.type === 'condensed' && cluster.tasks.length > 1) {
            return (
              <CondensedTaskBlock
                key={`cluster-${ci}`}
                cluster={cluster}
                hourHeight={HOUR_HEIGHT}
                showTimeLabels={showTimeLabels}
                onTap={(c) => {
                  if (onZoomToCluster) {
                    const viewportH = window.innerHeight * 0.7;
                    const targetZoom = getZoomForCluster(c, viewportH);
                    const centerMin = (c.startMin + c.endMin) / 2;
                    onZoomToCluster(c, targetZoom, centerMin);
                  }
                }}
              />
            );
          }

          // Single tasks — render normally
          return cluster.tasks.map((task) => {
            if (!task.time) return null;
            const taskMinutes = timeToMinutes(task.time);
            const top = ((taskMinutes - START_HOUR * 60) / 60) * HOUR_HEIGHT;
            const height = cluster.displayHeightPx ?? ((task.duration || 30) / 60) * HOUR_HEIGHT;
            const isActive = task.id === activeTaskId;
            const isResizingThis = resizing?.id === task.id;
            // LOCK no longer prevents drag — drop triggers Reflection prompt instead.
            const isLocked = false;
            const showUnlinkedOutline = false;
            const hasConflict = routineConflictIds.has(task.id) || calendarConflictIds.has(task.id);
            const laneInfo = laneMap.get(task.id);
            const laneIndex = laneInfo?.lane ?? 0;
            const laneCount = laneInfo?.count ?? 1;
            // Effective lane width: when tasks split into lanes, each lane
            // gets ~1/laneCount of the column. If that's too narrow to fit
            // any legible text, fall back to an icon-only glyph.
            const perLanePx = columnWidthPx ? (columnWidthPx / Math.max(1, laneCount)) : Infinity;
            const iconOnly = perLanePx < 70;

            // Groups have their own compact representation (single block, no inline expansion).
            if ((task as Task).type === 'group') {
              return (
                <GroupTimelineBlock
                  key={task.id}
                  task={task as Task}
                  top={top}
                  height={height}
                  isActive={isActive}
                  showTimeLabels={showTimeLabels}
                  formatDuration={formatDuration}
                  hourHeight={HOUR_HEIGHT}
                  isResizingThis={isResizingThis}
                  resizePreview={resizePreview}
                  handleResizeStart={handleResizeStart}
                />
              );
            }

            return (
              <TimelineTaskBlock
                key={task.id}
                task={task as Task}
                top={top}
                height={height}
                isActive={isActive}
                isLocked={isLocked}
                showUnlinkedOutline={showUnlinkedOutline}
                isResizingThis={isResizingThis}
                showTimeLabels={showTimeLabels}
                nowMinutes={nowMinutes}
                resizePreview={resizePreview}
                didDragRef={didDragRef}
                dragOffsetRef={dragOffsetRef}
                completeTask={completeTask}
                handleTaskClick={handleTaskClick}
                handleResizeStart={handleResizeStart}
                setDragMsg={setDragMsg}
                formatDuration={formatDuration}
                hourHeight={HOUR_HEIGHT}
                startHour={START_HOUR}
                hasRoutineConflict={hasConflict}
                laneIndex={laneIndex}
                laneCount={laneCount}
                iconOnly={iconOnly}
                isCompact={cluster.titleFits === false}
                onZoomIn={cluster.titleFits === false && onZoomToCluster ? () => {
                  const viewportH = window.innerHeight * 0.7;
                  const singleCluster: TaskCluster = {
                    type: 'single',
                    tasks: [task],
                    startMin: timeToMinutes(task.time!),
                    endMin: timeToMinutes(task.time!) + (task.duration || 30),
                  };
                  const targetZoom = getZoomForCluster(singleCluster, viewportH);
                  const centerMin = (singleCluster.startMin + singleCluster.endMin) / 2;
                  onZoomToCluster(singleCluster, targetZoom, centerMin);
                } : undefined}
              />
            );
          });
        });
      })()}

      {/* Completed task blocks — ghosted with strikethrough */}
      {(() => {
        // Recompute lanes across active + completed so an overlap between two
        // completed blocks (or a completed and an active) also splits.
        const completedForLanes = completedTasks
          .map((t) => {
            const displayTime = getTaskScheduleTime(t);
            return displayTime ? ({ ...t, time: displayTime } as Task) : null;
          })
          .filter((t): t is Task => !!t);
        const completedLaneMap = computeTaskLanes([...activeTasks, ...completedForLanes]);

        return completedTasks.map((task) => {
          const displayTime = getTaskScheduleTime(task);
          if (!displayTime) return null;
          const taskMinutes = timeToMinutes(displayTime);
          const top = ((taskMinutes - START_HOUR * 60) / 60) * HOUR_HEIGHT;
          const height = Math.max(((task.duration || 30) / 60) * HOUR_HEIGHT, 18);
          const displayTask = displayTime === task.time ? task : { ...task, time: displayTime };
          const info = completedLaneMap.get(task.id);
          const laneCount = info?.count ?? 1;
          const laneIndex = info?.lane ?? 0;
          const perLanePx = columnWidthPx ? (columnWidthPx / Math.max(1, laneCount)) : Infinity;
          const iconOnly = perLanePx < 70;
          return (
            <TimelineTaskBlock
              key={`completed-${task.id}`}
              task={displayTask as Task}
              top={top}
              height={height}
              isActive={false}
              isLocked={false}
              showUnlinkedOutline={false}
              isResizingThis={false}
              showTimeLabels={showTimeLabels}
              nowMinutes={nowMinutes}
              resizePreview={null}
              didDragRef={didDragRef}
              dragOffsetRef={dragOffsetRef}
              completeTask={completeTask}
              handleTaskClick={handleTaskClick}
              handleResizeStart={handleResizeStart}
              setDragMsg={setDragMsg}
              formatDuration={formatDuration}
              hourHeight={HOUR_HEIGHT}
              startHour={START_HOUR}
              hasRoutineConflict={false}
              laneIndex={laneIndex}
              laneCount={laneCount}
              iconOnly={iconOnly}
            />
          );
        });
      })()}

      {/* Waiting room note for past days */}
      {isPastDay && waitingRoomCount > 0 && (
        <div
          className="absolute z-20 cursor-pointer group"
          style={{
            bottom: 4,
            left: showTimeLabels ? '3.25rem' : '2px',
            right: 4,
          }}
          onClick={() => window.dispatchEvent(new Event('toggle-waiting-room'))}
        >
          <div className="flex items-center gap-1.5 px-2 py-1.5 rounded-sm bg-muted/30 border border-border/30 hover:border-primary/30 hover:bg-muted/50 transition-colors">
            <span className="text-[9px] font-mono text-muted-foreground/50 tracking-wider group-hover:text-primary/60 transition-colors">
              {waitingRoomCount} task{waitingRoomCount > 1 ? 's' : ''} → LIMBO
            </span>
          </div>
        </div>
      )}

      {/* Google Calendar events */}
      <CalendarEventBlocks date={date} hourHeight={HOUR_HEIGHT} showTimeLabels={showTimeLabels} />

      {/* Free time label */}
      {isToday && !activeTaskId && nowTop > 0 && nowTop < HOURS.length * HOUR_HEIGHT && (
        <div
          className="absolute z-20 pointer-events-none"
          style={{ top: nowTop + 4, left: showTimeLabels ? '3.25rem' : '2px' }}
        >
          <span className="text-[10px] font-mono text-muted-foreground/25 tracking-widest">FREE</span>
        </div>
      )}

      {/* Drag-to-create preview */}
      {creatingPreview && (
        <div
          className="absolute right-1 z-20 pointer-events-none"
          style={{
            top: creatingPreview.top,
            height: creatingPreview.height,
            left: showTimeLabels ? '3.25rem' : '2px',
          }}
        >
          <div className="h-full rounded-[2px] border border-primary/30 bg-primary/[0.06] border-dashed">
            <div className="px-2 py-1">
              <span className="text-[10px] font-mono text-primary/60">
                {formatTime12h(creatingPreview.time)} · {formatDuration(creatingPreview.duration)}
              </span>
            </div>
          </div>
        </div>
      )}

      {/* New task inline input */}
      {newTaskInput && (
        <div
          className="absolute right-1 z-30"
          style={{
            top: newTaskInput.top,
            height: 'auto',
            minHeight: Math.max(newTaskInput.height, 32),
            left: showTimeLabels ? '3.25rem' : '2px',
          }}
        >
          <div className="relative rounded-[2px] border border-primary/40 bg-card shadow-sm flex items-start px-2 py-1 gap-1.5"
               style={{ borderLeftWidth: '2px', borderLeftColor: 'hsl(var(--priority-0) / 0.4)', minHeight: Math.max(newTaskInput.height, 32) }}>
            <div className="flex-1 min-w-0 relative">
              <input
                ref={newTaskRef}
                value={newTaskTitle}
                onChange={(e) => setNewTaskTitle(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleNewTaskSubmit();
                  if (e.key === 'Escape') { setNewTaskInput(null); setNewTaskCategory(undefined); }
                }}
                onBlur={(e) => {
                  if (e.relatedTarget?.closest?.('[data-tag-autocomplete]')) return;
                  if (e.relatedTarget?.closest?.('[data-date-autocomplete]')) return;
                  // Don't submit while a tag/date autocomplete is mid-completion
                  // (#foo or @bar at end of input). Selecting a suggestion will
                  // continue the flow; submitting here would create a duplicate.
                  if (/[#@]\S*$/.test(newTaskTitle) || /\/\/\S*$/.test(newTaskTitle)) return;
                  handleNewTaskSubmit();
                }}
                placeholder={entryHint ? `Task name... (${entryHint})` : 'Task name...'}
                className="w-full bg-transparent text-[12px] font-mono text-foreground placeholder:text-muted-foreground/30 focus:outline-none leading-tight"
              />
              {newTaskCategory && (
                <span className="text-[10px] font-mono text-primary/60">#{newTaskCategory}</span>
              )}
              {newTaskDueDate && (
                <span className="text-[10px] font-mono text-primary/60">@{newTaskDueDate}</span>
              )}
              <span className="text-[10px] font-mono text-muted-foreground/40">
                {formatTime12h(newTaskInput.time)} · {formatDuration(newTaskInput.duration)}
              </span>
              <TagAutocomplete
                inputValue={newTaskTitle}
                inputRef={newTaskRef as React.RefObject<HTMLInputElement>}
                onSelectTag={(cat: CategoryDef, cleaned: string) => {
                  // Update refs synchronously so submit (potentially fired in
                  // the same tick) sees the chosen category, not stale state.
                  newTaskTitleRef.current = cleaned;
                  newTaskCategoryRef.current = cat.value;
                  setNewTaskTitle(cleaned);
                  setNewTaskCategory(cat.value);
                }}
                onSubmitAfterSelect={handleNewTaskSubmit}
              />
              <DateAutocomplete
                inputValue={newTaskTitle}
                inputRef={newTaskRef as React.RefObject<HTMLInputElement>}
                onSelectDate={(dateStr: string, cleaned: string) => {
                  newTaskTitleRef.current = cleaned;
                  newTaskDueDateRef.current = dateStr;
                  setNewTaskTitle(cleaned);
                  setNewTaskDueDate(dateStr);
                }}
                onSubmitAfterSelect={handleNewTaskSubmit}
              />
            </div>
          </div>
        </div>
      )}

      {/* Scheduled task drag overlay — blue=linked, red=unlink */}
      {scheduledDragActive && scheduledDragMinutes !== null && scheduledDragTargetDate === date && (
        <div
          className="absolute right-1 z-[25] pointer-events-none"
          style={{
            top: ((scheduledDragMinutes - START_HOUR * 60) / 60) * HOUR_HEIGHT,
            height: Math.max(((scheduledDragDuration || 30) / 60) * HOUR_HEIGHT, 22),
            left: showTimeLabels ? '3.25rem' : '2px',
          }}
        >
          <div className={`h-full rounded-[2px] border-2 border-dashed transition-colors duration-200 relative ${
            scheduledDragBlocked
              ? 'border-destructive/50 bg-destructive/[0.12]'
              : scheduledDragRelinkMode
                ? 'border-primary/50 bg-primary/[0.08]'
              : scheduledDragCopyMode
                ? 'border-primary/50 bg-primary/[0.08]'
                : scheduledDragUnlinkMode
                  ? 'border-destructive/60 bg-destructive/[0.04]'
                  : scheduledDragIsLinked
                    ? 'border-primary/50 bg-primary/[0.06]'
                    : 'border-muted-foreground/30 bg-muted/[0.06]'
          }`}>
            <div className={`px-2 py-1 flex items-center gap-1.5 h-full ${
              scheduledDragBlocked ? 'justify-center flex-col' : scheduledDragRelinkMode ? 'justify-center flex-col' : ''
            }`}>
              <span className={`text-[10px] font-mono transition-colors duration-200 ${
                scheduledDragBlocked
                  ? 'text-destructive/70'
                  : scheduledDragRelinkMode
                    ? 'text-primary/70'
                  : scheduledDragCopyMode
                    ? 'text-primary/70'
                    : scheduledDragUnlinkMode
                      ? 'text-destructive/70'
                      : scheduledDragIsLinked
                        ? 'text-primary/60'
                        : 'text-muted-foreground/50'
              }`}>
                {scheduledDragBlocked ? '' : scheduledDragRelinkMode ? '' : scheduledDragCopyMode ? 'COPY HERE' : formatTime12h(minutesToTime(scheduledDragMinutes))}
              </span>
              {!scheduledDragBlocked && scheduledDragRelinkMode && (
                <>
                  <Link size={16} className="text-primary/70" />
                  {Math.max(((scheduledDragDuration || 30) / 60) * HOUR_HEIGHT, 22) > 40 && (
                    <span className="text-[8px] font-mono tracking-wider uppercase text-primary/50">
                      relink to series
                    </span>
                  )}
                </>
              )}
              {!scheduledDragBlocked && !scheduledDragCopyMode && !scheduledDragRelinkMode && scheduledDragIsLinked && (
                <span className={`text-[8px] font-mono tracking-wider uppercase transition-colors duration-200 ${
                  scheduledDragUnlinkMode
                    ? 'text-destructive/50'
                    : 'text-primary/40'
                }`}>
                  {scheduledDragUnlinkMode ? 'unlink this' : 'move linked'}
                </span>
              )}
            </div>
            {/* Copy icon on far right */}
            {!scheduledDragBlocked && !scheduledDragIsLinked && !scheduledDragRelinkMode && (
              <div className={`absolute right-1.5 top-1/2 -translate-y-1/2 transition-colors duration-150 ${
                scheduledDragCopyMode ? 'text-primary/70' : 'text-muted-foreground/25'
              }`}>
                <Copy size={14} />
              </div>
            )}
            {/* Unlink icon on far right for linked tasks */}
            {!scheduledDragBlocked && scheduledDragIsLinked && !scheduledDragRelinkMode && (
              <div className={`absolute right-1.5 top-1/2 -translate-y-1/2 transition-colors duration-150 ${
                scheduledDragUnlinkMode ? 'text-destructive/70' : 'text-muted-foreground/25'
              }`}>
                <Unlink size={14} />
              </div>
            )}
          </div>
        </div>
      )}

      {/* Hidden proxy input — focused synchronously on touchend to open mobile keyboard */}
      <input
        ref={proxyInputRef}
        aria-hidden
        tabIndex={-1}
        className="absolute opacity-0 w-0 h-0 pointer-events-none"
        style={{ top: 0, left: 0 }}
        onInput={(e) => {
          // Forward any typing that happens before real input mounts
          const val = (e.target as HTMLInputElement).value;
          setNewTaskTitle(val);
          (e.target as HTMLInputElement).value = '';
        }}
      />

      <GroupNamePrompt
        open={!!groupPromptSlot}
        contextLabel="NEW GROUP"
        confirmLabel="CREATE GROUP"
        onCancel={() => setGroupPromptSlot(null)}
        onConfirm={(name) => {
          if (groupPromptSlot) {
            createEmptyGroup({
              name,
              date,
              time: groupPromptSlot.time,
              duration: groupPromptSlot.duration,
            });
          }
          setGroupPromptSlot(null);
        }}
      />
    </div>
  );
}
