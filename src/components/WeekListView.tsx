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
import { useColorSchemeStore } from '@/store/colorSchemeStore';
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
  const activeScheme = useColorSchemeStore((s) => s.getActiveScheme());

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

  const renderRow = (task: Task, dateStr: string) => {
    const isCurrentTask =
      dateStr === today && !!task.time && !!task.duration &&
      nowMinutes >= timeStrToMinutes(task.time!) &&
      nowMinutes < timeStrToMinutes(task.time!) + task.duration!;
    const start = task.time ? timeStrToMinutes(task.time) : null;
    const end = start !== null && task.duration ? start + task.duration : null;
    const progress = isCurrentTask && start !== null && end !== null && end > start
      ? Math.max(0, Math.min(100, ((nowMinutes - start) / (end - start)) * 100))
      : 0;
    return (
      <div
        key={task.id}
        className={`relative w-full text-left px-3 py-3 border-b border-border/20 transition-colors ${
          task.completed ? 'opacity-40' : ''
        } ${isCurrentTask ? 'bg-muted/40' : ''}`}
      >
        {isCurrentTask && (
          <div className="absolute left-0 top-0 bottom-0 w-0.5 bg-primary/15 overflow-hidden">
            <div className="absolute inset-x-0 top-0 bg-primary" style={{ height: `${progress}%` }} />
          </div>
        )}
        <button onClick={() => handleTaskTap(task.id)} className="w-full text-left">
          <div className="flex items-center gap-3">
            <div
              className="w-2 h-2 rounded-full flex-shrink-0"
              style={{
                backgroundColor: `hsl(${activeScheme.priorities[task.priority as 0 | 1 | 2 | 3]?.fill
                  ?? activeScheme.priorities[0].fill})`,
              }}
            />
            <div className="w-20 flex-shrink-0">
              {task.time ? (
                <p className={`text-sm font-mono font-medium ${isCurrentTask ? 'text-primary' : 'text-foreground'} leading-snug tabular-nums`}>
                  {formatTime12h(task.time)}
                </p>
              ) : (
                <p className="text-sm font-mono font-medium text-muted-foreground/40 leading-snug tracking-wider">
                  ANYTIME
                </p>
              )}
            </div>
            <div className="flex-1 min-w-0">
              <p className={`text-sm font-display font-medium text-foreground leading-snug truncate ${
                task.completed ? 'line-through' : ''
              }`}>
                {task.title}
              </p>
              {task.description && (
                <p className="text-[11px] text-muted-foreground/50 mt-0.5 line-clamp-1">
                  {task.description}
                </p>
              )}
            </div>
            {task.duration && task.time && (
              <span className="flex-shrink-0 text-[11px] font-mono font-medium text-muted-foreground/80 tabular-nums px-2 py-0.5 rounded-sm bg-muted/40">
                {formatDuration(task.duration)}
              </span>
            )}
          </div>
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

      {/* Day sections */}
      <div className="py-2">
        {weekDays.map((date, dayIdx) => {
          const dayTasks = tasksFor(date);
          const isToday = date === today;
          const dayDate = new Date(date + 'T12:00:00');
          const completed = dayTasks.filter(t => t.completed).length;
          return (
            <motion.section
              key={date}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: dayIdx * 0.02 }}
              className="mb-4"
            >
              <button
                onClick={() => jumpToDay(date)}
                className={`w-full flex items-baseline justify-between px-3 py-1.5 border-b ${
                  isToday ? 'border-primary/40' : 'border-border/40'
                } hover:bg-muted/30 transition-colors`}
              >
                <div className="flex items-baseline gap-2">
                  <span className={`text-[10px] font-mono tracking-[0.2em] ${
                    isToday ? 'text-primary' : 'text-muted-foreground/60'
                  }`}>
                    {dayDate.toLocaleDateString('en-US', { weekday: 'short' }).toUpperCase()}
                  </span>
                  <span className={`text-base font-display font-bold ${
                    isToday ? 'text-primary' : 'text-foreground'
                  }`}>
                    {dayDate.getDate()}
                  </span>
                  <span className="text-[10px] font-mono text-muted-foreground/40 tracking-widest">
                    {dayDate.toLocaleDateString('en-US', { month: 'short' }).toUpperCase()}
                  </span>
                </div>
                <span className="text-[10px] font-mono text-muted-foreground/40 tracking-widest">
                  {dayTasks.length === 0
                    ? 'NONE'
                    : `${completed}/${dayTasks.length}`}
                </span>
              </button>
              {dayTasks.length === 0 ? (
                <div className="px-3 py-3">
                  <p className="text-[11px] font-mono text-muted-foreground/30 tracking-wider">— EMPTY —</p>
                </div>
              ) : (
                <div className="flex flex-col">
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
