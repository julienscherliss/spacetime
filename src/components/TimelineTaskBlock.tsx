import { MutableRefObject, useRef, useCallback } from 'react';
import { Check } from 'lucide-react';
import { Task } from '@/store/taskStore';
import { PriorityBadge } from '@/components/PriorityBadge';
import { formatTime12h } from '@/hooks/useCurrentTime';
import { useScheduledDragStore } from '@/store/scheduledDragStore';

interface TimelineTaskBlockProps {
  task: Task;
  top: number;
  height: number;
  isActive: boolean;
  isLocked: boolean;
  showUnlinkedOutline: boolean;
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
  hourHeight: number;
  startHour: number;
}

const DRAG_THRESHOLD = 8;

export function TimelineTaskBlock({
  task,
  top,
  height,
  isActive,
  isLocked,
  showUnlinkedOutline,
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
  hourHeight,
  startHour,
}: TimelineTaskBlockProps) {
  const taskMinutes = task.time ? parseInt(task.time.split(':')[0], 10) * 60 + parseInt(task.time.split(':')[1], 10) : 0;
  const isDraggingThis = useScheduledDragStore((s) => s.active && s.taskId === task.id);

  const pointerStartRef = useRef<{ x: number; y: number; pointerId: number } | null>(null);
  const elRef = useRef<HTMLDivElement | null>(null);

  const borderLeftColor = {
    0: 'hsl(var(--priority-0) / 0.3)',
    1: 'hsl(var(--priority-1) / 0.5)',
    2: 'hsl(var(--priority-2) / 0.6)',
    3: 'hsl(var(--priority-3) / 0.7)',
  }[task.priority];

  const snapTo15 = (mins: number) => Math.round(mins / 15) * 15;

  const handlePointerDown = useCallback((e: React.PointerEvent) => {
    if (isLocked || isResizingThis) return;
    const target = e.target as HTMLElement;
    if (target.closest('button, input, textarea, [data-touch-ignore]')) return;

    pointerStartRef.current = { x: e.clientX, y: e.clientY, pointerId: e.pointerId };

    const blockRect = elRef.current?.getBoundingClientRect();
    const grabOffset = blockRect ? e.clientY - blockRect.top : 0;
    dragOffsetRef.current = grabOffset;

    useScheduledDragStore.getState().startDrag({
      taskId: task.id,
      sourceDate: task.date,
      originalTime: task.time || '09:00',
      duration: task.duration || 30,
      grabOffsetY: grabOffset,
    });

    elRef.current?.setPointerCapture(e.pointerId);
  }, [isLocked, isResizingThis, task.id, task.date, task.time, task.duration, dragOffsetRef]);

  const handlePointerMove = useCallback((e: React.PointerEvent) => {
    if (!pointerStartRef.current) return;
    const store = useScheduledDragStore.getState();
    if (!store.taskId) return;

    const dx = e.clientX - pointerStartRef.current.x;
    const dy = e.clientY - pointerStartRef.current.y;
    const distance = Math.hypot(dx, dy);

    if (!store.active) {
      if (distance < DRAG_THRESHOLD) return;
      useScheduledDragStore.getState().activate();
      didDragRef.current = true;
    }

    const col = elRef.current?.closest('[data-timeline-column]') as HTMLElement | null;
    if (!col) return;
    const colRect = col.getBoundingClientRect();
    const yInCol = e.clientY - colRect.top - store.grabOffsetY;
    const rawMinutes = startHour * 60 + (yInCol / hourHeight) * 60;
    const snapped = snapTo15(rawMinutes);
    useScheduledDragStore.getState().updatePosition(snapped);
  }, [didDragRef, hourHeight, startHour]);

  const handlePointerUp = useCallback((e: React.PointerEvent) => {
    if (!pointerStartRef.current) return;
    const store = useScheduledDragStore.getState();

    if (!store.active) {
      useScheduledDragStore.getState().cancel();
      handleTaskClick(task.id);
    }

    elRef.current?.releasePointerCapture(e.pointerId);
    pointerStartRef.current = null;
    setTimeout(() => { didDragRef.current = false; }, 50);
  }, [handleTaskClick, task.id, didDragRef]);

  const handlePointerCancel = useCallback((e: React.PointerEvent) => {
    useScheduledDragStore.getState().cancel();
    pointerStartRef.current = null;
    elRef.current?.releasePointerCapture(e.pointerId);
    didDragRef.current = false;
  }, [didDragRef]);

  return (
    <div
      ref={elRef}
      data-task-block
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerCancel}
      onContextMenu={(e) => e.preventDefault()}
      className={`absolute right-1 group select-none transition-[opacity,box-shadow] duration-200 ${
        isLocked
          ? 'cursor-default'
          : isResizingThis
            ? 'cursor-ns-resize'
            : 'cursor-grab active:cursor-grabbing'
      } ${isActive ? 'z-[15]' : 'z-10'} ${isDraggingThis ? 'opacity-0' : 'opacity-100'}`}
      style={{
        top,
        height,
        left: showTimeLabels ? '3.25rem' : '2px',
        touchAction: isLocked ? 'auto' : 'none',
        WebkitUserSelect: 'none',
        WebkitTouchCallout: 'none',
        userSelect: 'none',
      } as React.CSSProperties}
    >
      <div
        className={`h-full rounded-[2px] transition-all duration-200 ${
          isActive
            ? 'bg-card border border-primary/20 shadow-sm'
            : showUnlinkedOutline
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
