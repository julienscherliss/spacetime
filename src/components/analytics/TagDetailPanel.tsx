import { useMemo, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { X, Clock, CheckCircle, Calendar, TrendingUp, Tag as TagIcon } from 'lucide-react';
import { useTaskStore } from '@/store/taskStore';

import { useLibraryStore } from '@/store/libraryStore';
import { TagPickerMenu } from '@/components/TagPickerMenu';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { TagGoalEditor } from '@/components/analytics/TagGoalEditor';
import { subDays, format, parseISO } from 'date-fns';

function formatTime(minutes: number): string {
  if (minutes === 0) return '0m';
  if (minutes < 60) return `${minutes}m`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
}

interface Props {
  tag: string;
  onClose: () => void;
}

export function TagDetailPanel({ tag, onClose }: Props) {
  const tasks = useTaskStore(s => s.tasks);
  const setEditingTask = useTaskStore(s => s.setEditingTask);
  const updateTask = useTaskStore(s => s.updateTask);
  const categories = useLibraryStore(s => s.categories);
  const isUntagged = tag === 'untagged';
  const uncategorizedMatch = tag.match(/^(.+)\u0000uncategorized$/);
  const isUncategorizedDirect = !!uncategorizedMatch;
  const parentTag = uncategorizedMatch?.[1];
  const label = isUntagged
    ? 'UNTAGGED'
    : isUncategorizedDirect
      ? `${(categories.find(c => c.value === parentTag)?.label || parentTag)!.toUpperCase()} / UNCATEGORIZED`
      : (categories.find(c => c.value === tag)?.label || tag);

  const PAGE_SIZE = 20;
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const [batchMode, setBatchMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [showTagPicker, setShowTagPicker] = useState(false);
  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const longPressFired = useRef(false);

  const startLongPress = (taskId: string) => {
    longPressFired.current = false;
    if (longPressTimer.current) clearTimeout(longPressTimer.current);
    longPressTimer.current = setTimeout(() => {
      longPressFired.current = true;
      setBatchMode(true);
      setSelectedIds(prev => {
        const next = new Set(prev);
        next.add(taskId);
        return next;
      });
    }, 450);
  };
  const cancelLongPress = () => {
    if (longPressTimer.current) { clearTimeout(longPressTimer.current); longPressTimer.current = null; }
  };

  const toggleSelected = (taskId: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(taskId)) next.delete(taskId); else next.add(taskId);
      return next;
    });
  };

  const exitBatchMode = () => {
    setBatchMode(false);
    setSelectedIds(new Set());
    setShowTagPicker(false);
  };

  const applyTagToSelected = (newTag: string) => {
    selectedIds.forEach(id => {
      // Skip synthetic calendar entries (id prefixed with cal-)
      if (id.startsWith('cal-')) return;
      updateTask(id, { category: newTag });
    });
    exitBatchMode();
  };

  const stats = useMemo(() => {
    const tagTasks = tasks.filter(t => {
      if (t.archiveReason === 'deleted') return false;
      const cat = t.category || '';
      if (isUntagged) return !cat;
      if (isUncategorizedDirect) return cat === parentTag;
      return cat === tag;
    });
    const today = format(new Date(), 'yyyy-MM-dd');
    const week7 = format(subDays(new Date(), 7), 'yyyy-MM-dd');
    const week30 = format(subDays(new Date(), 30), 'yyyy-MM-dd');

    const last7 = tagTasks.filter(t => t.date >= week7 && t.date <= today);
    const last30 = tagTasks.filter(t => t.date >= week30 && t.date <= today);

    const totalScheduled = tagTasks.reduce((s, t) => s + (t.duration || 30), 0);
    const totalCompleted = tagTasks.filter(t => t.completed).reduce((s, t) => s + (t.duration || 30), 0);
    const completionRate = tagTasks.length > 0
      ? Math.round((tagTasks.filter(t => t.completed).length / tagTasks.length) * 100)
      : 0;

    // Top days
    const dayMap = new Map<string, number>();
    tagTasks.forEach(t => {
      const dow = parseISO(t.date).toLocaleDateString('en', { weekday: 'short' });
      dayMap.set(dow, (dayMap.get(dow) || 0) + (t.duration || 30));
    });
    const topDays = [...dayMap.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3);

    // Weekly average
    const weeklyAvg = last30.length > 0
      ? Math.round(last30.reduce((s, t) => s + (t.duration || 30), 0) / 4)
      : 0;

    // Recent tasks (all, sorted newest first; UI paginates)
    const recentTasks = [...tagTasks].sort((a, b) => b.date.localeCompare(a.date));

    return {
      totalTasks: tagTasks.length,
      totalScheduled,
      totalCompleted,
      completionRate,
      last7Count: last7.length,
      last7Minutes: last7.reduce((s, t) => s + (t.duration || 30), 0),
      topDays,
      weeklyAvg,
      recentTasks,
    };
  }, [tasks, tag, isUntagged, isUncategorizedDirect, parentTag]);

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 20 }}
      transition={{ duration: 0.2 }}
      className="fixed inset-0 z-50 bg-background/95 backdrop-blur-sm overflow-y-auto"
    >
      <div className="max-w-lg mx-auto px-4 py-6">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h2 className="font-display text-lg font-bold text-foreground tracking-tight">{label.toUpperCase()}</h2>
            <p className="text-[9px] font-mono text-muted-foreground/50 tracking-widest mt-0.5">
              {batchMode ? `${selectedIds.size} SELECTED` : 'TAG DETAIL'}
            </p>
          </div>
          <div className="flex items-center gap-1">
            {batchMode && (
              <>
                <Popover open={showTagPicker} onOpenChange={setShowTagPicker}>
                  <PopoverTrigger asChild>
                    <button
                      disabled={selectedIds.size === 0}
                      className="px-2.5 py-1.5 rounded-md text-[10px] font-mono tracking-[0.12em] border border-primary/40 text-primary hover:bg-primary/10 transition-colors flex items-center gap-1.5 disabled:opacity-40"
                    >
                      <TagIcon size={11} /> ASSIGN TAG
                    </button>
                  </PopoverTrigger>
                  <PopoverContent className="w-44 p-1 z-[70]" align="end">
                    <TagPickerMenu
                      value=""
                      onChange={(v) => applyTagToSelected(v)}
                      onClose={() => setShowTagPicker(false)}
                    />
                  </PopoverContent>
                </Popover>
                <button
                  onClick={exitBatchMode}
                  className="px-2.5 py-1.5 rounded-md text-[10px] font-mono tracking-[0.12em] text-muted-foreground hover:text-foreground hover:bg-muted/40 transition-colors"
                >
                  CANCEL
                </button>
              </>
            )}
            {!batchMode && (
              <button onClick={onClose} className="p-2 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted/40 transition-colors">
                <X size={18} />
              </button>
            )}
          </div>
        </div>

        {/* Summary cards */}
        <div className="grid grid-cols-2 gap-3 mb-6">
          {[
            { icon: Clock, label: 'TOTAL SCHEDULED', value: formatTime(stats.totalScheduled) },
            { icon: CheckCircle, label: 'TOTAL COMPLETED', value: formatTime(stats.totalCompleted) },
            { icon: Calendar, label: 'WEEKLY AVG', value: formatTime(stats.weeklyAvg) },
            { icon: TrendingUp, label: 'COMPLETION', value: `${stats.completionRate}%` },
          ].map(card => (
            <div key={card.label} className="border border-border/30 rounded-md p-3 bg-card/50">
              <div className="flex items-center gap-1.5 mb-1">
                <card.icon size={10} className="text-muted-foreground/40" />
                <span className="text-[8px] font-mono text-muted-foreground/40 tracking-[0.12em]">{card.label}</span>
              </div>
              <span className="text-base font-display font-bold text-foreground">{card.value}</span>
            </div>
          ))}
        </div>

        {/* Top days */}
        {stats.topDays.length > 0 && (
          <div className="mb-6">
            <h3 className="text-[9px] font-mono text-muted-foreground/40 tracking-[0.15em] mb-2">TOP DAYS</h3>
            <div className="flex gap-2">
              {stats.topDays.map(([day, mins]) => (
                <div key={day} className="border border-border/30 rounded px-3 py-2 bg-card/30 flex-1 text-center">
                  <span className="text-[11px] font-mono text-foreground/80 block">{day}</span>
                  <span className="text-[9px] font-mono text-muted-foreground/50">{formatTime(mins)}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Goals — only for real tags (not the synthetic untagged / uncategorized buckets) */}
        {!isUntagged && !isUncategorizedDirect && (
          <TagGoalEditor tag={tag} tagLabel={label} />
        )}

        {/* Recent tasks */}
        <div>
          <h3 className="text-[9px] font-mono text-muted-foreground/40 tracking-[0.15em] mb-2">
            RECENT TASKS <span className="text-muted-foreground/30">({stats.recentTasks.length})</span>
          </h3>
          {batchMode ? (
            <p className="text-[9px] font-mono text-primary/70 mb-2 leading-relaxed">
              Tap tasks to select, then ASSIGN TAG. Long-press already enabled batch mode.
            </p>
          ) : (isUntagged || isUncategorizedDirect) && stats.recentTasks.length > 0 && (
            <p className="text-[9px] font-mono text-muted-foreground/50 mb-2 leading-relaxed">
              Click a task to open it. Long-press to batch-assign a tag to multiple tasks.
            </p>
          )}
          <div className="space-y-1">
            {stats.recentTasks.slice(0, visibleCount).map(t => {
              const isSynthetic = t.id.startsWith('cal-');
              const selected = selectedIds.has(t.id);
              return (
                <button
                  key={t.id}
                  onPointerDown={() => { if (!isSynthetic) startLongPress(t.id); }}
                  onPointerUp={cancelLongPress}
                  onPointerLeave={cancelLongPress}
                  onPointerCancel={cancelLongPress}
                  onClick={() => {
                    if (longPressFired.current) { longPressFired.current = false; return; }
                    if (batchMode) {
                      if (!isSynthetic) toggleSelected(t.id);
                    } else {
                      setEditingTask(t.id);
                    }
                  }}
                  onContextMenu={(e) => {
                    if (isSynthetic) return;
                    e.preventDefault();
                    setBatchMode(true);
                    setSelectedIds(prev => { const n = new Set(prev); n.add(t.id); return n; });
                  }}
                  className={`w-full flex items-center gap-2 py-1.5 px-2 rounded border transition-colors text-left cursor-pointer select-none ${
                    selected
                      ? 'border-primary/50 bg-primary/10'
                      : 'border-border/20 bg-card/30 hover:bg-card/60'
                  } ${isSynthetic && batchMode ? 'opacity-40' : ''}`}
                >
                  {batchMode && (
                    <div className={`w-3 h-3 rounded-sm border shrink-0 flex items-center justify-center ${
                      selected ? 'bg-primary border-primary' : 'border-muted-foreground/40'
                    }`}>
                      {selected && <div className="w-1.5 h-1.5 bg-primary-foreground rounded-[1px]" />}
                    </div>
                  )}
                  <div className={`w-1.5 h-1.5 rounded-full ${t.completed ? 'bg-green-500/60' : 'bg-muted-foreground/30'}`} />
                  <span className="text-[10px] font-mono text-foreground/70 flex-1 truncate">{t.title}</span>
                  <span className="text-[8px] font-mono text-muted-foreground/40 shrink-0">{t.date}</span>
                  <span className="text-[8px] font-mono text-muted-foreground/60 tabular-nums shrink-0 ml-1 min-w-[28px] text-right">
                    {formatTime(t.duration || 30)}
                  </span>
                </button>
              );
            })}
            {stats.recentTasks.length === 0 && (
              <p className="text-[10px] font-mono text-muted-foreground/40 text-center py-4">NO TASKS</p>
            )}
          </div>
          {visibleCount < stats.recentTasks.length && (
            <button
              onClick={() => setVisibleCount(c => c + PAGE_SIZE)}
              className="w-full mt-3 py-2 text-[9px] font-mono text-muted-foreground/60 hover:text-foreground tracking-[0.15em] border border-border/30 rounded hover:bg-muted/40 transition-colors"
            >
              LOAD MORE ({stats.recentTasks.length - visibleCount} REMAINING)
            </button>
          )}
        </div>
      </div>
    </motion.div>
  );
}
