/**
 * WeekListView — read/scan list view for the week.
 * Stacks 7 day sections, each a sticky header + task rows. Tap row to edit;
 * tap a day header to jump into the day's timeline view. Keeps the same row
 * visual language as DayListView (dot · time · title · duration) but trimmed:
 * no drag-into-timeline portal, no inline gap/insert buttons. Optimised for
 * weekly review at a glance.
 */
import { useState, useEffect, useRef, useCallback } from 'react';
import { motion } from 'framer-motion';
import { useTaskStore, Task } from '@/store/taskStore';
import { useCarryStore } from '@/store/carryStore';
import { useDragHandoffStore } from '@/store/dragHandoffStore';
import { useCalendarStore } from '@/store/calendarStore';
import { useCurrentTime, formatTime12h, getWeekBounds } from '@/hooks/useCurrentTime';
import { ChevronLeft, ChevronRight, ChevronsRight } from 'lucide-react';

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

function timeStrToMinutes(time: string): number {
  const [h, m] = time.split(':').map(Number);
  return h * 60 + m;
}

export function WeekListView() {
  const {
    tasks, routinesEnabled, generateRecurringInstances,
    setEditingTask, setDaySubMode, setWeekSubMode, setNavigateToDate, setViewMode,
    setListReturnZoom, setShowListReturn,
  } = useTaskStore();
  const { dateStr: today, minutes: nowMinutes } = useCurrentTime(30000);

  // Week navigation: anchor on a date, derive the Mon→Sun bounds.
  const [anchor, setAnchor] = useState(today);
  const { start: weekStart, end: weekEnd } = getWeekBounds(anchor);
  // Shift the list by 3 days (Thu→Wed slice) when toggled. Defaults on
  // for Thu/Fri/Sat/Sun so the user opens onto the relevant half of the week.
  const [dayShift, setDayShift] = useState(() => {
    const d = new Date();
    const dow = d.getDay();
    return dow === 0 || dow >= 4 ? 3 : 0;
  });

  // Build the array of 7 ISO date strings for this week, offset by dayShift.
  const weekDays: string[] = [];
  {
    let cur = addDaysToDate(weekStart, dayShift);
    for (let i = 0; i < 7; i++) {
      weekDays.push(cur);
      cur = addDaysToDate(cur, 1);
    }
  }
  const rangeStart = weekDays[0];
  const rangeEnd = weekDays[weekDays.length - 1];

  useEffect(() => {
    generateRecurringInstances(rangeStart, rangeEnd);
  }, [rangeStart, rangeEnd, generateRecurringInstances]);

  const { connected, calendars, fetchEvents } = useCalendarStore();
  useEffect(() => {
    if (connected) fetchEvents(rangeStart, rangeEnd);
  }, [rangeStart, rangeEnd, connected, calendars, fetchEvents]);

  // Double-tap to complete (per-row)
  const lastTapRef = useRef<{ id: string; time: number } | null>(null);
  const handleTaskTap = useCallback((taskId: string) => {
    const now = Date.now();
    if (lastTapRef.current && lastTapRef.current.id === taskId && now - lastTapRef.current.time < 400) {
      lastTapRef.current = null;
      const task = tasks.find(t => t.id === taskId);
      if (task?.completed) useTaskStore.getState().uncompleteTask(taskId);
      else useTaskStore.getState().completeTask(taskId);
      if (navigator.vibrate) navigator.vibrate(20);
      return;
    }
    lastTapRef.current = { id: taskId, time: now };
    setTimeout(() => {
      if (lastTapRef.current && lastTapRef.current.id === taskId && Date.now() - lastTapRef.current.time >= 380) {
        setEditingTask(taskId);
        lastTapRef.current = null;
      }
    }, 400);
  }, [tasks, setEditingTask]);

  const jumpToDay = (date: string) => {
    setNavigateToDate(date);
    setDaySubMode('timeline');
    setViewMode('day');
  };

  /** Tapping the time chip or dragging a row portals into the week schedule
   *  view. Mirrors DayListView's behavior, swapped for week. */
  const enterWeekScheduleForTask = (task: Task) => {
    setNavigateToDate(task.date);
    if (task.time) {
      setListReturnZoom({ taskTime: task.time, taskDuration: task.duration || 30 });
    }
    setShowListReturn(true);
    setWeekSubMode('timeline');
    setViewMode('week');
  };

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

  const tasksFor = (date: string) =>
    tasks
      .filter((t) => t.date === date && !t.inWaitingRoom && !t.archivedAt &&
        !(!routinesEnabled && t.isRoutine !== false && t.type === 'recurring'))
      .filter((t) => !t.groupId)
      .sort((a, b) => {
        if (!a.time && !b.time) return 0;
        if (!a.time) return 1;
        if (!b.time) return -1;
        return a.time.localeCompare(b.time);
      });

  // Week label like "Apr 21 – Apr 27"
  const weekLabel = (() => {
    const s = new Date(rangeStart + 'T12:00:00');
    const e = new Date(rangeEnd + 'T12:00:00');
    const sameMonth = s.getMonth() === e.getMonth();
    const sFmt = s.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    const eFmt = sameMonth
      ? e.toLocaleDateString('en-US', { day: 'numeric' })
      : e.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    return `${sFmt} – ${eFmt}`;
  })();

  /** Compact task row: STATUS/TIME chip · title.
   *  - Completed → DONE
   *  - Has a time → "4:00 P"
   *  - Untimed/incomplete → TODO
   *  Past + uncompleted days fade their TODOs to muted; today's tasks pop. */
  const renderRow = (task: Task, dateStr: string) => {
    const isPast = dateStr < today;
    const isTodayDate = dateStr === today;
    const isCurrentTask =
      isTodayDate && !!task.time && !!task.duration &&
      nowMinutes >= timeStrToMinutes(task.time!) &&
      nowMinutes < timeStrToMinutes(task.time!) + task.duration!;

    // Status label
    let statusLabel: string;
    if (task.completed) statusLabel = 'DONE';
    else if (task.time) statusLabel = formatTime12h(task.time).replace(/\s?(AM|PM)/i, (m) => ` ${m.trim().charAt(0)}`);
    else statusLabel = 'TODO';

    // Time stays a uniform dark grey regardless of state (except current/completed cues)
    const statusColor = task.completed
      ? 'text-muted-foreground/40'
      : isCurrentTask
        ? 'text-primary'
        : 'text-foreground/70';

    // Title color reflects the task's mobility (priority) tag
    const priorityVar = `hsl(var(--priority-${task.priority ?? 0}))`;
    const titleClass = task.completed
      ? 'text-muted-foreground/50 line-through'
      : isPast
        ? 'opacity-60'
        : '';

    return (
      <div
        key={task.id}
        className="w-full flex items-baseline gap-4 px-1 py-1.5 hover:bg-muted/20 rounded-sm transition-colors select-none"
        onPointerDown={(e) => {
          if (e.pointerType === 'mouse' && e.button !== 0) return;
          if (useCarryStore.getState().carried) return;
          const startX = e.clientX;
          const startY = e.clientY;
          const pointerId = e.pointerId;
          let holdTimer: number | null = window.setTimeout(() => {
            holdTimer = null;
            cleanup();
            carryPickup(task);
          }, 500);
          const canPortal = !!task.time && task.type !== 'group';
          const onMove = (ev: PointerEvent) => {
            const dx = Math.abs(ev.clientX - startX);
            const dy = Math.abs(ev.clientY - startY);
            if (dx <= 8 && dy <= 8) return;
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
            enterWeekScheduleForTask(task);
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
        {/* Time / status chip — tappable to portal into week schedule */}
        <button
          onClick={(e) => {
            e.stopPropagation();
            if (task.time) enterWeekScheduleForTask(task);
          }}
          className={`w-16 flex-shrink-0 text-left text-[10px] font-mono font-medium tracking-[0.15em] tabular-nums whitespace-nowrap active:bg-muted/40 rounded-sm -mx-1 px-1 py-0.5 transition-colors ${statusColor}`}
        >
          {statusLabel}
        </button>
        {/* Title — tap to edit, double-tap to complete */}
        <button
          onClick={() => handleTaskTap(task.id)}
          style={task.completed ? undefined : { color: priorityVar }}
          className={`flex-1 min-w-0 text-left text-[15px] font-display leading-snug truncate active:bg-muted/40 rounded-sm -mx-1 px-1 py-0.5 transition-colors ${titleClass}`}
        >
          {task.title}
          {task.duration ? (
            <span className="ml-1.5 text-[11px] font-mono text-muted-foreground/50 tabular-nums">
              {formatDurationBracket(task.duration)}
            </span>
          ) : null}
        </button>
      </div>
    );
  };

  return (
    <div className="max-w-3xl mx-auto px-3 sm:px-4">
      {/* Sticky week header */}
      <div className="sticky top-0 sm:top-12 z-30 bg-background border-b border-border/30">
        <div className="pt-3 pb-2">
          <h2 className="text-lg sm:text-xl font-display font-bold text-foreground tracking-tight">
            {weekLabel}
          </h2>
          <p className="text-[10px] font-mono text-muted-foreground/50 mt-0.5 tracking-widest">
            WEEK OF {new Date(rangeStart + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'long' }).toUpperCase()}
          </p>
        </div>
        <div className="py-1.5 flex items-center justify-between border-t border-border/20">
          <div className="flex items-center gap-0.5">
            <button
              onClick={() => setAnchor((a) => addDaysToDate(a, -7))}
              className="p-1.5 rounded-sm text-muted-foreground/50 hover:text-foreground hover:bg-muted/50 transition-colors"
            >
              <ChevronLeft size={16} strokeWidth={1.5} />
            </button>
            <button
              onClick={() => setAnchor(today)}
              className={`px-2.5 py-1 rounded-sm text-[10px] font-mono tracking-widest transition-colors ${
                today >= rangeStart && today <= rangeEnd
                  ? 'text-primary bg-primary/5'
                  : 'text-muted-foreground/50 hover:text-foreground hover:bg-muted/50'
              }`}
            >
              THIS WEEK
            </button>
            <button
              onClick={() => setAnchor((a) => addDaysToDate(a, 7))}
              className="p-1.5 rounded-sm text-muted-foreground/50 hover:text-foreground hover:bg-muted/50 transition-colors"
            >
              <ChevronRight size={16} strokeWidth={1.5} />
            </button>
            <button
              onClick={() => setDayShift((s) => (s === 0 ? 3 : 0))}
              title={dayShift === 0 ? 'Shift forward 3 days' : 'Shift back 3 days'}
              aria-label={dayShift === 0 ? 'Shift forward 3 days' : 'Shift back 3 days'}
              className={`ml-1 p-1.5 rounded-sm transition-colors ${
                dayShift !== 0
                  ? 'text-primary hover:text-primary/80'
                  : 'text-muted-foreground/50 hover:text-foreground hover:bg-muted/50'
              }`}
            >
              <ChevronsRight size={14} strokeWidth={1.5} />
            </button>
          </div>
          <div />
        </div>
      </div>

      {/* Day sections — large day number anchors each block. Weekday/month sit
          right-aligned at the top of the section. Tasks indent under the number
          column so the date stays visually dominant. Empty days still appear
          (faded) so the week's rhythm is preserved. */}
      <div className="pt-6 pb-12 space-y-10">
        {weekDays.map((date, dayIdx) => {
          const dayTasks = tasksFor(date);
          const isToday = date === today;
          const isPast = date < today;
          const dayDate = new Date(date + 'T12:00:00');
          const isEmpty = dayTasks.length === 0;

          const dayNumberColor = isToday
            ? 'text-primary'
            : isPast
              ? 'text-muted-foreground/30'
              : 'text-foreground';

          const labelColor = isToday
            ? 'text-foreground'
            : isPast
              ? 'text-muted-foreground/40'
              : 'text-foreground';

          return (
            <motion.section
              key={date}
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: dayIdx * 0.02 }}
            >
              {/* Large date header — day number left, weekday/month right */}
              <button
                onClick={() => jumpToDay(date)}
                className="w-full flex items-start justify-between gap-4 px-1 mb-3 group"
              >
                <span
                  className={`text-5xl sm:text-6xl font-display font-bold tabular-nums leading-none tracking-tight ${dayNumberColor} group-hover:opacity-80 transition-opacity`}
                >
                  {dayDate.getDate()}
                </span>
                <div className="flex flex-col items-end leading-tight pt-1">
                  <span className={`text-base sm:text-lg font-display font-bold ${labelColor}`}>
                    {dayDate.toLocaleDateString('en-US', { weekday: 'long' })}
                  </span>
                  <span className={`text-sm font-display ${
                    isPast ? 'text-muted-foreground/40' : 'text-muted-foreground'
                  }`}>
                    {dayDate.toLocaleDateString('en-US', { month: 'long' })}
                  </span>
                </div>
              </button>

              {/* Task rows — indented under the date number, kept compact */}
              {!isEmpty && (
                <div className="flex flex-col gap-0.5 pl-1">
                  {dayTasks.map((task) => renderRow(task, date))}
                </div>
              )}
            </motion.section>
          );
        })}
      </div>
    </div>
  );
}
