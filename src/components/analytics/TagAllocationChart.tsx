import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronDown, ChevronRight, ArrowLeft } from 'lucide-react';
import type { TagBreakdown } from '@/hooks/useAnalyticsData';

function formatTime(minutes: number): string {
  if (minutes < 60) return `${minutes}m`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
}

/** Aggregate subtags into their top-level parent */
function aggregateToParent(data: TagBreakdown[]): TagBreakdown[] {
  const parentMap = new Map<string, TagBreakdown>();

  data.forEach(item => {
    const rootTag = item.tag.split('/')[0];
    const existing = parentMap.get(rootTag);
    if (existing) {
      existing.scheduledMinutes += item.scheduledMinutes;
      existing.completedMinutes += item.completedMinutes;
      existing.taskCount += item.taskCount;
      existing.completedCount += item.completedCount;
    } else {
      parentMap.set(rootTag, {
        tag: rootTag,
        label: item.label.split('/')[0],
        scheduledMinutes: item.scheduledMinutes,
        completedMinutes: item.completedMinutes,
        taskCount: item.taskCount,
        completedCount: item.completedCount,
      });
    }
  });

  return [...parentMap.values()].sort((a, b) => b.scheduledMinutes - a.scheduledMinutes);
}

/** Get direct children of a parent tag */
function getSubtags(data: TagBreakdown[], parent: string): TagBreakdown[] {
  const prefix = parent + '/';
  const depth = parent.split('/').length + 1;

  // Aggregate at the next level
  const childMap = new Map<string, TagBreakdown>();

  data.forEach(item => {
    if (!item.tag.startsWith(prefix) && item.tag !== parent) return;
    if (item.tag === parent) {
      // Tasks tagged directly on parent (not subtag)
      const key = parent + '\u0000direct';
      const existing = childMap.get(key);
      if (existing) {
        existing.scheduledMinutes += item.scheduledMinutes;
        existing.completedMinutes += item.completedMinutes;
        existing.taskCount += item.taskCount;
        existing.completedCount += item.completedCount;
      } else {
        childMap.set(key, { ...item, tag: key, label: '(direct)' });
      }
      return;
    }

    const segments = item.tag.split('/');
    const childKey = segments.slice(0, depth).join('/');
    const childLabel = segments[depth - 1];

    const existing = childMap.get(childKey);
    if (existing) {
      existing.scheduledMinutes += item.scheduledMinutes;
      existing.completedMinutes += item.completedMinutes;
      existing.taskCount += item.taskCount;
      existing.completedCount += item.completedCount;
    } else {
      childMap.set(childKey, {
        tag: childKey,
        label: childLabel,
        scheduledMinutes: item.scheduledMinutes,
        completedMinutes: item.completedMinutes,
        taskCount: item.taskCount,
        completedCount: item.completedCount,
      });
    }
  });

  return [...childMap.values()].sort((a, b) => b.scheduledMinutes - a.scheduledMinutes);
}

function hasSubtags(data: TagBreakdown[], parent: string): boolean {
  if (parent.includes('\u0000')) return false;
  const prefix = parent + '/';
  return data.some(item => item.tag.startsWith(prefix));
}

interface Props {
  data: TagBreakdown[];
  dataType: string;
  onTagClick?: (tag: string) => void;
}

function getValue(item: TagBreakdown, dataType: string): number {
  switch (dataType) {
    case 'completed-time': return item.completedMinutes;
    case 'task-count': return item.taskCount;
    case 'completion-rate': return item.taskCount > 0 ? Math.round((item.completedCount / item.taskCount) * 100) : 0;
    default: return item.scheduledMinutes;
  }
}

function formatValue(value: number, dataType: string): string {
  if (dataType === 'task-count') return `${value}`;
  if (dataType === 'completion-rate') return `${value}%`;
  return formatTime(value);
}

