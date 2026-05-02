import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronDown, SlidersHorizontal, X } from 'lucide-react';
import { useLibraryStore } from '@/store/libraryStore';
import type { AnalyticsFilters, TimeRange, DataType } from '@/hooks/useAnalyticsData';

const timeRanges: { value: TimeRange; label: string }[] = [
  { value: 'today', label: 'TODAY' },
  { value: 'yesterday', label: 'YESTERDAY' },
  { value: 'this-week', label: 'THIS WEEK' },
  { value: 'last-week', label: 'LAST WEEK' },
  { value: 'this-month', label: 'THIS MONTH' },
  { value: 'last-month', label: 'LAST MONTH' },
  { value: 'all-time', label: 'ALL TIME' },
];

const dataTypes: { value: DataType; label: string }[] = [
  { value: 'scheduled-time', label: 'SCHEDULED' },
  { value: 'completed-time', label: 'COMPLETED' },
  { value: 'task-count', label: 'TASKS' },
  { value: 'completion-rate', label: 'RATE' },
];

interface Props {
  filters: AnalyticsFilters;
  onChange: (patch: Partial<AnalyticsFilters>) => void;
}

export function AnalyticsFilterBar({ filters, onChange }: Props) {
  const [expanded, setExpanded] = useState(false);
  const categories = useLibraryStore(s => s.categories);

  const activeFilterCount = [
    filters.tags.length > 0,
    filters.completedOnly,
    filters.incompleteOnly,
    filters.routinesOnly,
    filters.recurringOnly,
    filters.compareMode !== 'none',
  ].filter(Boolean).length;

  return (
    <div className="space-y-2 min-w-0 w-full overflow-hidden">
      {/* Primary row: time range pills */}
      <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-none -mx-1 px-1">
        {timeRanges.map(tr => (
          <button
            key={tr.value}
            onClick={() => onChange({ timeRange: tr.value })}
            className={`shrink-0 px-2.5 py-1.5 rounded text-[10px] font-mono tracking-wider transition-all border ${
              filters.timeRange === tr.value
                ? 'bg-foreground text-background border-foreground'
                : 'bg-transparent text-muted-foreground border-border/50 hover:border-foreground/30 hover:text-foreground/70'
            }`}
          >
            {tr.label}
          </button>
        ))}
      </div>

      {/* Secondary row: data type + expand */}
      <div className="flex items-center gap-3 overflow-x-auto scrollbar-none -mx-1 px-1">
        <div className="flex items-center gap-1">
          <span className="text-[9px] font-mono text-muted-foreground/50 tracking-widest mr-1">SHOW</span>
          {dataTypes.map(dt => (
            <button
              key={dt.value}
              onClick={() => onChange({ dataType: dt.value })}
              className={`px-2 py-1 rounded text-[9px] font-mono tracking-wider transition-all ${
                filters.dataType === dt.value
                  ? 'bg-primary/10 text-primary border border-primary/20'
                  : 'text-muted-foreground/50 hover:text-foreground/60'
              }`}
            >
              {dt.label}
            </button>
          ))}
        </div>

        <div className="flex-1" />

        <button
          onClick={() => setExpanded(e => !e)}
          className={`flex items-center gap-1 px-2 py-1 rounded text-[9px] font-mono tracking-wider transition-all ${
            expanded || activeFilterCount > 0
              ? 'text-primary bg-primary/8'
              : 'text-muted-foreground/50 hover:text-foreground/60'
          }`}
        >
          <SlidersHorizontal size={11} />
          FILTERS
          {activeFilterCount > 0 && (
            <span className="ml-0.5 min-w-[14px] h-[14px] rounded-full bg-primary text-primary-foreground text-[8px] flex items-center justify-center">
              {activeFilterCount}
            </span>
          )}
          <ChevronDown size={10} className={`transition-transform ${expanded ? 'rotate-180' : ''}`} />
        </button>
      </div>

      {/* Expandable advanced filters */}
      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <div className="border border-border/30 rounded-md p-3 space-y-3 bg-card/50">
              {/* Tags */}
              {categories.length > 0 && (
                <div>
                  <span className="text-[9px] font-mono text-muted-foreground/50 tracking-widest block mb-1.5">TAGS</span>
                  <div className="flex flex-wrap gap-1">
                    {categories.map(cat => {
                      const active = filters.tags.includes(cat.value);
                      return (
                        <button
                          key={cat.value}
                          onClick={() => {
                            const next = active
                              ? filters.tags.filter(t => t !== cat.value)
                              : [...filters.tags, cat.value];
                            onChange({ tags: next });
                          }}
                          className={`px-2 py-0.5 rounded text-[9px] font-mono tracking-wide transition-all border ${
                            active
                              ? 'bg-foreground text-background border-foreground'
                              : 'border-border/40 text-muted-foreground/60 hover:border-foreground/30'
                          }`}
                        >
                          {cat.label}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Toggles row */}
              <div className="flex flex-wrap gap-1.5">
                {[
                  { key: 'completedOnly' as const, label: 'COMPLETED' },
                  { key: 'incompleteOnly' as const, label: 'INCOMPLETE' },
                  { key: 'routinesOnly' as const, label: 'ROUTINES' },
                  { key: 'recurringOnly' as const, label: 'RECURRING' },
                ].map(toggle => (
                  <button
                    key={toggle.key}
                    onClick={() => onChange({ [toggle.key]: !filters[toggle.key] })}
                    className={`px-2 py-0.5 rounded text-[9px] font-mono tracking-wide transition-all border ${
                      filters[toggle.key]
                        ? 'bg-foreground text-background border-foreground'
                        : 'border-border/40 text-muted-foreground/60 hover:border-foreground/30'
                    }`}
                  >
                    {toggle.label}
                  </button>
                ))}
              </div>

              {/* Compare mode */}
              <div>
                <span className="text-[9px] font-mono text-muted-foreground/50 tracking-widest block mb-1.5">COMPARE</span>
                <div className="flex gap-1">
                  {[
                    { value: 'none' as const, label: 'OFF' },
                    { value: 'previous-period' as const, label: 'PREV PERIOD' },
                    { value: 'planned-vs-completed' as const, label: 'PLAN VS DONE' },
                  ].map(cm => (
                    <button
                      key={cm.value}
                      onClick={() => onChange({ compareMode: cm.value })}
                      className={`px-2 py-0.5 rounded text-[9px] font-mono tracking-wide transition-all border ${
                        filters.compareMode === cm.value
                          ? 'bg-foreground text-background border-foreground'
                          : 'border-border/40 text-muted-foreground/60 hover:border-foreground/30'
                      }`}
                    >
                      {cm.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Clear all */}
              {activeFilterCount > 0 && (
                <button
                  onClick={() => onChange({
                    tags: [],
                    completedOnly: false,
                    incompleteOnly: false,
                    routinesOnly: false,
                    recurringOnly: false,
                    compareMode: 'none',
                  })}
                  className="flex items-center gap-1 text-[9px] font-mono text-destructive/70 hover:text-destructive tracking-wide"
                >
                  <X size={10} /> CLEAR FILTERS
                </button>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
