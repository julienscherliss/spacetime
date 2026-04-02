import { useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useTaskStore } from '@/store/taskStore';
import { PriorityBadge } from '@/components/PriorityBadge';
import { ChevronLeft, ChevronRight, X } from 'lucide-react';

export function CalendarView() {
  const { tasks } = useTaskStore();
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState<string | null>(null);

  const calendarData = useMemo(() => {
    const year = currentMonth.getFullYear();
    const month = currentMonth.getMonth();
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    const startOffset = (firstDay.getDay() + 6) % 7; // Monday start

    const days: { date: string; day: number; inMonth: boolean }[] = [];
    
    // Previous month padding
    for (let i = startOffset - 1; i >= 0; i--) {
      const d = new Date(year, month, -i);
      days.push({ date: d.toISOString().split('T')[0], day: d.getDate(), inMonth: false });
    }
    
    // Current month
    for (let i = 1; i <= lastDay.getDate(); i++) {
      const d = new Date(year, month, i);
      days.push({ date: d.toISOString().split('T')[0], day: i, inMonth: true });
    }
    
    // Next month padding
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

  return (
    <div className="max-w-3xl mx-auto px-4 py-8">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <h2 className="text-2xl font-display font-bold text-foreground tracking-tight">
          {currentMonth.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}
        </h2>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() - 1))}
            className="p-2 rounded-lg bg-secondary hover:bg-secondary/80 text-secondary-foreground transition-colors"
          >
            <ChevronLeft size={16} />
          </button>
          <button
            onClick={() => setCurrentMonth(new Date())}
            className="px-3 py-2 rounded-lg bg-secondary hover:bg-secondary/80 text-secondary-foreground text-xs font-mono tracking-wider transition-colors"
          >
            TODAY
          </button>
          <button
            onClick={() => setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1))}
            className="p-2 rounded-lg bg-secondary hover:bg-secondary/80 text-secondary-foreground transition-colors"
          >
            <ChevronRight size={16} />
          </button>
        </div>
      </div>

      {/* Day headers */}
      <div className="grid grid-cols-7 mb-2">
        {['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN'].map((d) => (
          <div key={d} className="text-center text-[10px] font-mono tracking-widest text-muted-foreground py-2">
            {d}
          </div>
        ))}
      </div>

      {/* Calendar grid */}
      <div className="grid grid-cols-7 gap-1">
        {calendarData.map((day, i) => {
          const count = taskCountByDate[day.date] || 0;
          const intensity = count / maxTasks;
          const isToday = day.date === today;
          const isSelected = day.date === selectedDate;

          return (
            <motion.button
              key={i}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: i * 0.008 }}
              onClick={() => setSelectedDate(isSelected ? null : day.date)}
              className={`aspect-square rounded-lg flex flex-col items-center justify-center relative transition-all ${
                !day.inMonth ? 'opacity-20' : ''
              } ${isSelected ? 'ring-1 ring-primary' : ''} ${
                isToday ? 'ring-1 ring-primary/50' : ''
              }`}
              style={{
                backgroundColor: count > 0
                  ? `hsl(14 80% 54% / ${0.08 + intensity * 0.35})`
                  : 'hsl(var(--card))',
              }}
            >
              <span className={`text-sm font-mono ${
                isToday ? 'text-primary font-bold' : day.inMonth ? 'text-foreground' : 'text-muted-foreground'
              }`}>
                {day.day}
              </span>
              {count > 0 && (
                <span className="text-[9px] font-mono text-primary/80 mt-0.5">
                  {count}
                </span>
              )}
            </motion.button>
          );
        })}
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
            <div className="bg-card border border-border rounded-lg p-4">
              <div className="flex items-center justify-between mb-3">
                <h3 className="font-display font-semibold text-foreground text-sm">
                  {new Date(selectedDate + 'T12:00:00').toLocaleDateString('en-US', {
                    weekday: 'long',
                    month: 'short',
                    day: 'numeric',
                  })}
                </h3>
                <button onClick={() => setSelectedDate(null)} className="text-muted-foreground hover:text-foreground">
                  <X size={14} />
                </button>
              </div>
              {selectedTasks.length === 0 ? (
                <p className="text-xs font-mono text-muted-foreground">No tasks</p>
              ) : (
                <div className="space-y-2">
                  {selectedTasks.map((task) => (
                    <div key={task.id} className={`flex items-center gap-3 py-1.5 ${task.completed ? 'opacity-40' : ''}`}>
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
