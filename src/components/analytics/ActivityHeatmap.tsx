import { motion } from 'framer-motion';
import type { HeatmapCell } from '@/hooks/useAnalyticsData';

const dayLabels = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];

function formatTime(minutes: number): string {
  if (minutes === 0) return '0m';
  if (minutes < 60) return `${minutes}m`;
  const h = Math.floor(minutes / 60);
  return `${h}h`;
}

interface Props {
  data: HeatmapCell[];
}

export function ActivityHeatmap({ data }: Props) {
  if (data.length === 0) {
    return (
      <div className="flex items-center justify-center h-24 text-[10px] font-mono text-muted-foreground/40 tracking-widest">
        NO DATA
      </div>
    );
  }

  const maxVal = Math.max(...data.map(d => d.value), 1);
  const weeks = Math.max(...data.map(d => d.weekIndex)) + 1;

  const getOpacity = (val: number) => {
    if (val === 0) return 0.05;
    return 0.15 + (val / maxVal) * 0.75;
  };

  return (
    <div className="flex gap-1">
      {/* Day labels */}
      <div className="flex flex-col gap-[3px] pt-0">
        {dayLabels.map((label, i) => (
          <div key={i} className="h-[12px] flex items-center">
            <span className="text-[7px] font-mono text-muted-foreground/30 w-3">{i % 2 === 0 ? label : ''}</span>
          </div>
        ))}
      </div>

      {/* Grid */}
      <div className="flex gap-[3px] flex-1 overflow-hidden">
        {Array.from({ length: weeks }).map((_, weekIdx) => (
          <div key={weekIdx} className="flex flex-col gap-[3px]">
            {Array.from({ length: 7 }).map((_, dayIdx) => {
              const cell = data.find(c => c.weekIndex === weekIdx && c.dayOfWeek === dayIdx);
              return (
                <motion.div
                  key={dayIdx}
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  transition={{ delay: (weekIdx * 7 + dayIdx) * 0.003, duration: 0.2 }}
                  className="w-[12px] h-[12px] rounded-[2px] cursor-default"
                  style={{
                    backgroundColor: cell
                      ? `hsl(var(--foreground) / ${getOpacity(cell.value)})`
                      : 'hsl(var(--foreground) / 0.03)',
                  }}
                  title={cell ? `${cell.date}: ${formatTime(cell.value)}` : ''}
                />
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}
