import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useTaskStore } from '@/store/taskStore';
import { PriorityBadge } from '@/components/PriorityBadge';
import { Check, SkipForward, Play, Pause, RotateCcw, ChevronRight } from 'lucide-react';

export function FocusView() {
  const { getCurrentFocusTask, completeTask, skipFocusTask, getNextTask, setFocusTask } = useTaskStore();
  const task = getCurrentFocusTask();

  const [elapsed, setElapsed] = useState(0);
  const [running, setRunning] = useState(false);
  const [showSkip, setShowSkip] = useState(true);
  const [timerMode, setTimerMode] = useState<'up' | 'down'>('down');
  const [showEndPrompt, setShowEndPrompt] = useState(false);
  const [justCompleted, setJustCompleted] = useState<string | null>(null);

  const taskDuration = (task?.duration || 25) * 60; // seconds

  useEffect(() => {
    setElapsed(0);
    setRunning(false);
    setShowSkip(true);
    setShowEndPrompt(false);
  }, [task?.id]);

  useEffect(() => {
    if (!running) return;
    const interval = setInterval(() => {
      setElapsed((e) => {
        const next = e + 1;
        if (timerMode === 'down' && next >= taskDuration) {
          setRunning(false);
          setShowEndPrompt(true);
          return taskDuration;
        }
        return next;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [running, timerMode, taskDuration]);

  const formatTime = useCallback((seconds: number) => {
    const m = Math.floor(seconds / 60).toString().padStart(2, '0');
    const s = (seconds % 60).toString().padStart(2, '0');
    return `${m}:${s}`;
  }, []);

  const displayTime = timerMode === 'down' ? Math.max(0, taskDuration - elapsed) : elapsed;
  const progress = taskDuration > 0 ? Math.min(1, elapsed / taskDuration) : 0;

  const handleComplete = () => {
    if (!task) return;
    const nextTask = getNextTask(task.id);
    setJustCompleted(task.id);
    completeTask(task.id);
    
    if (nextTask) {
      setTimeout(() => {
        setFocusTask(nextTask.id);
        setJustCompleted(null);
      }, 800);
    } else {
      setTimeout(() => setJustCompleted(null), 800);
    }
  };

  const handleSkip = () => {
    // Micro-friction: disable skip briefly after clicking
    setShowSkip(false);
    setTimeout(() => {
      skipFocusTask();
      setShowSkip(true);
    }, 600);
  };

  if (!task) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[80vh] bg-grid-fade">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
          className="text-center"
        >
          <div className="text-5xl md:text-6xl font-display font-bold tracking-tight text-foreground mb-4">
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
    <div className="flex flex-col items-center justify-center min-h-[80vh] bg-grid-fade relative">
      {/* Ambient glow */}
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[500px] rounded-full bg-primary/[0.04] blur-[100px] animate-pulse-gentle" />
      </div>

      <AnimatePresence mode="wait">
        <motion.div
          key={task.id}
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -24 }}
          transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
          className="text-center relative z-10 max-w-2xl px-6"
        >
          <div className="mb-5">
            <PriorityBadge priority={task.priority} />
          </div>

          <h1 className="text-3xl md:text-5xl font-display font-bold tracking-tight text-foreground mb-10 leading-tight">
            {task.title}
          </h1>

          {/* Progress ring */}
          <div className="relative inline-flex items-center justify-center mb-10">
            <svg width="160" height="160" className="rotate-[-90deg]">
              <circle
                cx="80" cy="80" r="72"
                stroke="hsl(var(--secondary))"
                strokeWidth="3"
                fill="none"
              />
              <motion.circle
                cx="80" cy="80" r="72"
                stroke="hsl(var(--primary))"
                strokeWidth="3"
                fill="none"
                strokeLinecap="round"
                strokeDasharray={452}
                animate={{ strokeDashoffset: 452 - 452 * progress }}
                transition={{ duration: 0.5 }}
              />
            </svg>
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              <div className="font-mono text-2xl text-foreground tabular-nums tracking-widest">
                {formatTime(displayTime)}
              </div>
              <button
                onClick={() => setTimerMode(timerMode === 'up' ? 'down' : 'up')}
                className="text-[9px] font-mono text-muted-foreground hover:text-foreground tracking-wider mt-1 transition-colors"
              >
                {timerMode === 'down' ? '↓ COUNT DOWN' : '↑ COUNT UP'}
              </button>
            </div>
          </div>

          {/* Timer controls */}
          <div className="flex items-center justify-center gap-3 mb-10">
            <button
              onClick={() => setRunning(!running)}
              className="p-2.5 rounded-lg bg-secondary hover:bg-secondary/80 text-secondary-foreground transition-colors"
            >
              {running ? <Pause size={15} /> : <Play size={15} />}
            </button>
            <button
              onClick={() => { setElapsed(0); setRunning(false); setShowEndPrompt(false); }}
              className="p-2.5 rounded-lg bg-secondary hover:bg-secondary/80 text-secondary-foreground transition-colors"
            >
              <RotateCcw size={15} />
            </button>
          </div>

          {/* End prompt */}
          <AnimatePresence>
            {showEndPrompt && (
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                className="mb-8 p-4 rounded-lg bg-card border border-primary/20"
              >
                <p className="text-xs font-mono text-muted-foreground mb-3 tracking-wider">TIME'S UP</p>
                <div className="flex items-center justify-center gap-2">
                  <button
                    onClick={handleComplete}
                    className="px-4 py-2 rounded bg-primary text-primary-foreground font-mono text-[11px] tracking-wider"
                  >
                    COMPLETE
                  </button>
                  <button
                    onClick={() => { setElapsed(0); setShowEndPrompt(false); setRunning(true); }}
                    className="px-4 py-2 rounded bg-secondary text-secondary-foreground font-mono text-[11px] tracking-wider"
                  >
                    EXTEND
                  </button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Actions */}
          {!showEndPrompt && (
            <div className="flex items-center justify-center gap-3">
              <motion.button
                whileTap={{ scale: 0.97 }}
                onClick={handleComplete}
                className="flex items-center gap-2 px-7 py-2.5 rounded-lg bg-primary text-primary-foreground font-mono text-[11px] tracking-wider hover:bg-primary/90 transition-colors"
              >
                <Check size={15} />
                COMPLETE
              </motion.button>
              <motion.button
                whileTap={{ scale: 0.97 }}
                onClick={handleSkip}
                disabled={!showSkip}
                className={`skip-btn flex items-center gap-2 px-7 py-2.5 rounded-lg bg-secondary text-secondary-foreground font-mono text-[11px] tracking-wider hover:bg-secondary/80 transition-colors ${
                  !showSkip ? 'opacity-30 cursor-not-allowed' : ''
                }`}
              >
                <SkipForward size={15} />
                SKIP
              </motion.button>
            </div>
          )}

          {task.time && (
            <p className="mt-8 text-[10px] font-mono text-muted-foreground/60 tracking-wider">
              SCHEDULED {task.time} · {task.duration ? `${task.duration}MIN` : ''}
            </p>
          )}
        </motion.div>
      </AnimatePresence>

      {/* Next task preview */}
      {task && getNextTask(task.id) && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.5 }}
          className="absolute bottom-8 flex items-center gap-2 text-[10px] font-mono text-muted-foreground/50 tracking-wider"
        >
          NEXT <ChevronRight size={10} /> {getNextTask(task.id)?.title}
        </motion.div>
      )}
    </div>
  );
}
