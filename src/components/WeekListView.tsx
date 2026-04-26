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
import { useCalendarStore } from '@/store/calendarStore';
import { useCurrentTime, formatTime12h, getWeekBounds } from '@/hooks/useCurrentTime';
import { ChevronLeft, ChevronRight } from 'lucide-react';

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
    setEditingTask, setDaySubMode, setNavigateToDate, setViewMode,
  } = useTaskStore();
  const { dateStr: today, minutes: nowMinutes } = useCurrentTime(30000);

  // Week navigation: anchor on a date, derive the Mon→Sun bounds.
  const [anchor, setAnchor] = useState(today);
  const { start: weekStart, end: weekEnd } = getWeekBounds(anchor);

  // Build the array of 7 ISO date strings for this week.
  const weekDays: string[] = [];
  {
    let cur = weekStart;
    while (cur <= weekEnd) {
      weekDays.push(cur);
      cur = addDaysToDate(cur, 1);
    }
  }

  useEffect(() => {
    generateRecurringInstances(weekStart, weekEnd);
  }, [weekStart, weekEnd, generateRecurringInstances]);

  const { connected, calendars, fetchEvents } = useCalendarStore();
  useEffect(() => {
    if (connected) fetchEvents(weekStart, weekEnd);
  }, [weekStart, weekEnd, connected, calendars, fetchEvents]);

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
    const s = new Date(weekStart + 'T12:00:00');
    const e = new Date(weekEnd + 'T12:00:00');
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

    const statusColor = task.completed
      ? 'text-muted-foreground/40'
      : isCurrentTask
        ? 'text-primary'
        : isPast
          ? 'text-muted-foreground/40'
          : isTodayDate
            ? 'text-primary/80'
            : 'text-muted-foreground/60';

    const titleColor = task.completed
      ? 'text-muted-foreground/50 line-through'
      : isPast
        ? 'text-foreground/50'
        : 'text-foreground';

    return (
      <button
        key={task.id}
        onClick={() => handleTaskTap(task.id)}
        className="w-full text-left flex items-baseline gap-4 px-1 py-1.5 hover:bg-muted/20 rounded-sm transition-colors"
      >
        <span className={`w-14 flex-shrink-0 text-[10px] font-mono font-medium tracking-[0.15em] tabular-nums ${statusColor}`}>
          {statusLabel}
        </span>
        <span className={`flex-1 min-w-0 text-[15px] font-display leading-snug truncate ${titleColor}`}>
          {task.title}
        </span>
      </button>
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
            WEEK OF {new Date(weekStart + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'long' }).toUpperCase()}
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
                today >= weekStart && today <= weekEnd
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
