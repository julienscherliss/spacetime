import { useState, useRef, useCallback, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useTaskStore } from '@/store/taskStore';
import { useCurrentTime, timeToMinutes, minutesToTime, formatTime12h } from '@/hooks/useCurrentTime';
import { PriorityBadge } from '@/components/PriorityBadge';
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
  const { minutes: nowMinutes, dateStr: today } = useCurrentTime(1000);
  const [activePanel, setActivePanel] = useState<FocusPanel>('main');

  // Hold-to-complete state
  const [holdProgress, setHoldProgress] = useState(0);
  const [isHolding, setIsHolding] = useState(false);
  const holdTimerRef = useRef<number | null>(null);
  const holdStartRef = useRef<number>(0);
  const HOLD_DURATION = 800;

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
    if (navigator.vibrate) navigator.vibrate(10);
    const tick = () => {
      const el = Date.now() - holdStartRef.current;
      const p = Math.min(1, el / HOLD_DURATION);
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
          className="absolute left-1/2 -translate-x-1/2 top-4 z-20 p-3 text-muted-foreground/10 hover:text-muted-foreground/25 transition-colors"
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
          className="absolute left-1/2 -translate-x-1/2 bottom-4 z-20 p-3 text-muted-foreground/10 hover:text-muted-foreground/25 transition-colors"
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
  nowMinutes: number;
  holdProgress: number;
  isHolding: boolean;
  onHoldStart: () => void;
  onHoldEnd: () => void;
  onUpdateTask: (id: string, updates: any) => void;
}

