import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useTaskStore, Priority, RecurrencePattern, CustomUnit } from '@/store/taskStore';
import { PriorityBadge } from '@/components/PriorityBadge';
import { SubtaskList, Subtask } from '@/components/SubtaskList';
import { X, Trash2, Repeat, ChevronDown, Archive, Link, Unlink, Clock, Calendar, Inbox, CalendarCheck, XCircle } from 'lucide-react';
import { useLibraryStore } from '@/store/libraryStore';
import { formatTime12h } from '@/hooks/useCurrentTime';

const PRIORITY_LABELS = ['Flex', 'Semi', 'Fixed', 'Lock'] as const;
const PRIORITY_COLORS = [
  'border-[hsl(var(--priority-0)/0.3)] text-[hsl(var(--priority-0))]',
  'border-[hsl(var(--priority-1)/0.3)] text-[hsl(var(--priority-1))]',
  'border-[hsl(var(--priority-2)/0.3)] text-[hsl(var(--priority-2))]',
  'border-[hsl(var(--priority-3)/0.3)] text-[hsl(var(--priority-3))]',
];

const RECURRENCE_OPTIONS = [
  { label: 'No repeat', value: 'none' },
  { label: 'Daily', value: 'daily' },
  { label: 'Every weekday (Mon–Fri)', value: 'weekdays' },
  { label: 'Weekly', value: 'weekly' },
  { label: 'Monthly', value: 'monthly' },
  { label: 'Yearly', value: 'yearly' },
  { label: 'Custom...', value: 'custom' },
] as const;

const DAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const UNIT_OPTIONS: { label: string; value: CustomUnit }[] = [
  { label: 'days', value: 'days' },
  { label: 'weeks', value: 'weeks' },
  { label: 'months', value: 'months' },
  { label: 'years', value: 'years' },
];

function recurrenceToType(r?: RecurrencePattern): string {
  if (!r) return 'none';
  return r.type;
}

function recurrenceLabel(r?: RecurrencePattern): string {
  if (!r) return 'No repeat';
  switch (r.type) {
    case 'daily': return 'Daily';
    case 'weekdays': return 'Mon–Fri';
    case 'weekly': return `Weekly (${r.days.map(d => DAY_LABELS[d]).join(', ')})`;
    case 'monthly': return `Monthly (day ${r.dayOfMonth})`;
    case 'yearly': return 'Yearly';
    case 'custom': {
      const base = `Every ${r.interval} ${r.unit}`;
      if (r.unit === 'weeks' && r.days && r.days.length > 0) {
        return `${base} on ${r.days.map(d => DAY_LABELS[d]).join(', ')}`;
      }
      return base;
    }
  }
}

function formatScheduleContext(date: string, time?: string, duration?: number): string {
  const d = new Date(date + 'T12:00:00');
  const dayStr = d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
  const parts = [dayStr];
  if (time) parts.push(`at ${formatTime12h(time)}`);
  if (duration) parts.push(`· ${duration}m`);
  return parts.join(' ');
}

function getDueDateText(dueDate: string): { relative: string; absolute: string; isOverdue: boolean } {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const due = new Date(dueDate + 'T12:00:00');
  due.setHours(0, 0, 0, 0);
  const diffMs = due.getTime() - today.getTime();
  const diffDays = Math.round(diffMs / (1000 * 60 * 60 * 24));
  const absolute = due.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

  if (diffDays < 0) return { relative: `Overdue by ${Math.abs(diffDays)} day${Math.abs(diffDays) !== 1 ? 's' : ''}`, absolute, isOverdue: true };
  if (diffDays === 0) return { relative: 'Due today', absolute, isOverdue: false };
  if (diffDays === 1) return { relative: 'Due tomorrow', absolute, isOverdue: false };
  return { relative: `Due in ${diffDays} days`, absolute, isOverdue: false };
}

