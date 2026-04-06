import { useRef, useState, useCallback, useEffect, Fragment, useMemo } from 'react';
import { useTaskStore, Task } from '@/store/taskStore';
import { useCalendarStore, CalendarEvent } from '@/store/calendarStore';
import { useLibraryStore } from '@/store/libraryStore';
import { useTouchDragStore } from '@/store/touchDragStore';
import { useScheduledDragStore } from '@/store/scheduledDragStore';
import { useCarryStore, isInScrollCooldown } from '@/store/carryStore';
import { PriorityBadge } from '@/components/PriorityBadge';
import { TimelineTaskBlock } from '@/components/TimelineTaskBlock';
import { timeToMinutes, minutesToTime, snapTo15, formatTime12h, formatHour12h } from '@/hooks/useCurrentTime';
import { Calendar as CalIcon } from 'lucide-react';
import { getOccupiedSlots, findValidPosition, clampResize, wouldOverlap, getRoutineConflicts } from '@/utils/collisionDetection';

export const DEFAULT_HOUR_HEIGHT = 56;
export const HOUR_HEIGHT = DEFAULT_HOUR_HEIGHT;
export const START_HOUR = 6;
export const END_HOUR = 23;
export const HOURS = Array.from({ length: END_HOUR - START_HOUR }, (_, i) => START_HOUR + i);

interface TimelineColumnProps {
  date: string;
  tasks: Task[];
  nowMinutes: number;
  isToday: boolean;
  showTimeLabels?: boolean;
  hourHeight?: number;
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
  const events = allEvents.filter(e => e.date === date);
  const timeLabelsLeft = showTimeLabels ? '3.25rem' : '2px';

  if (events.length === 0) return null;

