import { useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useTaskStore } from '@/store/taskStore';
import { PriorityBadge } from '@/components/PriorityBadge';
import { ChevronLeft, ChevronRight, X } from 'lucide-react';

export function CalendarView() {
  const { tasks, setEditingTask } = useTaskStore();
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState<string | null>(null);

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

  const taskCountByDate = useMemo(() => {
    const counts: Record<string, number> = {};
    tasks.forEach((t) => {
      if (!t.completed) counts[t.date] = (counts[t.date] || 0) + 1;
    });
    return counts;
  }, [tasks]);

  const maxTasks = Math.max(1, ...Object.values(taskCountByDate));
  const today = new Date().toISOString().split('T')[0];

  const selectedTasks = selectedDate
    ? tasks.filter((t) => t.date === selectedDate).sort((a, b) => (a.time || '').localeCompare(b.time || ''))
    : [];

  // Heat color: from neutral → warm grey → burnt orange
  const getHeatColor = (count: number): string => {
    if (count === 0) return 'hsl(var(--card))';
    const intensity = count / maxTasks;
    if (intensity < 0.33) return 'hsl(0 0% 14%)';
    if (intensity < 0.66) return 'hsl(25 30% 18%)';
    return `hsl(14 76% 50% / ${0.15 + intensity * 0.25})`;
  };

  return (
    <div className="max-w-3xl mx-auto px-4 py-8">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <h2 className="text-2xl font-display font-bold text-foreground tracking-tight">
          {currentMonth.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}
        </h2>
        <div className="flex items-center gap-1.5">
          <button
            onClick={() => setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() - 1))}
            className="p-2 rounded bg-secondary hover:bg-secondary/80 text-secondary-foreground transition-colors"
          >
            <ChevronLeft size={14} />
          </button>
          <button
            onClick={() => setCurrentMonth(new Date())}
            className="px-2.5 py-2 rounded bg-secondary hover:bg-secondary/80 text-secondary-foreground text-[10px] font-mono tracking-wider transition-colors"
          >
            TODAY
          </button>
          <button
            onClick={() => setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1))}
            className="p-2 rounded bg-secondary hover:bg-secondary/80 text-secondary-foreground transition-colors"
          >
            <ChevronRight size={14} />
          </button>
        </div>
      </div>

      {/* Day headers */}
      <div className="grid grid-cols-7 mb-1.5">
        {['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN'].map((d) => (
          <div key={d} className="text-center text-[9px] font-mono tracking-[0.2em] text-muted-foreground/60 py-2">
            {d}
          </div>
        ))}
      </div>

      {/* Calendar grid */}
      <div className="grid grid-cols-7 gap-[3px]">
        {calendarData.map((day, i) => {
          const count = taskCountByDate[day.date] || 0;
          const isToday = day.date === today;
          const isSelected = day.date === selectedDate;

          return (
            <motion.button
              key={i}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: i * 0.006 }}
              onClick={() => setSelectedDate(isSelected ? null : day.date)}
              className={`aspect-square rounded flex flex-col items-center justify-center relative transition-all ${
                !day.inMonth ? 'opacity-15' : ''
              } ${isSelected ? 'ring-1 ring-primary/60' : ''} ${
                isToday ? 'ring-1 ring-primary/30' : ''
              }`}
              style={{ backgroundColor: getHeatColor(count) }}
            >
              <span className={`text-sm font-mono ${
                isToday ? 'text-primary font-bold' : day.inMonth ? 'text-foreground/80' : 'text-muted-foreground'
              }`}>
                {day.day}
              </span>
              {count > 0 && (
                <span className="text-[8px] font-mono text-primary/70 mt-0.5">
                  {count}
                </span>
              )}
            </motion.button>
          );
        })}
      </div>

      {/* Legend */}
      <div className="flex items-center justify-end gap-1.5 mt-4">
        <span className="text-[9px] font-mono text-muted-foreground/40">LESS</span>
        {[0, 1, 2, 3, 4].map((i) => (
          <div
            key={i}
            className="w-3 h-3 rounded-sm"
            style={{ backgroundColor: getHeatColor(i === 0 ? 0 : (i / 4) * maxTasks) }}
          />
        ))}
        <span className="text-[9px] font-mono text-muted-foreground/40">MORE</span>
      </div>

      {/* Selected day detail */}
      <AnimatePresence>
        {selectedDate && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="mt-6 overflow-hidden"
          >
            <div className="bg-card border border-border/50 rounded-lg p-4">
              <div className="flex items-center justify-between mb-3">
                <h3 className="font-display font-semibold text-foreground text-sm">
                  {new Date(selectedDate + 'T12:00:00').toLocaleDateString('en-US', {
                    weekday: 'long',
                    month: 'short',
                    day: 'numeric',
                  })}
                </h3>
                <button onClick={() => setSelectedDate(null)} className="text-muted-foreground hover:text-foreground transition-colors">
                  <X size={14} />
                </button>
              </div>
              {selectedTasks.length === 0 ? (
                <p className="text-xs font-mono text-muted-foreground/50">No tasks</p>
              ) : (
                <div className="space-y-1.5">
                  {selectedTasks.map((task) => (
                    <div
                      key={task.id}
                      onClick={() => !task.completed && setEditingTask(task.id)}
                      className={`flex items-center gap-3 py-1.5 px-2 rounded cursor-pointer transition-colors ${
                        task.completed ? 'opacity-30' : 'hover:bg-elevated'
                      }`}
                    >
                      {task.time && (
                        <span className="text-[10px] font-mono text-muted-foreground w-12">{task.time}</span>
                      )}
                      <span className={`flex-1 text-xs font-mono ${task.completed ? 'line-through text-muted-foreground' : 'text-foreground'}`}>
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
