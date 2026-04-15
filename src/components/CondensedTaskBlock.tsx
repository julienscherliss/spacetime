import { motion } from 'framer-motion';
import { Layers } from 'lucide-react';
import { TaskCluster } from '@/utils/taskClustering';
import { START_HOUR } from '@/components/TimelineColumn';
import { useTimezoneStore } from '@/store/timezoneStore';

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
  const comfortMode = useTimezoneStore((s) => s.comfortMode);
  const top = ((cluster.startMin - START_HOUR * 60) / 60) * hourHeight;
  const totalMinutes = cluster.endMin - cluster.startMin;
  const height = cluster.displayHeightPx ?? ((totalMinutes / 60) * hourHeight);
  const count = cluster.tasks.length;

  const allCompleted = cluster.tasks.every(t => t.completed);
  const isCompact = height < (comfortMode ? 22 : 18);
  const canShowTitles = height > (comfortMode ? 54 : 46);
  const maxTitles = height > (comfortMode ? 84 : 72) ? 2 : 1;
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
      <div className={`h-full rounded-[3px] border transition-colors duration-150 overflow-hidden ${
        allCompleted
          ? 'border-border/60 bg-muted/50 hover:bg-muted/70 hover:border-border/80'
          : 'border-[hsl(var(--task-border))] bg-card hover:shadow-sm'
      }`}>
        {isCompact ? (
          <div className="flex items-center justify-center h-full px-1">
            <Layers size={8} className={allCompleted ? 'text-muted-foreground/60' : 'text-muted-foreground'} />
          </div>
        ) : (
          <div className="flex flex-col justify-center h-full py-1 gap-0" style={{ paddingLeft: 'var(--ui-space-md)', paddingRight: 'var(--ui-space-md)' }}>
            <div className="flex items-center gap-1 min-w-0">
              <Layers size={9} className={allCompleted ? 'text-muted-foreground/50' : 'text-muted-foreground/70'} />
              <span className={`font-mono tracking-wider truncate leading-none ${
                allCompleted ? 'text-muted-foreground/70' : 'text-foreground/75'
              }`} style={{ fontSize: 'var(--ui-task-meta)' }}>
                {count} tasks
              </span>
            </div>

            {canShowTitles && (
              <div className="flex flex-col mt-1 gap-0 overflow-hidden">
                {visibleTitles.map((task) => (
                  <div
                    key={task.id}
                    className={`font-mono truncate ${
                      task.completed ? 'line-through text-muted-foreground/40' : 'text-foreground/75'
                    }`}
                    style={{ fontSize: 'var(--ui-task-meta)', lineHeight: 'var(--ui-leading-tight)' }}
                  >
                    {task.title}
                  </div>
                ))}
                {remaining > 0 && (
                  <span className="font-mono text-muted-foreground/50 tracking-wider" style={{ fontSize: 'var(--ui-text-xs)', lineHeight: 'var(--ui-leading-tight)' }}>
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
