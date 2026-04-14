import { useState, useRef, useCallback, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useTaskStore } from '@/store/taskStore';
import { useCurrentTime, timeToMinutes, formatTime12h } from '@/hooks/useCurrentTime';
import { ChevronUp, ChevronDown, ChevronRight, Paperclip, ExternalLink, Check, Calendar as CalendarIcon, Tag } from 'lucide-react';
import { AttachmentLightbox } from '@/components/AttachmentLightbox';
import { TagAutocomplete } from '@/components/TagAutocomplete';
import { SegmentedProgressRing } from '@/components/SegmentedProgressRing';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { cn } from '@/lib/utils';
import { useTrackpadSwipe } from '@/hooks/useTrackpadSwipe';

type FocusPanel = 'completed' | 'main' | 'detail';

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

const PRIORITY_LABELS = ['FLEX', 'SEMI', 'FIXED', 'LOCK'] as const;

export function FocusView() {
  const { tasks, routinesEnabled, getNextTask, updateTask, completeTask, setEditingTask, setViewMode, setDaySubMode, setListReturnZoom, setShowListReturn } = useTaskStore();
  const { minutes: nowMinutes, dateStr: today } = useCurrentTime(1000);
  const [activePanel, setActivePanel] = useState<FocusPanel>('main');
  const [completedExpanded, setCompletedExpanded] = useState(false);

  // Hold-to-complete state
  const [holdProgress, setHoldProgress] = useState(0);
  const [isHolding, setIsHolding] = useState(false);
  const holdTimerRef = useRef<number | null>(null);
  const holdStartRef = useRef<number>(0);
  const HOLD_DURATION = 800;

  // Swipe state
  const touchStartY = useRef(0);

  // All today tasks (for top panel day-list view) — include completed tasks (even if archived)
  const allTodayTasks = tasks
    .filter((t) => !t.inWaitingRoom && t.date === today && t.archiveReason !== 'deleted' &&
      !(!routinesEnabled && t.isRoutine !== false && t.type === 'recurring'))
    .sort((a, b) => {
      if (!a.time && !b.time) return 0;
      if (!a.time) return 1;
      if (!b.time) return -1;
      return a.time.localeCompare(b.time);
    });

  const todayTasks = allTodayTasks.filter(t => !t.completed && t.time);

  const upcomingTasks = todayTasks.filter((t) => {
    if (!t.time) return false;
    const start = timeToMinutes(t.time);
    return start > nowMinutes;
  });

  const completedToday = allTodayTasks.filter(t => t.completed);

  // Grace period: keep overdue task in focus for 5 minutes
  const GRACE_MINUTES = 5;
  const overdueGraceRef = useRef<{ taskId: string; expiredAt: number } | null>(null);
  const [hasExpiredOverdue, setHasExpiredOverdue] = useState(false);

  // Find naturally active task (within its scheduled window)
  const naturalActiveTask = todayTasks.find((t) => {
    if (!t.time) return false;
    const start = timeToMinutes(t.time);
    const end = start + (t.duration || 30);
    return nowMinutes >= start && nowMinutes < end;
  });

  // Find grace-period task: an overdue task whose window ended within the last 5 minutes.
  // This takes PRIORITY over the natural active task for 5 minutes, so the user
  // sees their overdue task even if a new one has started.
  const graceTask = (() => {
    const justEnded = todayTasks
      .filter((t) => {
        if (!t.time) return false;
        const end = timeToMinutes(t.time) + (t.duration || 30);
        return nowMinutes >= end && nowMinutes < end + GRACE_MINUTES;
      })
      .sort((a, b) => {
        const endA = timeToMinutes(a.time!) + (a.duration || 30);
        const endB = timeToMinutes(b.time!) + (b.duration || 30);
        return endB - endA; // most recent first
      });
    return justEnded[0] || null;
  })();

  // Track when an overdue task's grace expires — then show red arrow
  useEffect(() => {
    if (graceTask) {
      if (!overdueGraceRef.current || overdueGraceRef.current.taskId !== graceTask.id) {
        const endMin = timeToMinutes(graceTask.time!) + (graceTask.duration || 30);
        overdueGraceRef.current = { taskId: graceTask.id, expiredAt: endMin };
      }
      setHasExpiredOverdue(false);
    } else if (overdueGraceRef.current) {
      // Grace just expired — mark red arrow
      setHasExpiredOverdue(true);
    }
  }, [graceTask?.id]);

  // Clear expired overdue flag when user navigates to completed panel
  useEffect(() => {
    if (activePanel === 'completed') setHasExpiredOverdue(false);
  }, [activePanel]);

  // Grace task takes priority for 5 minutes, then falls back to natural active task
  const activeTask = graceTask || naturalActiveTask;
  const isGracePeriod = !!graceTask;

  const elapsed = activeTask?.time ? nowMinutes - timeToMinutes(activeTask.time) : 0;
  const remaining = activeTask ? (activeTask.duration || 30) - elapsed : 0;
  const nextTask = activeTask ? getNextTask(activeTask.id) : todayTasks[0];

  // Overdue tasks: ended but not completed, not the active task, past grace
  const overdueTasks = todayTasks.filter((t) => {
    if (!t.time || t.id === activeTask?.id) return false;
    const end = timeToMinutes(t.time) + (t.duration || 30);
    return nowMinutes >= end + GRACE_MINUTES;
  });

  const completedCount = completedToday.length;

  // Hold-to-complete handlers
  const startHold = useCallback(() => {
    // Determine which task to complete: active task, or most overdue task
    const targetTask = activeTask || overdueTasks.reduce<typeof activeTask>((a, b) => {
      if (!a) return b;
      const endA = timeToMinutes(a.time!) + (a.duration || 30);
      const endB = timeToMinutes(b.time!) + (b.duration || 30);
      return (nowMinutes - endA) > (nowMinutes - endB) ? a : b;
    }, null);
    if (!targetTask) return;
    setIsHolding(true);
    holdStartRef.current = Date.now();
    if (navigator.vibrate) navigator.vibrate(10);
    const tick = () => {
      const el = Date.now() - holdStartRef.current;
      const p = Math.min(1, el / HOLD_DURATION);
      setHoldProgress(p);
      if (p >= 1) {
        completeTask(targetTask.id);
        setIsHolding(false);
        setHoldProgress(0);
        if (navigator.vibrate) navigator.vibrate(30);
        return;
      }
      holdTimerRef.current = requestAnimationFrame(tick);
    };
    holdTimerRef.current = requestAnimationFrame(tick);
  }, [activeTask, overdueTasks, nowMinutes, completeTask]);

  const cancelHold = useCallback(() => {
    if (holdTimerRef.current) {
      cancelAnimationFrame(holdTimerRef.current);
      holdTimerRef.current = null;
    }
    setIsHolding(false);
    const startVal = holdProgress;
    const startTime = Date.now();
    const reverseDuration = 300;
    const reverseStep = () => {
      const elapsed = Date.now() - startTime;
      const p = Math.max(0, startVal * (1 - elapsed / reverseDuration));
      setHoldProgress(p);
      if (p > 0) {
        holdTimerRef.current = requestAnimationFrame(reverseStep);
      } else {
        holdTimerRef.current = null;
      }
    };
    holdTimerRef.current = requestAnimationFrame(reverseStep);
  }, [holdProgress]);

  // Swipe handlers
  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    touchStartY.current = e.touches[0].clientY;
  }, []);

  const handleTouchEnd = useCallback((e: React.TouchEvent) => {
    const deltaY = e.changedTouches[0].clientY - touchStartY.current;
    const threshold = 60;
    if (Math.abs(deltaY) < threshold) return;
    if (deltaY < -threshold) {
      // Swipe up
      if (activePanel === 'main') setActivePanel('detail');
      else if (activePanel === 'completed') setActivePanel('main');
    } else if (deltaY > threshold) {
      // Swipe down
      if (activePanel === 'main') setActivePanel('completed');
      else if (activePanel === 'detail') setActivePanel('main');
    }
  }, [activePanel]);

  // Trackpad vertical swipe for panel navigation
  const focusContainerRef = useRef<HTMLDivElement>(null);
  useTrackpadSwipe({
    direction: 'vertical',
    containerRef: focusContainerRef,
    threshold: 120,
    onSwipeNegative: useCallback(() => {
      // Scroll down = swipe up
      setActivePanel(p => p === 'main' ? 'detail' : p === 'completed' ? 'main' : p);
    }, []),
    onSwipePositive: useCallback(() => {
      // Scroll up = swipe down
      setActivePanel(p => p === 'main' ? 'completed' : p === 'detail' ? 'main' : p);
    }, []),
  });

  useEffect(() => {
    return () => {
      if (holdTimerRef.current) cancelAnimationFrame(holdTimerRef.current);
    };
  }, []);

  const showUpArrow = activePanel === 'main';
  const showDownArrow = activePanel === 'main';

  // Double-tap handler for top panel
  const lastTapRef = useRef<{ id: string; time: number } | null>(null);
  const handleDayListTap = useCallback((taskId: string) => {
    const now = Date.now();
    if (lastTapRef.current && lastTapRef.current.id === taskId && now - lastTapRef.current.time < 400) {
      lastTapRef.current = null;
      completeTask(taskId);
      if (navigator.vibrate) navigator.vibrate(20);
      return;
    }
    lastTapRef.current = { id: taskId, time: now };
    setTimeout(() => {
      if (lastTapRef.current && lastTapRef.current.id === taskId && Date.now() - lastTapRef.current.time >= 380) {
        setEditingTask(taskId);
        lastTapRef.current = null;
      }
    }, 400);
  }, [completeTask, setEditingTask]);

  return (
    <div
      ref={focusContainerRef}
      className="relative overflow-hidden"
      style={{ height: 'calc(100svh - env(safe-area-inset-bottom, 0px) - 64px)', maxHeight: 'calc(100dvh - 64px)' }}
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
    >
      {/* Navigation arrows */}
      {showUpArrow && (
        <motion.button
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.5, delay: 0.4 }}
          onClick={() => setActivePanel('completed')}
          className={`absolute left-1/2 -translate-x-1/2 top-2 z-20 p-2 transition-colors ${
            hasExpiredOverdue
              ? 'text-destructive/70 hover:text-destructive'
              : 'text-muted-foreground/30 hover:text-muted-foreground/50'
          }`}
        >
          <ChevronUp size={40} strokeWidth={1.5} />
        </motion.button>
      )}
      {showDownArrow && (
        <motion.button
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.5, delay: 0.4 }}
          onClick={() => setActivePanel('detail')}
          className={`absolute left-1/2 -translate-x-1/2 bottom-2 z-20 p-2 transition-colors text-muted-foreground/30 hover:text-muted-foreground/50`}
        >
          <ChevronDown size={40} strokeWidth={1.5} className={activeTask?.subtasks && activeTask.subtasks.length > 0 ? 'animate-[subtask-pulse_30s_ease-in-out_infinite]' : ''} />
        </motion.button>
      )}

      <AnimatePresence mode="wait">
        {activePanel === 'completed' && (
          <FocusDayListPanel
            allTodayTasks={allTodayTasks}
            completedCount={completedCount}
            nowMinutes={nowMinutes}
            activeTaskId={activeTask?.id}
            onTaskTap={handleDayListTap}
            onBack={() => setActivePanel('main')}
          />
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
              overdueTasks={overdueTasks}
              isGracePeriod={isGracePeriod}
            />
          </motion.div>
        )}

        {activePanel === 'detail' && (
          <motion.div
            key="detail"
            initial={{ opacity: 0, y: 40 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 40 }}
            transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
            className="absolute inset-0 flex flex-col pt-6 pb-16 px-6 overflow-y-auto"
          >
            <button
              onClick={() => setActivePanel('main')}
              className="self-center mb-4 p-2 text-muted-foreground/30 hover:text-muted-foreground/50 transition-colors"
            >
              <ChevronUp size={40} strokeWidth={1.5} />
            </button>

            <TaskDetailPanel
              task={activeTask}
              onUpdateTask={updateTask}
              onCompleteTask={completeTask}
            />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ── Focus Day List Panel (swipe-down top view) ──
interface FocusDayListPanelProps {
  allTodayTasks: ReturnType<typeof useTaskStore.getState>['tasks'];
  completedCount: number;
  nowMinutes: number;
  activeTaskId: string | undefined;
  onTaskTap: (id: string) => void;
  onBack: () => void;
}

function FocusDayListPanel({ allTodayTasks, completedCount, nowMinutes, activeTaskId, onTaskTap, onBack }: FocusDayListPanelProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const activeRowRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // Scroll to center the active task when panel mounts
    if (activeRowRef.current && scrollRef.current) {
      const container = scrollRef.current;
      const row = activeRowRef.current;
      const containerHeight = container.clientHeight;
      const rowTop = row.offsetTop;
      const rowHeight = row.offsetHeight;
      container.scrollTop = rowTop - containerHeight / 2 + rowHeight / 2;
    }
  }, []);

  return (
    <div className="absolute inset-0">
      <motion.div
        key="completed"
        ref={scrollRef}
        initial={{ opacity: 0, y: -40 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -40 }}
        transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
        className="absolute inset-0 flex flex-col pt-8 pb-16 px-3 sm:px-4 overflow-y-auto"
      >
        {/* Header */}
        <div className="max-w-sm mx-auto w-full mb-2">
          <p className="text-[10px] font-mono text-muted-foreground/50 tracking-widest">
            {completedCount}/{allTodayTasks.length} COMPLETED
          </p>
        </div>

        {/* Task list */}
        <div className="max-w-sm mx-auto w-full flex flex-col">
          {allTodayTasks.length === 0 ? (
            <div className="text-center py-20">
              <p className="text-muted-foreground/30 font-mono text-sm tracking-wider">NO TASKS</p>
            </div>
          ) : (
            allTodayTasks.map((task) => {
              const isOverdue = !task.completed && task.time &&
                nowMinutes >= timeToMinutes(task.time) + (task.duration || 30);
              const isCurrent = task.id === activeTaskId;

              return (
                <div
                  key={task.id}
                  ref={isCurrent ? activeRowRef : undefined}
                  className={`w-full text-left px-3 py-4 transition-colors ${
                    task.completed ? 'opacity-50' : ''
                  } ${isCurrent ? 'border border-foreground/15 rounded-md my-1' : 'border-b border-border/20'}`}
                >
                  <div className="flex items-start gap-3">
                    {/* Time column */}
                    <div className="w-16 flex-shrink-0 pt-0.5">
                      {task.time ? (
                        <div>
                          <p className={`text-[11px] font-mono leading-tight ${
                            isOverdue ? 'text-red-500/80' : 'text-foreground/80'
                          }`}>
                            {formatTime12h(task.time)}
                          </p>
                          {task.duration && (
                            <p className={`text-[9px] font-mono mt-0.5 ${
                              isOverdue ? 'text-red-500/40' : 'text-muted-foreground/40'
                            }`}>
                              {Math.floor(task.duration / 60) > 0 ? `${Math.floor(task.duration / 60)}h ` : ''}{task.duration % 60 > 0 ? `${task.duration % 60}m` : ''}
                            </p>
                          )}
                        </div>
                      ) : (
                        <p className="text-[9px] font-mono text-muted-foreground/30 tracking-wider">
                          ANYTIME
                        </p>
                      )}
                    </div>

                    {/* Content — double tap to complete */}
                    <button
                      onClick={() => onTaskTap(task.id)}
                      className="flex-1 min-w-0 text-left active:bg-muted/40 rounded-sm -m-1 p-1 transition-colors"
                    >
                      <p className={`text-sm font-display font-medium leading-snug ${
                        task.completed
                          ? 'line-through text-muted-foreground/50'
                          : isOverdue
                            ? 'text-red-500'
                            : 'text-foreground'
                      }`}>
                        {task.title}
                      </p>
                      {task.description && (
                        <p className={`text-[11px] mt-0.5 line-clamp-1 ${
                          isOverdue ? 'text-red-500/40' : 'text-muted-foreground/50'
                        }`}>
                          {task.description}
                        </p>
                      )}
                      {task.subtasks && task.subtasks.length > 0 && (
                        <p className="text-[9px] font-mono text-muted-foreground/40 mt-1 tracking-wider">
                          {task.subtasks.filter((s: any) => s.completed).length}/{task.subtasks.length} SUBTASKS
                        </p>
                      )}
                    </button>

                    {/* Priority dot */}
                    <div
                      className="w-1.5 h-1.5 rounded-full mt-1.5 flex-shrink-0"
                      style={{
                        backgroundColor: `hsl(var(--priority-${task.priority}))`,
                        opacity: 0.6,
                      }}
                    />
                  </div>
                </div>
              );
            })
          )}
        </div>

        <button
          onClick={onBack}
          className="self-center mt-8 p-2 text-muted-foreground/30 hover:text-muted-foreground/50 transition-colors"
        >
          <ChevronDown size={40} strokeWidth={1.5} />
        </button>
      </motion.div>

      {/* Top vignette fade */}
      <div className="absolute top-0 left-0 right-0 h-16 pointer-events-none z-10"
        style={{ background: 'linear-gradient(to bottom, hsl(var(--background)), hsl(var(--background) / 0.6) 50%, transparent)' }}
      />
      {/* Bottom vignette fade */}
      <div className="absolute bottom-0 left-0 right-0 h-24 pointer-events-none z-10"
        style={{ background: 'linear-gradient(to top, hsl(var(--background)), hsl(var(--background) / 0.6) 50%, transparent)' }}
      />
    </div>
  );
}


