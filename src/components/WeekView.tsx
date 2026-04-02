import { useMemo } from 'react';
import { motion } from 'framer-motion';
import { useTaskStore } from '@/store/taskStore';
import { PriorityBadge } from '@/components/PriorityBadge';

export function WeekView() {
  const { tasks } = useTaskStore();

  const weekDays = useMemo(() => {
    const today = new Date();
    const monday = new Date(today);
    monday.setDate(today.getDate() - ((today.getDay() + 6) % 7));
    
    return Array.from({ length: 7 }, (_, i) => {
      const d = new Date(monday);
      d.setDate(monday.getDate() + i);
      return {
        date: d.toISOString().split('T')[0],
        label: d.toLocaleDateString('en-US', { weekday: 'short' }),
        day: d.getDate(),
        isToday: d.toISOString().split('T')[0] === today.toISOString().split('T')[0],
      };
    });
  }, []);

  return (
    <div className="px-4 py-8 overflow-x-auto">
      <h2 className="text-2xl font-display font-bold text-foreground tracking-tight mb-8 px-2">
        This Week
      </h2>

      <div className="grid grid-cols-7 gap-2 min-w-[800px]">
        {weekDays.map((day, di) => {
          const dayTasks = tasks.filter((t) => t.date === day.date && !t.completed)
            .sort((a, b) => (a.time || '').localeCompare(b.time || ''));

          return (
            <motion.div
              key={day.date}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: di * 0.05 }}
              className="flex flex-col"
            >
              {/* Day header */}
              <div className={`text-center py-3 rounded-t-lg border-b ${
                day.isToday ? 'bg-primary/10 border-primary/30' : 'bg-card border-border'
              }`}>
                <div className="text-[10px] font-mono tracking-widest text-muted-foreground uppercase">
                  {day.label}
                </div>
                <div className={`text-lg font-display font-bold ${day.isToday ? 'text-primary' : 'text-foreground'}`}>
                  {day.day}
                </div>
              </div>

              {/* Tasks */}
              <div className="flex-1 bg-card/50 border-x border-b border-border rounded-b-lg p-2 space-y-1.5 min-h-[200px]">
                {dayTasks.map((task) => (
                  <div
                    key={task.id}
                    className="p-2 rounded-md bg-elevated border border-border hover:border-primary/30 transition-colors cursor-pointer"
                  >
                    <div className="text-xs font-mono text-foreground leading-tight mb-1.5">
                      {task.title}
                    </div>
                    <div className="flex items-center justify-between">
                      {task.time && (
                        <span className="text-[10px] font-mono text-muted-foreground">
                          {task.time}
                        </span>
                      )}
                      <PriorityBadge priority={task.priority} />
                    </div>
                  </div>
                ))}
                {dayTasks.length === 0 && (
                  <div className="flex items-center justify-center h-full min-h-[100px]">
                    <span className="text-[10px] font-mono text-muted-foreground/40">—</span>
                  </div>
                )}
              </div>
            </motion.div>
          );
        })}
      </div>
    </div>
  );
}
