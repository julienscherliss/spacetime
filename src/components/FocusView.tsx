import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useTaskStore } from '@/store/taskStore';
import { PriorityBadge } from '@/components/PriorityBadge';
import { Check, SkipForward, Play, Pause, RotateCcw } from 'lucide-react';

export function FocusView() {
  const { getCurrentFocusTask, completeTask, skipFocusTask } = useTaskStore();
  const task = getCurrentFocusTask();

  const [elapsed, setElapsed] = useState(0);
  const [running, setRunning] = useState(false);

  useEffect(() => {
    setElapsed(0);
    setRunning(false);
  }, [task?.id]);

  useEffect(() => {
    if (!running) return;
    const interval = setInterval(() => setElapsed((e) => e + 1), 1000);
    return () => clearInterval(interval);
  }, [running]);

  const formatTime = useCallback((seconds: number) => {
    const m = Math.floor(seconds / 60).toString().padStart(2, '0');
    const s = (seconds % 60).toString().padStart(2, '0');
    return `${m}:${s}`;
  }, []);

  if (!task) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[80vh] bg-grid">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-center"
        >
          <div className="text-6xl font-display font-bold tracking-tight text-foreground mb-4">
            ALL CLEAR
          </div>
          <p className="text-muted-foreground font-mono text-sm">
            No pending tasks. Breathe.
          </p>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center justify-center min-h-[80vh] bg-grid relative">
      {/* Subtle ambient gradient */}
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] rounded-full bg-primary/5 blur-[120px] animate-pulse-gentle" />
      </div>

      <AnimatePresence mode="wait">
        <motion.div
          key={task.id}
          initial={{ opacity: 0, y: 30, filter: 'blur(10px)' }}
          animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
          exit={{ opacity: 0, y: -30, filter: 'blur(10px)' }}
          transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
          className="text-center relative z-10 max-w-2xl px-6"
        >
          <div className="mb-6">
            <PriorityBadge priority={task.priority} />
          </div>

          <h1 className="text-4xl md:text-6xl font-display font-bold tracking-tight text-foreground mb-8 leading-tight">
            {task.title}
          </h1>

          {/* Timer */}
          <div className="mb-12">
            <div className="font-mono text-3xl text-muted-foreground tabular-nums tracking-widest">
              {formatTime(elapsed)}
            </div>
            <div className="flex items-center justify-center gap-3 mt-4">
              <button
                onClick={() => setRunning(!running)}
                className="p-2 rounded-lg bg-secondary hover:bg-secondary/80 text-secondary-foreground transition-colors"
              >
                {running ? <Pause size={16} /> : <Play size={16} />}
              </button>
              <button
                onClick={() => { setElapsed(0); setRunning(false); }}
                className="p-2 rounded-lg bg-secondary hover:bg-secondary/80 text-secondary-foreground transition-colors"
              >
                <RotateCcw size={16} />
              </button>
            </div>
          </div>

          {/* Actions */}
          <div className="flex items-center justify-center gap-4">
            <motion.button
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              onClick={() => completeTask(task.id)}
              className="flex items-center gap-2 px-8 py-3 rounded-lg bg-primary text-primary-foreground font-mono text-sm tracking-wider hover:bg-primary/90 transition-colors"
            >
              <Check size={18} />
              COMPLETE
            </motion.button>
            <motion.button
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              onClick={skipFocusTask}
              className="flex items-center gap-2 px-8 py-3 rounded-lg bg-secondary text-secondary-foreground font-mono text-sm tracking-wider hover:bg-secondary/80 transition-colors"
            >
              <SkipForward size={18} />
              SKIP
            </motion.button>
          </div>

          {task.time && (
            <p className="mt-8 text-xs font-mono text-muted-foreground tracking-wider">
              SCHEDULED {task.time} · {task.duration ? `${task.duration}MIN` : ''}
            </p>
          )}
        </motion.div>
      </AnimatePresence>
    </div>
  );
}
