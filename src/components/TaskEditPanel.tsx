import { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useTaskStore, Priority, RecurrencePattern, CustomUnit, NthWeekday, NthWeek } from '@/store/taskStore';
import { SubtaskList, Subtask } from '@/components/SubtaskList';
import { X, Trash2, Repeat, ChevronDown, Archive, Link, Unlink, Clock, Calendar, Inbox, CalendarCheck, XCircle, Paperclip, ExternalLink, Check, AlertTriangle, Tag, Upload, FileText, Bell, PauseCircle, Layers } from 'lucide-react';
import { GroupNamePrompt } from '@/components/GroupNamePrompt';
import { AttachmentLightbox } from '@/components/AttachmentLightbox';
import { useTimezoneStore } from '@/store/timezoneStore';
import { supabase } from '@/integrations/supabase/client';
import { useLibraryStore } from '@/store/libraryStore';
import { TagAutocomplete } from '@/components/TagAutocomplete';
import { TagPickerMenu } from '@/components/TagPickerMenu';
import { formatTime12h } from '@/hooks/useCurrentTime';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar as CalendarPicker } from '@/components/ui/calendar';
import { DurationPicker } from '@/components/ScrollWheelPicker';
import { format } from 'date-fns';
import { DescriptionWithLinks } from '@/components/DescriptionWithLinks';
import { toast } from 'sonner';
import { useColorSchemeStore } from '@/store/colorSchemeStore';

const PRIORITY_LABELS = ['Flex', 'Semi', 'Fixed', 'Lock'] as const;

const RECURRENCE_OPTIONS = [
  { label: 'No repeat', value: 'none' },
  { label: 'Daily', value: 'daily' },
  { label: 'Every weekday (Mon–Fri)', value: 'weekdays' },
  { label: 'Weekly', value: 'weekly' },
  { label: 'Monthly (by date)', value: 'monthly' },
  { label: 'Monthly (by weekday)', value: 'monthlyNth' },
  { label: 'Yearly', value: 'yearly' },
  { label: 'Custom...', value: 'custom' },
] as const;

const DAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const NTH_WEEK_LABELS: { label: string; value: 1 | 2 | 3 | 4 | -1 }[] = [
  { label: '1st', value: 1 },
  { label: '2nd', value: 2 },
  { label: '3rd', value: 3 },
  { label: '4th', value: 4 },
  { label: 'Last', value: -1 },
];
const UNIT_OPTIONS: { label: string; value: CustomUnit }[] = [
  { label: 'days', value: 'days' },
  { label: 'weeks', value: 'weeks' },
  { label: 'months', value: 'months' },
  { label: 'years', value: 'years' },
];

