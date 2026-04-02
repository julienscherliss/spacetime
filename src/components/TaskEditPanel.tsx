import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useTaskStore, Priority, RecurrencePattern } from '@/store/taskStore';
import { PriorityBadge } from '@/components/PriorityBadge';
import { X, Play, Calendar, Clock, Trash2, Repeat, ChevronDown } from 'lucide-react';
import { minutesToTime, timeToMinutes } from '@/hooks/useCurrentTime';

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

function recurrenceToValue(r?: RecurrencePattern): string {
  if (!r) return 'none';
  return r.type;
}

function recurrenceLabel(r?: RecurrencePattern): string {
  if (!r) return 'No repeat';
  switch (r.type) {
    case 'daily': return 'Daily';
    case 'weekdays': return 'Mon–Fri';
    case 'weekly': return `Weekly (${r.days.map(d => DAY_LABELS[d]).join(', ')})`;
    case 'monthly': return `Monthly (${r.dayOfMonth}th)`;
    case 'yearly': return 'Yearly';
    case 'custom': return `Every ${r.intervalDays} days`;
  }
}

export function TaskEditPanel() {
  const { tasks, editingTaskId, setEditingTask, updateTask, deleteTask, deleteRecurrenceSeries, setFocusTask, setViewMode } = useTaskStore();
  const task = tasks.find((t) => t.id === editingTaskId);

  const [title, setTitle] = useState(task?.title || '');
  const [time, setTime] = useState(task?.time || '');
  const [duration, setDuration] = useState(task?.duration || 30);
  const [date, setDate] = useState(task?.date || '');
  const [priority, setPriority] = useState<Priority>(task?.priority || 0);
  const [recurrenceType, setRecurrenceType] = useState(recurrenceToValue(task?.recurrence));
  const [weeklyDays, setWeeklyDays] = useState<number[]>(
    task?.recurrence?.type === 'weekly' ? task.recurrence.days : [new Date().getDay()]
  );
  const [customInterval, setCustomInterval] = useState(
    task?.recurrence?.type === 'custom' ? task.recurrence.intervalDays : 2
  );
  const [showRecurrence, setShowRecurrence] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  useEffect(() => {
    if (task) {
      setTitle(task.title);
      setTime(task.time || '');
      setDuration(task.duration || 30);
      setDate(task.date);
      setPriority(task.priority);
      setRecurrenceType(recurrenceToValue(task.recurrence));
      setWeeklyDays(task.recurrence?.type === 'weekly' ? task.recurrence.days : [new Date().getDay()]);
      setCustomInterval(task.recurrence?.type === 'custom' ? task.recurrence.intervalDays : 2);
      setShowDeleteConfirm(false);
    }
  }, [task?.id]);

  const buildRecurrence = (): RecurrencePattern | undefined => {
    switch (recurrenceType) {
      case 'none': return undefined;
      case 'daily': return { type: 'daily' };
      case 'weekdays': return { type: 'weekdays' };
      case 'weekly': return { type: 'weekly', days: weeklyDays };
      case 'monthly': return { type: 'monthly', dayOfMonth: new Date(date).getDate() };
      case 'yearly': {
        const d = new Date(date);
        return { type: 'yearly', month: d.getMonth(), dayOfMonth: d.getDate() };
      }
      case 'custom': return { type: 'custom', intervalDays: customInterval };
      default: return undefined;
    }
  };

  const handleSave = () => {
    if (!task) return;
    const recurrence = buildRecurrence();
    updateTask(task.id, {
      title,
      time,
      duration,
      date,
      priority,
      recurrence,
      type: recurrence ? 'recurring' : 'one-time',
    });
  };

  const handleClose = () => {
    handleSave();
    setEditingTask(null);
  };

  const handleFocus = () => {
    if (!task) return;
    handleSave();
    setFocusTask(task.id);
    setEditingTask(null);
    setViewMode('focus');
  };

  const endTime = time ? minutesToTime(timeToMinutes(time) + duration) : '';

  return (
    <AnimatePresence>
      {task && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.15 }}
          className="fixed inset-0 z-50 flex items-center justify-center bg-background/60 backdrop-blur-[2px] p-4"
          onClick={handleClose}
        >
          <motion.div
            initial={{ opacity: 0, y: 12, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 12, scale: 0.98 }}
            transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
            className="bg-card border border-border rounded-sm p-4 w-full max-w-xs shadow-lg"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex items-start justify-between mb-3">
              <div className="flex-1 mr-3">
                <input
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  className="w-full bg-transparent font-display font-bold text-foreground text-sm leading-tight focus:outline-none border-b border-transparent focus:border-border transition-colors"
                />
                <div className="mt-1.5">
                  <PriorityBadge priority={priority} />
                </div>
              </div>
              <button
                onClick={handleClose}
                className="p-0.5 text-muted-foreground hover:text-foreground transition-colors"
              >
                <X size={14} strokeWidth={1.5} />
              </button>
            </div>

            {/* Fields */}
            <div className="space-y-2 mb-3">
              <div className="flex items-center gap-2">
                <Calendar size={11} className="text-muted-foreground/50 shrink-0" strokeWidth={1.5} />
                <input
                  type="date"
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                  className="flex-1 bg-muted/50 border border-border rounded-sm px-2 py-1.5 text-[10px] font-mono text-foreground focus:outline-none focus:ring-1 focus:ring-primary/30"
                />
              </div>
              <div className="flex items-center gap-2">
                <Clock size={11} className="text-muted-foreground/50 shrink-0" strokeWidth={1.5} />
                <input
                  type="time"
                  value={time}
                  onChange={(e) => setTime(e.target.value)}
                  className="flex-1 bg-muted/50 border border-border rounded-sm px-2 py-1.5 text-[10px] font-mono text-foreground focus:outline-none focus:ring-1 focus:ring-primary/30"
                />
                <span className="text-[8px] font-mono text-muted-foreground/40">→</span>
                <span className="text-[10px] font-mono text-muted-foreground/60">{endTime}</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-mono text-muted-foreground/50 w-[11px] text-center">⏱</span>
                <input
                  type="number"
                  value={duration}
                  onChange={(e) => setDuration(Number(e.target.value))}
                  min={5}
                  step={5}
                  className="flex-1 bg-muted/50 border border-border rounded-sm px-2 py-1.5 text-[10px] font-mono text-foreground focus:outline-none focus:ring-1 focus:ring-primary/30"
                />
                <span className="text-[8px] font-mono text-muted-foreground/40">MIN</span>
              </div>
            </div>

            {/* Priority selector */}
            <div className="mb-3">
              <label className="block text-[8px] font-mono tracking-widest text-muted-foreground/50 mb-1.5">PRIORITY</label>
              <div className="flex gap-1.5">
                {([0, 1, 2, 3] as Priority[]).map((p) => (
                  <button
                    key={p}
                    onClick={() => setPriority(p)}
                    className={`flex-1 py-1.5 rounded-sm text-[9px] font-mono tracking-wider border transition-colors ${
                      priority === p
                        ? `${PRIORITY_COLORS[p]} bg-muted/60`
                        : 'border-border text-muted-foreground/50 hover:border-border'
                    }`}
                  >
                    {PRIORITY_LABELS[p]}
                  </button>
                ))}
              </div>
            </div>

            {/* Recurrence */}
            <div className="mb-3">
              <button
                onClick={() => setShowRecurrence(!showRecurrence)}
                className="flex items-center gap-1.5 text-[9px] font-mono tracking-wider text-muted-foreground/60 hover:text-foreground transition-colors w-full"
              >
                <Repeat size={10} strokeWidth={1.5} />
                <span>{recurrenceLabel(buildRecurrence())}</span>
                <ChevronDown size={9} className={`ml-auto transition-transform ${showRecurrence ? 'rotate-180' : ''}`} />
              </button>

              {showRecurrence && (
                <div className="mt-2 space-y-2 pl-4 border-l border-border/50">
                  {RECURRENCE_OPTIONS.map((opt) => (
                    <button
                      key={opt.value}
                      onClick={() => setRecurrenceType(opt.value)}
                      className={`block w-full text-left text-[9px] font-mono tracking-wider py-1 px-2 rounded-sm transition-colors ${
                        recurrenceType === opt.value
                          ? 'text-foreground bg-muted/60'
                          : 'text-muted-foreground/50 hover:text-foreground hover:bg-muted/30'
                      }`}
                    >
                      {opt.label}
                    </button>
                  ))}

                  {/* Weekly day picker */}
                  {recurrenceType === 'weekly' && (
                    <div className="flex gap-1 pt-1">
                      {DAY_LABELS.map((label, i) => (
                        <button
                          key={i}
                          onClick={() => {
                            setWeeklyDays(prev =>
                              prev.includes(i) ? prev.filter(d => d !== i) : [...prev, i]
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

                  {/* Custom interval */}
                  {recurrenceType === 'custom' && (
                    <div className="flex items-center gap-2 pt-1">
                      <span className="text-[8px] font-mono text-muted-foreground/50">Every</span>
                      <input
                        type="number"
                        value={customInterval}
                        onChange={(e) => setCustomInterval(Math.max(1, Number(e.target.value)))}
                        min={1}
                        className="w-14 bg-muted/50 border border-border rounded-sm px-2 py-1 text-[10px] font-mono text-foreground focus:outline-none"
                      />
                      <span className="text-[8px] font-mono text-muted-foreground/50">days</span>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Move info */}
            {task.moveCount > 0 && (
              <div className="text-[8px] font-mono text-muted-foreground/40 tracking-widest mb-3">
                MOVED {task.moveCount}× · ORIGINALLY {PRIORITY_LABELS[task.originalPriority].toUpperCase()}
              </div>
            )}

            {/* Actions */}
            <div className="flex items-center gap-1.5">
              <button
                onClick={handleFocus}
                className="flex-1 flex items-center justify-center gap-1 py-2 rounded-sm bg-primary text-primary-foreground font-mono text-[9px] tracking-widest hover:bg-primary/90 transition-colors"
              >
                <Play size={10} strokeWidth={1.5} />
                FOCUS
              </button>
              <button
                onClick={() => {
                  if (task.recurrence && !task.isRecurrenceInstance) {
                    setShowDeleteConfirm(true);
                  } else {
                    deleteTask(task.id);
                    setEditingTask(null);
                  }
                }}
                className="p-2 rounded-sm border border-border text-muted-foreground hover:text-destructive hover:border-destructive/20 transition-colors"
              >
                <Trash2 size={12} strokeWidth={1.5} />
              </button>
            </div>

            {/* Delete confirmation for recurring */}
            {showDeleteConfirm && (
              <div className="mt-3 p-2.5 border border-border rounded-sm bg-muted/30">
                <p className="text-[9px] font-mono text-foreground/70 mb-2">Delete recurring task?</p>
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
                      deleteRecurrenceSeries(parentId);
                    }}
                    className="flex-1 py-1.5 rounded-sm border border-destructive/20 text-[8px] font-mono tracking-wider text-destructive hover:bg-destructive/5 transition-colors"
                  >
                    All tasks
                  </button>
                </div>
              </div>
            )}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
