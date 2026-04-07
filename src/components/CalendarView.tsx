import { useMemo, useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useTaskStore } from '@/store/taskStore';
import { useLibraryStore } from '@/store/libraryStore';
import { PriorityBadge } from '@/components/PriorityBadge';
import { formatTime12h } from '@/hooks/useCurrentTime';
import { ChevronLeft, ChevronRight, X } from 'lucide-react';

export function CalendarView() {
  const { tasks, routinesEnabled, setEditingTask, generateRecurringInstances, setViewMode, setNavigateToDate } = useTaskStore();
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState<string | null>(null);

  // Swipe state
  const touchStartRef = useRef<{ x: number; y: number } | null>(null);
  const [swipeOffset, setSwipeOffset] = useState(0);
  const [swiping, setSwiping] = useState(false);
  const swipeAxisRef = useRef<'horizontal' | 'vertical' | null>(null);

  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    if (e.touches.length !== 1) return;
    touchStartRef.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
    swipeAxisRef.current = null;
  }, []);

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    if (!touchStartRef.current || e.touches.length !== 1) return;
    const dx = e.touches[0].clientX - touchStartRef.current.x;
    const dy = e.touches[0].clientY - touchStartRef.current.y;
    // Lock axis on first significant movement
    if (!swipeAxisRef.current && (Math.abs(dx) > 10 || Math.abs(dy) > 10)) {
      swipeAxisRef.current = Math.abs(dx) > Math.abs(dy) ? 'horizontal' : 'vertical';
    }
    if (swipeAxisRef.current === 'horizontal' && Math.abs(dx) > 10) {
      setSwiping(true);
      setSwipeOffset(dx);
    }
  }, []);

  const handleTouchEnd = useCallback((e: React.TouchEvent) => {
    if (!touchStartRef.current) return;
    const dy = e.changedTouches[0].clientY - touchStartRef.current.y;

    // Horizontal swipe — month navigation
    if (swipeAxisRef.current === 'horizontal' && Math.abs(swipeOffset) > 60) {
      if (swipeOffset > 0) {
        setCurrentMonth(m => new Date(m.getFullYear(), m.getMonth() - 1));
      } else {
        setCurrentMonth(m => new Date(m.getFullYear(), m.getMonth() + 1));
      }
    }

    // Vertical swipe — open Library (up) or Waiting Room (down)
    if (swipeAxisRef.current === 'vertical' && Math.abs(dy) > 80) {
      if (dy < -80) {
        // Swipe up → open Library
        const { useLibraryStore } = require('@/store/libraryStore');
        useLibraryStore.getState().setPanelOpen(true);
      } else if (dy > 80) {
        // Swipe down → open Waiting Room
        window.dispatchEvent(new CustomEvent('toggle-waiting-room'));
      }
    }

    setSwipeOffset(0);
    setSwiping(false);
    touchStartRef.current = null;
    swipeAxisRef.current = null;
  }, [swipeOffset]);

  const calendarData = useMemo(() => {
    const year = currentMonth.getFullYear();
    const month = currentMonth.getMonth();
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    const startOffset = (firstDay.getDay() + 6) % 7;

    const days: { date: string; day: number; inMonth: boolean }[] = [];

    for (let i = startOffset - 1; i >= 0; i--) {
      const d = new Date(year, month, -i);
      days.push({ date: d.toISOString().split('T')[0], day: d.getDate(), inMonth: false });
    }

    for (let i = 1; i <= lastDay.getDate(); i++) {
      const d = new Date(year, month, i);
      days.push({ date: d.toISOString().split('T')[0], day: i, inMonth: true });
    }

    const remaining = 42 - days.length;
    for (let i = 1; i <= remaining; i++) {
      const d = new Date(year, month + 1, i);
      days.push({ date: d.toISOString().split('T')[0], day: i, inMonth: false });
    }

    return days;
  }, [currentMonth]);

  useEffect(() => {
    if (calendarData.length > 0) {
      generateRecurringInstances(calendarData[0].date, calendarData[calendarData.length - 1].date);
    }
  }, [calendarData, generateRecurringInstances]);

  const filteredTasks = useMemo(() => {
    if (routinesEnabled) return tasks;
    return tasks.filter((t) => t.type !== 'recurring');
  }, [tasks, routinesEnabled]);

  const taskCountByDate = useMemo(() => {
    const counts: Record<string, number> = {};
    filteredTasks.forEach((t) => {
      if (!t.completed) counts[t.date] = (counts[t.date] || 0) + 1;
    });
    return counts;
  }, [filteredTasks]);

  const maxTasks = Math.max(1, ...Object.values(taskCountByDate));
  const today = new Date().toISOString().split('T')[0];

  const selectedTasks = selectedDate
    ? filteredTasks.filter((t) => t.date === selectedDate).sort((a, b) => (a.time || '').localeCompare(b.time || ''))
    : [];

  const getHeatBg = (count: number): string => {
    if (count === 0) return '';
    const intensity = count / maxTasks;
    if (intensity < 0.33) return 'bg-muted/60';
    if (intensity < 0.66) return 'bg-[hsl(var(--priority-2)/0.08)]';
    return 'bg-[hsl(var(--primary)/0.1)]';
  };

  return (
    <div
      className="max-w-2xl mx-auto px-3 sm:px-4 py-4"
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
    >
      {/* Header */}
      <div className="flex items-center justify-between mb-5">
        <h2 className="text-base sm:text-lg font-display font-bold text-foreground tracking-tight">
          {currentMonth.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}
        </h2>
        <div className="flex items-center gap-1">
          <button
            onClick={() => setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() - 1))}
            className="p-2 rounded-sm border border-border text-muted-foreground hover:text-foreground transition-colors"
          >
            <ChevronLeft size={14} strokeWidth={1.5} />
          </button>
          <button
            onClick={() => setCurrentMonth(new Date())}
            className="px-2.5 py-1.5 rounded-sm border border-border text-muted-foreground hover:text-foreground text-[10px] font-mono tracking-widest transition-colors"
          >
            TODAY
          </button>
          <button
            onClick={() => setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1))}
            className="p-2 rounded-sm border border-border text-muted-foreground hover:text-foreground transition-colors"
          >
            <ChevronRight size={14} strokeWidth={1.5} />
          </button>
        </div>
      </div>

      {/* Day headers */}
      <div className="grid grid-cols-7 mb-1">
        {['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN'].map((d) => (
          <div key={d} className="text-center text-[9px] font-mono tracking-[0.15em] text-muted-foreground/40 py-1.5">
            {d}
          </div>
        ))}
      </div>

      {/* Calendar grid */}
      <div className="grid grid-cols-7 gap-px bg-border/30 rounded-sm overflow-hidden">
        {calendarData.map((day, i) => {
          const count = taskCountByDate[day.date] || 0;
          const isToday = day.date === today;
          const isSelected = day.date === selectedDate;

          return (
            <button
              key={i}
              onClick={() => {
                if (isSelected) {
                  // Second tap on selected date → navigate to day view
                  setNavigateToDate(day.date);
                  setViewMode('day');
                } else {
                  setSelectedDate(day.date);
                }
              }}
              className={`aspect-square flex flex-col items-center justify-center bg-card transition-all ${
                !day.inMonth ? 'opacity-20' : ''
              } ${isSelected ? 'ring-1 ring-inset ring-primary/30' : ''} hover:bg-muted/30 ${getHeatBg(count)}`}
            >
              <span className={`text-sm font-mono ${
                isToday ? 'text-primary font-bold' : day.inMonth ? 'text-foreground/60' : 'text-muted-foreground'
              }`}>
                {day.day}
              </span>
              {count > 0 && (
                <span className="text-[9px] font-mono text-muted-foreground/40 mt-px">
                  {count}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Selected day */}
      <AnimatePresence>
        {selectedDate && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="mt-4 overflow-hidden"
          >
            <div className="bg-card border border-border rounded-sm p-3">
              <div className="flex items-center justify-between mb-2">
                <h3 className="font-display font-semibold text-foreground text-sm">
                  {new Date(selectedDate + 'T12:00:00').toLocaleDateString('en-US', {
                    weekday: 'long',
                    month: 'short',
                    day: 'numeric',
                  })}
                </h3>
                <button onClick={() => setSelectedDate(null)} className="text-muted-foreground hover:text-foreground transition-colors">
                  <X size={14} strokeWidth={1.5} />
                </button>
              </div>
              {selectedTasks.length === 0 ? (
                <p className="text-[11px] font-mono text-muted-foreground/30 tracking-wider">NO TASKS</p>
              ) : (
                <div className="space-y-1">
                  {selectedTasks.map((task) => (
                    <div
                      key={task.id}
                      onClick={() => !task.completed && setEditingTask(task.id)}
                      className={`flex items-center gap-2 py-1.5 px-2 rounded-sm cursor-pointer transition-colors ${
                        task.completed ? 'opacity-20' : 'hover:bg-muted/40'
                      }`}
                    >
                      {task.time && (
                        <span className="text-[10px] font-mono text-muted-foreground/40 w-16">{formatTime12h(task.time)}</span>
                      )}
                      <span className={`flex-1 text-[12px] font-mono ${task.completed ? 'line-through text-muted-foreground' : 'text-foreground/70'}`}>
                        {task.title}
                      </span>
                      <PriorityBadge priority={task.priority} />
                    </div>
                  ))}
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
