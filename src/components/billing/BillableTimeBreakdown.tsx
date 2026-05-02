import { useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronDown, ChevronRight, Archive, ArchiveRestore, Plus } from 'lucide-react';
import { useTaskStore } from '@/store/taskStore';
import { useLibraryStore } from '@/store/libraryStore';
import { useBillingStore } from '@/store/billingStore';
import { findBillableAncestor } from '@/lib/billingInheritance';
import { TagBillingEditor } from '@/components/analytics/TagBillingEditor';
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
  billedMinutes: number; // invoiced minutes inside selected range
  daysSince: number | null; // days since most recent task touch (any time)
  rateLabel: string;
}

export function BillableTimeBreakdown() {
  const tasks = useTaskStore(s => s.tasks);
  const categories = useLibraryStore(s => s.categories);
  const addCategory = useLibraryStore(s => s.addCategory);
  const archiveCategory = useLibraryStore(s => s.archiveCategory);
  const unarchiveCategory = useLibraryStore(s => s.unarchiveCategory);
  const removeCategory = useLibraryStore(s => s.removeCategory);
  const settings = useBillingStore(s => s.settings);
  const upsertSettings = useBillingStore(s => s.upsertSettings);
  const invoices = useBillingStore(s => s.invoices);

  const [range, setRange] = useState<RangeKey>('this-week');
  const [showArchived, setShowArchived] = useState(false);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [editingTag, setEditingTag] = useState<string | null>(null);
  const [showAddTag, setShowAddTag] = useState(false);
  const [newTagName, setNewTagName] = useState('');
  const [newTagParent, setNewTagParent] = useState('');
  const [pickFromExisting, setPickFromExisting] = useState('');

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

  // Billed minutes per tag in range (from invoices issued in range).
  const billedByTag = useMemo(() => {
    const map = new Map<string, number>();
    for (const inv of invoices) {
      let inRange = true;
      if (interval) {
        try {
          const d = parseISO(inv.issuedAt);
          inRange = isWithinInterval(d, interval);
        } catch { inRange = false; }
      }
      if (!inRange) continue;
      for (const it of inv.items) {
        const mins = (it.hours || 0) * 60;
        if (!mins) continue;
        const segs = (it.tagValue || '').split('/');
        for (let i = segs.length; i >= 1; i--) {
          const a = segs.slice(0, i).join('/');
          map.set(a, (map.get(a) || 0) + mins);
        }
      }
    }
    return map;
  }, [invoices, interval]);

  const settingsByTag = useMemo(() => new Map(settings.map(s => [s.tagValue, s])), [settings]);

  const rateLabelFor = (tagValue: string): string => {
    const direct = settingsByTag.get(tagValue);
    const eff = direct?.billable ? direct : findBillableAncestor(tagValue, settings);
    if (!eff) return '';
    return eff.rateType === 'hourly'
      ? `${eff.hourlyRate} ${eff.currency}/h`
      : `${eff.flatRate} ${eff.currency} flat`;
  };

  const rows: TagRow[] = useMemo(() => {
    const list: TagRow[] = [];
    const catByValue = new Map(categories.map(c => [c.value, c]));
    // Union of all billable tag values (from settings + categories that inherit)
    const allValues = new Set<string>(billableTagValues);
    for (const s of settings) if (s.billable) allValues.add(s.tagValue);

    for (const value of allValues) {
      const c = catByValue.get(value);
      const archived = !!c?.archived;
      if (!showArchived && archived) continue;
      // Derive a label: prefer category label, else last segment of the path prettified
      const label = c?.label || (() => {
        const last = value.split('/').pop() || value;
        return last.replace(/[-_]/g, ' ').replace(/\b\w/g, ch => ch.toUpperCase());
      })();
      const minutes = perTag.minutes.get(value) || 0;
      const billedMinutes = billedByTag.get(value) || 0;
      const lastDate = perTag.lastUsed.get(value);
      const daysSince = lastDate ? differenceInDays(perTag.now, parseISO(lastDate)) : null;
      list.push({
        value,
        label,
        archived,
        minutes,
        billedMinutes,
        daysSince,
        rateLabel: rateLabelFor(value),
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
  }, [categories, billableTagValues, perTag, billedByTag, showArchived, settings]);

  // A row is a "root" in this view if NO ancestor of it is also in the visible row set.
  // This way subtags (e.g. "Projects/Starfire") render as top-level when their parent
  // ("Projects") isn't itself a billable row.
  const rowValues = new Set(rows.map(r => r.value));
  const hasVisibleAncestor = (value: string) => {
    const parts = value.split('/');
    for (let i = parts.length - 1; i >= 1; i--) {
      const ancestor = parts.slice(0, i).join('/');
      if (rowValues.has(ancestor)) return true;
    }
    return false;
  };
  const roots = rows.filter(r => !hasVisibleAncestor(r.value));
  const childrenOf = (parent: string) => rows.filter(r => {
    if (r.value === parent) return false;
    if (!r.value.startsWith(parent + '/')) return false;
    // direct child only — nearest visible ancestor must be `parent`
    const parts = r.value.split('/');
    for (let i = parts.length - 1; i >= 1; i--) {
      const ancestor = parts.slice(0, i).join('/');
      if (rowValues.has(ancestor)) return ancestor === parent;
    }
    return false;
  });

  const toggle = (v: string) => setExpanded(p => {
    const n = new Set(p); n.has(v) ? n.delete(v) : n.add(v); return n;
  });

  const maxMinutes = Math.max(1, ...rows.map(r => r.minutes));

  // Tags that aren't yet billable (for the MARK EXISTING dropdown)
  const nonBillableTags = categories
    .filter(c => !c.archived)
    .filter(c => !findBillableAncestor(c.value, settings))
    .filter(c => !settingsByTag.get(c.value)?.billable);

  const parentCandidates = categories
    .filter(c => !c.archived)
    .sort((a, b) => a.value.localeCompare(b.value));

  const handleAddTag = () => {
    const trimmed = newTagName.trim();
    if (!trimmed) { setShowAddTag(false); return; }
    const slug = trimmed.toLowerCase().replace(/\s+/g, '-');
    const value = newTagParent ? `${newTagParent}/${slug}` : slug;
    addCategory(trimmed, value);
    upsertSettings(value, {
      billable: true,
      rateType: 'hourly',
      hourlyRate: 0,
      flatRate: 0,
      flatItems: [],
      currency: 'USD',
    });
    setNewTagName('');
    setNewTagParent('');
    setShowAddTag(false);
    setEditingTag(value);
  };

  const markExistingBillable = (tagValue: string) => {
    if (!tagValue) return;
    upsertSettings(tagValue, {
      billable: true,
      rateType: 'hourly',
      hourlyRate: 0,
      flatRate: 0,
      flatItems: [],
      currency: 'USD',
    });
    setPickFromExisting('');
    setEditingTag(tagValue);
  };

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
    const totalPct = (r.minutes / maxMinutes) * 100;
    const billedClamped = Math.min(r.billedMinutes, r.minutes);
    const unbilledMinutes = Math.max(0, r.minutes - billedClamped);
    const billedPct = (billedClamped / maxMinutes) * 100;
    const unbilledPct = (unbilledMinutes / maxMinutes) * 100;
    const labelColor = stalenessClass(r.daysSince);
    const showWarn = r.daysSince == null || r.daysSince > 7;
    const isEditing = editingTag === r.value;

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
            <button
              onClick={() => setEditingTag(isEditing ? null : r.value)}
              className={`text-[10px] font-mono tracking-wide truncate flex-1 text-left hover:text-foreground transition-colors ${labelColor} ${r.archived ? 'line-through opacity-60' : ''}`}
              title="Edit billing"
            >
              {r.label.toUpperCase()}
            </button>
            {r.rateLabel && (
              <span className="text-[9px] font-mono text-muted-foreground/50 tracking-wide shrink-0">
                {r.rateLabel}
              </span>
            )}
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
          <div className="h-1.5 bg-muted/40 rounded-sm overflow-hidden ml-4 flex">
            {/* Billed (paid/invoiced) segment — solid */}
            <motion.div
              initial={{ width: 0 }}
              animate={{ width: `${billedPct}%` }}
              transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
              className="h-full bg-primary/80"
              title={`Billed: ${formatTime(billedClamped)}`}
            />
            {/* Unbilled segment — striped via opacity */}
            <motion.div
              initial={{ width: 0 }}
              animate={{ width: `${unbilledPct}%` }}
              transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1], delay: 0.05 }}
              className={`h-full ${r.daysSince != null && r.daysSince > 30 ? 'bg-destructive/40' : r.daysSince != null && r.daysSince > 7 ? 'bg-muted-foreground/30' : 'bg-foreground/30'}`}
              style={{
                backgroundImage: 'repeating-linear-gradient(45deg, transparent 0 3px, hsl(var(--background) / 0.4) 3px 5px)',
              }}
              title={`Unbilled: ${formatTime(unbilledMinutes)}`}
            />
          </div>
        </div>

        <AnimatePresence>
          {isEditing && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.15 }}
              className="overflow-hidden"
              style={{ paddingLeft: 4 + depth * 14 + 14 }}
            >
              <div className="pt-2 pb-1 pr-2">
                <TagBillingEditor tag={r.value} tagLabel={r.label} />
              </div>
            </motion.div>
          )}
        </AnimatePresence>

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
        <div className="flex items-center gap-3">
          <button
            onClick={() => setShowArchived(v => !v)}
            className={`text-[9px] font-mono tracking-wide ${showArchived ? 'text-primary' : 'text-muted-foreground/50 hover:text-foreground'}`}
          >
            {showArchived ? 'HIDE ARCHIVED' : 'SHOW ARCHIVED'}
          </button>
          <button
            onClick={() => setShowAddTag(v => !v)}
            className="flex items-center gap-1 text-[9px] font-mono text-primary/70 hover:text-primary tracking-wide"
          >
            <Plus size={10} /> NEW
          </button>
        </div>
      </div>

      {/* Add / mark existing controls */}
      {(showAddTag || nonBillableTags.length > 0) && (
        <div className="px-3 pt-2 pb-2 border-b border-border/20 space-y-2 bg-muted/10">
          {showAddTag && (
            <div className="space-y-1.5 p-2 border border-border/30 rounded bg-background/40">
              <div className="flex gap-2">
                <input
                  autoFocus
                  value={newTagName}
                  onChange={(e) => setNewTagName(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') handleAddTag(); if (e.key === 'Escape') { setShowAddTag(false); setNewTagParent(''); } }}
                  placeholder="New billable tag name"
                  className="flex-1 bg-transparent border border-border/40 rounded px-2 py-1 text-[11px] font-mono text-foreground focus:outline-none focus:border-primary/60"
                />
                <button
                  onClick={handleAddTag}
                  className="px-2 py-1 rounded text-[10px] font-mono bg-primary text-primary-foreground hover:bg-primary/90 tracking-wide"
                >
                  ADD
                </button>
              </div>
              <div className="flex items-center gap-2">
                <label className="text-[9px] font-mono text-muted-foreground/50 tracking-wide w-16 shrink-0">PARENT</label>
                <select
                  value={newTagParent}
                  onChange={(e) => setNewTagParent(e.target.value)}
                  className="flex-1 bg-transparent border border-border/30 rounded px-2 py-1 text-[11px] font-mono text-foreground focus:outline-none focus:border-primary/50"
                >
                  <option value="">— None (top-level) —</option>
                  {parentCandidates.map(c => (
                    <option key={c.value} value={c.value}>{c.value}</option>
                  ))}
                </select>
              </div>
              {newTagParent && (
                <p className="text-[9px] font-mono text-muted-foreground/40 leading-relaxed">
                  Will be created as <span className="text-foreground/70">{newTagParent}/{newTagName.trim().toLowerCase().replace(/\s+/g, '-') || '…'}</span>
                </p>
              )}
            </div>
          )}
          {nonBillableTags.length > 0 && (
            <div className="flex items-center gap-2">
              <label className="text-[9px] font-mono text-muted-foreground/50 tracking-wide shrink-0">MARK EXISTING</label>
              <select
                value={pickFromExisting}
                onChange={(e) => markExistingBillable(e.target.value)}
                className="flex-1 bg-transparent border border-border/30 rounded px-2 py-1 text-[11px] font-mono text-foreground focus:outline-none focus:border-primary/50"
              >
                <option value="">Select a tag…</option>
                {nonBillableTags.map(c => (
                  <option key={c.value} value={c.value}>{c.value}</option>
                ))}
              </select>
            </div>
          )}
        </div>
      )}

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
            No billable tags yet. Add one or mark an existing tag above — every subtag inherits automatically.
          </p>
        ) : (
          roots.map(r => renderRow(r, 0))
        )}
      </div>

      <div className="px-3 pb-2 pt-1 border-t border-border/20 flex items-center gap-3 flex-wrap text-[8px] font-mono text-muted-foreground/40 tracking-[0.15em]">
        <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-sm bg-primary/80" /> BILLED</span>
        <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-sm bg-foreground/30" /> UNBILLED</span>
        <span className="text-muted-foreground/30">·</span>
        <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-sm bg-muted-foreground/40" /> &gt;7D STALE</span>
        <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-sm bg-destructive/60" /> &gt;30D INACTIVE</span>
      </div>
    </div>
  );
}