  return (
    <>
      {events.filter(e => e.time && !e.isAllDay).map((event) => {
        const mins = timeToMinutes(event.time!);
        const top = ((mins - START_HOUR * 60) / 60) * hourHeight;
        const height = Math.max(((event.duration || 30) / 60) * hourHeight, 14);
        const cal = calendars.find(c => c.google_calendar_id === event.calendarId);
        const color = cal?.color || '#4285f4';

        return (
          <div
            key={`gcal-${event.id}`}
            className="absolute right-1 z-[5] pointer-events-none"
            style={{ top, height, left: timeLabelsLeft }}
          >
            <div
              className="h-full rounded-[2px] border border-border/30 bg-muted/30 overflow-hidden"
              style={{ borderLeftWidth: '2px', borderLeftColor: color }}
            >
              <div className="flex items-start h-full px-2 py-0.5 overflow-hidden">
                <div className="flex-1 min-w-0">
                  <div className="text-[11px] font-mono leading-tight truncate text-muted-foreground/60">
                    {event.title}
                  </div>
                  {height > 24 && (
                    <div className="flex items-center gap-1 mt-0.5">
                      <span className="text-[9px] font-mono text-muted-foreground/35">
                        {formatTime12h(event.time!)}
                      </span>
                      <CalIcon size={8} className="text-muted-foreground/25" />
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        );
      })}
    </>
  );
}

export function TimelineColumn({
  date,
  tasks,
  nowMinutes,
  isToday,
  showTimeLabels = true,
  hourHeight: hourHeightProp,
}: TimelineColumnProps) {
  const HOUR_HEIGHT = hourHeightProp ?? DEFAULT_HOUR_HEIGHT;
  const { setEditingTask, reorderTask, moveTask, resizeTask, completeTask, canMoveTask, addTask } = useTaskStore();
  const colRef = useRef<HTMLDivElement>(null);
  const [dragOverTime, setDragOverTime] = useState<string | null>(null);
  const [dragOverDuration, setDragOverDuration] = useState<number>(30);
  const [dragValid, setDragValid] = useState(true);
  const [dragMsg, setDragMsg] = useState('');

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
  const newTaskRef = useRef<HTMLInputElement>(null);
  const proxyInputRef = useRef<HTMLInputElement>(null);

  // When the real input mounts, steal focus from the proxy input
  useEffect(() => {
    if (newTaskInput && newTaskRef.current) {
      newTaskRef.current.focus();
    }
  }, [newTaskInput]);

  const activeTasks = tasks.filter((t) => !t.completed && t.time);
  const nowTop = ((nowMinutes - START_HOUR * 60) / 60) * HOUR_HEIGHT;

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

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    const mins = getMinutesFromY(e.clientY - dragOffsetRef.current);
    const snapped = snapTo15(mins);
    const taskDurationStr = e.dataTransfer.types.includes('taskduration') ? '30' : '30';
    const duration = parseInt(taskDurationStr, 10);
    const allTasks = useTaskStore.getState().tasks;
    const occupiedSlots = getOccupiedSlots(allTasks, date);
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

    const mins = getMinutesFromY(e.clientY - dragOffsetRef.current);
    const snapped = snapTo15(mins);

    // Collision check
    const allTasks = useTaskStore.getState().tasks;
    const excludeId = taskId || undefined;
    const occupiedSlots = getOccupiedSlots(allTasks, date, excludeId);
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
      const validation = canMoveTask(taskId, date);
      if (!validation.allowed) {
        setDragMsg('reason' in validation ? validation.reason : 'Cannot move');
        setDragValid(false);
        setTimeout(() => { setDragMsg(''); setDragValid(true); }, 2000);
        setDragOverTime(null);
        return;
      }
      moveTask(taskId, date, newTime);
    } else {
      reorderTask(taskId, newTime);
    }
    setDragOverTime(null);
  }, [date, getMinutesFromY, canMoveTask, moveTask, reorderTask, addTask]);

  // Resize — completely silent, no dialogs
  const handleResizeStart = useCallback((e: React.MouseEvent | React.TouchEvent, task: Task, edge: 'top' | 'bottom') => {
    e.preventDefault();
    e.stopPropagation();
    if (task.priority >= 3) {
      setDragMsg('Task is locked');
      setTimeout(() => setDragMsg(''), 1500);
      return;
    }
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

      // Get collision bounds
      const allTasks = useTaskStore.getState().tasks;
      const occupiedSlots = getOccupiedSlots(allTasks, date, resizing.id);
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
    if ((e.target as HTMLElement).closest('[data-task-block]')) return;
    if (newTaskInput) return;
    if (useCarryStore.getState().carried) return;
    const mins = getMinutesFromY(e.clientY);
    const snapped = snapTo15(mins);
    setCreating({ startMin: snapped, currentMin: snapped });
  }, [getMinutesFromY, newTaskInput]);

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
      if (target.closest('[data-task-block]') || target.closest('input') || target.closest('button')) return;
      if (useCarryStore.getState().carried) return;
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
      setCreating(prev => prev ? { ...prev, currentMin: snapped } : null);
    };
    const handleMouseUp = () => {
      if (!creating) return;
      const startMin = Math.min(creating.startMin, creating.currentMin);
      const endMin = Math.max(creating.startMin, creating.currentMin);
      const duration = Math.max(15, endMin - startMin);
      const time = minutesToTime(startMin);
      const top = ((startMin - START_HOUR * 60) / 60) * HOUR_HEIGHT;
      const height = (duration / 60) * HOUR_HEIGHT;
      setCreating(null);
      setNewTaskTitle('');
      setNewTaskInput({ time, duration, top, height });
      proxyInputRef.current?.focus();
    };
    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [creating, getMinutesFromY, HOUR_HEIGHT]);

  const handleNewTaskSubmit = useCallback(() => {
    if (!newTaskInput || !newTaskTitle.trim()) {
      setNewTaskInput(null);
      return;
    }

    // Collision check before creating
    const allTasks = useTaskStore.getState().tasks;
    const occupiedSlots = getOccupiedSlots(allTasks, date);
    const startMin = timeToMinutes(newTaskInput.time);
    if (wouldOverlap(startMin, newTaskInput.duration, occupiedSlots)) {
      const { startMin: validStart, blocked } = findValidPosition(startMin, newTaskInput.duration, occupiedSlots);
      if (blocked) {
        setDragMsg('No space available');
        setTimeout(() => setDragMsg(''), 2000);
        setNewTaskInput(null);
        return;
      }
      // Use the clamped position
      addTask({
        title: newTaskTitle.trim(),
        date,
        time: minutesToTime(validStart),
        duration: newTaskInput.duration,
        priority: 0,
        type: 'one-time',
      });
    } else {
      addTask({
        title: newTaskTitle.trim(),
        date,
        time: newTaskInput.time,
        duration: newTaskInput.duration,
        priority: 0,
        type: 'one-time',
      });
    }
    setNewTaskInput(null);
    setNewTaskTitle('');
  }, [newTaskInput, newTaskTitle, date, addTask]);

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

    // Collision check for carry drop
    const allTasks = useTaskStore.getState().tasks;
    const excludeId = carried.fromLibrary ? undefined : carried.taskId;
    const occupiedSlots = getOccupiedSlots(allTasks, date, excludeId);
    const { startMin, blocked } = findValidPosition(snapped, carried.duration, occupiedSlots);

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
      addTask({
        title: dropped.title,
        date,
        time: newTime,
        duration: dropped.duration,
        priority: 0,
        type: 'one-time',
      });
      // Library is a permanent repository — do NOT remove the source item
    } else if (dropped.fromWaitingRoom) {
      const { updateTask } = useTaskStore.getState();
      updateTask(dropped.taskId, {
        inWaitingRoom: false,
        date,
        time: newTime,
      } as any);
    } else {
      // Regular scheduled task
      if (dropped.fromDate !== date) {
        const validation = canMoveTask(dropped.taskId, date);
        if (!validation.allowed) {
          setDragMsg('reason' in validation ? validation.reason : 'Cannot move');
          setTimeout(() => setDragMsg(''), 2000);
          // Re-pickup since drop failed
          useCarryStore.getState().pickup(dropped);
          return;
        }
        moveTask(dropped.taskId, date, newTime);
      } else {
        reorderTask(dropped.taskId, newTime);
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
        // Use dragOffset to place task at its top edge, not finger position
        const y = touch.clientY - rect.top - dragOffsetRef.current;
        const mins = START_HOUR * 60 + (y / HOUR_HEIGHT) * 60;
        const snapped = snapTo15(mins);

        // Collision check for touch drop
        const allTasks = useTaskStore.getState().tasks;
        const excludeId = dragging.type === 'task' ? dragging.id : undefined;
        const duration = dragging.duration || 30;
        const occupiedSlots = getOccupiedSlots(allTasks, date, excludeId);
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
            const validation = canMoveTask(dragging.id, date);
            if (!validation.allowed) {
              setDragMsg('reason' in validation ? validation.reason : 'Cannot move');
              setDragValid(false);
              setTimeout(() => {
                setDragMsg('');
                setDragValid(true);
              }, 2000);
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

  // Scheduled drag: handle drop when pointer is released
  const scheduledDragActive = useScheduledDragStore((s) => s.active);
  const scheduledDragTaskId = useScheduledDragStore((s) => s.taskId);
  const scheduledDragMinutes = useScheduledDragStore((s) => s.currentMinutes);
  const scheduledDragDuration = useScheduledDragStore((s) => s.duration);
  const scheduledDragTargetDate = useScheduledDragStore((s) => s.targetDate);
  const scheduledDragUnlinkMode = useScheduledDragStore((s) => s.unlinkMode);
  const scheduledDragIsLinked = useScheduledDragStore((s) => s.isLinkedTask);
  const scheduledDragBlocked = useScheduledDragStore((s) => s.blocked);

  // Scheduled drag: single global drop handler — only the column matching targetDate processes it
  useEffect(() => {
    if (!scheduledDragActive) return;
    const handleUp = () => {
      const state = useScheduledDragStore.getState();
      if (!state.active || state.currentMinutes === null || !state.taskId) {
        return; // let another column or cancel handle it
      }
      // Only the column that matches targetDate should process the drop
      if (state.targetDate !== date) return;

      // Block drop if collision detected
      if (state.blocked) {
        setDragMsg('No space available');
        setTimeout(() => setDragMsg(''), 2000);
        useScheduledDragStore.getState().cancel();
        return;
      }

      const newTime = minutesToTime(state.currentMinutes);

      // If unlink mode is active, detach this single occurrence before moving
      if (state.unlinkMode) {
        const { updateTask } = useTaskStore.getState();
        updateTask(state.taskId, {
          linked: false,
          linkedGroupId: undefined,
          detachedFromSeries: true,
        });
      }

      if (state.sourceDate && state.sourceDate !== state.targetDate) {
        const validation = canMoveTask(state.taskId, state.targetDate);
        if (!validation.allowed) {
          setDragMsg('reason' in validation ? validation.reason : 'Cannot move');
          setTimeout(() => setDragMsg(''), 2000);
          useScheduledDragStore.getState().cancel();
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
      {/* Hour grid lines */}
      {HOURS.map((hour, i) => (
        <div
          key={hour}
          className="absolute left-0 right-0 flex items-start"
          style={{ top: i * HOUR_HEIGHT }}
        >
          {showTimeLabels && (
            <div className="w-[3.25rem] shrink-0 text-[11px] font-mono text-muted-foreground/70 font-medium -mt-2 text-right pr-2 select-none">
              {formatHour12h(hour)}
            </div>
          )}
          <div className="flex-1 border-t border-border/50" />
        </div>
      ))}

      {/* Half-hour lines */}
      {HOUR_HEIGHT >= 40 && HOURS.map((hour, i) => (
        <div
          key={`h30-${hour}`}
          className="absolute right-0 border-t border-border/20"
          style={{
            top: i * HOUR_HEIGHT + HOUR_HEIGHT / 2,
            left: timeLabelsWidth,
          }}
        />
      ))}

      {/* 15-min lines */}
      {HOUR_HEIGHT >= 72 && HOURS.map((hour, i) => (
        <Fragment key={`q-${hour}`}>
          <div
            className="absolute right-0 border-t border-border/10"
            style={{
              top: i * HOUR_HEIGHT + HOUR_HEIGHT / 4,
              left: timeLabelsWidth,
            }}
          />
          <div
            className="absolute right-0 border-t border-border/10"
            style={{
              top: i * HOUR_HEIGHT + (HOUR_HEIGHT * 3) / 4,
              left: timeLabelsWidth,
            }}
          />
        </Fragment>
      ))}

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

      {dragMsg && (
        <div className="absolute top-3 left-1/2 -translate-x-1/2 z-40 px-3 py-1.5 rounded-sm bg-card border border-destructive/20 shadow-sm">
          <span className="text-[10px] font-mono text-destructive tracking-wider">{dragMsg}</span>
        </div>
      )}

      {/* Task blocks */}
      {activeTasks.map((task) => {
        if (!task.time) return null;
        const taskMinutes = timeToMinutes(task.time);
        const top = ((taskMinutes - START_HOUR * 60) / 60) * HOUR_HEIGHT;
        const height = Math.max(((task.duration || 30) / 60) * HOUR_HEIGHT, 22);
        const isActive = task.id === activeTaskId;
        const isResizingThis = resizing?.id === task.id;
        const isLocked = task.priority >= 3;
        const showUnlinkedOutline = false; // unlinked state shown via icon, not border

        return (
          <TimelineTaskBlock
            key={task.id}
            task={task}
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
          />
        );
      })}

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
            height: Math.max(newTaskInput.height, 32),
            left: showTimeLabels ? '3.25rem' : '2px',
          }}
        >
          <div className="h-full rounded-[2px] border border-primary/40 bg-card shadow-sm flex items-start px-2 py-1 gap-1.5"
               style={{ borderLeftWidth: '2px', borderLeftColor: 'hsl(var(--priority-0) / 0.4)' }}>
            <div className="flex-1 min-w-0">
              <input
                ref={newTaskRef}
                value={newTaskTitle}
                onChange={(e) => setNewTaskTitle(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleNewTaskSubmit();
                  if (e.key === 'Escape') setNewTaskInput(null);
                }}
                onBlur={handleNewTaskSubmit}
                placeholder="Task name..."
                className="w-full bg-transparent text-[12px] font-mono text-foreground placeholder:text-muted-foreground/30 focus:outline-none leading-tight"
              />
              <span className="text-[10px] font-mono text-muted-foreground/40">
                {formatTime12h(newTaskInput.time)} · {formatDuration(newTaskInput.duration)}
              </span>
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
          <div className={`h-full rounded-[2px] border-2 border-dashed transition-colors duration-200 ${
            scheduledDragBlocked
              ? 'border-destructive/50 bg-destructive/[0.06]'
              : scheduledDragUnlinkMode
                ? 'border-destructive/60 bg-destructive/[0.04]'
                : scheduledDragIsLinked
                  ? 'border-primary/50 bg-primary/[0.06]'
                  : 'border-muted-foreground/30 bg-muted/[0.06]'
          }`}>
            <div className="px-2 py-1 flex items-center gap-1.5">
              <span className={`text-[10px] font-mono transition-colors duration-200 ${
                scheduledDragBlocked
                  ? 'text-destructive/70'
                  : scheduledDragUnlinkMode
                    ? 'text-destructive/70'
                    : scheduledDragIsLinked
                      ? 'text-primary/60'
                      : 'text-muted-foreground/50'
              }`}>
                {scheduledDragBlocked ? 'BLOCKED' : formatTime12h(minutesToTime(scheduledDragMinutes))}
              </span>
              {!scheduledDragBlocked && scheduledDragIsLinked && (
                <span className={`text-[8px] font-mono tracking-wider uppercase transition-colors duration-200 ${
                  scheduledDragUnlinkMode
                    ? 'text-destructive/50'
                    : 'text-primary/40'
                }`}>
                  {scheduledDragUnlinkMode ? 'unlink this' : 'move linked'}
                </span>
              )}
            </div>
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
    </div>
  );
}
