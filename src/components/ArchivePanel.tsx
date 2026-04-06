import { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useTaskStore, Task } from '@/store/taskStore';
import { X, RotateCcw, CheckCircle2, Trash2, Filter, Clock, AlertTriangle } from 'lucide-react';
import { format, isToday, isYesterday, startOfWeek, isWithinInterval, subDays } from 'date-fns';

type ArchiveFilter = 'all' | 'completed' | 'deleted';

interface ArchivePanelProps {
  open: boolean;
  onClose: () => void;
}

function getDateGroup(dateStr: string): string {
  const d = new Date(dateStr);
  if (isToday(d)) return 'Today';
  if (isYesterday(d)) return 'Yesterday';
  const weekStart = startOfWeek(new Date(), { weekStartsOn: 1 });
  if (isWithinInterval(d, { start: weekStart, end: new Date() })) return 'Earlier this week';
  const lastWeekStart = subDays(weekStart, 7);
  if (isWithinInterval(d, { start: lastWeekStart, end: subDays(weekStart, 1) })) return 'Last week';
  return format(d, 'MMMM d, yyyy');
}

function formatDuration(mins?: number) {
  if (!mins) return null;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  if (h && m) return `${h}h ${m}m`;
  if (h) return `${h}h`;
  return `${m}m`;
}

export function ArchivePanel({ open, onClose }: ArchivePanelProps) {
  const { tasks, restoreTask } = useTaskStore();
  const [filter, setFilter] = useState<ArchiveFilter>('all');

  const archived = useMemo(() => {
    return tasks
      .filter((t) => !!t.archivedAt)
      .filter((t) => {
        if (filter === 'completed') return t.archiveReason === 'completed';
        if (filter === 'deleted') return t.archiveReason === 'deleted';
        return true;
      })
      .sort((a, b) => new Date(b.archivedAt!).getTime() - new Date(a.archivedAt!).getTime());
  }, [tasks, filter]);

  const grouped = useMemo(() => {
    const groups: { label: string; tasks: Task[] }[] = [];
    const seen = new Map<string, Task[]>();
    archived.forEach((t) => {
      const label = getDateGroup(t.archivedAt!);
      if (!seen.has(label)) {
        const arr: Task[] = [];
        seen.set(label, arr);
        groups.push({ label, tasks: arr });
      }
      seen.get(label)!.push(t);
    });
    return groups;
  }, [archived]);

  const handleRevive = (id: string) => {
    restoreTask(id);
  };

  const filters: { key: ArchiveFilter; label: string }[] = [
    { key: 'all', label: 'All' },
    { key: 'completed', label: 'Completed' },
    { key: 'deleted', label: 'Deleted' },
  ];

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          className="fixed inset-0 z-50 bg-background"
        >
          {/* Header */}
          <div className="sticky top-0 z-10 bg-background border-b border-border/40">
            <div className="flex items-center justify-between px-4 py-3">
              <div className="flex items-center gap-2">
                <h2 className="text-sm font-mono font-semibold tracking-wide uppercase text-foreground">
                  Archive
                </h2>
                {archived.length > 0 && (
                  <span className="text-[10px] font-mono text-muted-foreground/50">
                    {archived.length}
                  </span>
                )}
              </div>
              <button
                onClick={onClose}
                className="p-2 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors"
              >
                <X size={18} strokeWidth={1.5} />
              </button>
            </div>

            {/* Filters */}
            <div className="flex items-center gap-1 px-4 pb-3">
              {filters.map((f) => (
                <button
                  key={f.key}
                  onClick={() => setFilter(f.key)}
                  className={`px-3 py-1.5 rounded-md text-[10px] font-mono tracking-wide transition-colors ${
                    filter === f.key
                      ? 'bg-foreground/8 text-foreground border border-border/50'
                      : 'text-muted-foreground hover:text-foreground'
                  }`}
                >
                  {f.label}
                </button>
              ))}
            </div>
          </div>

          {/* Content */}
          <div className="overflow-y-auto" style={{ height: 'calc(100vh - 100px)' }}>
            {archived.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-64 text-center px-6">
                <div className="w-10 h-10 rounded-full bg-muted/50 flex items-center justify-center mb-3">
                  <Filter size={16} className="text-muted-foreground/40" />
                </div>
                <p className="text-xs font-mono text-muted-foreground/60 tracking-wide">
                  {filter === 'all' ? 'No archived tasks yet' : `No ${filter} tasks`}
                </p>
                <p className="text-[10px] font-mono text-muted-foreground/30 mt-1">
                  Completed and deleted tasks will appear here
                </p>
              </div>
            ) : (
              <div className="pb-8">
                {grouped.map((group) => (
                  <div key={group.label}>
                    <div className="sticky top-0 bg-background/95 backdrop-blur-sm px-4 py-2 border-b border-border/20">
                      <span className="text-[9px] font-mono text-muted-foreground/50 tracking-[0.15em] uppercase">
                        {group.label}
                      </span>
                    </div>
                    <div className="divide-y divide-border/20">
                      {group.tasks.map((task) => (
                        <ArchiveRow key={task.id} task={task} onRevive={handleRevive} />
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function ArchiveRow({ task, onRevive }: { task: Task; onRevive: (id: string) => void }) {
  const isCompleted = task.archiveReason === 'completed';

  return (
    <div className="flex items-center gap-3 px-4 py-3 group">
      {/* Status icon */}
      <div className={`shrink-0 ${isCompleted ? 'text-muted-foreground/40' : 'text-destructive/40'}`}>
        {isCompleted ? (
          <CheckCircle2 size={14} strokeWidth={1.5} />
        ) : (
          <Trash2 size={14} strokeWidth={1.5} />
        )}
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <p className={`text-xs font-mono truncate ${isCompleted ? 'text-muted-foreground line-through' : 'text-foreground/70'}`}>
          {task.title}
        </p>
        <div className="flex items-center gap-2 mt-0.5">
          {task.duration && (
            <span className="text-[9px] font-mono text-muted-foreground/40">
              {formatDuration(task.duration)}
            </span>
          )}
          {task.archivedAt && (
            <span className="text-[9px] font-mono text-muted-foreground/30">
              {format(new Date(task.archivedAt), 'h:mm a')}
            </span>
          )}
        </div>
      </div>

      {/* Revive button */}
      <button
        onClick={() => onRevive(task.id)}
        className="shrink-0 flex items-center gap-1 px-2 py-1 rounded-md text-[9px] font-mono tracking-wide text-muted-foreground/50 hover:text-foreground hover:bg-muted/50 transition-colors sm:opacity-0 sm:group-hover:opacity-100"
      >
        <RotateCcw size={11} strokeWidth={1.5} />
        <span>Revive</span>
      </button>
    </div>
  );
}
