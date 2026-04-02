import { useState } from 'react';
import { motion } from 'framer-motion';
import { useTaskStore } from '@/store/taskStore';
import { useCurrentTime } from '@/hooks/useCurrentTime';
import { TimelineColumn, HOUR_HEIGHT, HOURS } from '@/components/TimelineColumn';
import { BlockedModal } from '@/components/BlockedModal';

export function DayView() {
  const { tasks } = useTaskStore();
  const { minutes: nowMinutes, dateStr: today } = useCurrentTime(15000);
  const [selectedDate] = useState(today);
  const [blockedTaskId, setBlockedTaskId] = useState<string | null>(null);

  const dayTasks = tasks.filter((t) => t.date === selectedDate);
  const completedCount = dayTasks.filter((t) => t.completed).length;
  const isToday = selectedDate === today;

  return (
    <div className="max-w-3xl mx-auto px-4 py-6">
      <div className="mb-5">
        <h2 className="text-xl font-display font-bold text-foreground tracking-tight">
          {new Date(selectedDate + 'T12:00:00').toLocaleDateString('en-US', {
            weekday: 'long',
            month: 'long',
            day: 'numeric',
          })}
        </h2>
        <p className="text-[10px] font-mono text-muted-foreground/50 mt-0.5 tracking-wider">
          {completedCount}/{dayTasks.length} COMPLETED
        </p>
      </div>

      {/* Progress */}
      <div className="h-px bg-border/20 mb-5 overflow-hidden">
        <motion.div
          className="h-full bg-primary/60"
          initial={{ width: 0 }}
          animate={{ width: dayTasks.length > 0 ? `${(completedCount / dayTasks.length) * 100}%` : '0%' }}
          transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
        />
      </div>

      {/* Timeline */}
      <div className="overflow-y-auto" style={{ maxHeight: `calc(100vh - 180px)` }}>
        <TimelineColumn
          date={selectedDate}
          tasks={dayTasks}
          nowMinutes={nowMinutes}
          isToday={isToday}
          showTimeLabels
        />
      </div>

      {/* Completed */}
      {dayTasks.filter((t) => t.completed).length > 0 && (
        <div className="mt-4 pt-3 border-t border-border/15">
          <div className="text-[9px] font-mono text-muted-foreground/30 tracking-wider mb-1.5">COMPLETED</div>
          {dayTasks.filter((t) => t.completed).map((task) => (
            <div key={task.id} className="flex items-center gap-3 py-1 opacity-20">
              <span className="text-[9px] font-mono text-muted-foreground w-10">{task.time}</span>
              <span className="text-[11px] font-mono line-through text-muted-foreground">{task.title}</span>
            </div>
          ))}
        </div>
      )}

      {dayTasks.length === 0 && (
        <div className="text-center py-20">
          <p className="text-muted-foreground/40 font-mono text-sm">No tasks for today</p>
        </div>
      )}

      <BlockedModal taskId={blockedTaskId || ''} open={!!blockedTaskId} onClose={() => setBlockedTaskId(null)} />
    </div>
  );
}
