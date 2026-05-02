import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, BarChart3 } from 'lucide-react';
import { AnalyticsFilterBar } from './AnalyticsFilterBar';
import { TagAllocationChart } from './TagAllocationChart';
import { TimeOverTimeChart } from './TimeOverTimeChart';
import { ActivityHeatmap } from './ActivityHeatmap';
import { CompletionMetrics } from './CompletionMetrics';
import { NeglectedTags } from './NeglectedTags';
import { ReflectionInsights } from './ReflectionInsights';
import { TagDetailPanel } from './TagDetailPanel';
import { GoalsModule } from './GoalsModule';
import { BillingModule } from './BillingModule';
import { useGoalCelebrationWatcher } from '@/hooks/useGoalsProgress';
import { useAnalyticsData, defaultFilters, type AnalyticsFilters } from '@/hooks/useAnalyticsData';
import { format } from 'date-fns';

interface Props {
  open: boolean;
  onClose: () => void;
}

function ModuleCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="border border-border/30 rounded-md bg-card/40 overflow-hidden">
      <div className="px-3 py-2 border-b border-border/20">
        <span className="text-[9px] font-mono text-muted-foreground/50 tracking-[0.15em]">{title}</span>
      </div>
      <div className="p-3">{children}</div>
    </div>
  );
}

export function AnalyticsPanel({ open, onClose }: Props) {
  const [filters, setFilters] = useState<AnalyticsFilters>(defaultFilters);
  const [detailTag, setDetailTag] = useState<string | null>(null);

  const data = useAnalyticsData(filters);
  useGoalCelebrationWatcher();

  const updateFilters = (patch: Partial<AnalyticsFilters>) => {
    setFilters(f => ({ ...f, ...patch }));
  };

  const rangeLabel = `${format(data.range.start, 'MMM d')} – ${format(data.range.end, 'MMM d')}`;

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          className="fixed inset-0 z-50 bg-background overflow-y-auto"
        >
          <div
            className="max-w-2xl mx-auto px-4 py-4"
            style={{ zoom: 1.15 }}
          >
            {/* Header */}
            <div className="flex items-start justify-between mb-4">
              <div>
                <div className="flex items-center gap-2 mb-0.5">
                  <BarChart3 size={16} className="text-muted-foreground/40" />
                  <h1 className="font-display text-xl font-bold text-foreground tracking-tight">Analytics</h1>
                </div>
                <p className="text-[9px] font-mono text-muted-foreground/40 tracking-[0.1em] ml-6">
                  EXPLORE TIME · PATTERNS · TAG ALLOCATION
                </p>
              </div>
              <button
                onClick={onClose}
                className="p-2 rounded-md text-muted-foreground/50 hover:text-foreground hover:bg-muted/40 transition-colors"
              >
                <X size={18} />
              </button>
            </div>

            {/* Dotted border divider */}
            <div className="border-t border-dashed border-border/30 mb-4" />

            {/* Range indicator */}
            <div className="text-[9px] font-mono text-muted-foreground/40 tracking-widest mb-3">
              ▸ {rangeLabel.toUpperCase()} · {data.totals.taskCount} TASKS
            </div>

            {/* Filters */}
            <div className="mb-5">
              <AnalyticsFilterBar filters={filters} onChange={updateFilters} />
            </div>

            {/* Summary metrics */}
            <div className="mb-5">
              <CompletionMetrics totals={data.totals} prevTotals={data.prevTotals} />
            </div>

            {/* Modules */}
            <div className="space-y-4">
              <ModuleCard title="TIME BY TAG">
                <TagAllocationChart
                  data={data.tagBreakdown}
                  dataType={filters.dataType}
                  onTagClick={setDetailTag}
                />
              </ModuleCard>

              <ModuleCard title="GOALS">
                <GoalsModule />
              </ModuleCard>

              <ModuleCard title="BILLING">
                <BillingModule />
              </ModuleCard>

              <ModuleCard title="TREND">
                <TimeOverTimeChart
                  data={data.dayBreakdown}
                  prevData={data.prevDayBreakdown}
                  dataType={filters.dataType}
                  compareMode={filters.compareMode}
                />
              </ModuleCard>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <ModuleCard title="ACTIVITY · 12 WEEKS">
                  <ActivityHeatmap data={data.heatmap} />
                </ModuleCard>

                <ModuleCard title="SIGNALS">
                  <NeglectedTags />
                </ModuleCard>
              </div>

              <ModuleCard title="REFLECTION · IMMOBILE TASK OVERRIDES">
                <ReflectionInsights range={data.range} />
              </ModuleCard>
            </div>

            {/* Empty state */}
            {data.totals.taskCount === 0 && (
              <div className="flex flex-col items-center justify-center py-16 text-center">
                <BarChart3 size={32} className="text-muted-foreground/15 mb-3" />
                <p className="text-[11px] font-mono text-muted-foreground/40 tracking-wide">
                  NO TASKS IN THIS PERIOD
                </p>
                <p className="text-[9px] font-mono text-muted-foreground/25 mt-1">
                  TRY A DIFFERENT TIME RANGE OR CLEAR FILTERS
                </p>
              </div>
            )}

            {/* Bottom spacer */}
            <div className="h-16" />
          </div>

          {/* Tag detail drill-down */}
          <AnimatePresence>
            {detailTag && (
              <TagDetailPanel tag={detailTag} onClose={() => setDetailTag(null)} />
            )}
          </AnimatePresence>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
