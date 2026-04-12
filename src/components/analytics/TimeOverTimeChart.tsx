import { motion } from 'framer-motion';
import type { DayBreakdown } from '@/hooks/useAnalyticsData';

function formatTime(minutes: number): string {
  if (minutes < 60) return `${minutes}m`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m > 0 ? `${h}h${m}m` : `${h}h`;
}

interface Props {
  data: DayBreakdown[];
  prevData: DayBreakdown[];
  dataType: string;
  compareMode: string;
}

export function TimeOverTimeChart({ data, prevData, dataType, compareMode }: Props) {
  if (data.length === 0) {
    return (
      <div className="flex items-center justify-center h-32 text-[10px] font-mono text-muted-foreground/40 tracking-widest">
        NO DATA
      </div>
    );
  }

  const getValue = (d: DayBreakdown) => {
    switch (dataType) {
      case 'completed-time': return d.completedMinutes;
      case 'task-count': return d.taskCount;
      case 'completion-rate': return d.taskCount > 0 ? Math.round((d.completedCount / d.taskCount) * 100) : 0;
      default: return d.scheduledMinutes;
    }
  };

  const showPrevPeriod = compareMode === 'previous-period' && prevData.length > 0;
  const showPlannedVsCompleted = compareMode === 'planned-vs-completed';

  // For previous-period, align by index (day 1 vs day 1)
  const prevValues = showPrevPeriod ? prevData.map(getValue) : [];

  const allValues = [...data.map(getValue)];
  if (showPrevPeriod) allValues.push(...prevValues);

  const maxVal = Math.max(...allValues, 1);
  const barWidth = Math.max(Math.min(100 / data.length - 1, 28), 4);

  return (
    <div className="relative">
      {/* Y axis guides */}
      <div className="absolute inset-0 flex flex-col justify-between pointer-events-none">
        {[0, 1, 2, 3].map(i => (
          <div key={i} className="border-t border-dashed border-border/20" />
        ))}
      </div>

      <div className="flex items-end justify-between gap-px h-36 relative z-10">
        {data.map((d, i) => {
          const val = getValue(d);
          const pct = (val / maxVal) * 100;

          if (showPlannedVsCompleted) {
            const completedPct = (d.completedMinutes / maxVal) * 100;
            return (
              <div key={d.date} className="flex flex-col items-center flex-1 min-w-0" title={`${d.label}: ${formatTime(val)}`}>
                <div className="w-full flex items-end justify-center gap-px" style={{ height: '128px' }}>
                  <motion.div
                    initial={{ height: 0 }}
                    animate={{ height: `${pct}%` }}
                    transition={{ duration: 0.4, delay: i * 0.03, ease: [0.22, 1, 0.36, 1] }}
                    className="rounded-t-sm bg-foreground/60 hover:bg-primary transition-colors"
                    style={{ width: `${barWidth / 2}px`, minWidth: '3px' }}
                  />
                  <motion.div
                    initial={{ height: 0 }}
                    animate={{ height: `${completedPct}%` }}
                    transition={{ duration: 0.4, delay: i * 0.03 + 0.1, ease: [0.22, 1, 0.36, 1] }}
                    className="rounded-t-sm bg-primary/40"
                    style={{ width: `${barWidth / 2}px`, minWidth: '3px' }}
                  />
                </div>
                {data.length <= 14 && (
                  <span className="text-[7px] font-mono text-muted-foreground/40 mt-1 tracking-wide truncate w-full text-center">
                    {d.label.split(' ')[0]}
                  </span>
                )}
              </div>
            );
          }

          if (showPrevPeriod) {
            const prevVal = prevValues[i] ?? 0;
            const prevPct = (prevVal / maxVal) * 100;
            return (
              <div key={d.date} className="flex flex-col items-center flex-1 min-w-0" title={`${d.label}: ${formatTime(val)}`}>
                <div className="w-full flex items-end justify-center gap-px" style={{ height: '128px' }}>
                  <motion.div
                    initial={{ height: 0 }}
                    animate={{ height: `${prevPct}%` }}
                    transition={{ duration: 0.4, delay: i * 0.03, ease: [0.22, 1, 0.36, 1] }}
                    className="rounded-t-sm bg-muted-foreground/20"
                    style={{ width: `${barWidth / 2}px`, minWidth: '3px' }}
                  />
                  <motion.div
                    initial={{ height: 0 }}
                    animate={{ height: `${pct}%` }}
                    transition={{ duration: 0.4, delay: i * 0.03 + 0.05, ease: [0.22, 1, 0.36, 1] }}
                    className="rounded-t-sm bg-foreground/60 hover:bg-primary transition-colors"
                    style={{ width: `${barWidth / 2}px`, minWidth: '3px' }}
                  />
                </div>
                {data.length <= 14 && (
                  <span className="text-[7px] font-mono text-muted-foreground/40 mt-1 tracking-wide truncate w-full text-center">
                    {d.label.split(' ')[0]}
                  </span>
                )}
              </div>
            );
          }

          // Default single bar
          return (
            <div key={d.date} className="flex flex-col items-center flex-1 min-w-0" title={`${d.label}: ${formatTime(val)}`}>
              <div className="w-full flex items-end justify-center" style={{ height: '128px' }}>
                <motion.div
                  initial={{ height: 0 }}
                  animate={{ height: `${pct}%` }}
                  transition={{ duration: 0.4, delay: i * 0.03, ease: [0.22, 1, 0.36, 1] }}
                  className="rounded-t-sm bg-foreground/60 hover:bg-primary transition-colors"
                  style={{ width: `${barWidth}px`, minWidth: '3px' }}
                />
              </div>
              {data.length <= 14 && (
                <span className="text-[7px] font-mono text-muted-foreground/40 mt-1 tracking-wide truncate w-full text-center">
                  {d.label.split(' ')[0]}
                </span>
              )}
            </div>
          );
        })}
      </div>

      {/* Legend */}
      {(showPlannedVsCompleted || showPrevPeriod) && (
        <div className="flex items-center gap-3 mt-2 justify-end">
          {showPrevPeriod && (
            <>
              <div className="flex items-center gap-1">
                <div className="w-2 h-2 rounded-sm bg-muted-foreground/20" />
                <span className="text-[8px] font-mono text-muted-foreground/50">PREV PERIOD</span>
              </div>
              <div className="flex items-center gap-1">
                <div className="w-2 h-2 rounded-sm bg-foreground/60" />
                <span className="text-[8px] font-mono text-muted-foreground/50">CURRENT</span>
              </div>
            </>
          )}
          {showPlannedVsCompleted && (
            <>
              <div className="flex items-center gap-1">
                <div className="w-2 h-2 rounded-sm bg-foreground/60" />
                <span className="text-[8px] font-mono text-muted-foreground/50">PLANNED</span>
              </div>
              <div className="flex items-center gap-1">
                <div className="w-2 h-2 rounded-sm bg-primary/40" />
                <span className="text-[8px] font-mono text-muted-foreground/50">COMPLETED</span>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
