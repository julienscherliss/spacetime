import { useEffect, useMemo, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Layers, X, Check, ListOrdered, Sliders, Trash2, ArrowUp, ArrowDown,
  LogOut, Minus, Plus,
} from 'lucide-react';
import { useTaskStore, Task } from '@/store/taskStore';
import { formatTime12h, timeToMinutes } from '@/hooks/useCurrentTime';
import { MIN_CHILD_DURATION } from '@/utils/groupRebalance';
import { toast } from 'sonner';

type Mode = 'list' | 'scheduler';

function formatDur(mins: number): string {
  if (mins < 60) return `${mins}m`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
}

/**
 * Modal that reveals the contents of a Group. Two modes:
 *
 *   • LIST — minimal reorderable list. Used for quick triage.
 *   • SCHEDULER — micro-timeline within the Group's time span. Each child can be
 *     resized in 5-minute steps; durations auto-rebalance to honor the parent
 *     Group's total duration (proportional squeeze, 5m floor).
 *
 * The Group itself only has a name + total time slot — its scheduling on the
 * main timeline is handled exactly like any other task block.
 */
export function GroupEditPanel() {
  const editingTaskId = useTaskStore((s) => s.editingTaskId);
  const tasks = useTaskStore((s) => s.tasks);
  const setEditingTask = useTaskStore((s) => s.setEditingTask);
  const renameGroup = useTaskStore((s) => s.renameGroup);
  const completeGroup = useTaskStore((s) => s.completeGroup);
  const completeChild = useTaskStore((s) => s.completeChild);
  const removeTaskFromGroup = useTaskStore((s) => s.removeTaskFromGroup);
  const deleteTask = useTaskStore((s) => s.deleteTask);
  const updateTask = useTaskStore((s) => s.updateTask);
  const rebalanceGroupChildren = useTaskStore((s) => s.rebalanceGroupChildren);

  const group = useMemo(
    () => tasks.find((t) => t.id === editingTaskId && t.type === 'group'),
    [tasks, editingTaskId],
  );

  const children = useMemo(
    () =>
      tasks
        .filter((t) => t.groupId === group?.id && !t.archivedAt)
        .sort((a, b) => (a.groupOrder ?? 0) - (b.groupOrder ?? 0)),
    [tasks, group?.id],
  );

  const [mode, setMode] = useState<Mode>('list');
  const [name, setName] = useState(group?.title ?? '');
  const [confirmDelete, setConfirmDelete] = useState(false);
  const nameInputRef = useRef<HTMLInputElement>(null);

  // Reset local state whenever a different Group is opened.
  useEffect(() => {
    if (group) {
      setName(group.title);
      setMode('list');
      setConfirmDelete(false);
    }
  }, [group?.id]);

  if (!group) return null;

  const handleClose = () => {
    if (name.trim() && name.trim() !== group.title) {
      renameGroup(group.id, name.trim());
    }
    setEditingTask(null);
  };

  const reorder = (childId: string, dir: -1 | 1) => {
    const idx = children.findIndex((c) => c.id === childId);
    const swapIdx = idx + dir;
    if (idx < 0 || swapIdx < 0 || swapIdx >= children.length) return;
    const a = children[idx];
    const b = children[swapIdx];
    updateTask(a.id, { groupOrder: b.groupOrder });
    updateTask(b.id, { groupOrder: a.groupOrder });
    // Re-run layout so times re-flow in scheduler order.
    setTimeout(() => rebalanceGroupChildren(group.id), 0);
  };

  const adjustChildDuration = (child: Task, delta: number) => {
    const current = child.preferredDuration ?? child.duration ?? 30;
    const next = Math.max(MIN_CHILD_DURATION, current + delta);
    updateTask(child.id, { preferredDuration: next });
    setTimeout(() => rebalanceGroupChildren(group.id), 0);
  };

  const handleUngroupChild = (child: Task) => {
    // Drop back onto the same date/time of the child itself; collision-resolved
    // by removeTaskFromGroup → findValidPosition.
    removeTaskFromGroup(child.id, child.date, child.time ?? group.time ?? '09:00');
    toast.success(`"${child.title}" removed from Group`);
  };

  const groupDuration = group.duration ?? 30;
  const totalChildren = children.length;
  const completedChildren = children.filter((c) => c.completed).length;

  return (
    <AnimatePresence>
      <motion.div
        key="group-edit-overlay"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-[80] flex items-end sm:items-center justify-center bg-background/60 backdrop-blur-[2px] p-0 sm:p-4"
        onClick={handleClose}
      >
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 30 }}
          transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
          className="bg-card border border-border rounded-t-lg sm:rounded-sm w-full max-w-lg shadow-lg max-h-[92vh] flex flex-col"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="px-5 pt-4 pb-3 flex items-center justify-between border-b border-border/40">
            <div className="flex items-center gap-1.5">
              <span className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-full text-[10px] font-mono tracking-wide text-foreground/70 bg-muted/40">
                <Layers size={11} strokeWidth={1.5} />
                GROUP
              </span>
              <span className="font-mono text-[10px] text-muted-foreground/50 tracking-wider">
                {group.time ? formatTime12h(group.time) : '—'} · {formatDur(groupDuration)}
              </span>
            </div>
            <button
              onClick={handleClose}
              className="p-1.5 rounded-sm text-muted-foreground/60 hover:text-foreground hover:bg-muted/40 transition-colors"
              aria-label="Close"
            >
              <X size={14} strokeWidth={1.5} />
            </button>
          </div>

          {/* Name */}
          <div className="px-5 pt-3 pb-2">
            <input
              ref={nameInputRef}
              value={name}
              onChange={(e) => setName(e.target.value)}
              onBlur={() => {
                if (name.trim() && name.trim() !== group.title) {
                  renameGroup(group.id, name.trim());
                }
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') (e.currentTarget as HTMLInputElement).blur();
                if (e.key === 'Escape') handleClose();
              }}
              className="w-full bg-transparent font-display font-bold text-foreground text-lg leading-tight focus:outline-none placeholder:text-muted-foreground/25"
              placeholder="Group name"
            />
            <div className="font-mono text-[10px] text-muted-foreground/40 tracking-wider mt-1">
              {completedChildren}/{totalChildren} TASK{totalChildren === 1 ? '' : 'S'} COMPLETE
            </div>
          </div>

          {/* Mode toggle */}
          <div className="px-5 pt-2 pb-3 flex gap-1.5">
            <button
              onClick={() => setMode('list')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-sm font-mono text-[10px] tracking-widest transition-colors ${
                mode === 'list'
                  ? 'bg-foreground text-background'
                  : 'text-muted-foreground/60 hover:text-foreground hover:bg-muted/30'
              }`}
            >
              <ListOrdered size={11} strokeWidth={1.5} />
              LIST
            </button>
            <button
              onClick={() => setMode('scheduler')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-sm font-mono text-[10px] tracking-widest transition-colors ${
                mode === 'scheduler'
                  ? 'bg-foreground text-background'
                  : 'text-muted-foreground/60 hover:text-foreground hover:bg-muted/30'
              }`}
            >
              <Sliders size={11} strokeWidth={1.5} />
              SCHEDULER
            </button>
          </div>

          {/* Children */}
          <div className="flex-1 overflow-y-auto px-5 pb-3">
            {children.length === 0 ? (
              <div className="py-10 text-center font-mono text-[11px] text-muted-foreground/40 tracking-wider">
                EMPTY GROUP — DRAG TASKS HERE FROM THE TIMELINE
              </div>
            ) : mode === 'list' ? (
              <ListMode
                children={children}
                onReorder={reorder}
                onComplete={completeChild}
                onUngroup={handleUngroupChild}
              />
            ) : (
              <SchedulerMode
                group={group}
                children={children}
                onAdjust={adjustChildDuration}
                onComplete={completeChild}
              />
            )}
          </div>

          {/* Footer actions */}
          <div className="px-5 py-4 border-t border-border/40 flex gap-2">
            {confirmDelete ? (
              <>
                <button
                  onClick={() => setConfirmDelete(false)}
                  className="flex-1 py-2.5 rounded-sm border border-border text-foreground/60 hover:text-foreground hover:bg-muted/30 font-mono text-[10px] tracking-widest transition-colors"
                >
                  CANCEL
                </button>
                <button
                  onClick={() => {
                    // Ungroup all children back onto the timeline at the group's slot, then delete shell.
                    const groupId = group.id;
                    const baseTime = group.time ?? '09:00';
                    children.forEach((c) => removeTaskFromGroup(c.id, c.date, c.time ?? baseTime));
                    deleteTask(groupId);
                    toast.success('Group dissolved — tasks restored');
                    setEditingTask(null);
                  }}
                  className="flex-1 py-2.5 rounded-sm bg-destructive/90 text-destructive-foreground font-mono text-[10px] tracking-widest hover:bg-destructive transition-colors"
                >
                  DISSOLVE GROUP
                </button>
              </>
            ) : (
              <>
                <button
                  onClick={() => setConfirmDelete(true)}
                  className="px-3 py-2.5 rounded-sm border border-border text-muted-foreground/70 hover:text-destructive hover:border-destructive/40 transition-colors"
                  title="Dissolve group (returns tasks to timeline)"
                >
                  <Trash2 size={12} strokeWidth={1.5} />
                </button>
                <button
                  onClick={() => {
                    completeGroup(group.id);
                    setEditingTask(null);
                  }}
                  disabled={children.length === 0}
                  className="flex-1 py-2.5 rounded-sm bg-primary text-primary-foreground font-mono text-[10px] tracking-widest hover:bg-primary/90 disabled:opacity-20 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-1.5"
                >
                  <Check size={12} strokeWidth={2} />
                  COMPLETE GROUP
                </button>
              </>
            )}
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}

