import { motion } from 'framer-motion';
import { Layers } from 'lucide-react';
import { TaskCluster } from '@/utils/taskClustering';
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
  const height = cluster.displayHeightPx ?? ((totalMinutes / 60) * hourHeight);
  const count = cluster.tasks.length;

  const allCompleted = cluster.tasks.every(t => t.completed);
  const isCompact = height < 18;
  const canShowTitles = height > 46;
  const maxTitles = height > 72 ? 2 : 1;
  const visibleTitles = canShowTitles ? cluster.tasks.slice(0, maxTitles) : [];
  const remaining = count - visibleTitles.length;

  return (
    <motion.div
      data-task-block
      data-cluster-block
      initial={{ opacity: 0, scale: 0.97 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.15 }}
      className="absolute right-1 z-[11] cursor-pointer"
      style={{
        top,
        height,
        left: showTimeLabels ? '3.25rem' : '2px',
        touchAction: 'none',
      }}
      onPointerDown={(e) => {
        e.stopPropagation();
      }}
      onClick={(e) => {
        e.stopPropagation();
        e.preventDefault();
        onTap(cluster);
      }}
      onTouchEnd={(e) => {
        e.stopPropagation();
      }}
    >
      <div className="h-full rounded-[3px] border border-border/60 bg-muted/50 hover:bg-muted/70 hover:border-border/80 transition-colors duration-150 overflow-hidden">
        {isCompact ? (
          <div className="flex items-center justify-center h-full px-1">
            <Layers size={8} className="text-muted-foreground/60 shrink-0" />
          </div>
        ) : (
          <div className="flex flex-col justify-center h-full px-2 py-1 gap-0">
            <div className="flex items-center gap-1 min-w-0">
              <Layers size={9} className="text-muted-foreground/50 shrink-0" />
              <span className="text-[10px] font-mono text-muted-foreground/70 tracking-wider truncate leading-none">
                {count} tasks
              </span>
            </div>

            {canShowTitles && (
              <div className="flex flex-col mt-1 gap-0 overflow-hidden">
                {visibleTitles.map((task) => (
                  <div
                    key={task.id}
                    className="text-[10px] font-mono text-foreground/55 truncate leading-tight"
                  >
                    {task.title}
                  </div>
                ))}
                {remaining > 0 && (
                  <span className="text-[9px] font-mono text-muted-foreground/35 tracking-wider leading-tight">
                    +{remaining} more
                  </span>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </motion.div>
  );
}
