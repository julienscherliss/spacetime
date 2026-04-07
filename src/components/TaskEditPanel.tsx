import { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useTaskStore, Priority, RecurrencePattern, CustomUnit } from '@/store/taskStore';
import { SubtaskList, Subtask } from '@/components/SubtaskList';
import { X, Trash2, Repeat, ChevronDown, Archive, Link, Unlink, Clock, Calendar, Inbox, CalendarCheck, XCircle, Paperclip, ExternalLink, Check, AlertTriangle, Tag } from 'lucide-react';
import { useLibraryStore } from '@/store/libraryStore';
import { formatTime12h } from '@/hooks/useCurrentTime';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar as CalendarPicker } from '@/components/ui/calendar';
import { DurationPicker } from '@/components/ScrollWheelPicker';
import { format } from 'date-fns';

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

function formatDuration(m: number): string {
  const h = Math.floor(m / 60);
  const mins = m % 60;
  if (h > 0 && mins > 0) return `${h}h ${mins}m`;
  if (h > 0) return `${h}h`;
  return `${mins}m`;
}

function formatScheduleContext(date: string, time?: string, duration?: number): string {
  const d = new Date(date + 'T12:00:00');
  const dayStr = d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
  const parts = [dayStr];
  if (time) parts.push(`at ${formatTime12h(time)}`);
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

  if (diffDays < 0) return { relative: `Overdue by ${Math.abs(diffDays)}d`, absolute, isOverdue: true };
  if (diffDays === 0) return { relative: 'Due today', absolute, isOverdue: false };
  if (diffDays === 1) return { relative: 'Tomorrow', absolute, isOverdue: false };
  return { relative: `${diffDays}d`, absolute, isOverdue: false };
}