export function TaskEditPanel() {
  const {
    tasks, editingTaskId, setEditingTask, updateTask, updateFutureInstances,
    deleteTask, deleteFutureInstances, deleteRecurrenceSeries, removeInstances,
    setFocusTask, setViewMode, generateRecurringInstances,
  } = useTaskStore();
  const task = tasks.find((t) => t.id === editingTaskId);

  const [title, setTitle] = useState(task?.title || '');
  const [description, setDescription] = useState(task?.description || '');
  const [subtasks, setSubtasks] = useState<Subtask[]>(task?.subtasks || []);
  const [priority, setPriority] = useState<Priority>(task?.priority || 0);
  const [recurrenceType, setRecurrenceType] = useState(recurrenceToType(task?.recurrence));
  const [weeklyDays, setWeeklyDays] = useState<number[]>(
    task?.recurrence?.type === 'weekly' ? task.recurrence.days :
    task?.recurrence?.type === 'custom' && task.recurrence.days ? task.recurrence.days :
    [new Date().getDay()]
  );
  const [customInterval, setCustomInterval] = useState(
    task?.recurrence?.type === 'custom' ? task.recurrence.interval : 1
  );
  const [customUnit, setCustomUnit] = useState<CustomUnit>(
    task?.recurrence?.type === 'custom' ? task.recurrence.unit : 'weeks'
  );
  const [isRoutine, setIsRoutine] = useState(task?.isRoutine !== false && task?.type === 'recurring');
  const [isLinked, setIsLinked] = useState(task?.linked || false);
  const [showRecurrence, setShowRecurrence] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [showEditScope, setShowEditScope] = useState(false);
  const [pendingUpdates, setPendingUpdates] = useState<any>(null);
  const scopeTriggeredRef = useRef(false);
  const titleInputRef = useRef<HTMLInputElement>(null);

  const isRecurring = !!(task?.recurrence || task?.isRecurrenceInstance);

  useEffect(() => {
    if (task) {
      setTitle(task.title);
      setDescription(task.description || '');
      setSubtasks(task.subtasks || []);
      setPriority(task.priority);
      setIsRoutine(task.isRoutine !== false && task.type === 'recurring');
      setIsLinked(task.linked || false);
      setRecurrenceType(recurrenceToType(task.recurrence));
      setWeeklyDays(
        task.recurrence?.type === 'weekly' ? task.recurrence.days :
        task.recurrence?.type === 'custom' && task.recurrence.days ? task.recurrence.days :
        [new Date().getDay()]
      );
      setCustomInterval(task.recurrence?.type === 'custom' ? task.recurrence.interval : 1);
      setCustomUnit(task.recurrence?.type === 'custom' ? task.recurrence.unit : 'weeks');
      setShowDeleteConfirm(false);
      setShowEditScope(false);
      setPendingUpdates(null);
      scopeTriggeredRef.current = false;
    }
  }, [task?.id]);

  // Auto-focus title for new tasks
  useEffect(() => {
    if (task && titleInputRef.current) {
      titleInputRef.current.focus();
    }
  }, [task?.id]);

  const buildRecurrence = (): RecurrencePattern | undefined => {
    switch (recurrenceType) {
      case 'none': return undefined;
      case 'daily': return { type: 'daily' };
      case 'weekdays': return { type: 'weekdays' };
      case 'weekly': return { type: 'weekly', days: weeklyDays.length > 0 ? weeklyDays : [new Date().getDay()] };
      case 'monthly': return { type: 'monthly', dayOfMonth: new Date((task?.date || '') + 'T12:00:00').getDate() };
      case 'yearly': {
        const d = new Date((task?.date || '') + 'T12:00:00');
        return { type: 'yearly', month: d.getMonth(), dayOfMonth: d.getDate() };
      }
      case 'custom': {
        const pattern: RecurrencePattern = {
          type: 'custom',
          interval: Math.max(1, customInterval),
          unit: customUnit,
        };
        if (customUnit === 'weeks') {
          pattern.days = weeklyDays.length > 0 ? weeklyDays : [new Date().getDay()];
        }
        return pattern;
      }
      default: return undefined;
    }
  };

  const getUpdates = () => {
    const recurrence = buildRecurrence();
    const parentId = task?.recurrenceParentId || task?.id;
    const seriesId = task?.seriesId || parentId;
    return {
      title,
      description: description || undefined,
      subtasks: subtasks.length > 0 ? subtasks : undefined,
      priority,
      recurrence,
      type: recurrence ? 'recurring' as const : 'one-time' as const,
      isRoutine: recurrence ? isRoutine : false,
      linked: recurrence ? isLinked : false,
      linkedGroupId: (recurrence && isLinked) ? (task?.linkedGroupId || seriesId) : undefined,
      detachedFromSeries: (recurrence && !isLinked && task?.recurrenceParentId) ? true : false,
    };
  };

  const regenerateInstances = (parentId: string) => {
    removeInstances(parentId);
    const endDate = new Date();
    endDate.setDate(endDate.getDate() + 60);
    setTimeout(() => {
      generateRecurringInstances(
        new Date().toISOString().split('T')[0],
        endDate.toISOString().split('T')[0]
      );
    }, 50);
  };

  const handleSave = () => {
    if (!task) return;
    const updates = getUpdates();

    if (isRecurring && !showEditScope) {
      const hasRecurrenceChange = JSON.stringify(task.recurrence) !== JSON.stringify(updates.recurrence);
      const hasContentChange = task.title !== updates.title || task.priority !== updates.priority;
      const onlyLinkedChanged = !hasRecurrenceChange && !hasContentChange && task.linked !== updates.linked;

      if ((hasRecurrenceChange || hasContentChange) && !onlyLinkedChanged) {
        setPendingUpdates(updates);
        setShowEditScope(true);
        scopeTriggeredRef.current = true;
        return;
      }
    }

    const parentId = task.recurrenceParentId || task.id;
    const hadRecurrence = !!task.recurrence;
    const hasRecurrence = !!updates.recurrence;

    updateTask(task.id, updates);

    if (!hasRecurrence && hadRecurrence) {
      removeInstances(parentId);
    }
    if (hasRecurrence) {
      regenerateInstances(parentId);
    }
  };

  const handleSaveThisOnly = () => {
    if (!task || !pendingUpdates) return;
    updateTask(task.id, { ...pendingUpdates, date: task.date });
    setShowEditScope(false);
    setPendingUpdates(null);
    scopeTriggeredRef.current = false;
    setEditingTask(null);
  };

  const handleSaveAllFuture = () => {
    if (!task || !pendingUpdates) return;
    const parentId = task.recurrenceParentId || task.id;

    if (!pendingUpdates.recurrence && task.recurrence) {
      updateFutureInstances(parentId, pendingUpdates);
      removeInstances(parentId);
    } else {
      updateFutureInstances(parentId, pendingUpdates);
      regenerateInstances(parentId);
    }

    setShowEditScope(false);
    setPendingUpdates(null);
    scopeTriggeredRef.current = false;
    setEditingTask(null);
  };

  const handleClose = () => {
    if (showEditScope) return;
    scopeTriggeredRef.current = false;
    handleSave();
    if (!scopeTriggeredRef.current) {
      setEditingTask(null);
    }
  };

  return (
    <AnimatePresence>
      {task && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.15 }}
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-background/60 backdrop-blur-[2px]"
          onClick={handleClose}
        >
          <motion.div
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 24 }}
            transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
            className="bg-card border border-border rounded-t-lg sm:rounded-sm w-full sm:max-w-sm shadow-lg max-h-[90vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            {/* ─── Schedule context (read-only) ─── */}
            <div className="px-4 pt-3 pb-2 border-b border-border/30 flex items-center gap-2 text-[10px] font-mono text-muted-foreground/50">
              <Calendar size={10} strokeWidth={1.5} />
              <span>{formatScheduleContext(task.date, task.time, task.duration)}</span>
              {isRecurring && (
                <>
                  <span className="text-muted-foreground/20">·</span>
                  <Repeat size={9} strokeWidth={1.5} />
                  <span>{recurrenceLabel(task.recurrence)}</span>
                </>
              )}
            </div>

            <div className="p-4 space-y-4">
              {/* ─── 1. Title ─── */}
              <div>
                <input
                  ref={titleInputRef}
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="Task name..."
                  className="w-full bg-transparent font-display font-bold text-foreground text-base leading-tight focus:outline-none placeholder:text-muted-foreground/20"
                />
              </div>

              {/* ─── 2. Priority ─── */}
              <div>
                <div className="flex gap-1.5">
                  {([0, 1, 2, 3] as Priority[]).map((p) => (
                    <button
                      key={p}
                      onClick={() => setPriority(p)}
                      className={`flex-1 py-2 rounded-sm text-[10px] font-mono tracking-wider border transition-colors ${
                        priority === p
                          ? `${PRIORITY_COLORS[p]} bg-muted/60`
                          : 'border-border text-muted-foreground/40 hover:border-border hover:text-muted-foreground/60'
                      }`}
                    >
                      {PRIORITY_LABELS[p]}
                    </button>
                  ))}
                </div>
                {/* Link/unlink for recurring */}
                {isRecurring && (
                  <div className="mt-2 flex items-center justify-between">
                    <div className="flex items-center gap-1.5">
                      {isLinked ? <Link size={10} className="text-primary/50" /> : <Unlink size={10} className="text-muted-foreground/30" />}
                      <span className="text-[9px] font-mono tracking-wider text-muted-foreground/50">
                        {isLinked ? 'LINKED' : 'UNLINKED'}
                      </span>
                    </div>
                    <button
                      onClick={() => setIsLinked(!isLinked)}
                      className={`relative w-7 h-4 rounded-full transition-colors ${
                        isLinked ? 'bg-primary/30' : 'bg-muted'
                      }`}
                    >
                      <span
                        className={`absolute top-0.5 w-3 h-3 rounded-full transition-all ${
                          isLinked ? 'left-3.5 bg-primary' : 'left-0.5 bg-muted-foreground/40'
                        }`}
                      />
                    </button>
                  </div>
                )}
              </div>

              {/* ─── 3. Notes / description ─── */}
              <div>
                <label className="block text-[8px] font-mono tracking-widest text-muted-foreground/40 mb-1.5">NOTES</label>
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Add details, context, links..."
                  rows={3}
                  className="w-full bg-muted/30 border border-border/50 rounded-sm px-3 py-2 text-[11px] font-mono text-foreground/70 placeholder:text-muted-foreground/20 focus:outline-none focus:border-primary/20 resize-none leading-relaxed"
                />
              </div>

              {/* ─── 4. Subtasks ─── */}
              <div>
                <label className="block text-[8px] font-mono tracking-widest text-muted-foreground/40 mb-1.5">
                  SUBTASKS {subtasks.length > 0 && (
                    <span className="text-muted-foreground/25 ml-1">
                      {subtasks.filter(s => s.completed).length}/{subtasks.length}
                    </span>
                  )}
                </label>
                <div className="bg-muted/20 border border-border/30 rounded-sm p-2">
                  <SubtaskList subtasks={subtasks} onChange={setSubtasks} />
                </div>
              </div>

              {/* ─── 5. Advanced (collapsed) ─── */}
              <div className="border-t border-border/20 pt-3">
                <button
                  onClick={() => setShowRecurrence(!showRecurrence)}
                  className="flex items-center gap-1.5 text-[9px] font-mono tracking-wider text-muted-foreground/40 hover:text-foreground transition-colors w-full"
                >
                  <Repeat size={10} strokeWidth={1.5} />
                  <span className="flex-1 text-left">{recurrenceLabel(buildRecurrence())}</span>
                  <ChevronDown size={9} className={`transition-transform ${showRecurrence ? 'rotate-180' : ''}`} />
                </button>

                <AnimatePresence>
                  {showRecurrence && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: 'auto', opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.15 }}
                      className="overflow-hidden"
                    >
                      <div className="mt-2 space-y-1 pl-4 border-l border-border/50">
                        {RECURRENCE_OPTIONS.map((opt) => (
                          <button
                            key={opt.value}
                            onClick={() => {
                              setRecurrenceType(opt.value);
                              if (opt.value === 'none') {
                                setIsRoutine(false);
                                setIsLinked(false);
                              } else if (recurrenceType === 'none') {
                                setIsRoutine(true);
                              }
                              if (opt.value !== 'custom') {
                                setShowRecurrence(false);
                              }
                            }}
                            className={`block w-full text-left text-[9px] font-mono tracking-wider py-1.5 px-2 rounded-sm transition-colors ${
                              recurrenceType === opt.value
                                ? 'text-foreground bg-muted/60'
                                : 'text-muted-foreground/50 hover:text-foreground hover:bg-muted/30'
                            }`}
                          >
                            {opt.label}
                          </button>
                        ))}

                        {recurrenceType === 'weekly' && (
                          <div className="pt-2">
                            <label className="block text-[7px] font-mono tracking-widest text-muted-foreground/40 mb-1.5">REPEAT ON</label>
                            <div className="flex gap-1">
                              {DAY_LABELS.map((label, i) => (
                                <button
                                  key={i}
                                  onClick={() => {
                                    setWeeklyDays(prev =>
                                      prev.includes(i)
                                        ? prev.length > 1 ? prev.filter(d => d !== i) : prev
                                        : [...prev, i]
                                    );
                                  }}
                                  className={`w-7 h-7 rounded-sm text-[8px] font-mono transition-colors ${
                                    weeklyDays.includes(i)
                                      ? 'bg-primary/10 text-primary border border-primary/20'
                                      : 'text-muted-foreground/40 border border-border hover:border-border'
                                  }`}
                                >
                                  {label[0]}
                                </button>
                              ))}
                            </div>
                          </div>
                        )}

                        {recurrenceType === 'custom' && (
                          <div className="pt-2 space-y-2.5">
                            <label className="block text-[7px] font-mono tracking-widest text-muted-foreground/40">REPEAT EVERY</label>
                            <div className="flex items-center gap-2">
                              <input
                                type="number"
                                value={customInterval}
                                onChange={(e) => setCustomInterval(Math.max(1, Number(e.target.value)))}
                                min={1}
                                className="w-12 bg-muted/50 border border-border rounded-sm px-2 py-1.5 text-[10px] font-mono text-foreground text-center focus:outline-none focus:ring-1 focus:ring-primary/30"
                              />
                              <div className="flex gap-0.5">
                                {UNIT_OPTIONS.map((u) => (
                                  <button
                                    key={u.value}
                                    onClick={() => setCustomUnit(u.value)}
                                    className={`px-2 py-1.5 rounded-sm text-[8px] font-mono tracking-wider border transition-colors ${
                                      customUnit === u.value
                                        ? 'text-foreground bg-muted/60 border-border'
                                        : 'text-muted-foreground/40 border-transparent hover:text-foreground'
                                    }`}
                                  >
                                    {u.label}
                                  </button>
                                ))}
                              </div>
                            </div>

                            {customUnit === 'weeks' && (
                              <div>
                                <label className="block text-[7px] font-mono tracking-widest text-muted-foreground/40 mb-1.5">ON THESE DAYS</label>
                                <div className="flex gap-1">
                                  {DAY_LABELS.map((label, i) => (
                                    <button
                                      key={i}
                                      onClick={() => {
                                        setWeeklyDays(prev =>
                                          prev.includes(i)
                                            ? prev.length > 1 ? prev.filter(d => d !== i) : prev
                                            : [...prev, i]
                                        );
                                      }}
                                      className={`w-7 h-7 rounded-sm text-[8px] font-mono transition-colors ${
                                        weeklyDays.includes(i)
                                          ? 'bg-primary/10 text-primary border border-primary/20'
                                          : 'text-muted-foreground/40 border border-border hover:border-border'
                                      }`}
                                    >
                                      {label[0]}
                                    </button>
                                  ))}
                                </div>
                              </div>
                            )}

                            {customUnit === 'months' && (
                              <p className="text-[8px] font-mono text-muted-foreground/40">
                                On day {new Date((task?.date || '') + 'T12:00:00').getDate()} of each month
                              </p>
                            )}
                          </div>
                        )}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>

                {/* Routine toggle */}
                {recurrenceType !== 'none' && (
                  <div className="mt-2 flex items-center justify-between">
                    <span className="text-[9px] font-mono tracking-wider text-muted-foreground/50">
                      ROUTINE
                    </span>
                    <button
                      onClick={() => setIsRoutine(!isRoutine)}
                      className={`relative w-7 h-4 rounded-full transition-colors ${
                        isRoutine ? 'bg-primary/30' : 'bg-muted'
                      }`}
                    >
                      <span
                        className={`absolute top-0.5 w-3 h-3 rounded-full transition-all ${
                          isRoutine ? 'left-3.5 bg-primary' : 'left-0.5 bg-muted-foreground/40'
                        }`}
                      />
                    </button>
                  </div>
                )}
              </div>

              {/* Move info */}
              {task.moveCount > 0 && (
                <div className="text-[8px] font-mono text-muted-foreground/30 tracking-widest">
                  MOVED {task.moveCount}× · ORIGINALLY {PRIORITY_LABELS[task.originalPriority].toUpperCase()}
                </div>
              )}

              {/* Edit scope prompt */}
              {showEditScope && (
                <div className="p-2.5 border border-border rounded-sm bg-muted/30">
                  <p className="text-[9px] font-mono text-foreground/70 mb-2">Apply changes to:</p>
                  <div className="flex gap-1.5">
                    <button
                      onClick={handleSaveThisOnly}
                      className="flex-1 py-1.5 rounded-sm border border-border text-[8px] font-mono tracking-wider text-muted-foreground hover:text-foreground transition-colors"
                    >
                      This only
                    </button>
                    <button
                      onClick={handleSaveAllFuture}
                      className="flex-1 py-1.5 rounded-sm border border-primary/20 text-[8px] font-mono tracking-wider text-primary hover:bg-primary/5 transition-colors"
                    >
                      All future
                    </button>
                  </div>
                </div>
              )}

              {/* ─── 6. Actions ─── */}
              {!showEditScope && (
                <div className="flex items-center gap-1.5 pt-2 border-t border-border/20">
                  <button
                    onClick={() => {
                      if (!task) return;
                      updateTask(task.id, { inWaitingRoom: true, time: undefined });
                      setEditingTask(null);
                    }}
                    className="flex items-center gap-1.5 px-3 py-2 rounded-sm border border-border text-[9px] font-mono tracking-wider text-muted-foreground/50 hover:text-foreground hover:border-primary/20 transition-colors"
                    title="Move to Waiting Room"
                  >
                    <Inbox size={11} strokeWidth={1.5} />
                    WAITING
                  </button>
                  <button
                    onClick={() => {
                      if (!task) return;
                      useLibraryStore.getState().addFromSchedule(task.title, task.duration || 30);
                      deleteTask(task.id);
                      setEditingTask(null);
                    }}
                    className="flex items-center gap-1.5 px-3 py-2 rounded-sm border border-border text-[9px] font-mono tracking-wider text-muted-foreground/50 hover:text-foreground hover:border-primary/20 transition-colors"
                    title="Send to Library"
                  >
                    <Archive size={11} strokeWidth={1.5} />
                    LIBRARY
                  </button>
                  <div className="flex-1" />
                  <button
                    onClick={() => {
                      if (isRecurring) {
                        setShowDeleteConfirm(true);
                      } else {
                        deleteTask(task.id);
                        setEditingTask(null);
                      }
                    }}
                    className="p-2 rounded-sm border border-border text-muted-foreground/40 hover:text-destructive hover:border-destructive/20 transition-colors"
                  >
                    <Trash2 size={12} strokeWidth={1.5} />
                  </button>
                </div>
              )}

              {/* Delete confirmation for recurring */}
              {showDeleteConfirm && (
                <div className="p-2.5 border border-border rounded-sm bg-muted/30">
                  <p className="text-[9px] font-mono text-foreground/70 mb-2">Delete routine task?</p>
                  <div className="flex gap-1.5">
                    <button
                      onClick={() => { deleteTask(task.id); setEditingTask(null); }}
                      className="flex-1 py-1.5 rounded-sm border border-border text-[8px] font-mono tracking-wider text-muted-foreground hover:text-foreground transition-colors"
                    >
                      This only
                    </button>
                    <button
                      onClick={() => {
                        const parentId = task.recurrenceParentId || task.id;
                        if (task.isRecurrenceInstance) {
                          deleteFutureInstances(parentId, task.date);
                        } else {
                          deleteRecurrenceSeries(parentId);
                        }
                      }}
                      className="flex-1 py-1.5 rounded-sm border border-destructive/20 text-[8px] font-mono tracking-wider text-destructive hover:bg-destructive/5 transition-colors"
                    >
                      All future
                    </button>
                  </div>
                </div>
              )}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
