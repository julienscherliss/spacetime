import { useState, useEffect, useCallback, useRef } from 'react';
import { motion } from 'framer-motion';
import { useTaskStore, Task } from '@/store/taskStore';
import { useTouchDragStore } from '@/store/touchDragStore';
import { useCalendarStore } from '@/store/calendarStore';
import { useCarryStore } from '@/store/carryStore';
import { useDragHandoffStore } from '@/store/dragHandoffStore';
import { useColorSchemeStore } from '@/store/colorSchemeStore';
import { useCurrentTime, formatTime12h } from '@/hooks/useCurrentTime';
import { ChevronLeft, ChevronRight, Plus } from 'lucide-react';
import { GroupListRow } from '@/components/GroupListRow';
import { DurationGlyph } from '@/components/DurationGlyph';
import { useTimezoneStore } from '@/store/timezoneStore';
import { shouldShowScheduledTask } from '@/utils/taskVisibility';

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

/** Bracketed duration suffix shown next to task titles.
 *  < 2h → "[45]" (minutes only)
 *  ≥ 2h → "[2h 45]" or "[3h]" when no remainder. */
function formatDurationBracket(mins: number): string {
  if (mins < 120) return `[${mins}]`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m > 0 ? `[${h}h ${m}]` : `[${h}h]`;
}

function getEndTime(time: string, duration: number): string {
  const [h, m] = time.split(':').map(Number);
  const total = h * 60 + m + duration;
  return `${Math.floor(total / 60).toString().padStart(2, '0')}:${(total % 60).toString().padStart(2, '0')}`;
}

/** "Free time" pseudo-task shown when the current moment falls between two
 *  scheduled tasks. Matches the active-task row styling (left accent bar +
 *  muted background) so it reads as the current block on the schedule. */
function NowMarker({
  nowMinutes,
  startMinutes,
  endMinutes,
}: {
  nowMinutes: number;
  startMinutes: number | null;
  endMinutes: number | null;
}) {
  // Visible start = where the gap starts (or now, if before day's first task)
  const start = startMinutes ?? nowMinutes;
  const end = endMinutes;
  const totalDuration = end !== null ? end - start : null;
  const progress =
    end !== null && end > start
      ? Math.max(0, Math.min(100, ((nowMinutes - start) / (end - start)) * 100))
      : 0;
  const startLabel = formatTime12h(start);

  return (
    <div className="relative w-full text-left px-3 py-4 border-b border-border/20 bg-muted/40" aria-label="Free time">
      {/* Active playhead: vertical accent bar with progress fill (only when bounded) */}
      <div className="absolute left-0 top-0 bottom-0 w-0.5 bg-primary/15 overflow-hidden">
        <div
          className="absolute inset-x-0 top-0 bg-primary"
          style={{ height: `${end !== null ? progress : 100}%` }}
        />
      </div>
      <div className="flex items-baseline gap-3">
        {/* Priority dot slot — muted to match "no priority" */}
        <div className="w-2 h-2 rounded-full self-center flex-shrink-0 bg-muted-foreground/30" />
        {/* Time column — matches focus row layout */}
        <div className="w-16 flex-shrink-0">
          <p className="text-[11px] font-mono leading-tight text-primary tabular-nums whitespace-nowrap">
            {startLabel}
          </p>
        </div>

        {/* Title */}
        <div className="flex-1 min-w-0">
          <p className="text-sm font-display font-medium text-muted-foreground italic leading-snug truncate">
            Free time
            {totalDuration !== null && totalDuration > 0 && (
              <span className="ml-1.5 text-[11px] font-mono text-muted-foreground/50 not-italic">
                {formatDurationBracket(totalDuration)}
              </span>
            )}
          </p>
        </div>
      </div>
    </div>
  );
}