const REMINDER_OPTIONS: { label: string; value: number }[] = [
  { label: 'At start', value: 0 },
  { label: '5 min', value: 5 },
  { label: '10 min', value: 10 },
  { label: '15 min', value: 15 },
  { label: '30 min', value: 30 },
  { label: '1 hour', value: 60 },
  { label: '2 hours', value: 120 },
  { label: '4 hours', value: 240 },
  { label: '8 hours', value: 480 },
  { label: '12 hours', value: 720 },
  { label: '24 hours', value: 1440 },
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
    case 'monthlyNth': {
      const labels = r.positions.map((p) => {
        const wk = NTH_WEEK_LABELS.find((w) => w.value === p.week)?.label ?? `${p.week}`;
        return `${wk} ${DAY_LABELS[p.day]}`;
      });
      return `Monthly (${labels.join(', ')})`;
    }
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
    convertTaskToGroup,
  } = useTaskStore();
  const task = tasks.find((t) => t.id === editingTaskId);
  const [showGroupPrompt, setShowGroupPrompt] = useState(false);

  // If the editing target is a Group, the dedicated GroupEditPanel handles it.
  // We need to render nothing here, but we MUST keep all hooks running in
  // order — so the gate is applied at the JSX level, not as an early return.
  const isGroup = task?.type === 'group';

  const [title, setTitle] = useState(task?.title || '');
  const [description, setDescription] = useState(task?.description || '');
  const [subtasks, setSubtasks] = useState<Subtask[]>(task?.subtasks || []);
  const [priority, setPriority] = useState<Priority>(task?.priority || 0);
  const activeScheme = useColorSchemeStore((s) => s.getActiveScheme());
  // Per-priority chip color: always use the scheme's FILL color so the chip
  // matches exactly what the user picked in the theme editor.
  const getPriorityColor = (p: Priority): string => activeScheme.priorities[p].fill;
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
  const [nthPositions, setNthPositions] = useState<NthWeekday[]>(() => {
    if (task?.recurrence?.type === 'monthlyNth') return task.recurrence.positions;
    if (task?.date) {
      const dt = new Date(task.date + 'T12:00:00');
      // Default: same day-of-week, same nth occurrence within month
      const dayOfMonth = dt.getDate();
      const week = (Math.ceil(dayOfMonth / 7) as 1 | 2 | 3 | 4 | -1);
      return [{ week, day: dt.getDay() }];
    }
    return [{ week: 1, day: new Date().getDay() }];
  });
  // Routine is OFF by default for new recurring tasks — user must opt in via the chip.
  const [isRoutine, setIsRoutine] = useState(task?.isRoutine === true && task?.type === 'recurring');
  const [isLinked, setIsLinked] = useState(task?.recurrence ? true : (task?.linked || false));
  const [showRecurrence, setShowRecurrence] = useState(false);
  const [showCatPicker, setShowCatPicker] = useState(false);
  const [taskCategory, setTaskCategory] = useState(task?.category || '');
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [dueDate, setDueDate] = useState<string>(task?.dueDate || '');
  const [showDuePicker, setShowDuePicker] = useState(false);
  const [showDurationPicker, setShowDurationPicker] = useState(false);
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved'>('idle');
  const [attachments, setAttachments] = useState<{ name: string; url: string; type: string }[]>(
    (task?.attachments || []).filter((a: any) => a.type !== 'link')
  );
  const [isUploading, setIsUploading] = useState(false);
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);
  const [reminders, setReminders] = useState<number[]>(task?.reminders || []);
  const [showReminderModal, setShowReminderModal] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  const titleInputRef = useRef<HTMLInputElement>(null);
  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const isRecurring = !!(task?.recurrence || task?.isRecurrenceInstance) && recurrenceType !== 'none';

  useEffect(() => {
    if (task) {
      setTitle(task.title);
      setDescription(task.description || '');
      setSubtasks(task.subtasks || []);
      setPriority(task.priority);
      setIsRoutine(task.isRoutine === true && task.type === 'recurring');
      setIsLinked(task.recurrence ? true : (task.linked || false));
      setRecurrenceType(recurrenceToType(task.recurrence));
      const taskDay = task.date ? new Date(task.date + 'T12:00:00').getDay() : new Date().getDay();
      setWeeklyDays(
        task.recurrence?.type === 'weekly' ? task.recurrence.days :
        task.recurrence?.type === 'custom' && task.recurrence.days ? task.recurrence.days :
        [taskDay]
      );
      setCustomInterval(task.recurrence?.type === 'custom' ? task.recurrence.interval : 1);
      setCustomUnit(task.recurrence?.type === 'custom' ? task.recurrence.unit : 'weeks');
      if (task.recurrence?.type === 'monthlyNth') {
        setNthPositions(task.recurrence.positions);
      } else if (task.date) {
        const dt = new Date(task.date + 'T12:00:00');
        const dayOfMonth = dt.getDate();
        const week = (Math.ceil(dayOfMonth / 7) as 1 | 2 | 3 | 4 | -1);
        setNthPositions([{ week, day: dt.getDay() }]);
      }
      setShowDeleteConfirm(false);
      setDueDate(task.dueDate || '');
      setTaskCategory(task.category || '');
      setShowDuePicker(false);
      setShowCatPicker(false);
      setSaveStatus('idle');
      setAttachments((task.attachments || []).filter((a: any) => a.type !== 'link'));
      setIsUploading(false);
      setReminders(task.reminders || []);
      setShowReminderModal(false);
      
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
      case 'monthlyNth': {
        const positions = nthPositions.length > 0 ? nthPositions : [{ week: 1 as NthWeek, day: taskDay }];
        return { type: 'monthlyNth', positions };
      }
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
      // Invariant: any task with recurrence must be linked. Unlinking now means
      // converting to a one-time task (handled by the dedicated UNLINK action).
      linked: recurrence ? true : false,
      linkedGroupId: recurrence ? (task?.linkedGroupId || task?.id || seriesId) : undefined,
      detachedFromSeries: false,
      dueDate: dueDate || undefined,
      category: taskCategory || undefined,
      reminders: reminders.length > 0 ? reminders : undefined,
      attachments: attachments.length > 0 ? attachments : undefined,
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

    const parentId = task.recurrenceParentId || task.id;
    const hadRecurrence = !!task.recurrence;
    const hasRecurrence = !!updates.recurrence;
    const hasRecurrenceChange = JSON.stringify(task.recurrence) !== JSON.stringify(updates.recurrence);
    const wasLinked = task.linked !== false;

    // Linked + recurring → propagate edits to all future occurrences automatically.
    // Unlinked → edits stay local (no prompt needed).
    if (isRecurring && wasLinked && isLinked) {
      updateFutureInstances(task.id, task.date, updates);
    } else {
      updateTask(task.id, updates);
    }

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

  const handleClose = () => {
    handleSave();
    showSaveConfirmation();
    setTimeout(() => setEditingTask(null), 400);
  };

  const MAX_FILE_SIZE = 25 * 1024 * 1024; // 25MB

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0 || !task) return;
    setIsUploading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');
      for (const file of Array.from(files)) {
        if (file.size > MAX_FILE_SIZE) {
          toast.error(`${file.name} exceeds 25MB limit`);
          continue;
        }
        const filePath = `${user.id}/${task.id}/${Date.now()}-${file.name}`;
        const { error } = await supabase.storage.from('task-attachments').upload(filePath, file);
        if (error) throw error;
        const { data: signedData } = await supabase.storage.from('task-attachments').createSignedUrl(filePath, 60 * 60 * 24 * 365);
        const url = signedData?.signedUrl || filePath;
        setAttachments(prev => [...prev, { name: file.name, url, type: file.type, path: filePath }]);
      }
    } catch (err) {
      console.error('Upload failed:', err);
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const removeAttachment = async (index: number) => {
    const att = attachments[index];
    // Try path field first, then extract from URL
    const storagePath = (att as any).path || (() => {
      const pathMatch = att.url.match(/task-attachments\/(.+?)(?:\?|$)/);
      return pathMatch ? pathMatch[1] : null;
    })();
    if (storagePath) {
      await supabase.storage.from('task-attachments').remove([storagePath]);
    }
    setAttachments(prev => prev.filter((_, i) => i !== index));
  };

  useEffect(() => {
    return () => { if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current); };
  }, []);

  const dueInfo = dueDate ? getDueDateText(dueDate) : null;

  return (
    <AnimatePresence>
      {task && !isGroup && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.15 }}
          className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center bg-background/60 backdrop-blur-[2px]"
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
            <div className="px-5 pt-4 pb-1 flex items-center justify-between">
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

            {/* ─── Metadata chips (top, above title) ─── */}
            <div className="px-5 pb-2 flex items-center gap-1.5 flex-wrap">
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
                  <div className="flex items-center gap-1.5 px-3 pb-2">
                    {[
                      { label: '1w', days: 7 },
                      { label: '1m', days: 30 },
                      { label: '6m', days: 182 },
                      { label: '1y', days: 365 },
                    ].map((opt) => (
                      <button
                        key={opt.label}
                        onClick={() => {
                          const d = new Date();
                          d.setDate(d.getDate() + opt.days);
                          setDueDate(d.toISOString().split('T')[0]);
                          setShowDuePicker(false);
                        }}
                        className="px-2.5 py-1 rounded-sm text-[10px] font-mono tracking-wider text-muted-foreground/60 bg-muted/30 hover:bg-muted/60 hover:text-foreground/70 transition-colors"
                      >
                        {opt.label}
                      </button>
                    ))}
                    {dueDate && (
                      <button onClick={() => { setDueDate(''); setShowDuePicker(false); }}
                        className="ml-auto text-[10px] font-mono text-muted-foreground/40 hover:text-destructive/60">
                        Clear
                      </button>
                    )}
                  </div>
                </PopoverContent>
              </Popover>

              {/* Category / Tag */}
              <Popover open={showCatPicker} onOpenChange={setShowCatPicker}>
                <PopoverTrigger asChild>
                  <button className={`flex items-center gap-1 px-2.5 py-1.5 rounded-full text-[10px] font-mono tracking-wide transition-colors ${
                    taskCategory
                      ? 'text-foreground/70 bg-muted/40 hover:bg-muted/60'
                      : 'text-muted-foreground/40 bg-muted/30 hover:bg-muted/50'
                  }`}>
                    <Tag size={10} strokeWidth={1.5} />
                    {taskCategory ? (useLibraryStore.getState().categories.find(c => c.value === taskCategory)?.label || taskCategory) : 'Tag'}
                  </button>
                </PopoverTrigger>
                <PopoverContent className="w-44 p-1 z-[70]" align="start" onClick={(e) => e.stopPropagation()}>
                  <TagPickerMenu
                    value={taskCategory}
                    onChange={(v) => setTaskCategory(v)}
                    onClose={() => setShowCatPicker(false)}
                  />
                </PopoverContent>
              </Popover>

              {/* Priority dropdown chip */}
              <Popover>
                <PopoverTrigger asChild>
                  <button
                    className="flex items-center gap-1 px-2.5 py-1.5 rounded-full text-[10px] font-mono tracking-wide transition-colors border bg-muted/40 hover:bg-muted/60"
                    style={{
                      color: `hsl(${getPriorityColor(priority)})`,
                      borderColor: `hsl(${getPriorityColor(priority)} / 0.45)`,
                    }}
                  >
                    {PRIORITY_LABELS[priority]}
                    <ChevronDown size={10} strokeWidth={1.5} />
                  </button>
                </PopoverTrigger>
                <PopoverContent className="w-32 p-1 z-[70]" align="start" onClick={(e) => e.stopPropagation()}>
                  {([0, 1, 2, 3] as Priority[]).map((p) => {
                    const mobilityMode = useTimezoneStore.getState().mobilityMode;
                    const isElite = mobilityMode === 'elite';
                    const isDisabled = isElite && p < priority;
                    return (
                    <button
                      key={p}
                      onClick={() => !isDisabled && setPriority(p)}
                      disabled={isDisabled}
                      className={`w-full text-left px-3 py-2 text-[11px] font-mono rounded-sm transition-colors ${
                        isDisabled
                          ? 'cursor-not-allowed opacity-30'
                          : priority === p
                            ? 'bg-muted/50'
                            : 'hover:bg-muted/30'
                      }`}
                      style={
                        isDisabled
                          ? undefined
                          : { color: `hsl(${getPriorityColor(p)})` }
                      }
                    >
                      {PRIORITY_LABELS[p]}
                      {isDisabled && <span className="text-[8px] ml-1 opacity-50">▼</span>}
                    </button>
                    );
                  })}
                </PopoverContent>
              </Popover>

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

              {/* Routine chip — visible when task is recurring */}
              {recurrenceType !== 'none' && (
                <button
                  onClick={() => setIsRoutine(!isRoutine)}
                  className={`flex items-center gap-1 px-2.5 py-1.5 rounded-full text-[10px] font-mono tracking-wide transition-colors ${
                    isRoutine
                      ? 'text-foreground/70 bg-muted/40'
                      : 'text-muted-foreground/35 bg-muted/25 hover:bg-muted/40'
                  }`}
                >
                  {isRoutine ? 'Routine' : 'Not routine'}
                </button>
              )}

              {/* Unlink chip — only shown for linked recurring tasks, fully detaches */}
              {isRecurring && isLinked && (
                <button
                  onClick={() => {
                    setIsLinked(false);
                    setRecurrenceType('none');
                    // Mark task as fully detached from its series
                    if (task) {
                      updateTask(task.id, {
                        linked: false,
                        linkedGroupId: undefined,
                        recurrence: undefined,
                        type: 'one-time',
                        isRecurrenceInstance: false,
                        recurrenceParentId: undefined,
                        seriesId: undefined,
                        detachedFromSeries: true,
                        isRoutine: false,
                      });
                    }
                    if (navigator.vibrate) navigator.vibrate(15);
                  }}
                  className="flex items-center gap-1 px-2.5 py-1.5 rounded-full text-[10px] font-mono tracking-wide transition-colors text-destructive/60 bg-destructive/10 hover:bg-destructive/15"
                >
                  <Unlink size={10} strokeWidth={1.5} />
                  Unlink
                </button>
              )}

              {/* Reminder chip */}
              <button
                onClick={() => setShowReminderModal(true)}
                className={`flex items-center gap-1 px-2.5 py-1.5 rounded-full text-[10px] font-mono tracking-wide transition-colors ${
                  reminders.length > 0
                    ? 'text-foreground/70 bg-muted/40 hover:bg-muted/60'
                    : 'text-muted-foreground/40 bg-muted/30 hover:bg-muted/50'
                }`}
              >
                <Bell size={10} strokeWidth={1.5} />
                {reminders.length > 0 ? `${reminders.length}` : ''}
              </button>

              {/* Attachment chip — paperclip only */}
              <button
                onClick={() => fileInputRef.current?.click()}
                disabled={isUploading}
                title="Add attachment"
                className={`flex items-center gap-1 px-2.5 py-1.5 rounded-full text-[10px] font-mono tracking-wide transition-colors disabled:opacity-50 ${
                  attachments.length > 0
                    ? 'text-foreground/70 bg-muted/40 hover:bg-muted/60'
                    : 'text-muted-foreground/40 bg-muted/30 hover:bg-muted/50'
                }`}
              >
                {isUploading ? (
                  <Upload size={10} strokeWidth={1.5} className="animate-pulse" />
                ) : (
                  <Paperclip size={10} strokeWidth={1.5} />
                )}
                {attachments.length > 0 ? `${attachments.length}` : ''}
              </button>
            </div>

            {/* Reminder modal */}
            <AnimatePresence>
              {showReminderModal && (
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="fixed inset-0 z-[80] flex items-center justify-center"
                >
                  <div className="absolute inset-0 bg-black/30" onClick={() => setShowReminderModal(false)} />
                  <motion.div
                    initial={{ scale: 0.95, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    exit={{ scale: 0.95, opacity: 0 }}
                    className="relative bg-card border border-border rounded-lg shadow-lg w-[300px] max-h-[70vh] overflow-hidden"
                  >
                    <div className="flex items-center justify-between px-4 py-3 border-b border-border/50">
                      <h3 className="text-[12px] font-display font-bold text-foreground tracking-tight">REMINDERS</h3>
                      <button onClick={() => setShowReminderModal(false)} className="text-muted-foreground hover:text-foreground transition-colors">
                        <X size={14} strokeWidth={1.5} />
                      </button>
                    </div>
                    <div className="p-4 flex flex-wrap gap-2">
                      {REMINDER_OPTIONS.map((opt) => {
                        const isSelected = reminders.includes(opt.value);
                        return (
                          <button
                            key={opt.value}
                            onClick={() => {
                              setReminders(prev =>
                                isSelected
                                  ? prev.filter(v => v !== opt.value)
                                  : [...prev, opt.value].sort((a, b) => a - b)
                              );
                            }}
                            className={`px-3 py-2 rounded-full text-[11px] font-mono tracking-wide transition-colors border ${
                              isSelected
                                ? 'border-primary/40 bg-primary/10 text-primary'
                                : 'border-border/50 bg-muted/30 text-muted-foreground/60 hover:bg-muted/50 hover:text-foreground/70'
                            }`}
                          >
                            {opt.label}
                          </button>
                        );
                      })}
                    </div>
                    {reminders.length > 0 && (
                      <div className="px-4 pb-3">
                        <button
                          onClick={() => setReminders([])}
                          className="text-[10px] font-mono text-muted-foreground/40 hover:text-destructive/60 transition-colors"
                        >
                          Clear all
                        </button>
                      </div>
                    )}
                  </motion.div>
                </motion.div>
              )}
            </AnimatePresence>

            <div className="px-5 pb-5">
              {/* ─── Title ─── */}
              <div className="relative">
                <input
                  ref={titleInputRef}
                  value={title}
                  onChange={(e) => {
                    const val = e.target.value;
                    setTitle(val);
                  }}
                  placeholder="Task name…"
                  className="w-full bg-transparent font-display font-bold text-foreground text-lg leading-tight focus:outline-none placeholder:text-muted-foreground/20 mb-1"
                />
                <TagAutocomplete
                  inputValue={title}
                  inputRef={titleInputRef as React.RefObject<HTMLInputElement>}
                  onSelectTag={(cat, cleaned) => {
                    setTitle(cleaned);
                    setTaskCategory(cat.value);
                  }}
                />
              </div>

              {/* ─── Subtitle / Description (always fully visible) ─── */}
              <DescriptionWithLinks
                value={description}
                onChange={(val) => {
                  setDescription(val);
                }}
                placeholder="Description"
              />

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
                             // Switching from none → recurring no longer auto-enables routine.
                             // User must explicitly toggle the ROUTINE chip.
                            if (opt.value === 'weekly' && task?.date) {
                              const taskDay = new Date(task.date + 'T12:00:00').getDay();
                              if (!weeklyDays.includes(taskDay)) setWeeklyDays([taskDay]);
                            }
                            if (opt.value !== 'custom' && opt.value !== 'monthlyNth') setShowRecurrence(false);
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

                      {recurrenceType === 'monthlyNth' && (
                        <div className="pt-2 space-y-2">
                          <div className="text-[8px] font-mono tracking-wider text-muted-foreground/50">
                            PICK ONE OR MORE
                          </div>
                          {NTH_WEEK_LABELS.map((wk) => (
                            <div key={wk.value} className="flex items-center gap-1.5">
                              <span className="w-7 text-[8px] font-mono tracking-wider text-muted-foreground/60">
                                {wk.label}
                              </span>
                              <div className="flex gap-0.5 flex-1">
                                {DAY_LABELS.map((label, dayIdx) => {
                                  const isOn = nthPositions.some(
                                    (p) => p.week === wk.value && p.day === dayIdx,
                                  );
                                  return (
                                    <button
                                      key={dayIdx}
                                      onClick={() => {
                                        setNthPositions((prev) => {
                                          const exists = prev.some(
                                            (p) => p.week === wk.value && p.day === dayIdx,
                                          );
                                          if (exists) {
                                            const next = prev.filter(
                                              (p) => !(p.week === wk.value && p.day === dayIdx),
                                            );
                                            return next.length > 0 ? next : prev;
                                          }
                                          return [...prev, { week: wk.value, day: dayIdx }];
                                        });
                                      }}
                                      className={`flex-1 h-6 rounded-sm text-[8px] font-mono transition-colors ${
                                        isOn
                                          ? 'bg-primary/10 text-primary border border-primary/20'
                                          : 'text-muted-foreground/40 border border-border hover:border-border'
                                      }`}
                                    >
                                      {label[0]}
                                    </button>
                                  );
                                })}
                              </div>
                            </div>
                          ))}
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
                          {isLinked && (
                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-1.5">
                                <Link size={10} className="text-primary/50" />
                                <span className="text-[9px] font-mono tracking-wider text-muted-foreground/50">LINKED</span>
                              </div>
                              <button
                                onClick={() => {
                                  setIsLinked(false);
                                  setRecurrenceType('none');
                                  if (task) {
                                    updateTask(task.id, {
                                      linked: false,
                                      linkedGroupId: undefined,
                                      recurrence: undefined,
                                      type: 'one-time',
                                      isRecurrenceInstance: false,
                                      recurrenceParentId: undefined,
                                      seriesId: undefined,
                                      detachedFromSeries: true,
                                      isRoutine: false,
                                    });
                                  }
                                  if (navigator.vibrate) navigator.vibrate(15);
                                }}
                                className="text-[8px] font-mono tracking-wider text-destructive/50 hover:text-destructive/80 transition-colors"
                              >
                                UNLINK
                              </button>
                            </div>
                          )}
                          {!isLinked && task?.recurrenceParentId && (
                            <div className="flex items-center gap-1.5">
                              <Unlink size={10} className="text-muted-foreground/30" />
                              <span className="text-[9px] font-mono tracking-wider text-muted-foreground/35">UNLINKED</span>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>

              {/* ─── Subtasks ─── */}
              <div className="mb-4">
                <SubtaskList subtasks={subtasks} onChange={setSubtasks} />
              </div>

              {/* ─── Attachments ─── */}
              {attachments.length > 0 && (
                <div className="mb-3">
                  {/* Image thumbnails */}
                  {attachments.some(a => a.type.startsWith('image/')) && (
                    <div className="flex flex-wrap gap-2 mb-2">
                      {attachments.map((att, i) => {
                        if (!att.type.startsWith('image/')) return null;
                        return (
                          <div key={i} className="relative group">
                            <button onClick={(e) => { e.stopPropagation(); setLightboxIndex(i); }}>
                              <img
                                src={att.url}
                                alt={att.name}
                                className="w-16 h-16 object-cover rounded-md border border-border/30 hover:border-primary/30 transition-colors cursor-zoom-in"
                              />
                            </button>
                            <button
                              onClick={() => removeAttachment(i)}
                              className="absolute -top-1.5 -right-1.5 w-4 h-4 rounded-full bg-card border border-border/50 flex items-center justify-center text-muted-foreground/40 hover:text-destructive opacity-0 group-hover:opacity-100 transition-opacity"
                            >
                              <X size={8} />
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  )}
                  {/* Non-image files */}
                  {attachments.filter(a => !a.type.startsWith('image/')).map((att, i) => {
                    const realIndex = attachments.indexOf(att);
                    return (
                      <div key={i} className="flex items-center gap-2 py-1.5 group">
                        <FileText size={11} className="text-muted-foreground/40 shrink-0" />
                        <button
                          onClick={(e) => { e.stopPropagation(); setLightboxIndex(realIndex); }}
                          className="flex-1 text-left text-[10px] font-mono text-foreground/60 hover:text-foreground truncate"
                        >
                          {att.name}
                        </button>
                        <button onClick={() => removeAttachment(realIndex)}
                          className="p-0.5 text-muted-foreground/20 hover:text-destructive opacity-0 group-hover:opacity-100 transition-opacity">
                          <X size={10} />
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}
              <input
                ref={fileInputRef}
                type="file"
                multiple
                className="hidden"
                onChange={handleFileUpload}
              />
              <button
                onClick={() => fileInputRef.current?.click()}
                disabled={isUploading}
                className="flex items-center gap-1.5 text-[9px] font-mono tracking-wider text-muted-foreground/70 hover:text-foreground transition-colors mb-3 disabled:opacity-50"
              >
                {isUploading ? (
                  <>
                    <Upload size={10} strokeWidth={1.5} className="animate-pulse" />
                    Uploading…
                  </>
                ) : (
                  <>
                    <Paperclip size={10} strokeWidth={1.5} />
                    Add attachment
                  </>
                )}
              </button>

              {/* Move info */}
              {task.moveCount > 0 && (
                <div className="text-[8px] font-mono text-muted-foreground/35 tracking-widest mb-3">
                  MOVED {task.moveCount}× · ORIGINALLY {PRIORITY_LABELS[task.originalPriority].toUpperCase()}
                </div>
              )}

              {/* ─── Actions ─── */}
              {(

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
                    title="Move to Limbo">
                    <PauseCircle size={12} strokeWidth={1.5} />
                    LIMBO
                  </button>
                  <button type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      e.preventDefault();
                      if (!task) return;
                      const taskTitle = task.title;
                      const libNavBtn = document.querySelector('[data-library-nav-btn]') as HTMLElement | null;
                      import('@/components/LibraryDueDatePrompt').then(({ useLibraryDuePrompt }) => {
                        useLibraryDuePrompt.getState().request({
                          title: task.title,
                          duration: task.duration || 30,
                          category: task.category,
                          note: task.description,
                          dueDate: task.dueDate ?? null,
                          anchor: libNavBtn,
                          side: 'bottom',
                          align: 'end',
                        });
                      });
                      deleteTask(task.id);
                      setEditingTask(null);
                      toast.success(`"${taskTitle}" sent to library`);
                    }}
                    className="flex items-center gap-1.5 px-3 py-2 rounded-sm text-[9px] font-mono tracking-wider text-muted-foreground/50 hover:text-foreground hover:bg-muted/30 transition-colors"
                    title="Send to Library">
                    <Archive size={12} strokeWidth={1.5} />
                    LIBRARY
                  </button>
                  {/* Convert to Group — only for normal scheduled, non-recurring tasks not already in a Group */}
                  {task && !task.groupId && task.time && task.duration && !task.recurrence && !task.isRecurrenceInstance && !task.recurrenceParentId && (
                    <button type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setShowGroupPrompt(true);
                      }}
                      className="flex items-center gap-1.5 px-3 py-2 rounded-sm text-[9px] font-mono tracking-wider text-muted-foreground/50 hover:text-foreground hover:bg-muted/30 transition-colors"
                      title="Convert this task into a Group container">
                      <Layers size={12} strokeWidth={1.5} />
                      GROUP
                    </button>
                  )}
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
      {lightboxIndex !== null && (
        <AttachmentLightbox
          attachments={attachments}
          currentIndex={lightboxIndex}
          onClose={() => setLightboxIndex(null)}
          onNavigate={setLightboxIndex}
        />
      )}
      <GroupNamePrompt
        open={showGroupPrompt}
        contextLabel="CONVERT TO GROUP"
        defaultName={task?.title ? `${task.title} block` : ''}
        confirmLabel="CREATE GROUP"
        onCancel={() => setShowGroupPrompt(false)}
        onConfirm={(name) => {
          if (!task) return;
          const groupId = convertTaskToGroup(task.id, name);
          setShowGroupPrompt(false);
          if (groupId) {
            toast.success(`Group "${name}" created`);
            // Open the new Group for editing — GroupEditPanel will replace this view in a follow-up step.
            setEditingTask(groupId);
          }
        }}
      />
    </AnimatePresence>
  );
}