function BarRow({ item, dataType, maxValue, index, hasSubs, expanded, onToggle, onTagClick }: {
  item: TagBreakdown;
  dataType: string;
  maxValue: number;
  index: number;
  hasSubs: boolean;
  expanded: boolean;
  onToggle: () => void;
  onTagClick?: (tag: string) => void;
}) {
  const value = getValue(item, dataType);
  const displayValue = formatValue(value, dataType);
  const pct = (value / maxValue) * 100;
  const isDirect = item.tag.includes('\u0000direct');

  return (
    <div className="w-full text-left group">
      <div className="flex items-center justify-between mb-0.5">
        <div className="flex items-center gap-1 min-w-0 flex-1">
          {hasSubs && (
            <button
              onClick={(e) => { e.stopPropagation(); onToggle(); }}
              className="p-0.5 rounded text-muted-foreground/40 hover:text-foreground transition-colors shrink-0"
            >
              {expanded ? <ChevronDown size={10} /> : <ChevronRight size={10} />}
            </button>
          )}
          {isDirect ? (
            <span className="text-[10px] font-mono text-muted-foreground/60 tracking-wide truncate">
              {item.label.toUpperCase()}
            </span>
          ) : (
            <button
              onClick={() => onTagClick?.(item.tag)}
              className="text-[10px] font-mono text-foreground/80 tracking-wide truncate hover:text-primary transition-colors"
            >
              {item.label.toUpperCase()}
            </button>
          )}
        </div>
        <span className="text-[10px] font-mono text-muted-foreground/60 tabular-nums ml-2 shrink-0">
          {displayValue}
        </span>
      </div>
      <div className="h-2 bg-muted/50 rounded-sm overflow-hidden">
        <motion.div
          initial={{ width: 0 }}
          animate={{ width: `${pct}%` }}
          transition={{ duration: 0.5, delay: index * 0.05, ease: [0.22, 1, 0.36, 1] }}
          className="h-full rounded-sm bg-foreground/70 group-hover:bg-primary transition-colors"
        />
      </div>
    </div>
  );
}

export function TagAllocationChart({ data, dataType, onTagClick }: Props) {
  const [expandedTags, setExpandedTags] = useState<Set<string>>(new Set());

  if (data.length === 0) {
    return (
      <div className="flex items-center justify-center h-32 text-[10px] font-mono text-muted-foreground/40 tracking-widest">
        NO DATA
      </div>
    );
  }

  const parentData = aggregateToParent(data);

  const maxValue = Math.max(...parentData.map(d => getValue(d, dataType)), 1);

  const toggleExpand = (tag: string) => {
    setExpandedTags(prev => {
      const next = new Set(prev);
      if (next.has(tag)) next.delete(tag);
      else next.add(tag);
      return next;
    });
  };

  return (
    <div className="space-y-2">
      {parentData.map((item, i) => {
        const hasSubs = hasSubtags(data, item.tag);
        const expanded = expandedTags.has(item.tag);

        return (
          <div key={item.tag}>
            <BarRow
              item={item}
              dataType={dataType}
              maxValue={maxValue}
              index={i}
              hasSubs={hasSubs}
              expanded={expanded}
              onToggle={() => toggleExpand(item.tag)}
              onTagClick={onTagClick}
            />
            <AnimatePresence>
              {expanded && hasSubs && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: 'auto', opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={{ duration: 0.2 }}
                  className="overflow-hidden"
                >
                  <SubtagBreakdown
                    allData={data}
                    parent={item.tag}
                    dataType={dataType}
                    onTagClick={onTagClick}
                  />
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        );
      })}
    </div>
  );
}

function SubtagBreakdown({ allData, parent, dataType, onTagClick }: {
  allData: TagBreakdown[];
  parent: string;
  dataType: string;
  onTagClick?: (tag: string) => void;
}) {
  const [expandedSubs, setExpandedSubs] = useState<Set<string>>(new Set());
  const subtags = getSubtags(allData, parent);
  const maxValue = Math.max(...subtags.map(d => getValue(d, dataType)), 1);

  const toggleExpand = (tag: string) => {
    setExpandedSubs(prev => {
      const next = new Set(prev);
      if (next.has(tag)) next.delete(tag);
      else next.add(tag);
      return next;
    });
  };

  return (
    <div className="pl-4 pt-1 space-y-1.5 border-l border-border/20 ml-1.5 mt-1">
      {subtags.map((sub, i) => {
        const hasSubs = hasSubtags(allData, sub.tag);
        const expanded = expandedSubs.has(sub.tag);

        return (
          <div key={sub.tag}>
            <BarRow
              item={sub}
              dataType={dataType}
              maxValue={maxValue}
              index={i}
              hasSubs={hasSubs}
              expanded={expanded}
              onToggle={() => toggleExpand(sub.tag)}
              onTagClick={onTagClick}
            />
            <AnimatePresence>
              {expanded && hasSubs && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: 'auto', opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={{ duration: 0.2 }}
                  className="overflow-hidden"
                >
                  <SubtagBreakdown
                    allData={allData}
                    parent={sub.tag}
                    dataType={dataType}
                    onTagClick={onTagClick}
                  />
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        );
      })}
    </div>
  );
}
