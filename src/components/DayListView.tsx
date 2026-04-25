import { useState, useEffect, useCallback, useRef } from 'react';
import { motion } from 'framer-motion';
import { useTaskStore, Task } from '@/store/taskStore';
import { useTouchDragStore } from '@/store/touchDragStore';
import { useCalendarStore } from '@/store/calendarStore';
import { useCarryStore } from '@/store/carryStore';
import { useDragHandoffStore } from '@/store/dragHandoffStore';
import { useCurrentTime, formatTime12h } from '@/hooks/useCurrentTime';
import { ChevronLeft, ChevronRight, Plus } from 'lucide-react';
import { GroupListRow } from '@/components/GroupListRow';

function addDaysToDate(dateStr: string, days: number): string {
  const d = new Date(dateStr + 'T12:00:00');
  d.setDate(d.getDate() + days);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function formatDuration(mins: number): string {
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  if (h > 0 && m > 0) return `${h}h ${m}m`;
  if (h > 0) return `${h}h`;
  return `${m}m`;
}

function getEndTime(time: string, duration: number): string {
  const [h, m] = time.split(':').map(Number);
  const total = h * 60 + m + duration;
  return `${Math.floor(total / 60).toString().padStart(2, '0')}:${(total % 60).toString().padStart(2, '0')}`;
}

export function DayListView() {
  const {
    tasks, routinesEnabled, generateRecurringInstances, addTask,
    navigateToDate, setNavigateToDate, currentDate, setCurrentDate,
    setEditingTask, setDaySubMode,
    setListReturnZoom, setShowListReturn, completeTask,
  } = useTaskStore();
  const { dateStr: today } = useCurrentTime(15000);
  const [selectedDate, _setSelectedDate] = useState(navigateToDate || currentDate || today);

  const setSelectedDate = useCallback((dateOrFn: string | ((prev: string) => string)) => {
    _setSelectedDate(prev => {
      const next = typeof dateOrFn === 'function' ? dateOrFn(prev) : dateOrFn;
      setCurrentDate(next);
      return next;
    });
  }, [setCurrentDate]);

  // Swipe
  const touchStartRef = useRef<{ x: number; y: number } | null>(null);
  const [swipeOffset, setSwipeOffset] = useState(0);
  const [swiping, setSwiping] = useState(false);

  useEffect(() => {
    if (navigateToDate) {
      setSelectedDate(navigateToDate);
      setNavigateToDate(null);
    }
  }, [navigateToDate, setNavigateToDate, setSelectedDate]);

  useEffect(() => {
    generateRecurringInstances(selectedDate, selectedDate);
  }, [selectedDate, generateRecurringInstances]);

  const { connected, calendars, fetchEvents } = useCalendarStore();
  useEffect(() => {
    if (connected) fetchEvents(selectedDate, selectedDate);
  }, [selectedDate, connected, calendars, fetchEvents]);

  const dayTasks = tasks
    .filter((t) => t.date === selectedDate && !t.inWaitingRoom && !t.archivedAt &&
      !(!routinesEnabled && t.isRoutine !== false && t.type === 'recurring'))
    // Hide children of Groups from the top-level list — they render inside the group expander.
    .filter((t) => !t.groupId)
    .sort((a, b) => {
      if (!a.time && !b.time) return 0;
      if (!a.time) return 1;
      if (!b.time) return -1;
      return a.time.localeCompare(b.time);
    });

  // For the "completed" counter, count every visible task (groups + non-grouped) plus
  // their group children, so progress reflects real work done.
  const visibleWithChildren = tasks.filter(
    (t) => t.date === selectedDate && !t.inWaitingRoom && !t.archivedAt &&
      !(!routinesEnabled && t.isRoutine !== false && t.type === 'recurring'),
  );
  const completedCount = visibleWithChildren.filter((t) => t.completed).length;
  const isToday = selectedDate === today;

  // Double-tap to complete
  const lastTapRef = useRef<{ id: string; time: number } | null>(null);

  const handleTaskTap = (taskId: string) => {
    const now = Date.now();
    if (lastTapRef.current && lastTapRef.current.id === taskId && now - lastTapRef.current.time < 400) {
      lastTapRef.current = null;
      const task = dayTasks.find(t => t.id === taskId);
      if (task?.completed) {
        // Double tap on completed → uncomplete
        useTaskStore.getState().uncompleteTask(taskId);
      } else {
        // Double tap on active → complete
        completeTask(taskId);
      }
      if (navigator.vibrate) navigator.vibrate(20);
      return;
    }
    lastTapRef.current = { id: taskId, time: now };
    // Single tap → edit (delayed to distinguish from double)
    setTimeout(() => {
      if (lastTapRef.current && lastTapRef.current.id === taskId && Date.now() - lastTapRef.current.time >= 380) {
        setEditingTask(taskId);
        lastTapRef.current = null;
      }
    }, 400);
  };

  const handleTimeTap = (task: { time?: string; duration?: number }) => {
    if (!task.time) return;
    setListReturnZoom({ taskTime: task.time, taskDuration: task.duration || 30 });
    setShowListReturn(true);
    setDaySubMode('timeline');
  };

  const handleAddTask = () => {
    setDaySubMode('timeline');
  };

  /** Insert a new task in the gap between two scheduled tasks, then jump to
   *  schedule view with the edit panel open and the "return to list" pill armed. */
  const handleInsertBetween = (prev: Task, next: Task) => {
    if (!prev.time || !next.time || !prev.duration) return;
    const prevEnd = timeStrToMinutes(getEndTime(prev.time, prev.duration));
    const nextStart = timeStrToMinutes(next.time);
    const gap = nextStart - prevEnd;
    if (gap <= 0) return;

    const duration = gap >= 60 ? 60 : gap;
    // Place flush against the second task so the new block ends exactly when
    // `next` begins — mirrors the user's "right before the second task" spec.
    const startMin = nextStart - duration;
    const time = minutesToTimeStr(startMin);

    const newId = addTask({
      title: '',
      date: selectedDate,
      time,
      duration,
      priority: 0,
      type: 'one-time',
    });

    setListReturnZoom({ taskTime: time, taskDuration: duration });
    setShowListReturn(true);
    setDaySubMode('timeline');
    // Open the edit panel after the view swap settles so the panel mounts on top.
    setTimeout(() => setEditingTask(newId), 50);
  };

  /** Portal into schedule view so the existing timeline drag system can take
   *  over. The list-return pill arms automatically so the user can hop back
   *  when they're done re-arranging. */
  const enterScheduleForDrag = (task: Task, options?: { zoomToTask?: boolean }) => {
    const zoomToTask = options?.zoomToTask ?? true;
    if (zoomToTask && task.time) {
      setListReturnZoom({ taskTime: task.time, taskDuration: task.duration || 30 });
    }
    setShowListReturn(true);
    setDaySubMode('timeline');
  };

  /** Long-press (still) → pick the task up into carry mode so the user can
   *  navigate dates while holding it. Mirrors the timeline carry behaviour. */
  const carryPickup = (task: Task) => {
    if (navigator.vibrate) navigator.vibrate(30);
    useCarryStore.getState().pickup({
      taskId: task.id,
      title: task.title,
      duration: task.duration || 30,
      fromDate: task.date,
      fromTime: task.time,
      pickedUpAt: Date.now(),
    });
  };

  // Swipe handlers
  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    if (useTouchDragStore.getState().dragging) return;
    if (e.touches.length !== 1) return;
    touchStartRef.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
  }, []);

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    if (useTouchDragStore.getState().dragging) return;
    if (!touchStartRef.current || e.touches.length !== 1) return;
    const dx = e.touches[0].clientX - touchStartRef.current.x;
    const dy = e.touches[0].clientY - touchStartRef.current.y;
    if (Math.abs(dx) > Math.abs(dy) && Math.abs(dx) > 10) {
      setSwiping(true);
      setSwipeOffset(dx);
    }
  }, []);

  const handleTouchEnd = useCallback(() => {
    if (useTouchDragStore.getState().dragging) {
      setSwipeOffset(0);
      setSwiping(false);
      touchStartRef.current = null;
      return;
    }
    if (!touchStartRef.current) return;
    if (Math.abs(swipeOffset) > 60) {
      setSelectedDate(d => addDaysToDate(d, swipeOffset > 0 ? -1 : 1));
    }
    setSwipeOffset(0);
    setSwiping(false);
    touchStartRef.current = null;
  }, [swipeOffset]);

  return (
    <div
      className="max-w-3xl mx-auto px-3 sm:px-4"
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
    >
      {/* Sticky header: title + controls pinned together */}
      <div className="sticky top-0 sm:top-12 z-30 bg-background border-b border-border/30">
        <div className="pt-3 pb-2">
          <h2 className="text-lg sm:text-xl font-display font-bold text-foreground tracking-tight">
            {new Date(selectedDate + 'T12:00:00').toLocaleDateString('en-US', {
              weekday: 'long',
              month: 'long',
              day: 'numeric',
            })}
          </h2>
          <p className="text-[10px] font-mono text-muted-foreground/50 mt-0.5 tracking-widest">
            {completedCount}/{dayTasks.length} COMPLETED
          </p>
        </div>

        {/* Navigation bar */}
        <div className="py-1.5 flex items-center justify-between border-t border-border/20">
          <div className="flex items-center gap-0.5">
            <button
              onClick={() => setSelectedDate(d => addDaysToDate(d, -1))}
              className="p-1.5 rounded-sm text-muted-foreground/50 hover:text-foreground hover:bg-muted/50 transition-colors"
            >
              <ChevronLeft size={16} strokeWidth={1.5} />
            </button>
            <button
              onClick={() => setSelectedDate(today)}
              className={`px-2.5 py-1 rounded-sm text-[10px] font-mono tracking-widest transition-colors ${
                isToday
                  ? 'text-primary bg-primary/5'
                  : 'text-muted-foreground/50 hover:text-foreground hover:bg-muted/50'
              }`}
            >
              TODAY
            </button>
            <button
              onClick={() => setSelectedDate(d => addDaysToDate(d, 1))}
              className="p-1.5 rounded-sm text-muted-foreground/50 hover:text-foreground hover:bg-muted/50 transition-colors"
            >
              <ChevronRight size={16} strokeWidth={1.5} />
            </button>
          </div>

          <div className="text-[9px] font-mono text-muted-foreground/40 tracking-widest">
            LIST
          </div>
        </div>
      </div>

      {/* Task list */}
      <div
        className="py-2"
        style={{
          transform: swiping ? `translateX(${swipeOffset * 0.3}px)` : 'none',
        }}
      >
        {dayTasks.length === 0 ? (
          <div className="text-center py-20">
            <p className="text-muted-foreground/30 font-mono text-sm tracking-wider">NO TASKS</p>
          </div>
        ) : (
          <div className="flex flex-col">
            {dayTasks.map((task, i) => {
              const next = dayTasks[i + 1];
              const gapMinutes = computeGapMinutes(task, next);
              if (task.type === 'group') {
                return (
                  <div key={task.id}>
                    <motion.div
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: i * 0.03 }}
                    >
                      <GroupListRow
                        group={task}
                        onGroupTap={(id) => setEditingTask(id)}
                        renderChild={(child) => renderTaskRow(child, true)}
                      />
                    </motion.div>
                    {gapMinutes > 0 && next && (
                      <InsertGapButton
                        gapMinutes={gapMinutes}
                        onInsert={() => handleInsertBetween(task, next)}
                      />
                    )}
                  </div>
                );
              }
              return (
                <div key={task.id}>
                  <motion.div
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: i * 0.03 }}
                  >
                    {renderTaskRow(task, false)}
                  </motion.div>
                  {gapMinutes > 0 && next && (
                    <InsertGapButton
                      gapMinutes={gapMinutes}
                      onInsert={() => handleInsertBetween(task, next)}
                    />
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* FAB — positioned above bottom nav on mobile */}
      <button
        onClick={handleAddTask}
        className="fixed bottom-20 sm:bottom-6 right-6 z-40 w-12 h-12 rounded-full bg-primary text-primary-foreground shadow-lg flex items-center justify-center active:scale-95 transition-transform"
      >
        <Plus size={22} strokeWidth={2} />
      </button>
    </div>
  );

  function renderTaskRow(task: Task, isChild: boolean) {
    const endTime = task.time && task.duration ? getEndTime(task.time, task.duration) : null;
    return (
      <div
        className={`w-full text-left px-3 py-${isChild ? '2' : '4'} ${isChild ? 'border-b border-border/10' : 'border-b border-border/20'} transition-colors ${
          task.completed ? 'opacity-40' : ''
        }`}
        onPointerDown={(e) => {
          if (e.pointerType === 'mouse' && e.button !== 0) return;
          if (useCarryStore.getState().carried) return;

          const startX = e.clientX;
          const startY = e.clientY;
          const pointerId = e.pointerId;
          // Long-press still = carry pickup (~500ms matches timeline behaviour).
          let holdTimer: number | null = window.setTimeout(() => {
            holdTimer = null;
            cleanup();
            carryPickup(task);
          }, 500);
          // Only scheduled tasks can be portaled into the timeline drag system.
          const canPortal = !!task.time && task.type !== 'group';

          const onMove = (ev: PointerEvent) => {
            const dx = Math.abs(ev.clientX - startX);
            const dy = Math.abs(ev.clientY - startY);
            if (dx <= 8 && dy <= 8) return;
            // Movement before hold completes → portal into schedule view and
            // hand off the in-flight drag to the matching TimelineTaskBlock.
            if (holdTimer != null) {
              window.clearTimeout(holdTimer);
              holdTimer = null;
            }
            cleanup();
            if (!canPortal) return;
            useDragHandoffStore.getState().setHandoff({
              taskId: task.id,
              pointerId,
              clientX: ev.clientX,
              clientY: ev.clientY,
              startedAt: Date.now(),
            });
            enterScheduleForDrag(task, { zoomToTask: false });
          };
          const onUp = () => {
            if (holdTimer != null) {
              window.clearTimeout(holdTimer);
              holdTimer = null;
            }
            cleanup();
          };
          const cleanup = () => {
            window.removeEventListener('pointermove', onMove);
            window.removeEventListener('pointerup', onUp);
            window.removeEventListener('pointercancel', onUp);
          };
          window.addEventListener('pointermove', onMove);
          window.addEventListener('pointerup', onUp);
          window.addEventListener('pointercancel', onUp);
        }}
      >
        <div className="flex items-start gap-3">
          {/* Priority dot — leftmost */}
          <div
            className="w-1.5 h-1.5 rounded-full mt-2 flex-shrink-0"
            style={{
              backgroundColor: `hsl(var(--priority-${task.priority}))`,
              opacity: 0.6,
            }}
          />

          {/* Start time — tappable to zoom timeline */}
          <button
            onClick={(e) => {
              e.stopPropagation();
              handleTimeTap(task);
            }}
            className={`${isChild ? 'w-14' : 'w-16'} flex-shrink-0 pt-0.5 text-left active:bg-muted/40 rounded-sm -m-1 p-1 transition-colors`}
          >
            {task.time ? (
              <p className="text-[11px] font-mono text-foreground/80 leading-tight">
                {formatTime12h(task.time)}
              </p>
            ) : (
              <p className="text-[9px] font-mono text-muted-foreground/30 tracking-wider">ANYTIME</p>
            )}
          </button>

          {/* Title + duration — tappable to edit */}
          <button
            onClick={() => handleTaskTap(task.id)}
            className="flex-1 min-w-0 text-left active:bg-muted/40 rounded-sm -m-1 p-1 transition-colors"
          >
            <p className={`${isChild ? 'text-xs' : 'text-sm'} font-display font-medium text-foreground leading-snug ${
              task.completed ? 'line-through' : ''
            }`}>
              {task.title}
            </p>
            {task.duration && !isChild && (
              <p className="text-[9px] font-mono text-muted-foreground/40 mt-0.5 tracking-wider">
                {formatDuration(task.duration)}
              </p>
            )}
            {task.description && !isChild && (
              <p className="text-[11px] text-muted-foreground/50 mt-0.5 line-clamp-1">
                {task.description}
              </p>
            )}
            {task.subtasks && task.subtasks.length > 0 && (
              <p className="text-[9px] font-mono text-muted-foreground/40 mt-1 tracking-wider">
                {task.subtasks.filter((s: any) => s.completed).length}/{task.subtasks.length} SUBTASKS
              </p>
            )}
          </button>

          {/* End time — far right */}
          {endTime && (
            <p className="text-[11px] font-mono text-muted-foreground/60 leading-tight pt-1.5 flex-shrink-0">
              {formatTime12h(endTime)}
            </p>
          )}
        </div>
      </div>
    );
  }
}

// ─── Helpers ───────────────────────────────────────────

function timeStrToMinutes(time: string): number {
  const [h, m] = time.split(':').map(Number);
  return h * 60 + m;
}

function minutesToTimeStr(mins: number): string {
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`;
}

function computeGapMinutes(prev: Task, next: Task | undefined): number {
  if (!next || !prev.time || !next.time || !prev.duration) return 0;
  const prevEnd = timeStrToMinutes(getEndTime(prev.time, prev.duration));
  const nextStart = timeStrToMinutes(next.time);
  return nextStart - prevEnd;
}

function InsertGapButton({ gapMinutes, onInsert }: { gapMinutes: number; onInsert: () => void }) {
  return (
    <button
      onClick={onInsert}
      aria-label={`Insert task in ${formatDuration(gapMinutes)} gap`}
      className="group w-full flex items-center gap-2 px-3 py-1.5 text-left hover:bg-muted/30 transition-colors"
    >
      <div className="flex-1 h-px bg-border/30 group-hover:bg-primary/40 transition-colors" />
      <div className="flex items-center gap-1.5">
        <span className="text-[9px] font-mono text-muted-foreground/40 group-hover:text-primary/60 tracking-wider transition-colors">
          {formatDuration(gapMinutes)}
        </span>
        <div className="w-4 h-4 rounded-full border border-border/40 group-hover:border-primary/60 group-hover:bg-primary/10 flex items-center justify-center transition-colors">
          <Plus size={9} strokeWidth={2} className="text-muted-foreground/50 group-hover:text-primary transition-colors" />
        </div>
      </div>
      <div className="flex-1 h-px bg-border/30 group-hover:bg-primary/40 transition-colors" />
    </button>
  );
}

