import { useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronDown, ChevronRight, Archive, ArchiveRestore } from 'lucide-react';
import { useTaskStore } from '@/store/taskStore';
import { useLibraryStore } from '@/store/libraryStore';
import { useBillingStore } from '@/store/billingStore';
import { findBillableAncestor } from '@/lib/billingInheritance';
import { HoldToDeleteButton } from './HoldToDeleteButton';
import {
  startOfDay, endOfDay, startOfWeek, endOfWeek, startOfMonth, endOfMonth,
  subDays, subWeeks, subMonths, parseISO, isWithinInterval, differenceInDays,
} from 'date-fns';

type RangeKey = 'today' | 'this-week' | 'last-week' | 'this-month' | 'last-month' | 'all-time';

const RANGES: { key: RangeKey; label: string }[] = [
  { key: 'today', label: 'TODAY' },
  { key: 'this-week', label: 'THIS WEEK' },
  { key: 'last-week', label: 'LAST WEEK' },
  { key: 'this-month', label: 'THIS MONTH' },
  { key: 'last-month', label: 'LAST MONTH' },
  { key: 'all-time', label: 'ALL TIME' },
];

function rangeFor(key: RangeKey): { start: Date; end: Date } | null {
  const now = new Date();
  switch (key) {
    case 'today': return { start: startOfDay(now), end: endOfDay(now) };
    case 'this-week': return { start: startOfWeek(now, { weekStartsOn: 1 }), end: endOfWeek(now, { weekStartsOn: 1 }) };
    case 'last-week': {
      const w = subWeeks(now, 1);
      return { start: startOfWeek(w, { weekStartsOn: 1 }), end: endOfWeek(w, { weekStartsOn: 1 }) };
    }
    case 'this-month': return { start: startOfMonth(now), end: endOfMonth(now) };
    case 'last-month': { const m = subMonths(now, 1); return { start: startOfMonth(m), end: endOfMonth(m) }; }
    case 'all-time': return null;
  }
}

function formatTime(min: number): string {
  if (!min) return '0m';
  if (min < 60) return `${Math.round(min)}m`;
  const h = Math.floor(min / 60);
  const m = Math.round(min % 60);
  return m ? `${h}h ${m}m` : `${h}h`;
}

interface TagRow {
  value: string;
  label: string;
  archived: boolean;
  minutes: number;       // minutes inside selected range
  daysSince: number | null; // days since most recent task touch (any time)
}

