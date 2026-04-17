import { useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { Layers, Check } from 'lucide-react';
import { Task, useTaskStore } from '@/store/taskStore';
import { formatTime12h } from '@/hooks/useCurrentTime';

interface GroupTimelineBlockProps {
  task: Task;
  top: number;
  height: number;
  isActive: boolean;
  showTimeLabels: boolean;
  formatDuration: (mins: number) => string;
}

/**
 * Compact "stacked" representation of a Group on the main timeline.
 *
 * Visual treatment:
 *   - Three thin offset borders behind the main block hint at the multiple
 *     tasks bundled inside, without revealing them inline (per spec — contents
 *     only visible inside the GroupEditPanel modal or in focus mode).
 *   - A small Layers icon + child count is shown in the corner.
 *
 * Interactions:
 *   - Single click: open the Group edit panel.
 *   - Double click: complete the entire Group (with a brief "confirming" pulse
 *     to make accidental completion unlikely).
 */
export function GroupTimelineBlock({
  task,
  top,
  height,
  isActive,
  showTimeLabels,
  formatDuration,
}: GroupTimelineBlockProps) {
  const setEditingTask = useTaskStore((s) => s.setEditingTask);
  const completeGroup = useTaskStore((s) => s.completeGroup);
  const childCount = useTaskStore((s) =>
    s.tasks.filter((t) => t.groupId === task.id && !t.archivedAt).length,
  );
  const completedCount = useTaskStore((s) =>
    s.tasks.filter((t) => t.groupId === task.id && !t.archivedAt && t.completed).length,
  );

  const [confirming, setConfirming] = useState(false);
  const clickTimer = useRef<number | null>(null);

  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    // Light debounce so double-click doesn't also fire the open-panel single click.
    if (clickTimer.current !== null) {
      window.clearTimeout(clickTimer.current);
      clickTimer.current = null;
      return;
    }
    clickTimer.current = window.setTimeout(() => {
      clickTimer.current = null;
      setEditingTask(task.id);
    }, 220);
  };

  const handleDoubleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    if (clickTimer.current !== null) {
      window.clearTimeout(clickTimer.current);
      clickTimer.current = null;
    }
    // Brief confirming pulse, then commit.
    setConfirming(true);
    window.setTimeout(() => {
      completeGroup(task.id);
    }, 180);
  };

  const isShort = height < 36;

  return (
    <div
      className="absolute left-1 right-1"
      style={{ top, height }}
    >
      {/* Stacked layer hints behind the main block */}
      <div
        className="absolute inset-0 rounded-sm border border-border/30 bg-card/40 pointer-events-none"
        style={{ transform: 'translate(4px, 4px)' }}
        aria-hidden
      />
      <div
        className="absolute inset-0 rounded-sm border border-border/40 bg-card/60 pointer-events-none"
        style={{ transform: 'translate(2px, 2px)' }}
        aria-hidden
      />

      {/* Main block */}
      <motion.button
        type="button"
        onClick={handleClick}
        onDoubleClick={handleDoubleClick}
        animate={confirming ? { scale: 0.96 } : { scale: 1 }}
        transition={{ duration: 0.15 }}
        className={`absolute inset-0 rounded-sm border text-left overflow-hidden transition-colors group ${
          confirming
            ? 'bg-primary text-primary-foreground border-primary'
            : isActive
            ? 'bg-card border-primary/40'
            : 'bg-card border-border hover:border-foreground/30'
        }`}
        title={`${task.title} — double-click to complete the whole Group`}
      >
        <div className="h-full w-full px-2 py-1.5 flex flex-col justify-between">
          <div className="flex items-start gap-1.5 min-w-0">
            <Layers
              size={11}
              strokeWidth={1.5}
              className={`mt-0.5 shrink-0 ${confirming ? '' : 'text-foreground/50'}`}
              aria-hidden
            />
            <div className="min-w-0 flex-1">
              <div
                className={`font-display font-bold leading-tight truncate ${
                  isShort ? 'text-[10px]' : 'text-[11px]'
                }`}
              >
                {task.title}
              </div>
              {!isShort && (
                <div className={`text-[9px] font-mono tracking-wide mt-0.5 ${
                  confirming ? 'text-primary-foreground/80' : 'text-muted-foreground/60'
                }`}>
                  {childCount === 0
                    ? 'Empty Group'
                    : `${completedCount}/${childCount} task${childCount === 1 ? '' : 's'}`}
                </div>
              )}
            </div>
          </div>

          {showTimeLabels && !isShort && task.time && task.duration && (
            <div className={`text-[9px] font-mono tracking-wider self-end ${
              confirming ? 'text-primary-foreground/70' : 'text-muted-foreground/50'
            }`}>
              {formatTime12h(task.time)} · {formatDuration(task.duration)}
            </div>
          )}
        </div>

        {confirming && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <Check size={18} strokeWidth={2} />
          </div>
        )}
      </motion.button>
    </div>
  );
}
