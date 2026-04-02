import { motion, AnimatePresence } from 'framer-motion';
import { useTaskStore } from '@/store/taskStore';
import { useCurrentTime, timeToMinutes, minutesToTime } from '@/hooks/useCurrentTime';
import { PriorityBadge } from '@/components/PriorityBadge';
import { ChevronRight } from 'lucide-react';

export function FocusView() {
  const { tasks, getNextTask } = useTaskStore();
  const { minutes: nowMinutes, dateStr: today } = useCurrentTime(5000);

  // Find the task that intersects the current time
  const todayTasks = tasks
    .filter((t) => !t.completed && t.date === today && t.time)
    .sort((a, b) => (a.time || '').localeCompare(b.time || ''));

  const activeTask = todayTasks.find((t) => {
    if (!t.time) return false;
    const start = timeToMinutes(t.time);
    const end = start + (t.duration || 30);
    return nowMinutes >= start && nowMinutes < end;
  });

  const elapsed = activeTask && activeTask.time
    ? nowMinutes - timeToMinutes(activeTask.time)
    : 0;
  const remaining = activeTask
    ? (activeTask.duration || 30) - elapsed
    : 0;
  const progress = activeTask
    ? Math.min(1, elapsed / (activeTask.duration || 30))
    : 0;

  const nextTask = activeTask ? getNextTask(activeTask.id) : todayTasks[0];

  if (!activeTask) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[80vh] bg-grid-fade">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
          className="text-center"
        >
          <div className="text-4xl md:text-5xl font-display font-bold tracking-tight text-foreground/80 mb-3">
            FREE TIME
          </div>
          <p className="text-muted-foreground/40 font-mono text-xs tracking-wider">
            {nextTask
              ? `NEXT: ${nextTask.title} AT ${nextTask.time}`
              : 'NO MORE TASKS TODAY'}
          </p>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center justify-center min-h-[80vh] bg-grid-fade relative">
      {/* Ambient glow */}
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[400px] h-[400px] rounded-full bg-primary/[0.03] blur-[120px]" />
      </div>

      <AnimatePresence mode="wait">
        <motion.div
          key={activeTask.id}
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -24 }}
          transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
          className="text-center relative z-10 max-w-xl px-6"
        >
          <div className="mb-4">
            <PriorityBadge priority={activeTask.priority} />
          </div>

          <h1 className="text-3xl md:text-5xl font-display font-bold tracking-tight text-foreground mb-8 leading-tight">
            {activeTask.title}
          </h1>

          {/* Progress ring */}
          <div className="relative inline-flex items-center justify-center mb-8">
            <svg width="140" height="140" className="rotate-[-90deg]">
              <circle
                cx="70" cy="70" r="62"
                stroke="hsl(var(--secondary))"
                strokeWidth="2"
                fill="none"
              />
              <motion.circle
                cx="70" cy="70" r="62"
                stroke="hsl(var(--primary))"
                strokeWidth="2"
                fill="none"
                strokeLinecap="round"
                strokeDasharray={390}
                animate={{ strokeDashoffset: 390 - 390 * progress }}
                transition={{ duration: 1 }}
              />
            </svg>
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              <div className="font-mono text-xl text-foreground tabular-nums tracking-widest">
                {minutesToTime(remaining)}
              </div>
              <div className="text-[8px] font-mono text-muted-foreground/40 tracking-wider mt-0.5">
                REMAINING
              </div>
            </div>
          </div>

          {/* Time info */}
          <div className="flex items-center justify-center gap-4 text-[10px] font-mono text-muted-foreground/40 tracking-wider">
            <span>{activeTask.time} — {minutesToTime(timeToMinutes(activeTask.time) + (activeTask.duration || 30))}</span>
            <span>·</span>
            <span>{elapsed}m ELAPSED</span>
          </div>
        </motion.div>
      </AnimatePresence>

      {/* Next task preview */}
      {nextTask && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.5 }}
          className="absolute bottom-8 flex items-center gap-1.5 text-[9px] font-mono text-muted-foreground/25 tracking-wider"
        >
          NEXT <ChevronRight size={9} /> {nextTask.title} · {nextTask.time}
        </motion.div>
      )}
    </div>
  );
}