export function BillableTimeBreakdown() {
  const tasks = useTaskStore(s => s.tasks);
  const categories = useLibraryStore(s => s.categories);
  const archiveCategory = useLibraryStore(s => s.archiveCategory);
  const unarchiveCategory = useLibraryStore(s => s.unarchiveCategory);
  const removeCategory = useLibraryStore(s => s.removeCategory);
  const settings = useBillingStore(s => s.settings);

  const [range, setRange] = useState<RangeKey>('this-week');
  const [showArchived, setShowArchived] = useState(false);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const interval = useMemo(() => rangeFor(range), [range]);

  // Determine which tags are billable (direct or inherited).
  const billableTagValues = useMemo(() => {
    const set = new Set<string>();
    for (const s of settings) if (s.billable) set.add(s.tagValue);
    for (const c of categories) {
      if (findBillableAncestor(c.value, settings)) set.add(c.value);
    }
    return set;
  }, [settings, categories]);

  // Per-tag aggregates: minutes in range + lastUsed date across ALL time.
  const perTag = useMemo(() => {
    const minutes = new Map<string, number>();
    const lastUsed = new Map<string, string>(); // YYYY-MM-DD
    const now = new Date();

    for (const t of tasks) {
      if (t.archiveReason === 'deleted') continue;
      const cat = t.category || '';
      if (!cat) continue;
      const dur = t.duration || 30;
      const dateStr = t.date;
      let inRange = true;
      if (interval) {
        try {
          const d = parseISO(dateStr);
          inRange = isWithinInterval(d, interval);
        } catch { inRange = false; }
      }

      const segments = cat.split('/');
      for (let i = segments.length; i >= 1; i--) {
        const ancestor = segments.slice(0, i).join('/');
        if (inRange && t.completed) {
          minutes.set(ancestor, (minutes.get(ancestor) || 0) + dur);
        }
        // last used = most recent task date for this tag (any status)
        const prev = lastUsed.get(ancestor);
        if (!prev || dateStr > prev) lastUsed.set(ancestor, dateStr);
      }
    }

    return { minutes, lastUsed, now };
  }, [tasks, interval]);

  const rows: TagRow[] = useMemo(() => {
    const list: TagRow[] = [];
    for (const c of categories) {
      if (!billableTagValues.has(c.value)) continue;
      if (!showArchived && c.archived) continue;
      const minutes = perTag.minutes.get(c.value) || 0;
      const last = perTag.lastUsed.get(c.value);
      const daysSince = last ? differenceInDays(perTag.now, parseISO(last)) : null;
      list.push({
        value: c.value,
        label: c.label,
        archived: !!c.archived,
        minutes,
        daysSince,
      });
    }
    // Sort: roots first by minutes desc, subtags follow their parent alphabetically
    return list.sort((a, b) => {
      const ad = a.value.split('/').length;
      const bd = b.value.split('/').length;
      if (ad !== bd) return ad - bd;
      if (a.minutes !== b.minutes) return b.minutes - a.minutes;
      return a.value.localeCompare(b.value);
    });
  }, [categories, billableTagValues, perTag, showArchived]);

  const roots = rows.filter(r => !r.value.includes('/'));
  const childrenOf = (parent: string) => rows.filter(r => {
    const parts = r.value.split('/');
    return parts.length > 1 && parts.slice(0, -1).join('/') === parent;
  });

  const toggle = (v: string) => setExpanded(p => {
    const n = new Set(p); n.has(v) ? n.delete(v) : n.add(v); return n;
  });

  const maxMinutes = Math.max(1, ...rows.map(r => r.minutes));

  // Staleness: grey if no activity in 7 days, red if >30 days.
  const stalenessClass = (daysSince: number | null) => {
    if (daysSince == null) return 'text-destructive';
    if (daysSince > 30) return 'text-destructive';
    if (daysSince > 7) return 'text-muted-foreground/40';
    return 'text-foreground/80';
  };
  const stalenessLabel = (daysSince: number | null) => {
    if (daysSince == null) return 'NEVER USED';
    if (daysSince === 0) return 'TODAY';
    if (daysSince === 1) return '1D AGO';
    if (daysSince < 7) return `${daysSince}D AGO`;
    if (daysSince < 30) return `${Math.floor(daysSince / 7)}W AGO`;
    if (daysSince < 365) return `${Math.floor(daysSince / 30)}MO AGO`;
    return `${Math.floor(daysSince / 365)}Y AGO`;
  };

  const renderRow = (r: TagRow, depth: number) => {
    const kids = childrenOf(r.value);
    const isOpen = expanded.has(r.value);
    const pct = (r.minutes / maxMinutes) * 100;
    const labelColor = stalenessClass(r.daysSince);
    const showWarn = r.daysSince == null || r.daysSince > 7;

    return (
      <div key={r.value}>
        <div
          className="group rounded px-1 py-1 hover:bg-muted/30"
          style={{ paddingLeft: 4 + depth * 14 }}
        >
          <div className="flex items-center gap-1 mb-0.5">
            {kids.length > 0 ? (
              <button
                onClick={() => toggle(r.value)}
                className="p-0.5 text-muted-foreground/40 hover:text-foreground"
              >
                {isOpen ? <ChevronDown size={10} /> : <ChevronRight size={10} />}
              </button>
            ) : <span className="w-3.5" />}
            <span className={`text-[10px] font-mono tracking-wide truncate flex-1 ${labelColor} ${r.archived ? 'line-through opacity-60' : ''}`}>
              {r.label.toUpperCase()}
            </span>
            {showWarn && (
              <span className={`text-[8px] font-mono tracking-[0.15em] ${r.daysSince != null && r.daysSince > 30 ? 'text-destructive' : 'text-muted-foreground/40'}`}>
                {stalenessLabel(r.daysSince)}
              </span>
            )}
            <span className="text-[10px] font-mono text-muted-foreground/60 tabular-nums w-16 text-right shrink-0">
              {formatTime(r.minutes)}
            </span>
            <div className="opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-1">
              {r.archived ? (
                <button
                  onClick={() => unarchiveCategory(r.value)}
                  className="flex items-center gap-1 px-1.5 py-1 rounded text-[9px] font-mono tracking-wide border border-border/40 text-muted-foreground hover:text-foreground"
                  title="Restore"
                >
                  <ArchiveRestore size={10} />
                </button>
              ) : (
                <button
                  onClick={() => archiveCategory(r.value)}
                  className="flex items-center gap-1 px-1.5 py-1 rounded text-[9px] font-mono tracking-wide border border-border/40 text-muted-foreground hover:text-foreground"
                  title="Archive"
                >
                  <Archive size={10} />
                </button>
              )}
              <HoldToDeleteButton onConfirm={() => removeCategory(r.value)} />
            </div>
          </div>
          <div className="h-1.5 bg-muted/40 rounded-sm overflow-hidden ml-4">
            <motion.div
              initial={{ width: 0 }}
              animate={{ width: `${pct}%` }}
              transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
              className={`h-full ${r.daysSince != null && r.daysSince > 30 ? 'bg-destructive/60' : r.daysSince != null && r.daysSince > 7 ? 'bg-muted-foreground/40' : 'bg-foreground/70'}`}
            />
          </div>
        </div>

        <AnimatePresence>
          {isOpen && kids.length > 0 && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.15 }}
              className="overflow-hidden"
            >
              {kids.map(k => renderRow(k, depth + 1))}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    );
  };

  return (
    <div className="border border-border/30 rounded-md bg-card/40 overflow-hidden mb-4">
      <div className="px-3 py-2 border-b border-border/20 flex items-center justify-between">
        <span className="text-[9px] font-mono text-muted-foreground/50 tracking-[0.15em]">TIME BY BILLABLE TAG</span>
        <button
          onClick={() => setShowArchived(v => !v)}
          className={`text-[9px] font-mono tracking-wide ${showArchived ? 'text-primary' : 'text-muted-foreground/50 hover:text-foreground'}`}
        >
          {showArchived ? 'HIDE ARCHIVED' : 'SHOW ARCHIVED'}
        </button>
      </div>

      <div className="px-3 pt-2 pb-1 flex items-center gap-1 overflow-x-auto scrollbar-none">
        {RANGES.map(r => (
          <button
            key={r.key}
            onClick={() => setRange(r.key)}
            className={`shrink-0 px-2 py-1 rounded text-[9px] font-mono tracking-wider border transition-all ${
              range === r.key
                ? 'bg-foreground text-background border-foreground'
                : 'bg-transparent text-muted-foreground/60 border-border/40 hover:text-foreground/80 hover:border-foreground/30'
            }`}
          >
            {r.label}
          </button>
        ))}
      </div>

      <div className="p-2 space-y-0.5">
        {roots.length === 0 ? (
          <p className="text-[10px] font-mono text-muted-foreground/40 leading-relaxed py-3 px-2">
            No billable tags to display.
          </p>
        ) : (
          roots.map(r => renderRow(r, 0))
        )}
      </div>

      <div className="px-3 pb-2 pt-1 border-t border-border/20 flex items-center gap-3 text-[8px] font-mono text-muted-foreground/40 tracking-[0.15em]">
        <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-sm bg-foreground/70" /> ACTIVE</span>
        <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-sm bg-muted-foreground/40" /> &gt;7D STALE</span>
        <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-sm bg-destructive/60" /> &gt;30D INACTIVE</span>
      </div>
    </div>
  );
}