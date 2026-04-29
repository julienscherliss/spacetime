import { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useTaskStore, Task } from '@/store/taskStore';
import { useLibraryStore } from '@/store/libraryStore';

import { X, RotateCcw, CheckCircle2, Trash2, Filter, Clock, AlertTriangle, Tag, ChevronDown, ChevronRight } from 'lucide-react';
import { format, isToday, isYesterday, startOfWeek, isWithinInterval, subDays } from 'date-fns';

type ArchiveFilter = 'all' | 'completed' | 'deleted' | 'tags';

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
  const { tasks, restoreTask, setEditingTask } = useTaskStore();
  const allCategories = useLibraryStore((s) => s.categories);
  const allLibItems = useLibraryStore((s) => s.items);
  const unarchiveCategory = useLibraryStore((s) => s.unarchiveCategory);
  const archivedTags = useMemo(
    () => allCategories.filter((c) => c.archived),
    [allCategories]
  );
  const tagUsageCount = (value: string) => {
    const taskCount = tasks.filter((t) =>
      t.category === value || (t.category && t.category.startsWith(value + '/'))
    ).length;
    const libCount = allLibItems.filter((i) =>
      i.category === value || (i.category && i.category.startsWith(value + '/'))
    ).length;
    return taskCount + libCount;
  };
  const [filter, setFilter] = useState<ArchiveFilter>('all');
  const [tagFilter, setTagFilter] = useState<string>('all');

  // Collect tags actually present on archived tasks
  const archivedTaskTags = useMemo(() => {
    const set = new Set<string>();
    tasks.forEach((t) => {
      if (t.archivedAt && t.category) set.add(t.category);
    });
    return Array.from(set).sort();
  }, [tasks]);

  const tagLabel = (value: string) => {
    const cat = allCategories.find((c) => c.value === value);
    return cat?.label ?? value;
  };

  const archived = useMemo(() => {
    return tasks
      .filter((t) => !!t.archivedAt)
      .filter((t) => {
        if (filter === 'completed') return t.archiveReason === 'completed';
        if (filter === 'deleted') return t.archiveReason === 'deleted';
        return true;
      })
      .filter((t) => {
        if (tagFilter === 'all') return true;
        if (tagFilter === '__none__') return !t.category;
        return t.category === tagFilter || (t.category && t.category.startsWith(tagFilter + '/'));
      })
      .sort((a, b) => new Date(b.archivedAt!).getTime() - new Date(a.archivedAt!).getTime());
  }, [tasks, filter, tagFilter]);

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
    { key: 'tags', label: 'Tags' },
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

            {/* Tag filter — only when not on the Tags management view */}
            {filter !== 'tags' && archivedTaskTags.length > 0 && (
              <div className="flex items-center gap-1 px-4 pb-3 overflow-x-auto">
                <span className="text-[9px] font-mono text-muted-foreground/50 tracking-[0.15em] uppercase pr-1 shrink-0">
                  Tag
                </span>
                <button
                  onClick={() => setTagFilter('all')}
                  className={`px-2 py-1 rounded-md text-[10px] font-mono tracking-wide transition-colors shrink-0 ${
                    tagFilter === 'all'
                      ? 'bg-foreground/8 text-foreground border border-border/50'
                      : 'text-muted-foreground hover:text-foreground'
                  }`}
                >
                  All
                </button>
                {archivedTaskTags.map((value) => (
                  <button
                    key={value}
                    onClick={() => setTagFilter(value)}
                    className={`px-2 py-1 rounded-md text-[10px] font-mono tracking-wide transition-colors shrink-0 flex items-center gap-1 ${
                      tagFilter === value
                        ? 'bg-foreground/8 text-foreground border border-border/50'
                        : 'text-muted-foreground hover:text-foreground'
                    }`}
                  >
                    <Tag size={10} strokeWidth={1.5} />
                    {tagLabel(value)}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Content */}
          <div className="overflow-y-auto" style={{ height: 'calc(100vh - 100px)' }}>
            {filter === 'tags' ? (
              archivedTags.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-64 text-center px-6">
                  <div className="w-10 h-10 rounded-full bg-muted/50 flex items-center justify-center mb-3">
                    <Tag size={16} className="text-muted-foreground/40" />
                  </div>
                  <p className="text-xs font-mono text-muted-foreground/60 tracking-wide">
                    No archived tags
                  </p>
                  <p className="text-[10px] font-mono text-muted-foreground/30 mt-1">
                    Archived tags stay attached to tasks but hide from the picker
                  </p>
                </div>
              ) : (
                <div className="divide-y divide-border/20 pb-8">
                  {archivedTags.map((cat) => {
                    const count = tagUsageCount(cat.value);
                    return (
                      <div key={cat.value} className="flex items-center gap-3 px-4 py-3 group">
                        <div className="shrink-0 text-muted-foreground/40">
                          <Tag size={14} strokeWidth={1.5} />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="text-xs font-mono text-foreground/70 truncate">
                            {cat.label}
                          </div>
                          <div className="text-[9px] font-mono text-muted-foreground/40 mt-0.5">
                            {count} task{count === 1 ? '' : 's'} still tagged
                          </div>
                        </div>
                        <button
                          onClick={() => unarchiveCategory(cat.value)}
                          className="shrink-0 flex items-center gap-1 px-2 py-1 rounded-md text-[9px] font-mono tracking-wide text-muted-foreground/50 hover:text-foreground hover:bg-muted/50 transition-colors sm:opacity-0 sm:group-hover:opacity-100"
                        >
                          <RotateCcw size={11} strokeWidth={1.5} />
                          <span>Restore</span>
                        </button>
                      </div>
                    );
                  })}
                </div>
              )
            ) : archived.length === 0 ? (
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
                        <ArchiveRow key={task.id} task={task} onRevive={handleRevive} onEdit={setEditingTask} />
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

function ArchiveRow({ task, onRevive, onEdit }: { task: Task; onRevive: (id: string) => void; onEdit: (id: string) => void }) {
  const isCompleted = task.archiveReason === 'completed';
  const [expanded, setExpanded] = useState(false);
  const hasDetails = !!(task.description || (task.subtasks && task.subtasks.length > 0) || task.category || task.date || task.time);

  return (
    <div className="px-4 py-3 group">
      <div className="flex items-center gap-3">
      {/* Expand toggle */}
      <button
        onClick={() => setExpanded((v) => !v)}
        disabled={!hasDetails}
        className={`shrink-0 p-0.5 rounded transition-colors ${
          hasDetails ? 'text-muted-foreground/50 hover:text-foreground hover:bg-muted/50' : 'text-muted-foreground/20 cursor-default'
        }`}
        aria-label={expanded ? 'Collapse details' : 'Expand details'}
      >
        {expanded ? <ChevronDown size={12} strokeWidth={1.5} /> : <ChevronRight size={12} strokeWidth={1.5} />}
      </button>

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
        <button
          onClick={() => onEdit(task.id)}
          className={`text-xs font-mono truncate text-left hover:underline cursor-pointer ${isCompleted ? 'text-muted-foreground line-through' : 'text-foreground/70'}`}
        >
          {task.title}
        </button>
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
          {task.category && (
            <span className="text-[9px] font-mono text-muted-foreground/40 flex items-center gap-1">
              <Tag size={9} strokeWidth={1.5} />
              {task.category}
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

      {/* Expanded details */}
      <AnimatePresence initial={false}>
        {expanded && hasDetails && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.15 }}
            className="overflow-hidden"
          >
            <div className="pl-10 pr-2 pt-2 space-y-1.5">
              {(task.date || task.time) && (
                <div className="text-[10px] font-mono text-muted-foreground/60">
                  <span className="text-muted-foreground/40">When: </span>
                  {task.date}{task.time ? ` · ${task.time}` : ''}
                </div>
              )}
              {task.description && (
                <div className="text-[10px] font-mono text-muted-foreground/70 whitespace-pre-wrap">
                  {task.description}
                </div>
              )}
              {task.subtasks && task.subtasks.length > 0 && (
                <div className="space-y-0.5">
                  {task.subtasks.map((s: any, i: number) => (
                    <div key={i} className="text-[10px] font-mono text-muted-foreground/60 flex items-center gap-1.5">
                      <span className={s.completed ? 'text-muted-foreground/40' : 'text-muted-foreground/60'}>
                        {s.completed ? '✓' : '○'}
                      </span>
                      <span className={s.completed ? 'line-through' : ''}>{s.title}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
