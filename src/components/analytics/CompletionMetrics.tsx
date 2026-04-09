import { motion } from 'framer-motion';
import { TrendingUp, TrendingDown, Minus } from 'lucide-react';

function formatTime(minutes: number): string {
  if (minutes === 0) return '0m';
  if (minutes < 60) return `${minutes}m`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
}

interface Totals {
  scheduledMinutes: number;
  completedMinutes: number;
  taskCount: number;
  completedCount: number;
  completionRate: number;
}

interface Props {
  totals: Totals;
  prevTotals: Totals;
}

function Metric({ label, value, prevValue, unit }: { label: string; value: number; prevValue: number; unit?: string }) {
  const diff = prevValue > 0 ? Math.round(((value - prevValue) / prevValue) * 100) : 0;
  const TrendIcon = diff > 0 ? TrendingUp : diff < 0 ? TrendingDown : Minus;

  return (
    <div className="flex flex-col">
      <span className="text-[8px] font-mono text-muted-foreground/40 tracking-[0.15em] mb-1">{label}</span>
      <div className="flex items-baseline gap-1.5">
        <motion.span
          key={value}
          initial={{ opacity: 0, y: 4 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-lg font-display font-bold text-foreground tabular-nums leading-none"
        >
          {unit === 'time' ? formatTime(value) : unit === '%' ? `${value}%` : value}
        </motion.span>
        {prevValue > 0 && diff !== 0 && (
          <span className={`flex items-center gap-0.5 text-[8px] font-mono ${
            diff > 0 ? 'text-green-600/60' : 'text-destructive/60'
          }`}>
            <TrendIcon size={9} />
            {Math.abs(diff)}%
          </span>
        )}
      </div>
    </div>
  );
}

export function CompletionMetrics({ totals, prevTotals }: Props) {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
      <Metric label="SCHEDULED" value={totals.scheduledMinutes} prevValue={prevTotals.scheduledMinutes} unit="time" />
      <Metric label="COMPLETED" value={totals.completedMinutes} prevValue={prevTotals.completedMinutes} unit="time" />
      <Metric label="TASKS" value={totals.taskCount} prevValue={prevTotals.taskCount} />
      <Metric label="COMPLETION" value={totals.completionRate} prevValue={prevTotals.completionRate} unit="%" />
    </div>
  );
}
