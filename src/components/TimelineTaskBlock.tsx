import { MutableRefObject } from 'react';
import { Check } from 'lucide-react';
import { Task } from '@/store/taskStore';
import { PriorityBadge } from '@/components/PriorityBadge';
import { formatTime12h } from '@/hooks/useCurrentTime';
import { useIntentionalTouchDrag } from '@/hooks/useIntentionalTouchDrag';

interface TimelineTaskBlockProps {
  task: Task;
  top: number;
  height: number;
  isActive: boolean;
  isLocked: boolean;
  isRoutine: boolean;
  isResizingThis: boolean;
  showTimeLabels: boolean;
  nowMinutes: number;
  resizePreview: { time: string; duration: number } | null;
  didDragRef: MutableRefObject<boolean>;
  dragOffsetRef: MutableRefObject<number>;
  completeTask: (taskId: string) => void;
  handleTaskClick: (taskId: string) => void;
  handleResizeStart: (e: React.MouseEvent | React.TouchEvent, task: Task, edge: 'top' | 'bottom') => void;
  setDragMsg: (message: string) => void;
  formatDuration: (mins: number) => string;
}

export function TimelineTaskBlock({
  task,
  top,
  height,
  isActive,
  isLocked,
  isRoutine,
  isResizingThis,
  showTimeLabels,
  nowMinutes,
  resizePreview,
  didDragRef,
  dragOffsetRef,
  completeTask,
  handleTaskClick,
  handleResizeStart,
  setDragMsg,
  formatDuration,
}: TimelineTaskBlockProps) {
  const taskMinutes = task.time ? parseInt(task.time.split(':')[0], 10) * 60 + parseInt(task.time.split(':')[1], 10) : 0;

  const borderLeftColor = {
    0: 'hsl(var(--priority-0) / 0.3)',
    1: 'hsl(var(--priority-1) / 0.5)',
    2: 'hsl(var(--priority-2) / 0.6)',
    3: 'hsl(var(--priority-3) / 0.7)',
  }[task.priority];

  const taskRef = useIntentionalTouchDrag<HTMLDivElement>({
    payload: {
      type: 'task',
      id: task.id,
      title: task.title,
      duration: task.duration || 30,
      sourceDate: task.date,
    },
    canDrag: !isLocked && !isResizingThis,
    onTap: () => handleTaskClick(task.id),
    onDragStart: ({ point, element }) => {
      didDragRef.current = true;
      const blockRect = element.getBoundingClientRect();
      dragOffsetRef.current = point.y - blockRect.top;
    },
    onDragEnd: () => {
      setTimeout(() => {
        didDragRef.current = false;
      }, 50);
    },
  });

  return (
    <div
      ref={taskRef}
      data-task-block
      draggable={!isResizingThis && !isLocked}
      onDragStart={(e) => {
        if (isLocked) {
          e.preventDefault();
          setDragMsg('Task is locked');
          setTimeout(() => setDragMsg(''), 1500);
          return;
        }
        didDragRef.current = true;
        const blockRect = (e.currentTarget as HTMLElement).getBoundingClientRect();
        dragOffsetRef.current = e.clientY - blockRect.top;
        e.dataTransfer.setData('taskId', task.id);
        e.dataTransfer.setData('sourceDate', task.date);
        e.dataTransfer.effectAllowed = 'move';
      }}
      onDragEnd={() => {
        setTimeout(() => {
          didDragRef.current = false;
        }, 50);
      }}
      onClick={() => handleTaskClick(task.id)}
      onContextMenu={(e) => e.preventDefault()}
      className={`absolute right-1 group draggable-item select-none transition-shadow duration-200 ${
        isLocked
          ? 'cursor-default'
          : isResizingThis
            ? 'cursor-ns-resize'
            : 'cursor-grab active:cursor-grabbing'
      } ${isActive ? 'z-[15]' : 'z-10'}`}
      style={{
        top,
        height,
        left: showTimeLabels ? '3.25rem' : '2px',
      }}
    >
      <div
        className={`h-full rounded-[2px] transition-all duration-200 ${
          isActive
            ? 'bg-card border border-primary/20 shadow-sm'
            : isRoutine
              ? 'bg-card border border-border/60 border-dashed hover:border-[hsl(var(--task-hover))] hover:shadow-sm'
              : 'bg-card border border-[hsl(var(--task-border))] hover:border-[hsl(var(--task-hover))] hover:shadow-sm'
        }`}
        style={{
          borderLeftColor,
          borderLeftWidth: task.priority >= 2 ? '3px' : '2px',
        }}
      >
        {!isLocked && (
          <div
            data-touch-ignore
            onMouseDown={(e) => handleResizeStart(e, task, 'top')}
            onTouchStart={(e) => handleResizeStart(e, task, 'top')}
            className="absolute top-0 left-0 right-0 h-[8px] cursor-ns-resize z-20 opacity-0 group-hover:opacity-100 touch:opacity-100"
          >
            <div className="mx-auto mt-[1px] w-8 h-[2px] rounded-full bg-muted-foreground/20 transition-colors group-hover:bg-muted-foreground/40" />
          </div>
        )}

        <div className="flex items-start justify-between h-full px-2 py-1 overflow-hidden">
          <div className="flex-1 min-w-0">
            <div className={`text-[12px] font-mono leading-tight truncate ${isActive ? 'text-foreground font-medium' : 'text-foreground/75'}`}>
              {task.title}
            </div>
            {height > 36 && task.time && (
              <div className="flex items-center gap-1.5 mt-0.5">
                <span className="text-[10px] font-mono text-muted-foreground/50">{formatTime12h(task.time)}</span>
                {task.duration && (
                  <span className="text-[10px] font-mono text-muted-foreground/35">{formatDuration(task.duration)}</span>
                )}
                {isActive && (
                  <span className="text-[10px] font-mono text-primary/70">
                    {formatDuration(Math.max(0, taskMinutes + (task.duration || 30) - nowMinutes))} left
                  </span>
                )}
              </div>
            )}
          </div>
          <div className="flex items-center gap-1 shrink-0 ml-1">
            <PriorityBadge priority={task.priority} />
            <button
              data-touch-ignore
              onClick={(e) => {
                e.stopPropagation();
                completeTask(task.id);
              }}
              className="p-1 rounded-sm text-muted-foreground/20 hover:text-primary hover:bg-primary/5 transition-all opacity-0 group-hover:opacity-100"
            >
              <Check size={12} />
            </button>
          </div>
        </div>

        {isResizingThis && resizePreview && (
          <div className="absolute -right-1 top-1/2 -translate-y-1/2 translate-x-full z-30 px-2 py-1 rounded-sm bg-card border border-border shadow-sm pointer-events-none">
            <span className="text-[10px] font-mono text-foreground/70 whitespace-nowrap">
              {formatTime12h(resizePreview.time)} – {formatTime12h(taskMinutes + resizePreview.duration)} · {formatDuration(resizePreview.duration)}
            </span>
          </div>
        )}

        {isActive && task.time && (
          <div
            className="absolute bottom-0 left-0 right-0 bg-primary/[0.04] pointer-events-none rounded-b-[2px]"
            style={{
              height: `${Math.min(100, ((nowMinutes - taskMinutes) / (task.duration || 30)) * 100)}%`,
            }}
          />
        )}

        {!isLocked && (
          <div
            data-touch-ignore
            onMouseDown={(e) => handleResizeStart(e, task, 'bottom')}
            onTouchStart={(e) => handleResizeStart(e, task, 'bottom')}
            className="absolute bottom-0 left-0 right-0 h-[8px] cursor-ns-resize z-20 opacity-0 group-hover:opacity-100 touch:opacity-100"
          >
            <div className="mx-auto mb-[1px] w-8 h-[2px] rounded-full bg-muted-foreground/20 transition-colors group-hover:bg-muted-foreground/40" />
          </div>
        )}
      </div>
    </div>
  );
}