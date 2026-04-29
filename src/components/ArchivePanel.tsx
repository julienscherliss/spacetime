import { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useTaskStore, Task } from '@/store/taskStore';
import { useLibraryStore } from '@/store/libraryStore';

import { X, RotateCcw, CheckCircle2, Trash2, Filter, Tag, ChevronsUpDown } from 'lucide-react';
import { format, isToday, isYesterday } from 'date-fns';

type ArchiveFilter = 'all' | 'completed' | 'deleted' | 'tags';

interface ArchivePanelProps {
  open: boolean;
  onClose: () => void;
}

function getDayKey(dateStr: string): string {
  // YYYY-MM-DD bucket key based on local time of archivedAt
  const d = new Date(dateStr);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
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
  const [drilldownParent, setDrilldownParent] = useState<string | null>(null);
  const [expandAll, setExpandAll] = useState(false);

  // Collect tags actually present on archived tasks, split by root vs sub
  const { archivedRootTags, archivedSubTagsByRoot } = useMemo(() => {
    const all = new Set<string>();
    tasks.forEach((t) => {
      if (t.archivedAt && t.category) all.add(t.category);
    });
    const roots = new Set<string>();
    const subs = new Map<string, Set<string>>();
    all.forEach((value) => {
      const root = value.split('/')[0];
      roots.add(root);
      if (value !== root) {
        if (!subs.has(root)) subs.set(root, new Set());
        subs.get(root)!.add(value);
      }
    });
    const subsObj: Record<string, string[]> = {};
    subs.forEach((v, k) => { subsObj[k] = Array.from(v).sort(); });
    return {
      archivedRootTags: Array.from(roots).sort(),
      archivedSubTagsByRoot: subsObj,
    };
  }, [tasks]);

  const tagLabel = (value: string) => {
    const cat = allCategories.find((c) => c.value === value);
    return cat?.label ?? value;
  };

  const drilldownSubs = drilldownParent ? (archivedSubTagsByRoot[drilldownParent] || []) : [];

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
    const groups: { key: string; date: Date; tasks: Task[] }[] = [];
    const seen = new Map<string, { key: string; date: Date; tasks: Task[] }>();
    archived.forEach((t) => {
      const key = getDayKey(t.archivedAt!);
      if (!seen.has(key)) {
        const entry = { key, date: new Date(t.archivedAt!), tasks: [] as Task[] };
        seen.set(key, entry);
        groups.push(entry);
      }
      seen.get(key)!.tasks.push(t);
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

            {/* Tag filter — library-style pill chips with drilldown */}
            {filter !== 'tags' && archivedRootTags.length > 0 && (
              <div className="flex items-center gap-1.5 px-4 pb-3 overflow-x-auto scrollbar-none">
                {drilldownParent ? (
                  <>
                    <ArchiveChip
                      active={false}
                      label="← Back"
                      onClick={() => { setDrilldownParent(null); setTagFilter('all'); }}
                    />
                    <ArchiveChip
                      active={tagFilter === drilldownParent}
                      label={tagLabel(drilldownParent)}
                      onClick={() => setTagFilter(drilldownParent)}
                    />
                    {drilldownSubs.map((sub) => {
                      const subOnly = sub.split('/').slice(1).join('/');
                      const fullLabel = tagLabel(sub);
                      const subLabel = fullLabel.includes(' / ')
                        ? fullLabel.split(' / ').slice(1).join(' / ')
                        : (subOnly || fullLabel);
                      return (
                        <ArchiveChip
                          key={sub}
                          active={tagFilter === sub}
                          label={subLabel}
                          onClick={() => setTagFilter(sub)}
                        />
                      );
                    })}
                  </>
                ) : (
                  <>
                    <ArchiveChip
                      active={tagFilter === 'all'}
                      label="All"
                      onClick={() => setTagFilter('all')}
                    />
                    <ArchiveChip
                      active={tagFilter === '__none__'}
                      label="Untagged"
                      onClick={() => setTagFilter(tagFilter === '__none__' ? 'all' : '__none__')}
                    />
                    {archivedRootTags.map((root) => {
                      const hasSubs = (archivedSubTagsByRoot[root] || []).length > 0;
                      return (
                        <ArchiveChip
                          key={root}
                          active={tagFilter === root || (!!archivedSubTagsByRoot[root]?.includes(tagFilter))}
                          label={tagLabel(root)}
                          onClick={() => {
                            if (tagFilter === root && hasSubs) {
                              setDrilldownParent(root);
                            } else {
                              setTagFilter(tagFilter === root ? 'all' : root);
                            }
                          }}
                        />
                      );
                    })}
                  </>
                )}

                {/* Expand-all toggle */}
                <div className="flex-1 min-w-2" />
                <button
                  onClick={() => setExpandAll((v) => !v)}
                  title={expandAll ? 'Collapse all details' : 'Expand all details'}
                  className={`shrink-0 flex items-center gap-1 px-2.5 py-1.5 rounded-full text-[10px] font-mono tracking-wider transition-colors border min-h-[32px] ${
                    expandAll
                      ? 'border-foreground/25 bg-foreground/8 text-foreground font-medium'
                      : 'border-border/50 text-muted-foreground/60 hover:text-foreground hover:border-border'
                  }`}
                >
                  <ChevronsUpDown size={10} strokeWidth={1.5} />
                  <span>{expandAll ? 'Collapse' : 'Expand'}</span>
                </button>
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
              <div className="pb-8 px-4 sm:px-6 pt-4 space-y-6">
                {grouped.map((group) => {
                  const d = group.date;
                  const today = isToday(d);
                  const yest = isYesterday(d);
                  const weekdayColor = today
                    ? 'text-accent'
                    : 'text-foreground/80';
                  const dateNumColor = today
                    ? 'text-accent'
                    : 'text-foreground/70';
                  const weekdayLabel = today
                    ? 'Today'
                    : yest
                    ? 'Yesterday'
                    : d.toLocaleDateString('en-US', { weekday: 'long' });
                  return (
                    <section key={group.key}>
                      <div className="w-full flex items-start justify-between gap-4 px-1 mb-3">
                        <span
                          className={`text-4xl sm:text-5xl font-display font-bold uppercase leading-none tracking-tight ${weekdayColor}`}
                        >
                          {weekdayLabel}
                        </span>
                        <div className="flex flex-col items-end leading-tight pt-1">
                          <span className={`text-lg sm:text-xl font-display font-bold tabular-nums ${dateNumColor}`}>
                            {d.getDate()}
                          </span>
                          <span className="text-xs font-display text-muted-foreground">
                            {d.toLocaleDateString('en-US', { month: 'long' })}
                          </span>
                        </div>
                      </div>
                      <div className="divide-y divide-border/20 pl-1">
                        {group.tasks.map((task) => (
                          <ArchiveRow key={task.id} task={task} onRevive={handleRevive} onEdit={setEditingTask} expandAll={expandAll} />
                        ))}
                      </div>
                    </section>
                  );
                })}
              </div>
            )}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function ArchiveChip({ active, label, onClick }: { active: boolean; label: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={`shrink-0 px-3 py-1.5 rounded-full text-[10px] font-mono tracking-wider transition-colors min-h-[32px] border select-none ${
        active
          ? 'border-foreground/25 bg-foreground/8 text-foreground font-medium'
          : 'border-border/50 text-muted-foreground/60 hover:text-foreground hover:border-border'
      }`}
    >
      {label}
    </button>
  );
}

function ArchiveRow({ task, onRevive, onEdit, expandAll }: { task: Task; onRevive: (id: string) => void; onEdit: (id: string) => void; expandAll: boolean }) {
  const isCompleted = task.archiveReason === 'completed';
  const hasDetails = !!(task.description || (task.subtasks && task.subtasks.length > 0));
  const expanded = expandAll && hasDetails;

  return (
    <div className="px-4 py-3 group">
      <div className="flex items-center gap-3">
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
            <div className="pl-7 pr-2 pt-2 space-y-1.5">
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
