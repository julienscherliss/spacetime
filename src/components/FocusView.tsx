import { motion, AnimatePresence } from 'framer-motion';
import { useTaskStore } from '@/store/taskStore';
import { useCurrentTime, timeToMinutes, minutesToTime } from '@/hooks/useCurrentTime';
import { PriorityBadge } from '@/components/PriorityBadge';
import { ChevronRight } from 'lucide-react';

export function FocusView() {
  const { tasks, routinesEnabled, getNextTask } = useTaskStore();
  const { minutes: nowMinutes, dateStr: today } = useCurrentTime(5000);

  const todayTasks = tasks
    .filter((t) => !t.completed && t.date === today && t.time &&
      !(vacationMode && t.type === 'recurring'))
    .sort((a, b) => (a.time || '').localeCompare(b.time || ''));

  const activeTask = todayTasks.find((t) => {
    if (!t.time) return false;
    const start = timeToMinutes(t.time);
    const end = start + (t.duration || 30);
    return nowMinutes >= start && nowMinutes < end;
  });

  const elapsed = activeTask?.time ? nowMinutes - timeToMinutes(activeTask.time) : 0;
  const remaining = activeTask ? (activeTask.duration || 30) - elapsed : 0;
  const progress = activeTask ? Math.min(1, elapsed / (activeTask.duration || 30)) : 0;
  const nextTask = activeTask ? getNextTask(activeTask.id) : todayTasks[0];

  if (!activeTask) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[80vh] bg-grid-fade">
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
          className="text-center"
        >
          <div className="text-3xl md:text-4xl font-display font-bold tracking-tight text-foreground/60 mb-2">
            FREE TIME
          </div>
          <p className="text-muted-foreground/35 font-mono text-[10px] tracking-widest">
            {nextTask ? `NEXT — ${nextTask.title} AT ${nextTask.time}` : 'NO MORE TASKS TODAY'}
          </p>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center justify-center min-h-[80vh] bg-grid-fade relative">
      <AnimatePresence mode="wait">
        <motion.div
          key={activeTask.id}
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -20 }}
          transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
          className="text-center relative z-10 max-w-lg px-6"
        >
          <div className="mb-3">
            <PriorityBadge priority={activeTask.priority} />
          </div>

          <h1 className="text-2xl md:text-4xl font-display font-bold tracking-tight text-foreground mb-6 leading-tight">
            {activeTask.title}
          </h1>

          {/* Progress ring — thin, precise */}
          <div className="relative inline-flex items-center justify-center mb-6">
            <svg width="120" height="120" className="rotate-[-90deg]">
              <circle
                cx="60" cy="60" r="54"
                stroke="hsl(var(--border))"
                strokeWidth="1.5"
                fill="none"
              />
              <motion.circle
                cx="60" cy="60" r="54"
                stroke="hsl(var(--primary))"
                strokeWidth="1.5"
                fill="none"
                strokeLinecap="round"
                strokeDasharray={339}
                animate={{ strokeDashoffset: 339 - 339 * progress }}
                transition={{ duration: 1 }}
              />
            </svg>
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              <div className="font-mono text-lg text-foreground tabular-nums tracking-widest">
                {minutesToTime(remaining)}
              </div>
              <div className="text-[7px] font-mono text-muted-foreground/35 tracking-widest mt-px">
                REMAINING
              </div>
            </div>
          </div>

          {/* Time info */}
          <div className="flex items-center justify-center gap-3 text-[8px] font-mono text-muted-foreground/35 tracking-widest">
            <span>{activeTask.time} — {minutesToTime(timeToMinutes(activeTask.time) + (activeTask.duration || 30))}</span>
            <span>·</span>
            <span>{elapsed}M ELAPSED</span>
          </div>
        </motion.div>
      </AnimatePresence>

      {nextTask && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.4 }}
          className="absolute bottom-6 flex items-center gap-1 text-[8px] font-mono text-muted-foreground/20 tracking-widest"
        >
          NEXT <ChevronRight size={8} /> {nextTask.title} · {nextTask.time}
        </motion.div>
      )}
    </div>
  );
}
