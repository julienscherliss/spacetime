import { motion } from 'framer-motion';
import type { TagBreakdown } from '@/hooks/useAnalyticsData';

function formatTime(minutes: number): string {
  if (minutes < 60) return `${minutes}m`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
}

interface Props {
  data: TagBreakdown[];
  dataType: string;
  onTagClick?: (tag: string) => void;
}

export function TagAllocationChart({ data, dataType, onTagClick }: Props) {
  if (data.length === 0) {
    return (
      <div className="flex items-center justify-center h-32 text-[10px] font-mono text-muted-foreground/40 tracking-widest">
        NO DATA
      </div>
    );
  }

  const maxValue = Math.max(
    ...data.map(d => {
      switch (dataType) {
        case 'completed-time': return d.completedMinutes;
        case 'task-count': return d.taskCount;
        case 'completion-rate': return 100;
        default: return d.scheduledMinutes;
      }
    }),
    1
  );

  return (
    <div className="space-y-2">
      {data.map((item, i) => {
        const value = (() => {
          switch (dataType) {
            case 'completed-time': return item.completedMinutes;
            case 'task-count': return item.taskCount;
            case 'completion-rate': return item.taskCount > 0 ? Math.round((item.completedCount / item.taskCount) * 100) : 0;
            default: return item.scheduledMinutes;
          }
        })();

        const displayValue = dataType === 'task-count'
          ? `${value}`
          : dataType === 'completion-rate'
            ? `${value}%`
            : formatTime(value);

        const pct = (value / maxValue) * 100;

        return (
          <button
            key={item.tag}
            onClick={() => onTagClick?.(item.tag)}
            className="w-full text-left group"
          >
            <div className="flex items-center justify-between mb-0.5">
              <span className="text-[10px] font-mono text-foreground/80 tracking-wide truncate group-hover:text-primary transition-colors">
                {item.label.toUpperCase()}
              </span>
              <span className="text-[10px] font-mono text-muted-foreground/60 tabular-nums ml-2 shrink-0">
                {displayValue}
              </span>
            </div>
            <div className="h-2 bg-muted/50 rounded-sm overflow-hidden">
              <motion.div
                initial={{ width: 0 }}
                animate={{ width: `${pct}%` }}
                transition={{ duration: 0.5, delay: i * 0.05, ease: [0.22, 1, 0.36, 1] }}
                className="h-full rounded-sm bg-foreground/70 group-hover:bg-primary transition-colors"
              />
            </div>
          </button>
        );
      })}
    </div>
  );
}