export function DayListView() {
  const {
    tasks, routinesEnabled, generateRecurringInstances, addTask,
    navigateToDate, setNavigateToDate, currentDate, setCurrentDate,
    setEditingTask, setDaySubMode,
    setListReturnZoom, setShowListReturn, completeTask,
  } = useTaskStore();
  const { dateStr: today } = useCurrentTime(15000);
  const { minutes: nowMinutes } = useCurrentTime(30000);
  const activeScheme = useColorSchemeStore((s) => s.getActiveScheme());
  const showCompletedTasks = useTimezoneStore((s) => s.showCompletedTasks);
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
    .filter((t) => t.date === selectedDate && shouldShowScheduledTask(t, { showCompleted: showCompletedTasks, routinesEnabled }))
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
    (t) => t.date === selectedDate && shouldShowScheduledTask(t, { showCompleted: showCompletedTasks, routinesEnabled }),
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

  /** Insert a 60-minute task ending exactly when the first scheduled task
   *  begins. If the first task starts before 01:00 we clamp to 00:00. */
  const handleInsertBefore = (first: Task) => {
    if (!first.time) return;
    const firstStart = timeStrToMinutes(first.time);
    const duration = Math.min(60, firstStart);
    if (duration <= 0) return;
    const time = minutesToTimeStr(firstStart - duration);
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
    setTimeout(() => setEditingTask(newId), 50);
  };

  /** Insert a 60-minute task starting exactly when the last scheduled task
   *  ends. Clamped so it never spills past midnight. */
  const handleInsertAfter = (last: Task) => {
    if (!last.time || !last.duration) return;
    const lastEnd = timeStrToMinutes(getEndTime(last.time, last.duration));
    const remaining = 24 * 60 - lastEnd;
    const duration = Math.min(60, remaining);
    if (duration <= 0) return;
    const time = minutesToTimeStr(lastEnd);
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
      <div className="sticky top-[env(safe-area-inset-top)] sm:top-12 z-30 bg-background border-b border-border/30">
        <div className="py-3 flex items-center justify-between gap-2">
          <h2 className="text-base sm:text-lg font-display font-bold text-foreground tracking-tight truncate">
            {new Date(selectedDate + 'T12:00:00').toLocaleDateString('en-US', {
              weekday: 'long',
              month: 'long',
              day: 'numeric',
            })}
          </h2>
          <div className="flex items-center gap-1 shrink-0">
            <button
              onClick={() => setSelectedDate(d => addDaysToDate(d, -1))}
              className="p-2 rounded-sm border border-border text-muted-foreground hover:text-foreground transition-colors"
            >
              <ChevronLeft size={14} strokeWidth={1.5} />
            </button>
            <button
              onClick={() => setSelectedDate(today)}
              className={`px-2.5 py-1.5 rounded-sm border border-border text-[10px] font-mono tracking-widest transition-colors ${
                isToday ? 'text-primary' : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              TODAY
            </button>
            <button
              onClick={() => setSelectedDate(d => addDaysToDate(d, 1))}
              className="p-2 rounded-sm border border-border text-muted-foreground hover:text-foreground transition-colors"
            >
              <ChevronRight size={14} strokeWidth={1.5} />
            </button>
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
            {(() => {
              // Compute insertion index for the standalone NOW marker (only on today).
              // If we're currently inside a task, don't render a standalone marker;
              // that task gets an inline playhead instead.
              let nowIndex = -1;
              if (isToday) {
                const scheduled = dayTasks
                  .map((t, idx) => ({ t, idx }))
                  .filter((x) => !!x.t.time);

                if (scheduled.length > 0) {
                  const currentScheduledTask = scheduled.find(({ t }) => {
                    const start = timeStrToMinutes(t.time!);
                    const end = start + (t.duration || 0);
                    return nowMinutes >= start && nowMinutes < end;
                  });

                  if (!currentScheduledTask) {
                    const firstUpcoming = scheduled.find(({ t }) => timeStrToMinutes(t.time!) > nowMinutes);
                    nowIndex = firstUpcoming ? firstUpcoming.idx : dayTasks.length;
                  }
                } else {
                  nowIndex = 0;
                }
              }
              return dayTasks.map((task, i) => {
              const next = dayTasks[i + 1];
              const gapMinutes = computeGapMinutes(task, next);
              const isFirstScheduled = !!task.time && dayTasks.slice(0, i).every((t) => !t.time);
              const isLastScheduled = !!task.time && dayTasks.slice(i + 1).every((t) => !t.time);
              // When the NowMarker appears here, hide the gap button between this row's
              // previous sibling and this row (the marker replaces it visually).
              const showNowMarkerHere = i === nowIndex;
              const prevTask = i > 0 ? dayTasks[i - 1] : undefined;
              const nowStart = prevTask?.time && prevTask?.duration
                ? timeStrToMinutes(prevTask.time) + prevTask.duration
                : null;
              const nowEnd = task.time ? timeStrToMinutes(task.time) : null;
              // When NowMarker appears AFTER the last row (nothing left today)
              const showNowMarkerAtEnd = i === dayTasks.length - 1 && nowIndex === dayTasks.length;
              const endNowStart = task.time && task.duration ? timeStrToMinutes(task.time) + task.duration : null;
              // The next sibling will render the NowMarker → suppress the gap "+" here.
              const nextRowShowsNowMarker = i + 1 === nowIndex;
              // The current row is the last one and the marker comes after → suppress trailing "+".
              const trailingShowsNowMarker = showNowMarkerAtEnd;
              if (task.type === 'group') {
                return (
                  <div key={task.id}>
                    {showNowMarkerHere && (
                      <NowMarker nowMinutes={nowMinutes} startMinutes={nowStart} endMinutes={nowEnd} />
                    )}
                    {isFirstScheduled && !showNowMarkerHere && (
                      <InsertGapButton
                        gapMinutes={Math.min(60, timeStrToMinutes(task.time!))}
                        onInsert={() => handleInsertBefore(task)}
                        showLabel={false}
                      />
                    )}
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
                    {gapMinutes > 0 && next && !nextRowShowsNowMarker && (
                      <InsertGapButton
                        gapMinutes={gapMinutes}
                        onInsert={() => handleInsertBetween(task, next)}
                      />
                    )}
                    {isLastScheduled && task.time && task.duration && !trailingShowsNowMarker && (
                      <InsertGapButton
                        gapMinutes={Math.min(60, 24 * 60 - timeStrToMinutes(getEndTime(task.time, task.duration)))}
                        onInsert={() => handleInsertAfter(task)}
                        showLabel={false}
                      />
                    )}
                    {showNowMarkerAtEnd && (
                      <NowMarker nowMinutes={nowMinutes} startMinutes={endNowStart} endMinutes={null} />
                    )}
                  </div>
                );
              }
              return (
                <div key={task.id}>
                  {showNowMarkerHere && (
                    <NowMarker nowMinutes={nowMinutes} startMinutes={nowStart} endMinutes={nowEnd} />
                  )}
                  {isFirstScheduled && !showNowMarkerHere && (
                    <InsertGapButton
                      gapMinutes={Math.min(60, timeStrToMinutes(task.time!))}
                      onInsert={() => handleInsertBefore(task)}
                      showLabel={false}
                    />
                  )}
                  <motion.div
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: i * 0.03 }}
                  >
                    {renderTaskRow(task, false)}
                  </motion.div>
                  {gapMinutes > 0 && next && !nextRowShowsNowMarker && (
                    <InsertGapButton
                      gapMinutes={gapMinutes}
                      onInsert={() => handleInsertBetween(task, next)}
                    />
                  )}
                  {isLastScheduled && task.time && task.duration && !trailingShowsNowMarker && (
                    <InsertGapButton
                      gapMinutes={Math.min(60, 24 * 60 - timeStrToMinutes(getEndTime(task.time, task.duration)))}
                      onInsert={() => handleInsertAfter(task)}
                      showLabel={false}
                    />
                  )}
                  {showNowMarkerAtEnd && (
                    <NowMarker nowMinutes={nowMinutes} startMinutes={endNowStart} endMinutes={null} />
                  )}
                </div>
              );
              });
            })()}
          </div>
        )}
      </div>

      {/* FAB — positioned above bottom nav on mobile */}
      <button
        onClick={handleAddTask}
        className="fixed bottom-[calc(5rem+env(safe-area-inset-bottom,0px))] sm:bottom-6 right-6 z-40 w-12 h-12 rounded-full bg-primary text-primary-foreground shadow-lg flex items-center justify-center active:scale-95 transition-transform"
      >
        <Plus size={22} strokeWidth={2} />
      </button>
    </div>
  );

  function renderTaskRow(task: Task, isChild: boolean) {
    const endTime = task.time && task.duration ? getEndTime(task.time, task.duration) : null;
    const startMinutes = task.time ? timeStrToMinutes(task.time) : null;
    const endMinutes = task.time && task.duration ? startMinutes! + task.duration : null;
    const isCurrentTask = isToday && !!task.time && !!task.duration && nowMinutes >= startMinutes! && nowMinutes < endMinutes!;
    const currentProgress = isCurrentTask && startMinutes !== null && endMinutes !== null && endMinutes > startMinutes
      ? Math.max(0, Math.min(100, ((nowMinutes - startMinutes) / (endMinutes - startMinutes)) * 100))
      : 0;
    return (
      <div
        className={`relative w-full text-left px-3 py-${isChild ? '2' : '4'} ${isChild ? 'border-b border-border/10' : 'border-b border-border/20'} transition-colors ${
          task.completed ? 'opacity-40' : ''
        } ${isCurrentTask ? 'bg-muted/40' : ''}`}
        onPointerDown={(e) => {
          if (e.pointerType === 'mouse' && e.button !== 0) return;
          if (useCarryStore.getState().carried) return;

          const startX = e.clientX;
          const startY = e.clientY;
          const pointerId = e.pointerId;
          const startedAt = Date.now();
          // Mirror timeline drag gating: for the first 250ms ANY movement is
          // treated as a scroll — the gesture is abandoned without picking
          // up or portaling the task. Only after the lock window can drag
          // activation fire.
          const LOCK_MS = 250;
          const MOVE_THRESHOLD = 10;
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
            if (dx <= MOVE_THRESHOLD && dy <= MOVE_THRESHOLD) return;
            // Within the lock window: any movement = user is scrolling.
            // Bail out of the entire gesture so the page can scroll freely.
            if (Date.now() - startedAt < LOCK_MS) {
              if (holdTimer != null) {
                window.clearTimeout(holdTimer);
                holdTimer = null;
              }
              cleanup();
              return;
            }
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
            enterScheduleForDrag(task, { zoomToTask: true });
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
        {/* Active-task playhead: thin accent left bar with vertical progress fill */}
        {isCurrentTask && (
          <div className="absolute left-0 top-0 bottom-0 w-0.5 bg-primary/15 overflow-hidden">
            <div
              className="absolute inset-x-0 top-0 bg-primary"
              style={{ height: `${currentProgress}%` }}
            />
          </div>
        )}
        <div className="flex items-baseline gap-3">
          {/* Priority dot — colored by task mobility, left of time */}
          <span
            aria-hidden
            className="flex-shrink-0 self-center w-2 h-2 rounded-full"
            style={{
              backgroundColor: `hsl(${activeScheme.priorities[task.priority as 0 | 1 | 2 | 3]?.fill
                ?? activeScheme.priorities[0].fill})`,
            }}
          />
          {/* Time column — single line, baseline-aligned with title */}
          <button
            onClick={(e) => {
              e.stopPropagation();
              handleTimeTap(task);
            }}
            className={`${isChild ? 'w-12' : 'w-16'} flex-shrink-0 text-left active:bg-muted/40 rounded-sm -mx-1 px-1 py-0.5 transition-colors`}
          >
            {task.time ? (
              <span className={`text-[11px] font-mono ${isCurrentTask ? 'text-primary' : 'text-foreground/80'} tabular-nums`}>
                {formatTime12h(task.time)}
              </span>
            ) : (
              <span className="text-[9px] font-mono text-muted-foreground/30 tracking-wider">ANYTIME</span>
            )}
          </button>

          {/* Title — tappable to edit */}
          <button
            onClick={() => handleTaskTap(task.id)}
            className="flex-1 min-w-0 text-left active:bg-muted/40 rounded-sm -mx-1 px-1 py-0.5 transition-colors"
          >
            <p className={`${isChild ? 'text-xs' : 'text-sm'} font-display font-medium text-foreground leading-snug ${
              task.completed ? 'line-through text-muted-foreground/50' : ''
            }`}>
              {task.title}
              {task.duration ? <DurationGlyph minutes={task.duration} size={isChild ? 12 : 14} className="ml-2" /> : null}
            </p>
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

/** Subtle inline insert affordance — sits flush on the divider between two
 *  rows so it doesn't add vertical rhythm. A small "+" on the left, no label
 *  by default; on hover it reveals the gap duration. */
function InsertGapButton({ gapMinutes, onInsert, showLabel = true }: { gapMinutes: number; onInsert: () => void; showLabel?: boolean }) {
  return (
    <div className="relative h-0">
      <button
        onClick={onInsert}
        aria-label={`Insert task in ${formatDuration(gapMinutes)} gap`}
        className="group absolute left-0 -top-2 z-10 flex items-center gap-1.5 pl-2 pr-2 h-4 text-left"
      >
        <div className="w-3.5 h-3.5 rounded-full bg-background border border-border/50 group-hover:border-primary/60 group-hover:bg-primary/10 flex items-center justify-center transition-colors">
          <Plus size={8} strokeWidth={2} className="text-muted-foreground/50 group-hover:text-primary transition-colors" />
        </div>
        {showLabel && (
          <span className="text-[9px] font-mono text-muted-foreground/0 group-hover:text-muted-foreground/60 tracking-wider transition-colors">
            {formatDuration(gapMinutes)}
          </span>
        )}
      </button>
    </div>
  );
}