function MainFocusPanel({
  activeTask, nextTask, remaining,
  holdProgress, isHolding, onHoldStart, onHoldEnd, onUpdateTask,
}: MainFocusPanelProps) {
  const [descExpanded, setDescExpanded] = useState(false);
  const [subtasksExpanded, setSubtasksExpanded] = useState(false);
  const SUBTASK_PREVIEW_COUNT = 3;

  // Pulse state for the colon
  const [colonVisible, setColonVisible] = useState(true);
  useEffect(() => {
    if (!activeTask) return;
    const interval = setInterval(() => setColonVisible(v => !v), 1000);
    return () => clearInterval(interval);
  }, [activeTask]);

  if (!activeTask) {
    return (
      <div className="flex flex-col h-full">
        <div className="flex-1 flex flex-col items-center justify-center px-6">
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
            className="text-center"
          >
            {/* Time-dominant even in free state */}
            <div className="font-mono text-6xl sm:text-8xl font-bold tracking-tight text-foreground/90 tabular-nums mb-6">
              --:--
            </div>
            <h1 className="text-2xl sm:text-3xl font-display font-bold tracking-tight text-foreground/60 leading-[0.95]">
              Free Time
            </h1>
          </motion.div>
        </div>

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
  const [timeMins, timeSecs] = timeDisplay.split(':');
  const hasDescription = activeTask.description && activeTask.description.trim().length > 0;
  const hasAttachments = activeTask.attachments && activeTask.attachments.length > 0;
  const hasSubtasks = activeTask.subtasks && activeTask.subtasks.length > 0;
  const subtasksDone = hasSubtasks ? activeTask.subtasks!.filter(s => s.completed).length : 0;
  const subtasksTotal = hasSubtasks ? activeTask.subtasks!.length : 0;
  const visibleSubtasks = hasSubtasks
    ? (subtasksExpanded ? activeTask.subtasks! : activeTask.subtasks!.slice(0, SUBTASK_PREVIEW_COUNT))
    : [];
  const hasMoreSubtasks = hasSubtasks && activeTask.subtasks!.length > SUBTASK_PREVIEW_COUNT;

  return (
    <div
      className="flex flex-col h-full select-none"
      onPointerDown={(e) => {
        // Only trigger hold on the main area, not on buttons/links
        const target = e.target as HTMLElement;
        if (target.closest('button') || target.closest('a')) return;
        e.preventDefault();
        onHoldStart();
      }}
      onPointerUp={onHoldEnd}
      onPointerLeave={onHoldEnd}
      onPointerCancel={onHoldEnd}
    >
      <AnimatePresence mode="wait">
        <motion.div
          key={activeTask.id}
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -16 }}
          transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
          className="flex flex-col h-full"
        >
          {/* ═══ TOP — FLEX tag, very subtle ═══ */}
          <div className="pt-5 px-6 flex items-center gap-3">
            <div className="opacity-30 scale-[0.8]">
              <PriorityBadge priority={activeTask.priority} />
            </div>
            <div className="h-px flex-1 bg-border/10" />
          </div>

          {/* ═══ PRIMARY — TIME (dominant) + TASK (secondary) ═══ */}
          <div className="flex-1 flex flex-col items-center justify-center px-6 min-h-0">
            <motion.div
              className="w-full max-w-sm text-center"
              animate={isHolding ? { scale: 0.97 } : { scale: 1 }}
              transition={{ duration: 0.2, ease: 'easeOut' }}
            >
              {/* TIME — largest element, digital clock feel */}
              <div className="font-mono font-bold tracking-tight text-foreground tabular-nums leading-none mb-3">
                <span className="text-7xl sm:text-8xl md:text-9xl">{timeMins}</span>
                <span className={`text-7xl sm:text-8xl md:text-9xl transition-opacity duration-300 ${colonVisible ? 'opacity-90' : 'opacity-20'}`}>:</span>
                <span className="text-7xl sm:text-8xl md:text-9xl">{timeSecs}</span>
              </div>

              {/* TASK TITLE — secondary, strong but smaller */}
              <h1 className="text-2xl sm:text-3xl font-display font-bold tracking-tight text-foreground/80 leading-[1.05] mb-1">
                {activeTask.title}
              </h1>

              {/* Hold-to-complete feedback */}
              <div className="h-5 flex items-center justify-center">
                {isHolding ? (
                  <div className="w-32 h-[3px] bg-border/30 rounded-full overflow-hidden">
                    <motion.div
                      className="h-full bg-primary rounded-full"
                      style={{ width: `${holdProgress * 100}%` }}
                    />
                  </div>
                ) : (
                  <span className="text-[8px] font-mono tracking-[0.3em] text-muted-foreground/15 uppercase">
                    Hold to complete
                  </span>
                )}
              </div>
            </motion.div>
          </div>

          {/* ═══ BOTTOM — structured detail block ═══ */}
          <div className="px-6 pb-5 space-y-0 max-h-[40%] overflow-y-auto">
            {/* Description — left-aligned */}
            {hasDescription && (
              <button
                onClick={(e) => { e.stopPropagation(); setDescExpanded(!descExpanded); }}
                className="w-full text-left mb-3 group"
              >
                <div className={`text-[12px] font-mono text-foreground/45 leading-relaxed ${!descExpanded ? 'line-clamp-2' : ''}`}>
                  {linkify(activeTask.description!)}
                </div>
                {!descExpanded && activeTask.description!.length > 100 && (
                  <span className="text-[9px] font-mono text-muted-foreground/25 tracking-[0.15em] uppercase mt-1 inline-block group-hover:text-muted-foreground/45 transition-colors">
                    More
                  </span>
                )}
              </button>
            )}

            {/* Subtasks — actionable checklist */}
            {hasSubtasks && (
              <div className="mb-3">
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-[9px] font-mono tracking-[0.2em] text-muted-foreground/35 uppercase">
                    {subtasksDone}/{subtasksTotal}
                  </span>
                  <div className="h-px flex-1 bg-border/15" />
                </div>
                <div className="space-y-1">
                  {visibleSubtasks.map((s) => (
                    <button
                      key={s.id}
                      onClick={(e) => {
                        e.stopPropagation();
                        const updated = activeTask.subtasks!.map(st =>
                          st.id === s.id ? { ...st, completed: !st.completed } : st
                        );
                        onUpdateTask(activeTask.id, { subtasks: updated });
                      }}
                      className="flex items-center gap-2.5 w-full text-left py-1 group"
                    >
                      <div className={`w-3 h-3 rounded-sm border flex items-center justify-center shrink-0 transition-colors ${
                        s.completed
                          ? 'bg-foreground/15 border-foreground/20'
                          : 'border-muted-foreground/25 group-hover:border-muted-foreground/40'
                      }`}>
                        {s.completed && (
                          <svg width="8" height="8" viewBox="0 0 8 8" className="text-foreground/50">
                            <path d="M1.5 4L3.2 5.8L6.5 2.2" stroke="currentColor" strokeWidth="1.2" fill="none" strokeLinecap="round" strokeLinejoin="round" />
                          </svg>
                        )}
                      </div>
                      <span className={`text-[11px] font-mono leading-snug ${
                        s.completed ? 'line-through text-muted-foreground/30' : 'text-foreground/55'
                      }`}>
                        {s.title}
                      </span>
                    </button>
                  ))}
                </div>
                {hasMoreSubtasks && !subtasksExpanded && (
                  <button
                    onClick={(e) => { e.stopPropagation(); setSubtasksExpanded(true); }}
                    className="text-[9px] font-mono text-muted-foreground/30 tracking-[0.15em] uppercase mt-1.5 hover:text-muted-foreground/50 transition-colors"
                  >
                    +{activeTask.subtasks!.length - SUBTASK_PREVIEW_COUNT} more
                  </button>
                )}
                {subtasksExpanded && hasMoreSubtasks && (
                  <button
                    onClick={(e) => { e.stopPropagation(); setSubtasksExpanded(false); }}
                    className="text-[9px] font-mono text-muted-foreground/30 tracking-[0.15em] uppercase mt-1.5 hover:text-muted-foreground/50 transition-colors"
                  >
                    Show less
                  </button>
                )}
              </div>
            )}

            {/* Attachments — minimal chips */}
            {hasAttachments && (
              <div className="flex flex-wrap gap-1.5 mb-3">
                {activeTask.attachments!.map((att, i) => (
                  <a
                    key={i}
                    href={att.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 px-2 py-1 bg-muted/30 border border-border/20 text-[10px] font-mono text-foreground/50 hover:text-foreground/70 hover:border-border/40 transition-colors"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <Paperclip size={9} />
                    <span className="truncate max-w-[100px]">{att.name}</span>
                  </a>
                ))}
              </div>
            )}

            {/* Time range + next — very bottom, very subtle */}
            <div className="pt-2 space-y-1">
              <div className="text-[9px] font-mono text-muted-foreground/20 tracking-[0.15em] uppercase tabular-nums">
                {formatTime12h(activeTask.time!)} — {formatTime12h(timeToMinutes(activeTask.time!) + (activeTask.duration || 30))}
              </div>
              {nextTask && (
                <div className="flex items-center gap-2 text-[10px] font-mono text-muted-foreground/25 tracking-[0.12em] uppercase">
                  <ChevronRight size={10} strokeWidth={1.5} className="opacity-50" />
                  <span className="truncate">{nextTask.title}</span>
                  <span className="tabular-nums ml-auto shrink-0">{formatTime12h(nextTask.time!)}</span>
                </div>
              )}
            </div>
          </div>
        </motion.div>
      </AnimatePresence>
    </div>
  );
}