interface TaskDetailPanelProps {
  task: ReturnType<typeof useTaskStore.getState>['tasks'][0] | undefined;
  onUpdateTask: (id: string, updates: any) => void;
  onCompleteTask: (id: string) => void;
}

function TaskDetailPanel({ task, onUpdateTask, onCompleteTask }: TaskDetailPanelProps) {
  const [editingTitle, setEditingTitle] = useState(false);
  const [titleDraft, setTitleDraft] = useState('');
  const [editingNote, setEditingNote] = useState(false);
  const [noteDraft, setNoteDraft] = useState('');
  const noteEditorRef = useRef<HTMLDivElement | null>(null);
  const [editingSubtaskId, setEditingSubtaskId] = useState<string | null>(null);
  const [subtaskDraft, setSubtaskDraft] = useState('');
  const [addingSubtask, setAddingSubtask] = useState(false);
  const [newSubtaskDraft, setNewSubtaskDraft] = useState('');
  const { now: detailNow, minutes: nowMinutes } = useCurrentTime(1000);
  const [focusLightboxIndex, setFocusLightboxIndex] = useState<number | null>(null);

  useEffect(() => {
    if (!editingNote || !noteEditorRef.current) return;
    const editor = noteEditorRef.current;
    editor.textContent = noteDraft;
    requestAnimationFrame(() => {
      editor.focus();
      const selection = window.getSelection();
      const range = document.createRange();
      range.selectNodeContents(editor);
      range.collapse(false);
      selection?.removeAllRanges();
      selection?.addRange(range);
    });
  }, [editingNote]);

  // Empty state
  if (!task) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center gap-4">
        <div className="w-12 h-12 rounded-full border border-border/20 flex items-center justify-center">
          <div className="w-2 h-2 rounded-full bg-muted-foreground/20" />
        </div>
        <p className="text-sm font-mono text-muted-foreground/40 tracking-wider">No task in focus</p>
        <p className="text-[10px] font-mono text-muted-foreground/25 tracking-widest uppercase">
          Schedule a task to get started
        </p>
      </div>
    );
  }

  const hasSubtasks = task.subtasks && task.subtasks.length > 0;
  const hasDescription = task.description && task.description.trim().length > 0;
  const hasAttachments = task.attachments && task.attachments.length > 0;
  const completedSubtasks = task.subtasks?.filter(s => s.completed).length ?? 0;
  const totalSubtasks = task.subtasks?.length ?? 0;
  const priorityLabel = PRIORITY_LABELS[task.priority] || 'FLEX';

  // Lightweight countdown with seconds — use minute-level remaining + current seconds offset
  const taskEndMinutes = task.time ? timeToMinutes(task.time) + (task.duration || 30) : 0;
  const remainingWholeMinutes = task.time ? Math.max(0, taskEndMinutes - nowMinutes) : 0;
  const currentSeconds = detailNow.getSeconds();
  // Total remaining seconds = (remaining full minutes * 60) minus elapsed seconds in current minute
  const remainingSec = task.time ? Math.max(0, remainingWholeMinutes * 60 - currentSeconds) : 0;
  const countdownH = Math.floor(remainingSec / 3600);
  const countdownM = Math.floor((remainingSec % 3600) / 60);
  const countdownS = remainingSec % 60;
  const countdownLabel = `${String(countdownH).padStart(2, '0')}:${String(countdownM).padStart(2, '0')}:${String(countdownS).padStart(2, '0')}`;

  // Due date label — no date = Today, tomorrow = Tomorrow, within week = day name, else date
  const dueDateLabel = (() => {
    if (!task.dueDate) return 'Today';
    const due = new Date(task.dueDate + 'T12:00:00');
    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 12, 0, 0);
    const diffDays = Math.round((due.getTime() - todayStart.getTime()) / (1000 * 60 * 60 * 24));
    if (diffDays <= 0) return 'Today';
    if (diffDays === 1) return 'Due Tomorrow';
    if (diffDays <= 6) return `Due ${due.toLocaleDateString('en-US', { weekday: 'long' })}`;
    return `Due ${due.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`;
  })();

  return (
    <div className="w-full max-w-sm mx-auto flex flex-col gap-5">
      {/* ── Header: countdown (left, tappable → day view) + due date (right, tappable → date picker) ── */}
      <div className="flex items-center justify-between">
        <button
          onClick={() => {
            if (!task.time) return;
            const { setViewMode, setDaySubMode, setListReturnZoom, setShowListReturn } = useTaskStore.getState();
            setListReturnZoom({ taskTime: task.time, taskDuration: task.duration || 30 });
            setShowListReturn(true);
            setDaySubMode('timeline');
            setViewMode('day');
          }}
          className="text-sm font-mono tabular-nums tracking-wider text-foreground/60 font-medium active:text-foreground/80 transition-colors"
        >
          {task.time ? countdownLabel : '—'}
        </button>

        <Popover>
          <PopoverTrigger asChild>
            <button className="text-xs font-mono tracking-[0.15em] text-foreground/50 uppercase font-medium active:text-foreground/70 transition-colors">
              {dueDateLabel}
            </button>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-0" align="end">
            <Calendar
              mode="single"
              selected={task.dueDate ? new Date(task.dueDate + 'T12:00:00') : undefined}
              onSelect={(date) => {
                if (date) {
                  const yyyy = date.getFullYear();
                  const mm = String(date.getMonth() + 1).padStart(2, '0');
                  const dd = String(date.getDate()).padStart(2, '0');
                  onUpdateTask(task.id, { dueDate: `${yyyy}-${mm}-${dd}` });
                } else {
                  onUpdateTask(task.id, { dueDate: undefined });
                }
              }}
              className={cn("p-3 pointer-events-auto")}
            />
          </PopoverContent>
        </Popover>
      </div>

      {/* ── Title ── */}
      {editingTitle ? (
        <div className="relative">
          <input
            autoFocus
            value={titleDraft}
            onChange={(e) => setTitleDraft(e.target.value)}
            onBlur={() => {
              const clean = titleDraft.replace(/#\S*$/, '').trim();
              if (clean && clean !== task.title) {
                onUpdateTask(task.id, { title: clean });
              }
              setEditingTitle(false);
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !titleDraft.match(/#\S+$/)) (e.target as HTMLInputElement).blur();
              if (e.key === 'Escape') setEditingTitle(false);
            }}
            className="text-xl font-display font-bold text-foreground leading-tight bg-transparent border-b border-foreground/10 focus:border-foreground/30 outline-none pb-1 w-full"
          />
          <TagAutocomplete
            inputValue={titleDraft}
            onSelectTag={(cat, cleaned) => {
              setTitleDraft(cleaned);
              onUpdateTask(task.id, { category: cat.value });
            }}
          />
        </div>
      ) : (
        <button
          onClick={() => { setTitleDraft(task.title); setEditingTitle(true); }}
          className="text-xl font-display font-bold text-foreground leading-tight text-left w-full"
        >
          {task.title}
        </button>
      )}

      {/* ── Subtasks (editable) ── */}
      <div className="flex flex-col gap-0.5">
        <div className="text-[9px] font-mono tracking-[0.2em] text-muted-foreground/30 uppercase mb-2">
          Subtasks · {completedSubtasks}/{totalSubtasks}
        </div>
        <div className="space-y-1">
          {(task.subtasks || []).map((s) => (
            <div key={s.id} className="flex items-center gap-3 w-full py-2.5 px-3 rounded-md hover:bg-muted/30 transition-colors group">
              {/* Checkbox */}
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  const updated = task.subtasks!.map(st =>
                    st.id === s.id ? { ...st, completed: !st.completed } : st
                  );
                  onUpdateTask(task.id, { subtasks: updated });
                }}
                className={`w-4 h-4 rounded-sm border-2 flex items-center justify-center shrink-0 transition-all ${
                  s.completed
                    ? 'bg-foreground/15 border-foreground/25'
                    : 'border-muted-foreground/25 group-hover:border-muted-foreground/45'
                }`}
              >
                {s.completed && (
                  <svg width="10" height="10" viewBox="0 0 8 8" className="text-foreground/60">
                    <path d="M1.5 4L3.2 5.8L6.5 2.2" stroke="currentColor" strokeWidth="1.3" fill="none" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                )}
              </button>

              {/* Title — tap to edit inline */}
              {editingSubtaskId === s.id ? (
                <input
                  autoFocus
                  value={subtaskDraft}
                  onChange={(e) => setSubtaskDraft(e.target.value)}
                  onBlur={() => {
                    if (!subtaskDraft.trim()) {
                      // Empty = delete subtask
                      const updated = task.subtasks!.filter(st => st.id !== s.id);
                      onUpdateTask(task.id, { subtasks: updated });
                    } else if (subtaskDraft.trim() !== s.title) {
                      const updated = task.subtasks!.map(st =>
                        st.id === s.id ? { ...st, title: subtaskDraft.trim() } : st
                      );
                      onUpdateTask(task.id, { subtasks: updated });
                    }
                    setEditingSubtaskId(null);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
                    if (e.key === 'Escape') setEditingSubtaskId(null);
                  }}
                  className="flex-1 text-[13px] font-mono leading-snug text-foreground/85 bg-transparent outline-none caret-foreground/50"
                />
              ) : (
                <button
                  onClick={() => {
                    setEditingSubtaskId(s.id);
                    setSubtaskDraft(s.title);
                  }}
                  className={`flex-1 text-left text-[13px] font-mono leading-snug ${
                    s.completed ? 'line-through text-muted-foreground/35' : 'text-foreground/85'
                  }`}
                >
                  {s.title}
                </button>
              )}
            </div>
          ))}

          {/* New subtask input */}
          {addingSubtask ? (
            <div className="flex items-center gap-3 w-full py-2.5 px-3 rounded-md">
              <div className="w-4 h-4 rounded-sm border-2 border-muted-foreground/15 shrink-0" />
              <input
                autoFocus
                value={newSubtaskDraft}
                onChange={(e) => setNewSubtaskDraft(e.target.value)}
                placeholder="New subtask…"
                onBlur={() => {
                  if (newSubtaskDraft.trim()) {
                    const newSub = { id: crypto.randomUUID(), title: newSubtaskDraft.trim(), completed: false };
                    onUpdateTask(task.id, { subtasks: [...(task.subtasks || []), newSub] });
                  }
                  setNewSubtaskDraft('');
                  setAddingSubtask(false);
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && newSubtaskDraft.trim()) {
                    const newSub = { id: crypto.randomUUID(), title: newSubtaskDraft.trim(), completed: false };
                    onUpdateTask(task.id, { subtasks: [...(task.subtasks || []), newSub] });
                    setNewSubtaskDraft('');
                    // Stay in adding mode for chain-add
                  } else if (e.key === 'Enter' || e.key === 'Escape') {
                    setNewSubtaskDraft('');
                    setAddingSubtask(false);
                  }
                }}
                className="flex-1 text-[13px] font-mono leading-snug text-foreground/85 bg-transparent border-b border-foreground/10 focus:border-foreground/30 outline-none placeholder:text-muted-foreground/20"
              />
            </div>
          ) : (
            <button
              onClick={() => setAddingSubtask(true)}
              className="flex items-center gap-3 w-full py-2.5 px-3 rounded-md text-muted-foreground/30 hover:text-muted-foreground/50 transition-colors"
            >
              <div className="w-4 h-4 rounded-sm border-2 border-dashed border-current flex items-center justify-center shrink-0">
                <span className="text-[10px] leading-none">+</span>
              </div>
            </button>
          )}
        </div>
      </div>

      {/* ── Description / Notes ── */}
      <div className="flex flex-col gap-1">
        <div className="text-[9px] font-mono tracking-[0.2em] text-muted-foreground/30 uppercase">
          Notes
        </div>
        {editingNote ? (
          <div
            ref={noteEditorRef}
            contentEditable
            suppressContentEditableWarning
            onInput={(e) => setNoteDraft(e.currentTarget.innerText)}
            onBlur={() => {
              const value = noteEditorRef.current?.innerText ?? '';
              onUpdateTask(task.id, { description: value.trim() || undefined });
              setNoteDraft(value);
              setEditingNote(false);
            }}
            className="min-h-[40px] px-3 py-2 text-[12px] font-mono text-foreground/50 leading-relaxed whitespace-pre-wrap break-words outline-none"
          />
        ) : (
          <button
            onClick={() => { setNoteDraft(task.description || ''); setEditingNote(true); }}
            className="text-left min-h-[40px] px-3 py-2 w-full"
          >
            {hasDescription ? (
              <div className="text-[12px] font-mono text-foreground/50 leading-relaxed whitespace-pre-wrap break-words">
                {linkify(task.description!)}
              </div>
            ) : (
              <span className="text-[12px] font-mono text-muted-foreground/25 italic">Tap to add notes…</span>
            )}
          </button>
        )}
      </div>

      {/* ── Attachments ── */}
      {hasAttachments && (
        <div className="flex flex-wrap gap-1.5">
          {task.attachments!.map((att, i) => (
            <button
              key={i}
              onClick={() => setFocusLightboxIndex(i)}
              className="inline-flex items-center gap-1.5 px-2.5 py-1.5 border border-border/15 rounded-md text-[10px] font-mono text-foreground/35 hover:text-foreground/55 hover:border-border/30 transition-colors"
            >
              <Paperclip size={9} />
              <span className="truncate max-w-[120px]">{att.name}</span>
            </button>
          ))}
        </div>
      )}

      {/* ── Metadata: Category + Due Date ── */}
      <div className="flex flex-col gap-2 pt-1">
        {task.category && (
          <div className="flex items-center gap-2">
            <Tag size={10} className="text-muted-foreground/25" />
            <span className="text-[10px] font-mono text-muted-foreground/35 tracking-wider uppercase">
              {task.category}
            </span>
          </div>
        )}
        {task.dueDate && (
          <div className="flex items-center gap-2">
            <CalendarIcon size={10} className="text-muted-foreground/25" />
            <span className="text-[10px] font-mono text-muted-foreground/35 tabular-nums tracking-wider">
              Due {new Date(task.dueDate + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
            </span>
          </div>
        )}
      </div>

      {/* ── Complete button ── */}
      <button
        onClick={() => onCompleteTask(task.id)}
        className="mt-2 flex items-center justify-center gap-2 w-full py-3 rounded-md border border-border/20 text-foreground/60 hover:text-foreground hover:border-primary/40 hover:bg-primary/5 transition-all"
      >
        <Check size={14} strokeWidth={2} />
        <span className="text-[11px] font-mono tracking-[0.15em] uppercase">Complete Task</span>
      </button>
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
  overdueTasks: ReturnType<typeof useTaskStore.getState>['tasks'];
  isGracePeriod: boolean;
}

function MainFocusPanel({
  activeTask, nextTask, remaining, nowMinutes,
  holdProgress, isHolding, onHoldStart, onHoldEnd, onUpdateTask, overdueTasks, isGracePeriod,
}: MainFocusPanelProps) {
  const [completing, setCompleting] = useState(false);
  const { completeTask } = useTaskStore();

  useEffect(() => {
    setCompleting(false);
  }, [activeTask?.id]);

  if (!activeTask) {
    const hasOverdue = overdueTasks.length > 0;

    // Most overdue task = earliest end time
    const mostOverdueMinutes = hasOverdue
      ? Math.max(...overdueTasks.map(t => nowMinutes - (timeToMinutes(t.time!) + (t.duration || 30))))
      : 0;
    const overdueH = String(Math.floor(mostOverdueMinutes / 60)).padStart(2, '0');
    const overdueM = String(mostOverdueMinutes % 60).padStart(2, '0');

    // Time until next task
    const minsToNext = nextTask?.time ? timeToMinutes(nextTask.time) - nowMinutes : 0;
    const nextH = String(Math.floor(Math.max(0, minsToNext) / 60)).padStart(2, '0');
    const nextM = String(Math.max(0, minsToNext) % 60).padStart(2, '0');

    // Pick the most overdue task for ring display
    const mostOverdueTask = hasOverdue ? overdueTasks.reduce((a, b) => {
      const endA = timeToMinutes(a.time!) + (a.duration || 30);
      const endB = timeToMinutes(b.time!) + (b.duration || 30);
      return (nowMinutes - endA) > (nowMinutes - endB) ? a : b;
    }) : null;

    // Compute progress for the overdue ring (full = 100% since task ended)
    const overdueRingProgress = 1; // task is fully elapsed

    return (
      <div
        className="flex flex-col h-full"
        onPointerDown={hasOverdue ? onHoldStart : undefined}
        onPointerUp={hasOverdue ? onHoldEnd : undefined}
        onPointerLeave={hasOverdue ? onHoldEnd : undefined}
        onPointerCancel={hasOverdue ? onHoldEnd : undefined}
      >
        {/* ── Top status strip ── */}
        <div className="flex items-center justify-between px-5 py-3">
          <span className="text-[9px] font-mono tracking-[0.2em] text-muted-foreground/30 uppercase">
            {hasOverdue ? 'OVERDUE' : 'Focus'}
          </span>
          <span className="text-[9px] font-mono text-muted-foreground/20 tabular-nums tracking-wider">
            {hasOverdue && mostOverdueTask?.time
              ? `${formatTime12h(mostOverdueTask.time)} – ${formatTime12h(timeToMinutes(mostOverdueTask.time) + (mostOverdueTask.duration || 30))}`
              : '—'}
          </span>
        </div>

        {/* ── Center ── */}
        <div className="flex-1 flex flex-col items-center justify-center px-6">
          {hasOverdue ? (
            <div className="relative" style={{ width: 280, height: 280 }}>
              <SegmentedProgressRing
                progress={overdueRingProgress}
                size={280}
                segments={60}
                barWidth={4}
                barLength={14}
                holdProgress={holdProgress}
                color="destructive"
              />
              <div className="absolute inset-0 flex flex-col items-center justify-center">
                <div className="font-display text-[64px] sm:text-[80px] font-bold text-red-500/70 leading-none tabular-nums tracking-tight select-none">
                  {overdueH}:{overdueM}
                </div>
                <h1 className="mt-3 text-sm font-display font-medium text-red-500/60 leading-tight text-center uppercase max-w-[220px]">
                  {overdueTasks.length === 1 ? overdueTasks[0].title : `${overdueTasks.length} tasks`}
                </h1>
                <span className="mt-1 text-[10px] font-mono text-red-500/40 tracking-[0.15em] uppercase">
                  Overdue
                </span>
              </div>
            </div>
          ) : (
            <>
              <div className="font-display text-[64px] sm:text-[80px] font-bold text-foreground/8 leading-none tabular-nums tracking-tight select-none">
                {nextTask?.time ? `${nextH}:${nextM}` : '--:--'}
              </div>
              <h1 className="mt-4 text-lg font-display font-medium text-foreground/40 leading-tight text-center">
                Free Time
              </h1>
              {nextTask && (
                <span className="mt-2 text-[10px] font-mono text-muted-foreground/25 tracking-[0.1em]">
                  until {nextTask.title}
                </span>
              )}
            </>
          )}
        </div>

        {/* ── Bottom ── */}
        <div className="px-5 py-4">
          {nextTask ? (
            <div className="flex items-center gap-2 text-[10px] font-mono text-muted-foreground/25 tracking-[0.12em] uppercase">
              <ChevronRight size={10} strokeWidth={1.5} className="opacity-50" />
              <span className="truncate">{nextTask.title}</span>
              <span className="tabular-nums ml-auto shrink-0">{formatTime12h(nextTask.time!)}</span>
            </div>
          ) : (
            <div className="text-[10px] font-mono text-muted-foreground/15 tracking-[0.12em] uppercase">
              Nothing scheduled
            </div>
          )}
        </div>
      </div>
    );
  }

  const clampedRemaining = Math.max(0, remaining);
  // In grace period, show how long overdue
  const overdueMinutes = isGracePeriod ? Math.abs(remaining) : 0;
  const displayH = isGracePeriod
    ? String(Math.floor(overdueMinutes / 60)).padStart(2, '0')
    : String(Math.floor(clampedRemaining / 60)).padStart(2, '0');
  const displayM = isGracePeriod
    ? String(overdueMinutes % 60).padStart(2, '0')
    : String(clampedRemaining % 60).padStart(2, '0');
  const priorityLabel = PRIORITY_LABELS[activeTask.priority] || 'FLEX';
  const timeStart = formatTime12h(activeTask.time!);
  const timeEnd = formatTime12h(timeToMinutes(activeTask.time!) + (activeTask.duration || 30));


  return (
    <div
      className="flex flex-col h-full select-none"
      onPointerDown={(e) => {
        const target = e.target as HTMLElement;
        if (target.closest('button') || target.closest('a')) return;
        e.preventDefault();
        onHoldStart();
      }}
      onPointerUp={onHoldEnd}
      onPointerLeave={onHoldEnd}
      onPointerCancel={onHoldEnd}
    >
      {/* Background grid removed for cleaner focus view */}

      {/* ═══ ZONE 1: TOP STATUS STRIP ═══ */}
      <div className="relative z-10 flex items-center justify-between px-5 py-3">
        <span className="text-[9px] font-mono tracking-[0.2em] text-muted-foreground/40 uppercase">
          {priorityLabel}
        </span>
        <span className="text-[9px] font-mono text-muted-foreground/25 tabular-nums tracking-wider">
          {timeStart} – {timeEnd}
        </span>
      </div>

      {/* ═══ ZONE 2: CENTER FOCUS (ring + timer + title) ═══ */}
      <div className="relative z-10 flex-1 flex items-center justify-center px-6 min-h-0">
        <div className="relative" style={{ width: 280, height: 280 }}>
          <SegmentedProgressRing
            progress={activeTask.duration ? (activeTask.duration - clampedRemaining) / activeTask.duration : 0}
            size={280}
            segments={60}
            barWidth={4}
            barLength={14}
            holdProgress={holdProgress}
            color={isGracePeriod ? 'destructive' : 'default'}
          />

          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <AnimatePresence mode="wait">
              <motion.div
                key={activeTask.id}
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -12 }}
                transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
                className="flex flex-col items-center"
              >
                <motion.div
                  className={`font-display text-[64px] sm:text-[80px] font-bold leading-none tabular-nums tracking-tight select-none ${
                    isGracePeriod ? 'text-red-500/70' : 'text-foreground'
                  }`}
                  animate={completing ? { scale: 0.95, opacity: 0.3 } : { scale: 1, opacity: 1 }}
                  transition={{ duration: 0.25, ease: 'easeOut' }}
                >
                  {displayH}:{displayM}
                </motion.div>

                <h1 className={`mt-2 text-sm sm:text-base font-display font-medium leading-snug text-center max-w-[220px] uppercase ${
                  isGracePeriod ? 'text-red-500/60' : 'text-foreground/80'
                }`}>
                  {activeTask.title}
                </h1>
                {isGracePeriod && (
                  <span className="mt-1 text-[10px] font-mono text-red-500/40 tracking-[0.15em] uppercase">
                    Overdue
                  </span>
                )}
              </motion.div>
            </AnimatePresence>
          </div>
        </div>
      </div>

      {/* ═══ ZONE 3: BOTTOM — next task hint only ═══ */}
      <div className="relative z-10 px-5 pb-5">
        <div className="max-w-[320px] mx-auto">
          {nextTask && (
            <div className="flex items-center gap-2 text-[9px] font-mono text-muted-foreground/20 tracking-[0.12em] uppercase pt-1">
              <ChevronRight size={9} strokeWidth={1.5} className="opacity-40" />
              <span className="truncate">{nextTask.title}</span>
              <span className="tabular-nums ml-auto shrink-0">{formatTime12h(nextTask.time!)}</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}