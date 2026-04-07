import { motion } from 'framer-motion';
import { Layers } from 'lucide-react';
import { TaskCluster } from '@/utils/taskClustering';
import { formatTime12h, minutesToTime } from '@/hooks/useCurrentTime';
import { START_HOUR } from '@/components/TimelineColumn';

interface CondensedTaskBlockProps {
  cluster: TaskCluster;
  hourHeight: number;
  showTimeLabels: boolean;
  onTap: (cluster: TaskCluster) => void;
}

export function CondensedTaskBlock({
  cluster,
  hourHeight,
  showTimeLabels,
  onTap,
}: CondensedTaskBlockProps) {
  const top = ((cluster.startMin - START_HOUR * 60) / 60) * hourHeight;
  const totalMinutes = cluster.endMin - cluster.startMin;
  const height = Math.max((totalMinutes / 60) * hourHeight, 32);
  const count = cluster.tasks.length;
  const maxTitles = 3;
  const visibleTitles = cluster.tasks.slice(0, maxTitles);
  const remaining = count - maxTitles;

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.97 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.15 }}
      className="absolute right-1 z-10 cursor-pointer"
      style={{
        top,
        height,
        left: showTimeLabels ? '3.25rem' : '2px',
      }}
      onClick={(e) => {
        e.stopPropagation();
        onTap(cluster);
      }}
    >
      <div className="h-full rounded-[3px] border border-border/60 bg-muted/40 backdrop-blur-[2px] hover:bg-muted/60 hover:border-border transition-colors duration-150 overflow-hidden">
        <div className="flex flex-col justify-center h-full px-2.5 py-1.5 gap-0.5">
          {/* Header: count + time range */}
          <div className="flex items-center gap-1.5">
            <Layers size={10} className="text-muted-foreground/50 shrink-0" />
            <span className="text-[10px] font-mono text-muted-foreground/60 tracking-wider">
              {count} tasks · {formatTime12h(minutesToTime(cluster.startMin))}–{formatTime12h(minutesToTime(cluster.endMin))}
            </span>
          </div>

          {/* Task titles */}
          {height > 40 && (
            <div className="flex flex-col gap-px mt-0.5">
              {visibleTitles.map((task) => (
                <div
                  key={task.id}
                  className="text-[11px] font-mono text-foreground/60 truncate leading-tight"
                >
                  {task.title}
                </div>
              ))}
              {remaining > 0 && (
                <span className="text-[10px] font-mono text-muted-foreground/40 tracking-wider">
                  +{remaining} more
                </span>
              )}
            </div>
          )}
        </div>
      </div>
    </motion.div>
  );
}