function isValidUrl(str: string): boolean {
  try {
    const url = new URL(str);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch { return false; }
}

function getDomain(url: string): string {
  try { return new URL(url).hostname.replace('www.', ''); } catch { return url; }
}

export function TaskEditPanel() {
  const {
    tasks, editingTaskId, setEditingTask, updateTask, updateFutureInstances,
    deleteTask, deleteFutureInstances, deleteRecurrenceSeries, removeInstances,
    setFocusTask, setViewMode, generateRecurringInstances, linkSeriesFromDate,
  } = useTaskStore();
  const task = tasks.find((t) => t.id === editingTaskId);

  const [title, setTitle] = useState(task?.title || '');
  const [description, setDescription] = useState(task?.description || '');
  const [subtasks, setSubtasks] = useState<Subtask[]>(task?.subtasks || []);
  const [priority, setPriority] = useState<Priority>(task?.priority || 0);
  const [recurrenceType, setRecurrenceType] = useState(recurrenceToType(task?.recurrence));
  const [weeklyDays, setWeeklyDays] = useState<number[]>(() => {
    if (task?.recurrence?.type === 'weekly') return task.recurrence.days;
    if (task?.recurrence?.type === 'custom' && task.recurrence.days) return task.recurrence.days;
    if (task?.date) return [new Date(task.date + 'T12:00:00').getDay()];
    return [new Date().getDay()];
  });
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
  const [dueDate, setDueDate] = useState<string>(task?.dueDate || '');
  const [showDuePicker, setShowDuePicker] = useState(false);
  const [showDurationPicker, setShowDurationPicker] = useState(false);
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved'>('idle');
  const [links, setLinks] = useState<string[]>([]);
  const [linkInput, setLinkInput] = useState('');
  const [showLinkInput, setShowLinkInput] = useState(false);
  const scopeTriggeredRef = useRef(false);
  const titleInputRef = useRef<HTMLInputElement>(null);
  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

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
      const taskDay = task.date ? new Date(task.date + 'T12:00:00').getDay() : new Date().getDay();
      setWeeklyDays(
        task.recurrence?.type === 'weekly' ? task.recurrence.days :
        task.recurrence?.type === 'custom' && task.recurrence.days ? task.recurrence.days :
        [taskDay]
      );
      setCustomInterval(task.recurrence?.type === 'custom' ? task.recurrence.interval : 1);
      setCustomUnit(task.recurrence?.type === 'custom' ? task.recurrence.unit : 'weeks');
      setShowDeleteConfirm(false);
      setShowEditScope(false);
      setPendingUpdates(null);
      setDueDate(task.dueDate || '');
      setShowDuePicker(false);
      setSaveStatus('idle');
      setShowLinkInput(false);
      setLinkInput('');
      const urlRegex = /https?:\/\/[^\s]+/g;
      const foundLinks = task.description?.match(urlRegex) || [];
      setLinks(foundLinks);
      scopeTriggeredRef.current = false;
    }
  }, [task?.id]);

  useEffect(() => {
    if (task && !task.title.trim() && titleInputRef.current) {
      titleInputRef.current.focus();
    }
  }, [task?.id]);

  const buildRecurrence = (): RecurrencePattern | undefined => {
    const taskDay = task?.date ? new Date(task.date + 'T12:00:00').getDay() : new Date().getDay();
    switch (recurrenceType) {
      case 'none': return undefined;
      case 'daily': return { type: 'daily' };
      case 'weekdays': return { type: 'weekdays' };
      case 'weekly': return { type: 'weekly', days: weeklyDays.length > 0 ? weeklyDays : [taskDay] };
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
          pattern.days = weeklyDays.length > 0 ? weeklyDays : [taskDay];
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
      linkedGroupId: (recurrence && isLinked) ? (task?.linkedGroupId || task?.id || seriesId) : undefined,
      detachedFromSeries: (recurrence && !isLinked && task?.recurrenceParentId) ? true : false,
      dueDate: dueDate || undefined,
    };
  };

  const syncUpcomingInstances = () => {
    const endDate = new Date();
    endDate.setDate(endDate.getDate() + 60);
    setTimeout(() => {
      generateRecurringInstances(
        new Date().toISOString().split('T')[0],
        endDate.toISOString().split('T')[0]
      );
    }, 50);
  };

  const showSaveConfirmation = () => {
    setSaveStatus('saving');
    if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
    saveTimeoutRef.current = setTimeout(() => {
      setSaveStatus('saved');
      saveTimeoutRef.current = setTimeout(() => setSaveStatus('idle'), 1200);
    }, 300);
  };

  const handleSave = () => {
    if (!task) return;
    const updates = getUpdates();

    if (isRecurring && task.linked !== isLinked) {
      linkSeriesFromDate(task.id, task.date, isLinked);
    }

    if (isRecurring && !showEditScope) {
      const hasRecurrenceChange = JSON.stringify(task.recurrence) !== JSON.stringify(updates.recurrence);
      const hasContentChange = task.title !== updates.title || task.priority !== updates.priority;

      if (hasRecurrenceChange || hasContentChange) {
        setPendingUpdates(updates);
        setShowEditScope(true);
        scopeTriggeredRef.current = true;
        return;
      }
    }

    const parentId = task.recurrenceParentId || task.id;
    const hadRecurrence = !!task.recurrence;
    const hasRecurrence = !!updates.recurrence;
    const hasRecurrenceChange = JSON.stringify(task.recurrence) !== JSON.stringify(updates.recurrence);

    updateTask(task.id, updates);

    if (!hasRecurrence && hadRecurrence) {
      removeInstances(parentId);
      return;
    }

    if (hasRecurrence) {
      if (!task.isRecurrenceInstance && hasRecurrenceChange) {
        removeInstances(parentId);
      }
      syncUpcomingInstances();
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
      updateFutureInstances(task.id, task.date, pendingUpdates);
      removeInstances(parentId);
    } else {
      updateFutureInstances(task.id, task.date, pendingUpdates);
      syncUpcomingInstances();
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
      showSaveConfirmation();
      setTimeout(() => setEditingTask(null), 400);
    }
  };

  const addLink = () => {
    const trimmed = linkInput.trim();
    if (!trimmed) { setShowLinkInput(false); return; }
    const url = trimmed.startsWith('http') ? trimmed : `https://${trimmed}`;
    if (isValidUrl(url)) {
      setLinks(prev => [...prev, url]);
      setDescription(prev => prev ? `${prev}\n${url}` : url);
    }
    setLinkInput('');
    setShowLinkInput(false);
  };

  const removeLink = (index: number) => {
    const removed = links[index];
    setLinks(prev => prev.filter((_, i) => i !== index));
    setDescription(prev => prev.replace(removed, '').replace(/\n\n+/g, '\n').trim());
  };

  useEffect(() => {
    return () => { if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current); };
  }, []);

  const dueInfo = dueDate ? getDueDateText(dueDate) : null;

  return (
    <AnimatePresence>
      {task && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.15 }}
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-background/60 backdrop-blur-[2px]"
          onClick={(e) => {
            if (e.target === e.currentTarget) handleClose();
          }}
        >
          <motion.div
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 24 }}
            transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
            className="bg-card border border-border/50 rounded-t-lg sm:rounded-lg w-full sm:max-w-md shadow-lg max-h-[90vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            {/* ─── Header ─── */}
            <div className="px-5 pt-4 pb-2 flex items-center justify-between">
              <span className="text-[10px] font-mono text-muted-foreground/40 tracking-wider">
                {task.time ? formatScheduleContext(task.date, task.time) : formatScheduleContext(task.date)}
              </span>
              <div className="flex items-center gap-2">
                <AnimatePresence mode="wait">
                  {saveStatus === 'saving' && (
                    <motion.span key="saving" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                      className="text-[9px] font-mono text-muted-foreground/35 tracking-wider">Saving…</motion.span>
                  )}
                  {saveStatus === 'saved' && (
                    <motion.span key="saved" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                      className="flex items-center gap-1 text-[9px] font-mono text-primary/60 tracking-wider">
                      <Check size={10} /> Saved
                    </motion.span>
                  )}
                </AnimatePresence>
                <button onClick={handleClose}
                  className="text-[11px] font-mono tracking-wider text-foreground/60 hover:text-foreground transition-colors">
                  Done
                </button>
              </div>
            </div>

            <div className="px-5 pb-5">
              {/* ─── Title ─── */}
              <input
                ref={titleInputRef}
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Task name…"
                className="w-full bg-transparent font-display font-bold text-foreground text-lg leading-tight focus:outline-none placeholder:text-muted-foreground/20 mb-1"
              />

              {/* ─── Subtitle / Description ─── */}
              <textarea
                value={description}
                onChange={(e) => {
                  setDescription(e.target.value);
                  const ta = e.target;
                  ta.style.height = 'auto';
                  ta.style.height = ta.scrollHeight + 'px';
                }}
                onFocus={(e) => {
                  const ta = e.target;
                  ta.style.height = 'auto';
                  ta.style.height = ta.scrollHeight + 'px';
                }}
                placeholder="Add details, context, links…"
                rows={1}
                className="w-full bg-transparent text-[13px] font-mono text-foreground/60 placeholder:text-muted-foreground/20 focus:outline-none resize-none leading-relaxed mb-4"
                style={{ minHeight: '24px' }}
              />

              {/* ─── Metadata chips ─── */}
              <div className="flex items-center gap-1.5 flex-wrap mb-5">
                {/* Duration */}
                <Popover open={showDurationPicker} onOpenChange={setShowDurationPicker}>
                  <PopoverTrigger asChild>
                    <button className="flex items-center gap-1 px-2.5 py-1.5 rounded-full text-[10px] font-mono tracking-wide text-muted-foreground/60 hover:text-foreground bg-muted/40 hover:bg-muted/60 transition-colors">
                      <Clock size={11} strokeWidth={1.5} />
                      {formatDuration(task.duration || 30)}
                    </button>
                  </PopoverTrigger>
                  <PopoverContent className="w-56 p-3 z-[70]" align="start" onClick={(e) => e.stopPropagation()}>
                    <DurationPicker duration={task.duration || 30} onChange={(m) => updateTask(task.id, { duration: m })} />
                  </PopoverContent>
                </Popover>

                {/* Due date */}
                <Popover open={showDuePicker} onOpenChange={setShowDuePicker}>
                  <PopoverTrigger asChild>
                    <button className={`flex items-center gap-1 px-2.5 py-1.5 rounded-full text-[10px] font-mono tracking-wide transition-colors ${
                      dueInfo?.isOverdue
                        ? 'text-destructive/80 bg-destructive/10'
                        : dueDate
                          ? 'text-foreground/70 bg-muted/40'
                          : 'text-muted-foreground/40 bg-muted/30 hover:bg-muted/50'
                    }`}>
                      <CalendarCheck size={11} strokeWidth={1.5} />
                      {dueInfo ? dueInfo.relative : 'Due'}
                    </button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0 z-[70]" align="start" onClick={(e) => e.stopPropagation()}>
                    <CalendarPicker
                      mode="single"
                      selected={dueDate ? new Date(dueDate + 'T12:00:00') : undefined}
                      onSelect={(d) => {
                        if (d) setDueDate(d.toISOString().split('T')[0]);
                        else setDueDate('');
                        setShowDuePicker(false);
                      }}
                      className="p-3 pointer-events-auto"
                    />
                    {dueDate && (
                      <div className="px-3 pb-2">
                        <button onClick={() => { setDueDate(''); setShowDuePicker(false); }}
                          className="text-[10px] font-mono text-muted-foreground/40 hover:text-destructive/60">
                          Remove due date
                        </button>
                      </div>
                    )}
                  </PopoverContent>
                </Popover>

                {/* Priority chips */}
                {([0, 1, 2, 3] as Priority[]).map((p) => (
                  <button
                    key={p}
                    onClick={() => setPriority(p)}
                    className={`px-2.5 py-1.5 rounded-full text-[10px] font-mono tracking-wide transition-colors ${
                      priority === p
                        ? `${PRIORITY_COLORS[p]} bg-muted/50`
                        : 'text-muted-foreground/30 hover:text-muted-foreground/60'
                    }`}
                  >
                    {PRIORITY_LABELS[p]}
                  </button>
                ))}

                {/* Repeat */}
                <button
                  onClick={() => setShowRecurrence(!showRecurrence)}
                  className={`flex items-center gap-1 px-2.5 py-1.5 rounded-full text-[10px] font-mono tracking-wide transition-colors ${
                    recurrenceType !== 'none'
                      ? 'text-foreground/70 bg-muted/40'
                      : 'text-muted-foreground/35 bg-muted/25 hover:bg-muted/40'
                  }`}
                >
                  <Repeat size={10} strokeWidth={1.5} />
                  {recurrenceType !== 'none' ? recurrenceLabel(buildRecurrence()) : ''}
                </button>
              </div>

              {/* ─── Recurrence expanded ─── */}
              <AnimatePresence>
                {showRecurrence && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.15 }}
                    className="overflow-hidden mb-4"
                  >
                    <div className="space-y-1 pl-3 border-l-2 border-border/30">
                      {RECURRENCE_OPTIONS.map((opt) => (
                        <button
                          key={opt.value}
                          onClick={() => {
                            setRecurrenceType(opt.value);
                            if (opt.value === 'none') { setIsRoutine(false); setIsLinked(false); }
                            else if (recurrenceType === 'none') setIsRoutine(true);
                            if (opt.value === 'weekly' && task?.date) {
                              const taskDay = new Date(task.date + 'T12:00:00').getDay();
                              if (!weeklyDays.includes(taskDay)) setWeeklyDays([taskDay]);
                            }
                            if (opt.value !== 'custom') setShowRecurrence(false);
                          }}
                          className={`block w-full text-left text-[10px] font-mono tracking-wider py-1.5 px-2 rounded-sm transition-colors ${
                            recurrenceType === opt.value
                              ? 'text-foreground bg-muted/50'
                              : 'text-muted-foreground/50 hover:text-foreground hover:bg-muted/30'
                          }`}
                        >
                          {opt.label}
                        </button>
                      ))}

                      {recurrenceType === 'weekly' && (
                        <div className="pt-2">
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
                          <div className="flex items-center gap-2">
                            <input
                              type="number"
                              value={customInterval}
                              onChange={(e) => setCustomInterval(Math.max(1, Number(e.target.value)))}
                              min={1}
                              className="w-12 bg-muted/50 border border-border rounded-sm px-2 py-1.5 text-[10px] font-mono text-foreground text-center focus:outline-none"
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
                          )}
                        </div>
                      )}

                      {/* Routine + Link toggles */}
                      {recurrenceType !== 'none' && (
                        <div className="pt-2 space-y-2">
                          <div className="flex items-center justify-between">
                            <span className="text-[9px] font-mono tracking-wider text-muted-foreground/50">ROUTINE</span>
                            <button
                              onClick={() => setIsRoutine(!isRoutine)}
                              className={`relative w-7 h-4 rounded-full transition-colors ${isRoutine ? 'bg-primary/30' : 'bg-muted'}`}
                            >
                              <span className={`absolute top-0.5 w-3 h-3 rounded-full transition-all ${isRoutine ? 'left-3.5 bg-primary' : 'left-0.5 bg-muted-foreground/40'}`} />
                            </button>
                          </div>
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-1.5">
                              {isLinked ? <Link size={10} className="text-primary/50" /> : <Unlink size={10} className="text-muted-foreground/30" />}
                              <span className="text-[9px] font-mono tracking-wider text-muted-foreground/50">
                                {isLinked ? 'LINKED' : 'UNLINKED'}
                              </span>
                            </div>
                            <button
                              onClick={() => setIsLinked(!isLinked)}
                              className={`relative w-7 h-4 rounded-full transition-colors ${isLinked ? 'bg-primary/30' : 'bg-muted'}`}
                            >
                              <span className={`absolute top-0.5 w-3 h-3 rounded-full transition-all ${isLinked ? 'left-3.5 bg-primary' : 'left-0.5 bg-muted-foreground/40'}`} />
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>

              {/* ─── Subtasks ─── */}
              <div className="mb-4">
                {subtasks.length > 0 && (
                  <div className="mb-1">
                    <SubtaskList subtasks={subtasks} onChange={setSubtasks} />
                  </div>
                )}
              </div>

              {/* ─── Links ─── */}
              {links.length > 0 && (
                <div className="space-y-1 mb-3">
                  {links.map((url, i) => (
                    <div key={i} className="flex items-center gap-2 py-1 group">
                      <ExternalLink size={11} className="text-muted-foreground/30 shrink-0" />
                      <a href={url} target="_blank" rel="noopener noreferrer"
                        className="flex-1 text-[10px] font-mono text-primary/60 hover:text-primary truncate"
                        onClick={(e) => e.stopPropagation()}>
                        {getDomain(url)}
                      </a>
                      <button onClick={() => removeLink(i)}
                        className="p-0.5 text-muted-foreground/20 hover:text-destructive opacity-0 group-hover:opacity-100 transition-opacity">
                        <X size={10} />
                      </button>
                    </div>
                  ))}
                </div>
              )}
              {showLinkInput ? (
                <div className="flex items-center gap-2 mb-3">
                  <input
                    value={linkInput}
                    onChange={(e) => setLinkInput(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter') addLink(); if (e.key === 'Escape') { setShowLinkInput(false); setLinkInput(''); } }}
                    onBlur={addLink}
                    placeholder="Paste URL…"
                    className="flex-1 bg-transparent text-[11px] font-mono text-foreground placeholder:text-muted-foreground/25 focus:outline-none border-b border-primary/30 py-1"
                    autoFocus
                  />
                </div>
              ) : (
                <button
                  onClick={() => setShowLinkInput(true)}
                  className="flex items-center gap-1.5 text-[9px] font-mono tracking-wider text-muted-foreground/30 hover:text-foreground transition-colors mb-3"
                >
                  <Paperclip size={10} strokeWidth={1.5} />
                  Add link
                </button>
              )}

              {/* Move info */}
              {task.moveCount > 0 && (
                <div className="text-[8px] font-mono text-muted-foreground/35 tracking-widest mb-3">
                  MOVED {task.moveCount}× · ORIGINALLY {PRIORITY_LABELS[task.originalPriority].toUpperCase()}
                </div>
              )}

              {/* Edit scope prompt */}
              {showEditScope && (
                <div className="p-3 border border-border/40 rounded-sm bg-muted/20 mb-3">
                  <p className="text-[9px] font-mono text-foreground/60 mb-2.5">Apply changes to:</p>
                  <div className="flex gap-2">
                    <button onClick={handleSaveThisOnly}
                      className="flex-1 py-2 rounded-sm border border-border text-[9px] font-mono tracking-wider text-muted-foreground hover:text-foreground transition-colors">
                      This only
                    </button>
                    <button onClick={handleSaveAllFuture}
                      className="flex-1 py-2 rounded-sm border border-primary/20 text-[9px] font-mono tracking-wider text-primary hover:bg-primary/5 transition-colors">
                      All future
                    </button>
                  </div>
                </div>
              )}

              {/* ─── Actions ─── */}
              {!showEditScope && (
                <div className="flex items-center gap-2 pt-3 border-t border-border/20"
                  onPointerDown={(e) => e.stopPropagation()}
                  onClick={(e) => e.stopPropagation()}>
                  <button type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      if (!task) return;
                      updateTask(task.id, { inWaitingRoom: true, time: undefined });
                      setEditingTask(null);
                    }}
                    className="flex items-center gap-1.5 px-3 py-2 rounded-sm text-[9px] font-mono tracking-wider text-muted-foreground/50 hover:text-foreground hover:bg-muted/30 transition-colors"
                    title="Move to Waiting Room">
                    <Inbox size={12} strokeWidth={1.5} />
                    WAITING
                  </button>
                  <button type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      if (!task) return;
                      useLibraryStore.getState().addFromSchedule({
                        title: task.title,
                        duration: task.duration || 30,
                        category: task.category,
                        note: task.description,
                      });
                      deleteTask(task.id);
                      setEditingTask(null);
                    }}
                    className="flex items-center gap-1.5 px-3 py-2 rounded-sm text-[9px] font-mono tracking-wider text-muted-foreground/50 hover:text-foreground hover:bg-muted/30 transition-colors"
                    title="Send to Library">
                    <Archive size={12} strokeWidth={1.5} />
                    LIBRARY
                  </button>
                  <div className="flex-1" />
                  <button type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      if (!task) return;
                      if (isRecurring) {
                        setShowDeleteConfirm(true);
                      } else {
                        deleteTask(task.id);
                        setEditingTask(null);
                      }
                    }}
                    className="p-2.5 rounded-sm text-muted-foreground/35 hover:text-destructive transition-colors"
                    title="Delete task">
                    <Trash2 size={14} strokeWidth={1.5} />
                  </button>
                </div>
              )}

              {/* Delete confirmation for recurring */}
              {showDeleteConfirm && (
                <div className="p-3 border border-border/40 rounded-sm bg-muted/20 mt-2">
                  <p className="text-[9px] font-mono text-foreground/60 mb-2.5">Delete routine task?</p>
                  <div className="flex gap-2">
                    <button
                      onClick={(e) => { e.stopPropagation(); deleteTask(task.id); setEditingTask(null); }}
                      className="flex-1 py-2 rounded-sm border border-border text-[9px] font-mono tracking-wider text-muted-foreground hover:text-foreground transition-colors">
                      This only
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        const parentId = task.recurrenceParentId || task.id;
                        if (task.isRecurrenceInstance) {
                          deleteFutureInstances(parentId, task.date);
                        } else {
                          deleteRecurrenceSeries(parentId);
                        }
                        setEditingTask(null);
                      }}
                      className="flex-1 py-2 rounded-sm border border-destructive/20 text-[9px] font-mono tracking-wider text-destructive hover:bg-destructive/5 transition-colors">
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
