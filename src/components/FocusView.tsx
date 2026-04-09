import { useState, useRef, useCallback, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useTaskStore } from '@/store/taskStore';
import { useCurrentTime, timeToMinutes, formatTime12h } from '@/hooks/useCurrentTime';
import { ChevronUp, ChevronDown, ChevronRight, Paperclip, ExternalLink, Check, Calendar as CalendarIcon, Tag } from 'lucide-react';
import { SegmentedProgressRing } from '@/components/SegmentedProgressRing';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { cn } from '@/lib/utils';

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

  const todayTasks = tasks
    .filter((t) => !t.completed && !t.inWaitingRoom && !t.archivedAt && t.date === today && t.time &&
      !(!routinesEnabled && t.isRoutine !== false && t.type === 'recurring'))
    .sort((a, b) => (a.time || '').localeCompare(b.time || ''));

  const upcomingTasks = todayTasks.filter((t) => {
    if (!t.time) return false;
    const start = timeToMinutes(t.time);
    return start > nowMinutes;
  });

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
    .sort((a, b) => (a.time || '').localeCompare(b.time || ''));

  const activeTask = todayTasks.find((t) => {
    if (!t.time) return false;
    const start = timeToMinutes(t.time);
    const end = start + (t.duration || 30);
    return nowMinutes >= start && nowMinutes < end;
  });

  const elapsed = activeTask?.time ? nowMinutes - timeToMinutes(activeTask.time) : 0;
  const remaining = activeTask ? (activeTask.duration || 30) - elapsed : 0;
  const nextTask = activeTask ? getNextTask(activeTask.id) : todayTasks[0];

  // Overdue tasks: ended but not completed, not the active task
  const overdueTasks = todayTasks.filter((t) => {
    if (!t.time || t.id === activeTask?.id) return false;
    const end = timeToMinutes(t.time) + (t.duration || 30);
    return nowMinutes >= end;
  });

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

  useEffect(() => {
    return () => {
      if (holdTimerRef.current) cancelAnimationFrame(holdTimerRef.current);
    };
  }, []);

  const showUpArrow = activePanel === 'main' && (completedToday.length > 0 || upcomingTasks.length > 0);
  const showDownArrow = activePanel === 'main';

  return (
    <div
      className="relative overflow-hidden"
      style={{ height: 'calc(100vh - 48px)' }}
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
          className="absolute left-1/2 -translate-x-1/2 top-2 z-20 p-2 text-muted-foreground/30 hover:text-muted-foreground/50 transition-colors"
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
          <motion.div
            key="completed"
            initial={{ opacity: 0, y: -40 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -40 }}
            transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
            className="absolute inset-0 flex flex-col pt-8 pb-16 px-6 overflow-y-auto"
          >
            {/* Completed section */}
            <div className="w-full max-w-sm mx-auto mb-6">
              <div className="text-[10px] font-mono tracking-[0.25em] text-muted-foreground/50 mb-3 uppercase">
                Completed · {completedCount}
              </div>
              <div className="space-y-1">
                {completedToday.length === 0 ? (
                  <p className="text-center text-muted-foreground/30 font-mono text-[12px] py-3">Nothing yet</p>
                ) : (
                  <>
                    {(completedExpanded ? completedToday : completedToday.slice(-5)).map((task) => (
                      <div key={task.id} className="flex items-center gap-3 py-2.5 px-3">
                        <div className="w-1.5 h-1.5 rounded-full bg-muted-foreground/30 shrink-0" />
                        <button
                          onClick={() => setEditingTask(task.id)}
                          className="text-[13px] font-mono text-muted-foreground/50 line-through truncate flex-1 text-left"
                        >
                          {task.title}
                        </button>
                        {task.time && (
                          <button
                            onClick={() => {
                              setListReturnZoom({ taskTime: task.time!, taskDuration: task.duration || 30 });
                              setShowListReturn(true);
                              setDaySubMode('timeline');
                              setViewMode('day');
                            }}
                            className="text-[10px] font-mono text-muted-foreground/30 tabular-nums shrink-0 active:text-muted-foreground/60"
                          >
                            {formatTime12h(task.time)}
                          </button>
                        )}
                      </div>
                    ))}
                    {completedToday.length > 5 && (
                      <button
                        onClick={() => setCompletedExpanded(!completedExpanded)}
                        className="w-full text-center py-2 text-[10px] font-mono tracking-[0.15em] text-muted-foreground/35 hover:text-muted-foreground/55 transition-colors uppercase"
                      >
                        {completedExpanded ? 'Show less' : `+ ${completedToday.length - 5} more`}
                      </button>
                    )}
                  </>
                )}
              </div>
            </div>

            {/* Divider */}
            <div className="w-full max-w-sm mx-auto h-px bg-foreground/[0.06] mb-6" />

            {/* Upcoming section */}
            <div className="w-full max-w-sm mx-auto">
              <div className="text-[10px] font-mono tracking-[0.25em] text-muted-foreground/50 mb-3 uppercase">
                Upcoming · {upcomingTasks.length}
              </div>
              <div className="space-y-1">
                {upcomingTasks.length === 0 ? (
                  <p className="text-center text-muted-foreground/30 font-mono text-[12px] py-3">Nothing upcoming</p>
                ) : (
                  upcomingTasks.map((task) => (
                    <div key={task.id} className="flex items-center gap-3 py-2.5 px-3">
                      <div className="w-1.5 h-1.5 rounded-full bg-primary/40 shrink-0" />
                      <button
                        onClick={() => setEditingTask(task.id)}
                        className="text-[13px] font-mono text-foreground/70 truncate flex-1 text-left"
                      >
                        {task.title}
                      </button>
                      {task.time && (
                        <button
                          onClick={() => {
                            setListReturnZoom({ taskTime: task.time!, taskDuration: task.duration || 30 });
                            setShowListReturn(true);
                            setDaySubMode('timeline');
                            setViewMode('day');
                          }}
                          className="text-[10px] font-mono text-muted-foreground/35 tabular-nums shrink-0 active:text-muted-foreground/60"
                        >
                          {formatTime12h(task.time)}
                        </button>
                      )}
                    </div>
                  ))
                )}
              </div>
            </div>

            <button
              onClick={() => setActivePanel('main')}
              className="self-center mt-8 p-2 text-muted-foreground/30 hover:text-muted-foreground/50 transition-colors"
            >
              <ChevronDown size={40} strokeWidth={1.5} />
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
              overdueTasks={overdueTasks}
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

// ── Task Detail Panel (swipe-up content) ──
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
        <input
          autoFocus
          value={titleDraft}
          onChange={(e) => setTitleDraft(e.target.value)}
          onBlur={() => {
            if (titleDraft.trim() && titleDraft !== task.title) {
              onUpdateTask(task.id, { title: titleDraft.trim() });
            }
            setEditingTitle(false);
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
            if (e.key === 'Escape') setEditingTitle(false);
          }}
          className="text-xl font-display font-bold text-foreground leading-tight bg-transparent border-b border-foreground/10 focus:border-foreground/30 outline-none pb-1 w-full"
        />
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
            <a
              key={i}
              href={att.url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 px-2.5 py-1.5 border border-border/15 rounded-md text-[10px] font-mono text-foreground/35 hover:text-foreground/55 hover:border-border/30 transition-colors"
            >
              <Paperclip size={9} />
              <span className="truncate max-w-[120px]">{att.name}</span>
            </a>
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
}

function MainFocusPanel({
  activeTask, nextTask, remaining, nowMinutes,
  holdProgress, isHolding, onHoldStart, onHoldEnd, onUpdateTask, overdueTasks,
}: MainFocusPanelProps) {
  const autoCompleteRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [completing, setCompleting] = useState(false);
  const { completeTask } = useTaskStore();

  useEffect(() => {
    if (remaining <= 0 && activeTask && !completing) {
      setCompleting(true);
      autoCompleteRef.current = setTimeout(() => {
        completeTask(activeTask.id);
        setCompleting(false);
      }, 500);
    }
    return () => {
      if (autoCompleteRef.current) clearTimeout(autoCompleteRef.current);
    };
  }, [remaining, activeTask?.id, completing, completeTask]);

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

    return (
      <div className="flex flex-col h-full">
        {/* ── Top status strip ── */}
        <div className="flex items-center justify-between px-5 py-3">
          <span className="text-[9px] font-mono tracking-[0.2em] text-muted-foreground/30 uppercase">Focus</span>
          <span className="text-[9px] font-mono text-muted-foreground/20 tabular-nums tracking-wider">—</span>
        </div>

        {/* ── Center ── */}
        <div className="flex-1 flex flex-col items-center justify-center px-6">
          {hasOverdue ? (
            <>
              <div className="font-display text-[64px] sm:text-[80px] font-bold text-primary/70 leading-none tabular-nums tracking-tight select-none">
                +{overdueH}:{overdueM}
              </div>
              <h1 className="mt-3 text-sm font-display font-medium text-primary/60 leading-tight text-center uppercase">
                {overdueTasks.length === 1 ? overdueTasks[0].title : `${overdueTasks.length} tasks`}
              </h1>
              <span className="mt-1 text-[10px] font-mono text-primary/35 tracking-[0.15em] uppercase">
                Overdue
              </span>
            </>
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
  const remainingH = String(Math.floor(clampedRemaining / 60)).padStart(2, '0');
  const remainingM = String(clampedRemaining % 60).padStart(2, '0');
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
      {/* ═══ BACKGROUND GRID — subtle structural lines ═══ */}
      <div className="absolute inset-0 pointer-events-none" aria-hidden>
        <div className="absolute inset-x-0 top-[33%] h-px bg-foreground/[0.03]" />
        <div className="absolute inset-x-0 top-[66%] h-px bg-foreground/[0.03]" />
        <div className="absolute inset-y-0 left-1/2 w-px bg-foreground/[0.02]" />
        <div className="absolute top-0 bottom-0 left-4 w-px bg-foreground/[0.02]" />
        <div className="absolute top-0 bottom-0 right-4 w-px bg-foreground/[0.02]" />
      </div>

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
                  className="font-display text-[64px] sm:text-[80px] font-bold text-foreground leading-none tabular-nums tracking-tight select-none"
                  animate={completing ? { scale: 0.95, opacity: 0.3 } : { scale: 1, opacity: 1 }}
                  transition={{ duration: 0.25, ease: 'easeOut' }}
                >
                  {remainingH}:{remainingM}
                </motion.div>

                <h1 className="mt-2 text-sm sm:text-base font-display font-medium text-foreground/80 leading-snug text-center max-w-[220px] uppercase">
                  {activeTask.title}
                </h1>
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