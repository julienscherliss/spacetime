import { useState, useRef, useCallback, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useTaskStore } from '@/store/taskStore';
import { useCurrentTime, timeToMinutes, minutesToTime, formatTime12h } from '@/hooks/useCurrentTime';
import { PriorityBadge } from '@/components/PriorityBadge';
import { SubtaskList } from '@/components/SubtaskList';
import { ChevronUp, ChevronDown, ChevronRight, Paperclip, ExternalLink } from 'lucide-react';

type FocusPanel = 'completed' | 'main' | 'upcoming';

// ── URL detection helper ──
function linkify(text: string) {
  const urlRegex = /(https?:\/\/[^\s]+)/g;
  const parts = text.split(urlRegex);
  return parts.map((part, i) => {
    if (urlRegex.test(part)) {
      urlRegex.lastIndex = 0;
      const display = part.replace(/^https?:\/\/(www\.)?/, '').slice(0, 40);
      return (
        <a
          key={i}
          href={part}
          target="_blank"
          rel="noopener noreferrer"
          className="underline underline-offset-2 decoration-foreground/25 hover:decoration-foreground/50 transition-colors inline-flex items-center gap-1"
        >
          {display}
          <ExternalLink size={10} className="opacity-50" />
        </a>
      );
    }
    return <span key={i}>{part}</span>;
  });
}