// ─── List Mode ─────────────────────────────────────────────

function ListMode({
  children,
  onReorder,
  onComplete,
  onUngroup,
}: {
  children: Task[];
  onReorder: (id: string, dir: -1 | 1) => void;
  onComplete: (id: string) => void;
  onUngroup: (child: Task) => void;
}) {
  return (
    <div className="space-y-1.5 py-1">
      {children.map((c, i) => (
        <div
          key={c.id}
          className={`group flex items-center gap-2 px-2.5 py-2 rounded-sm border transition-colors ${
            c.completed
              ? 'bg-muted/20 border-border/30 opacity-60'
              : 'bg-background border-border/60 hover:border-foreground/30'
          }`}
        >
          <button
            onClick={() => onComplete(c.id)}
            disabled={c.completed}
            className={`shrink-0 w-4 h-4 rounded-[2px] border flex items-center justify-center transition-colors ${
              c.completed
                ? 'bg-primary border-primary text-primary-foreground'
                : 'border-border hover:border-primary'
            }`}
            aria-label={c.completed ? 'Completed' : 'Complete task'}
          >
            {c.completed && <Check size={10} strokeWidth={2.5} />}
          </button>

          <div className="flex-1 min-w-0">
            <div
              className={`font-display font-medium text-[13px] leading-tight truncate ${
                c.completed ? 'line-through text-muted-foreground' : 'text-foreground'
              }`}
            >
              {c.title}
            </div>
            <div className="font-mono text-[9px] text-muted-foreground/50 tracking-wider mt-0.5">
              {c.time ? formatTime12h(c.time) : '—'} · {formatDur(c.duration ?? c.preferredDuration ?? 30)}
              {c.preferredDuration && c.duration && c.preferredDuration !== c.duration && (
                <span className="ml-1 text-muted-foreground/30">
                  (pref {formatDur(c.preferredDuration)})
                </span>
              )}
            </div>
          </div>

          <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
            <button
              onClick={() => onReorder(c.id, -1)}
              disabled={i === 0}
              className="p-1 rounded-sm text-muted-foreground/60 hover:text-foreground hover:bg-muted/40 disabled:opacity-20 disabled:cursor-not-allowed"
              aria-label="Move up"
            >
              <ArrowUp size={11} strokeWidth={1.5} />
            </button>
            <button
              onClick={() => onReorder(c.id, 1)}
              disabled={i === children.length - 1}
              className="p-1 rounded-sm text-muted-foreground/60 hover:text-foreground hover:bg-muted/40 disabled:opacity-20 disabled:cursor-not-allowed"
              aria-label="Move down"
            >
              <ArrowDown size={11} strokeWidth={1.5} />
            </button>
            <button
              onClick={() => onUngroup(c)}
              className="p-1 rounded-sm text-muted-foreground/60 hover:text-foreground hover:bg-muted/40"
              aria-label="Remove from group"
              title="Remove from Group"
            >
              <LogOut size={11} strokeWidth={1.5} />
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}

// ─── Scheduler Mode ─────────────────────────────────────────

function SchedulerMode({
  group,
  children,
  onAdjust,
  onComplete,
}: {
  group: Task;
  children: Task[];
  onAdjust: (child: Task, delta: number) => void;
  onComplete: (id: string) => void;
}) {
  const totalDuration = group.duration ?? 30;
  const groupStart = timeToMinutes(group.time ?? '09:00');
  // Total preferred — used for "squeezed" warning treatment.
  const totalPreferred = children.reduce(
    (sum, c) => sum + (c.preferredDuration ?? c.duration ?? 30),
    0,
  );
  const isOverflowing = totalPreferred > totalDuration;

  return (
    <div className="py-1">
      {isOverflowing && (
        <div className="mb-2 px-2.5 py-1.5 rounded-sm bg-muted/30 font-mono text-[9px] tracking-wider text-muted-foreground/70">
          ⚠ Tasks total {formatDur(totalPreferred)} — squeezed to fit {formatDur(totalDuration)}
        </div>
      )}

      {/* Micro-timeline: stacked horizontal bars proportional to actual duration */}
      <div className="space-y-1.5">
        {children.map((c) => {
          const dur = c.duration ?? c.preferredDuration ?? 30;
          const pct = totalDuration > 0 ? (dur / totalDuration) * 100 : 0;
          const startMin = c.time ? timeToMinutes(c.time) : groupStart;
          const offsetMin = startMin - groupStart;

          return (
            <div key={c.id} className="space-y-1">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 min-w-0 flex-1">
                  <button
                    onClick={() => onComplete(c.id)}
                    disabled={c.completed}
                    className={`shrink-0 w-3.5 h-3.5 rounded-[2px] border flex items-center justify-center transition-colors ${
                      c.completed
                        ? 'bg-primary border-primary text-primary-foreground'
                        : 'border-border hover:border-primary'
                    }`}
                  >
                    {c.completed && <Check size={8} strokeWidth={2.5} />}
                  </button>
                  <span className={`font-display text-[12px] truncate ${
                    c.completed ? 'line-through text-muted-foreground' : 'text-foreground'
                  }`}>
                    {c.title}
                  </span>
                </div>

                <div className="flex items-center gap-1 shrink-0">
                  <button
                    onClick={() => onAdjust(c, -5)}
                    className="p-0.5 rounded-sm text-muted-foreground/60 hover:text-foreground hover:bg-muted/40"
                    aria-label="Decrease duration"
                  >
                    <Minus size={10} strokeWidth={1.5} />
                  </button>
                  <span className="font-mono text-[10px] text-muted-foreground/70 tabular-nums w-10 text-center">
                    {formatDur(dur)}
                  </span>
                  <button
                    onClick={() => onAdjust(c, 5)}
                    className="p-0.5 rounded-sm text-muted-foreground/60 hover:text-foreground hover:bg-muted/40"
                    aria-label="Increase duration"
                  >
                    <Plus size={10} strokeWidth={1.5} />
                  </button>
                </div>
              </div>

              {/* Proportional bar */}
              <div className="relative h-3 bg-muted/30 rounded-[2px] overflow-hidden">
                <div
                  className={`absolute top-0 bottom-0 ${
                    c.completed ? 'bg-primary/30' : 'bg-foreground/70'
                  }`}
                  style={{
                    left: `${(offsetMin / totalDuration) * 100}%`,
                    width: `${pct}%`,
                  }}
                />
              </div>
              <div className="font-mono text-[8px] text-muted-foreground/40 tracking-wider">
                {c.time ? formatTime12h(c.time) : '—'}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
