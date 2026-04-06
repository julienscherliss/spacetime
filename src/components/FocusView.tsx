import { useState, useRef, useCallback, useEffect } from 'react';
import { motion, AnimatePresence, useMotionValue, useTransform, animate } from 'framer-motion';
import { useTaskStore } from '@/store/taskStore';
import { useCurrentTime, timeToMinutes, minutesToTime, formatTime12h } from '@/hooks/useCurrentTime';
import { PriorityBadge } from '@/components/PriorityBadge';
import { SubtaskList } from '@/components/SubtaskList';
import { HoldToConfirmRing } from '@/components/HoldToConfirmRing';
import { ChevronUp, ChevronDown, ChevronRight, Check } from 'lucide-react';

type FocusPanel = 'completed' | 'main' | 'upcoming';

export function FocusView() {
  const { tasks, routinesEnabled, getNextTask, updateTask, completeTask } = useTaskStore();
  const { minutes: nowMinutes, dateStr: today } = useCurrentTime(5000);
  const [activePanel, setActivePanel] = useState<FocusPanel>('main');

  // Hold-to-complete state
  const [holdProgress, setHoldProgress] = useState(0);
  const [isHolding, setIsHolding] = useState(false);
  const holdTimerRef = useRef<number | null>(null);
  const holdStartRef = useRef<number>(0);
  const HOLD_DURATION = 1200; // 1.2s

  // Swipe state
  const touchStartY = useRef(0);
  const isSwiping = useRef(false);

  const todayTasks = tasks
    .filter((t) => !t.completed && !t.inWaitingRoom && !t.archivedAt && t.date === today && t.time &&
      !(!routinesEnabled && t.isRoutine !== false && t.type === 'recurring'))
    .sort((a, b) => (a.time || '').localeCompare(b.time || ''));

  const completedToday = tasks
    .filter((t) => t.completed && t.date === today && !t.archivedAt)
    .sort((a, b) => (b.time || '').localeCompare(a.time || ''));

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

  // Upcoming = tasks after active task (or all if no active)
  const upcomingTasks = activeTask
    ? todayTasks.filter((t) => {
        if (!t.time || !activeTask.time) return false;
        return t.time > activeTask.time;
      })
    : todayTasks;

  // Hold-to-complete handlers
  const startHold = useCallback(() => {
    if (!activeTask) return;
    setIsHolding(true);
    holdStartRef.current = Date.now();
    const tick = () => {
      const elapsed = Date.now() - holdStartRef.current;
      const p = Math.min(1, elapsed / HOLD_DURATION);
      setHoldProgress(p);
      if (p >= 1) {
        // Complete!
        completeTask(activeTask.id);
        setIsHolding(false);
        setHoldProgress(0);
        if (navigator.vibrate) navigator.vibrate(30);
        return;
      }
      holdTimerRef.current = requestAnimationFrame(tick);
    };
    holdTimerRef.current = requestAnimationFrame(tick);
  }, [activeTask, completeTask]);

  const cancelHold = useCallback(() => {
    setIsHolding(false);
    setHoldProgress(0);
    if (holdTimerRef.current) {
      cancelAnimationFrame(holdTimerRef.current);
      holdTimerRef.current = null;
    }
  }, []);

  // Swipe handlers
  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    touchStartY.current = e.touches[0].clientY;
    isSwiping.current = false;
  }, []);

  const handleTouchEnd = useCallback((e: React.TouchEvent) => {
    const deltaY = e.changedTouches[0].clientY - touchStartY.current;
    const threshold = 60;

    if (Math.abs(deltaY) < threshold) return;

    if (deltaY < -threshold) {
      // Swipe up
      if (activePanel === 'main') setActivePanel('upcoming');
      else if (activePanel === 'completed') setActivePanel('main');
    } else if (deltaY > threshold) {
      // Swipe down
      if (activePanel === 'main') setActivePanel('completed');
      else if (activePanel === 'upcoming') setActivePanel('main');
    }
  }, [activePanel]);

  // Cleanup hold on unmount
  useEffect(() => {
    return () => {
      if (holdTimerRef.current) cancelAnimationFrame(holdTimerRef.current);
    };
  }, []);

  return (
    <div
      className="relative overflow-hidden"
      style={{ height: 'calc(100vh - 48px)' }}
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
    >
      {/* Navigation chevrons */}
      <AnimatePresence>
        {activePanel !== 'completed' && completedToday.length > 0 && (
          <motion.button
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setActivePanel('completed')}
            className="absolute top-3 left-1/2 -translate-x-1/2 z-20 p-2 text-muted-foreground/20 hover:text-muted-foreground/40 transition-colors"
          >
            <ChevronUp size={16} strokeWidth={1.5} />
          </motion.button>
        )}
      </AnimatePresence>
      <AnimatePresence>
        {activePanel !== 'upcoming' && upcomingTasks.length > 0 && (
          <motion.button
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setActivePanel('upcoming')}
            className="absolute bottom-3 left-1/2 -translate-x-1/2 z-20 p-2 text-muted-foreground/20 hover:text-muted-foreground/40 transition-colors"
          >
            <ChevronDown size={16} strokeWidth={1.5} />
          </motion.button>
        )}
      </AnimatePresence>

      <AnimatePresence mode="wait">
        {activePanel === 'completed' && (
          <motion.div
            key="completed"
            initial={{ opacity: 0, y: -40 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -40 }}
            transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
            className="absolute inset-0 flex flex-col items-center pt-12 pb-16 px-6 overflow-y-auto"
          >
            <div className="text-[9px] font-mono tracking-[0.3em] text-muted-foreground/30 mb-6 uppercase">
              Completed today
            </div>
            <div className="w-full max-w-sm space-y-1">
              {completedToday.length === 0 ? (
                <p className="text-center text-muted-foreground/25 font-mono text-[11px]">
                  No tasks completed yet
                </p>
              ) : (
                completedToday.map((task) => (
                  <div
                    key={task.id}
                    className="flex items-center gap-3 py-2.5 px-3 rounded-sm"
                  >
                    <Check size={12} className="text-muted-foreground/25 shrink-0" />
                    <span className="text-[12px] font-mono text-muted-foreground/40 line-through truncate flex-1">
                      {task.title}
                    </span>
                    {task.time && (
                      <span className="text-[10px] font-mono text-muted-foreground/20 tabular-nums shrink-0">
                        {formatTime12h(task.time)}
                      </span>
                    )}
                  </div>
                ))
              )}
            </div>

            {/* Back to main */}
            <button
              onClick={() => setActivePanel('main')}
              className="mt-8 p-2 text-muted-foreground/20 hover:text-muted-foreground/40 transition-colors"
            >
              <ChevronDown size={16} strokeWidth={1.5} />
            </button>
          </motion.div>
        )}

        {activePanel === 'main' && (
          <motion.div
            key="main"
            initial={{ opacity: 0, y: 0 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
            className="absolute inset-0"
          >
            <MainFocusPanel
              activeTask={activeTask}
              nextTask={nextTask}
              elapsed={elapsed}
              remaining={remaining}
              progress={progress}
              nowMinutes={nowMinutes}
              holdProgress={holdProgress}
              isHolding={isHolding}
              onHoldStart={startHold}
              onHoldEnd={cancelHold}
              onUpdateTask={updateTask}
            />
          </motion.div>
        )}

        {activePanel === 'upcoming' && (
          <motion.div
            key="upcoming"
            initial={{ opacity: 0, y: 40 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 40 }}
            transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
            className="absolute inset-0 flex flex-col items-center pt-12 pb-16 px-6 overflow-y-auto"
          >
            {/* Back to main */}
            <button
              onClick={() => setActivePanel('main')}
              className="mb-6 p-2 text-muted-foreground/20 hover:text-muted-foreground/40 transition-colors"
            >
              <ChevronUp size={16} strokeWidth={1.5} />
            </button>

            <div className="text-[9px] font-mono tracking-[0.3em] text-muted-foreground/30 mb-6 uppercase">
              Upcoming today
            </div>
            <div className="w-full max-w-sm space-y-1">
              {upcomingTasks.length === 0 ? (
                <p className="text-center text-muted-foreground/25 font-mono text-[11px]">
                  No more tasks today
                </p>
              ) : (
                upcomingTasks.map((task) => (
                  <div
                    key={task.id}
                    className="flex items-center gap-3 py-2.5 px-3 rounded-sm"
                  >
                    <div className="w-1.5 h-1.5 rounded-full bg-muted-foreground/15 shrink-0" />
                    <span className="text-[12px] font-mono text-foreground/70 truncate flex-1">
                      {task.title}
                    </span>
                    {task.time && (
                      <span className="text-[10px] font-mono text-muted-foreground/30 tabular-nums shrink-0">
                        {formatTime12h(task.time)}
                        {task.duration && (
                          <> — {formatTime12h(timeToMinutes(task.time) + task.duration)}</>
                        )}
                      </span>
                    )}
                  </div>
                ))
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ── Main Focus Panel (extracted for clarity) ──
interface MainFocusPanelProps {
  activeTask: ReturnType<typeof useTaskStore.getState>['tasks'][0] | undefined;
  nextTask: ReturnType<typeof useTaskStore.getState>['tasks'][0] | undefined;
  elapsed: number;
  remaining: number;
  progress: number;
  nowMinutes: number;
  holdProgress: number;
  isHolding: boolean;
  onHoldStart: () => void;
  onHoldEnd: () => void;
  onUpdateTask: (id: string, updates: any) => void;
}

function MainFocusPanel({
  activeTask, nextTask, elapsed, remaining, progress,
  holdProgress, isHolding, onHoldStart, onHoldEnd, onUpdateTask,
}: MainFocusPanelProps) {
  if (!activeTask) {
    return (
      <div className="flex flex-col items-center justify-center h-full bg-grid-fade px-4">
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
          className="text-center"
        >
          <div className="text-2xl sm:text-4xl font-display font-bold tracking-tight text-foreground/60 mb-2">
            FREE TIME
          </div>
          <p className="text-muted-foreground/35 font-mono text-[11px] tracking-widest">
            {nextTask ? `NEXT — ${nextTask.title} AT ${formatTime12h(nextTask.time!)}` : 'NO MORE TASKS TODAY'}
          </p>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center justify-center h-full bg-grid-fade relative px-4">
      <AnimatePresence mode="wait">
        <motion.div
          key={activeTask.id}
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -20 }}
          transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
          className="text-center relative z-10 max-w-lg px-4 sm:px-6"
        >
          <div className="mb-3">
            <PriorityBadge priority={activeTask.priority} />
          </div>

          <h1 className="text-xl sm:text-2xl md:text-4xl font-display font-bold tracking-tight text-foreground mb-4 leading-tight">
            {activeTask.title}
          </h1>

          {activeTask.description && (
            <p className="text-[11px] font-mono text-muted-foreground/50 mb-4 max-w-sm mx-auto leading-relaxed">
              {activeTask.description}
            </p>
          )}

          {activeTask.subtasks && activeTask.subtasks.length > 0 && (
            <div className="mb-6 text-left max-w-xs mx-auto bg-card/50 rounded-sm p-3 border border-border/30">
              <SubtaskList
                subtasks={activeTask.subtasks}
                onChange={(newSubtasks) => onUpdateTask(activeTask.id, { subtasks: newSubtasks })}
                compact
              />
            </div>
          )}

          {/* Progress ring with hold-to-complete */}
          <div
            className="relative inline-flex items-center justify-center mb-6 select-none touch-none cursor-pointer"
            onPointerDown={(e) => {
              e.preventDefault();
              onHoldStart();
            }}
            onPointerUp={onHoldEnd}
            onPointerLeave={onHoldEnd}
            onPointerCancel={onHoldEnd}
          >
            <svg width="120" height="120" className="rotate-[-90deg]">
              {/* Background ring */}
              <circle cx="60" cy="60" r="54" stroke="hsl(var(--border))" strokeWidth="1.5" fill="none" />
              {/* Time progress ring */}
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
              {/* Hold-to-complete ring (inner, thicker) */}
              {isHolding && (
                <circle
                  cx="60" cy="60" r="46"
                  stroke={holdProgress >= 1 ? 'hsl(var(--primary))' : 'hsl(var(--primary) / 0.5)'}
                  strokeWidth="3"
                  fill="none"
                  strokeLinecap="round"
                  strokeDasharray={289}
                  strokeDashoffset={289 - 289 * holdProgress}
                  style={{ transition: 'none' }}
                />
              )}
            </svg>
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              <div className="font-mono text-lg text-foreground tabular-nums tracking-widest">
                {minutesToTime(remaining)}
              </div>
              <div className="text-[9px] font-mono text-muted-foreground/35 tracking-widest mt-px">
                {isHolding ? 'HOLD TO COMPLETE' : 'REMAINING'}
              </div>
            </div>
          </div>

          {/* Time info */}
          <div className="flex items-center justify-center gap-3 text-[10px] font-mono text-muted-foreground/35 tracking-widest flex-wrap">
            <span>{formatTime12h(activeTask.time!)} — {formatTime12h(timeToMinutes(activeTask.time!) + (activeTask.duration || 30))}</span>
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
          className="absolute bottom-8 flex items-center gap-1 text-[10px] font-mono text-muted-foreground/20 tracking-widest"
        >
          NEXT <ChevronRight size={10} /> {nextTask.title} · {formatTime12h(nextTask.time!)}
        </motion.div>
      )}
    </div>
  );
}