export function FocusView() {
  const { tasks, routinesEnabled, getNextTask, updateTask, completeTask } = useTaskStore();
  const { minutes: nowMinutes, dateStr: today } = useCurrentTime(5000);
  const [activePanel, setActivePanel] = useState<FocusPanel>('main');

  // Hold-to-complete state
  const [holdProgress, setHoldProgress] = useState(0);
  const [isHolding, setIsHolding] = useState(false);
  const holdTimerRef = useRef<number | null>(null);
  const holdStartRef = useRef<number>(0);
  const HOLD_DURATION = 1200;

  // Swipe state
  const touchStartY = useRef(0);

  const todayTasks = tasks
    .filter((t) => !t.completed && !t.inWaitingRoom && !t.archivedAt && t.date === today && t.time &&
      !(!routinesEnabled && t.isRoutine !== false && t.type === 'recurring'))
    .sort((a, b) => (a.time || '').localeCompare(b.time || ''));

  const completedToday = tasks
    .filter((t) => {
      if (!t.completed || t.archiveReason === 'deleted') return false;
      if (t.date === today) return true;
      if (t.archivedAt) {
        const archivedDate = t.archivedAt.slice(0, 10);
        if (archivedDate === today) return true;
      }
      return false;
    })
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

  const upcomingTasks = activeTask
    ? todayTasks.filter((t) => {
        if (!t.time || !activeTask.time) return false;
        return t.time > activeTask.time;
      })
    : todayTasks;

  const completedCount = completedToday.length;

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
  }, []);

  const handleTouchEnd = useCallback((e: React.TouchEvent) => {
    const deltaY = e.changedTouches[0].clientY - touchStartY.current;
    const threshold = 60;
    if (Math.abs(deltaY) < threshold) return;
    if (deltaY < -threshold) {
      if (activePanel === 'main') setActivePanel('upcoming');
      else if (activePanel === 'completed') setActivePanel('main');
    } else if (deltaY > threshold) {
      if (activePanel === 'main') setActivePanel('completed');
      else if (activePanel === 'upcoming') setActivePanel('main');
    }
  }, [activePanel]);

  useEffect(() => {
    return () => {
      if (holdTimerRef.current) cancelAnimationFrame(holdTimerRef.current);
    };
  }, []);

  const showUpArrow = activePanel === 'main' && completedToday.length > 0;
  const showDownArrow = activePanel === 'main' && upcomingTasks.length > 0;

  return (
    <div
      className="relative overflow-hidden"
      style={{ height: 'calc(100vh - 48px)' }}
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
    >
      {/* Navigation arrows — centered vertically */}
      {showUpArrow && (
        <motion.button
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.5, delay: 0.4 }}
          onClick={() => setActivePanel('completed')}
          className="absolute left-1/2 -translate-x-1/2 top-4 z-20 p-3 text-muted-foreground/12 hover:text-muted-foreground/25 transition-colors"
        >
          <ChevronUp size={28} strokeWidth={1.5} />
        </motion.button>
      )}
      {showDownArrow && (
        <motion.button
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.5, delay: 0.4 }}
          onClick={() => setActivePanel('upcoming')}
          className="absolute left-1/2 -translate-x-1/2 bottom-4 z-20 p-3 text-muted-foreground/12 hover:text-muted-foreground/25 transition-colors"
        >
          <ChevronDown size={28} strokeWidth={1.5} />
        </motion.button>
      )}

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
            <div className="text-[10px] font-mono tracking-[0.25em] text-muted-foreground/50 mb-6 uppercase">
              Completed · {completedCount}
            </div>
            <div className="w-full max-w-sm space-y-1">
              {completedToday.length === 0 ? (
                <p className="text-center text-muted-foreground/40 font-mono text-[12px]">
                  Nothing yet
                </p>
              ) : (
                completedToday.map((task) => (
                  <div key={task.id} className="flex items-center gap-3 py-2.5 px-3">
                    <div className="w-1.5 h-1.5 rounded-full bg-muted-foreground/30 shrink-0" />
                    <span className="text-[13px] font-mono text-muted-foreground/50 line-through truncate flex-1">
                      {task.title}
                    </span>
                    {task.time && (
                      <span className="text-[10px] font-mono text-muted-foreground/30 tabular-nums shrink-0">
                        {formatTime12h(task.time)}
                      </span>
                    )}
                  </div>
                ))
              )}
            </div>
            <button
              onClick={() => setActivePanel('main')}
              className="mt-8 p-2 text-muted-foreground/40 hover:text-muted-foreground/60 transition-colors"
            >
              <ChevronDown size={20} strokeWidth={2} />
            </button>
          </motion.div>
        )}

        {activePanel === 'main' && (
          <motion.div
            key="main"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
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
            <button
              onClick={() => setActivePanel('main')}
              className="mb-6 p-2 text-muted-foreground/40 hover:text-muted-foreground/60 transition-colors"
            >
              <ChevronUp size={20} strokeWidth={2} />
            </button>
            <div className="text-[10px] font-mono tracking-[0.25em] text-muted-foreground/50 mb-6 uppercase">
              Upcoming · {upcomingTasks.length}
            </div>
            <div className="w-full max-w-sm space-y-1.5">
              {upcomingTasks.length === 0 ? (
                <p className="text-center text-muted-foreground/40 font-mono text-[12px]">
                  Clear ahead
                </p>
              ) : (
                upcomingTasks.map((task) => (
                  <div key={task.id} className="flex items-center gap-3 py-2.5 px-3">
                    <div className="w-1.5 h-1.5 rounded-full bg-muted-foreground/20 shrink-0" />
                    <span className="text-[14px] font-mono font-medium text-foreground/85 truncate flex-1">
                      {task.title}
                    </span>
                    {task.time && (
                      <span className="text-[10px] font-mono text-muted-foreground/45 tabular-nums shrink-0">
                        {formatTime12h(task.time)}
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

// ── Main Focus Panel ──
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
  const [descExpanded, setDescExpanded] = useState(false);

  if (!activeTask) {
    return (
      <div className="flex flex-col h-full">
        {/* TOP zone — context */}
        <div className="pt-8 px-6">
          <div className="text-[9px] font-mono tracking-[0.3em] text-muted-foreground/30 uppercase">
            No active block
          </div>
        </div>

        {/* MIDDLE zone — dominant */}
        <div className="flex-1 flex flex-col items-center justify-center px-6">
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
          >
            <h1 className="text-5xl sm:text-7xl font-display font-bold tracking-tight text-foreground/90 leading-[0.95] text-center">
              FREE
            </h1>
            <h1 className="text-5xl sm:text-7xl font-display font-bold tracking-tight text-foreground/90 leading-[0.95] text-center -mt-1">
              TIME
            </h1>
          </motion.div>
        </div>

        {/* BOTTOM zone — next task info */}
        <div className="pb-8 px-6">
          {nextTask ? (
            <div className="flex items-center gap-2 text-[10px] font-mono text-muted-foreground/35 tracking-[0.15em] uppercase">
              <ChevronRight size={10} strokeWidth={1.5} className="opacity-60" />
              <span className="truncate">{nextTask.title}</span>
              <span className="tabular-nums ml-auto shrink-0">{formatTime12h(nextTask.time!)}</span>
            </div>
          ) : (
            <div className="text-[10px] font-mono text-muted-foreground/25 tracking-[0.15em] uppercase">
              Nothing scheduled
            </div>
          )}
        </div>
      </div>
    );
  }

  const timeDisplay = minutesToTime(remaining);
  const hasDescription = activeTask.description && activeTask.description.trim().length > 0;
  const hasAttachments = activeTask.attachments && activeTask.attachments.length > 0;
  const hasSubtasks = activeTask.subtasks && activeTask.subtasks.length > 0;

  return (
    <div className="flex flex-col h-full">
      <AnimatePresence mode="wait">
        <motion.div
          key={activeTask.id}
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -16 }}
          transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
          className="flex flex-col h-full"
        >
          {/* ═══ TOP ZONE — meta label ═══ */}
          <div className="pt-6 px-6 flex items-center gap-3">
            <div className="opacity-40 scale-90">
              <PriorityBadge priority={activeTask.priority} />
            </div>
            <div className="h-px flex-1 bg-border/20" />
            <span className="text-[9px] font-mono text-muted-foreground/30 tracking-[0.2em] uppercase tabular-nums">
              {formatTime12h(activeTask.time!)}
            </span>
          </div>

          {/* ═══ MIDDLE ZONE — primary focus ═══ */}
          <div className="flex-1 flex flex-col items-center justify-center px-6 min-h-0">
            <div className="w-full max-w-sm">
              {/* Task title — dominant */}
              <h1 className="text-4xl sm:text-6xl md:text-7xl font-display font-bold tracking-tight text-foreground leading-[0.95] text-center mb-6">
                {activeTask.title}
              </h1>

              {/* Timer + progress — unified block */}
              <div
                className="select-none touch-none cursor-pointer"
                onPointerDown={(e) => { e.preventDefault(); onHoldStart(); }}
                onPointerUp={onHoldEnd}
                onPointerLeave={onHoldEnd}
                onPointerCancel={onHoldEnd}
              >
                {/* Time remaining */}
                <div className="text-center mb-3">
                  <span className="font-mono text-3xl sm:text-4xl text-foreground/75 tabular-nums tracking-wider">
                    {timeDisplay}
                  </span>
                </div>

                {/* Progress bar — intentional, structural */}
                <div className="relative w-full h-[4px] bg-border/50 overflow-hidden">
                  {/* Elapsed */}
                  <motion.div
                    className="absolute inset-y-0 left-0 bg-foreground/25"
                    animate={{ width: `${progress * 100}%` }}
                    transition={{ duration: 1, ease: 'linear' }}
                  />
                  {/* Hold overlay */}
                  {isHolding && (
                    <motion.div
                      className="absolute inset-y-0 left-0 bg-primary"
                      style={{ width: `${holdProgress * 100}%` }}
                    />
                  )}
                  {/* Position dot */}
                  <motion.div
                    className="absolute top-1/2 -translate-y-1/2 w-2.5 h-2.5 rounded-full bg-foreground/60"
                    animate={{ left: `${progress * 100}%` }}
                    transition={{ duration: 1, ease: 'linear' }}
                    style={{ marginLeft: '-5px' }}
                  />
                </div>

                {/* Hold hint */}
                <div className="mt-1.5 text-center h-3">
                  <span className={`text-[8px] font-mono tracking-[0.25em] uppercase transition-opacity duration-200 ${isHolding ? 'text-primary/60' : 'text-transparent'}`}>
                    Hold to complete
                  </span>
                </div>
              </div>

              {/* Subtasks — compact */}
              {hasSubtasks && (
                <div className="mt-6 text-left">
                  <SubtaskList
                    subtasks={activeTask.subtasks!}
                    onChange={(newSubtasks) => onUpdateTask(activeTask.id, { subtasks: newSubtasks })}
                    compact
                  />
                </div>
              )}

              {/* Description — expandable */}
              {hasDescription && (
                <div className="mt-6 border-t border-border/20 pt-4">
                  <button
                    onClick={() => setDescExpanded(!descExpanded)}
                    className="w-full text-left group"
                  >
                    <div className={`text-[13px] font-mono text-foreground/55 leading-relaxed ${!descExpanded ? 'line-clamp-2' : ''}`}>
                      {linkify(activeTask.description!)}
                    </div>
                    {!descExpanded && activeTask.description!.length > 80 && (
                      <span className="text-[9px] font-mono text-muted-foreground/30 tracking-[0.15em] uppercase mt-1 inline-block group-hover:text-muted-foreground/50 transition-colors">
                        More
                      </span>
                    )}
                  </button>
                </div>
              )}

              {/* Attachments */}
              {hasAttachments && (
                <div className="mt-4 flex flex-wrap gap-2">
                  {activeTask.attachments!.map((att, i) => (
                    <a
                      key={i}
                      href={att.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-muted/50 border border-border/30 text-[11px] font-mono text-foreground/60 hover:text-foreground/80 hover:border-border/50 transition-colors"
                    >
                      <Paperclip size={10} />
                      <span className="truncate max-w-[120px]">{att.name}</span>
                    </a>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* ═══ BOTTOM ZONE — secondary info ═══ */}
          <div className="pb-6 px-6 space-y-1.5">
            {/* Time range */}
            <div className="text-[9px] font-mono text-muted-foreground/25 tracking-[0.15em] uppercase tabular-nums">
              {formatTime12h(activeTask.time!)} — {formatTime12h(timeToMinutes(activeTask.time!) + (activeTask.duration || 30))}
            </div>

            {/* Next task */}
            {nextTask && (
              <div className="flex items-center gap-2 text-[10px] font-mono text-muted-foreground/30 tracking-[0.12em] uppercase">
                <ChevronRight size={10} strokeWidth={1.5} className="opacity-50" />
                <span className="truncate">{nextTask.title}</span>
                <span className="tabular-nums ml-auto shrink-0">{formatTime12h(nextTask.time!)}</span>
              </div>
            )}
          </div>
        </motion.div>
      </AnimatePresence>
    </div>
  );
}
