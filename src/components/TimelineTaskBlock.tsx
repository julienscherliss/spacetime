import { MutableRefObject, useRef, useCallback, useEffect, useState } from 'react';
import { Check, Link, Unlink } from 'lucide-react';
import { Task } from '@/store/taskStore';
import { PriorityBadge } from '@/components/PriorityBadge';
import { HoldToConfirmRing } from '@/components/HoldToConfirmRing';
import { formatTime12h } from '@/hooks/useCurrentTime';
import { useScheduledDragStore } from '@/store/scheduledDragStore';
import { useCarryStore } from '@/store/carryStore';
import { START_HOUR } from '@/components/TimelineColumn';

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
const PICKUP_HOLD_MS = 2000; // Hold still 2s to pick up into carry mode
const STILLNESS_THRESHOLD = 8; // px — movement under this counts as "still"

function findColumnAtPoint(x: number, y: number): { date: string; element: HTMLElement } | null {
  const cols = document.querySelectorAll<HTMLElement>('[data-timeline-column]');
  for (const col of cols) {
    const rect = col.getBoundingClientRect();
    if (x >= rect.left && x <= rect.right && y >= rect.top - 50 && y <= rect.bottom + 50) {
      const date = col.getAttribute('data-column-date');
      if (date) return { date, element: col };
    }
  }
  return null;
}

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
  const taskEndMinutes = taskMinutes + (task.duration || 30);
  const todayStr = new Date().toISOString().split('T')[0];
  const isOverdue = !task.completed && !!task.time && task.date <= todayStr && taskEndMinutes < nowMinutes;
  const isDraggingThis = useScheduledDragStore((s) => s.active && s.taskId === task.id);
  const isCarried = useCarryStore((s) => s.carried?.taskId === task.id);

  const borderLeftColor = {
    0: 'hsl(var(--priority-0) / 0.3)',
    1: 'hsl(var(--priority-1) / 0.5)',
    2: 'hsl(var(--priority-2) / 0.6)',
    3: 'hsl(var(--priority-3) / 0.7)',
  }[task.priority];

  const snapTo15 = (mins: number) => Math.round(mins / 15) * 15;

  const pointerStartRef = useRef<{ x: number; y: number; pointerId: number; time: number } | null>(null);
  const elRef = useRef<HTMLDivElement | null>(null);
  const pickupRafRef = useRef<number | null>(null);
  const pickupStartTime = useRef<number | null>(null);
  const [pickupProgress, setPickupProgress] = useState(0);
  const pickupCommitted = useRef(false);
  const dragActivated = useRef(false);
  const unlinkHoldTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastMoveTime = useRef<number>(0);
  const stationaryStart = useRef<number>(0);
  const lastPosition = useRef<{ x: number; y: number } | null>(null);

  const UNLINK_HOLD_MS = 600;
  const STATIONARY_THRESHOLD = 6;

  const clearUnlinkHold = () => {
    if (unlinkHoldTimer.current) {
      clearTimeout(unlinkHoldTimer.current);
      unlinkHoldTimer.current = null;
    }
  };

  const clearPickupHold = () => {
    if (pickupRafRef.current) {
      cancelAnimationFrame(pickupRafRef.current);
      pickupRafRef.current = null;
    }
    pickupStartTime.current = null;
    setPickupProgress(0);
  };

  const startPickupTimer = useCallback(() => {
    pickupStartTime.current = performance.now();
    setPickupProgress(0);
    const tick = () => {
      if (!pickupStartTime.current || pickupCommitted.current || dragActivated.current) return;
      const elapsed = performance.now() - pickupStartTime.current;
      const progress = Math.min(1, elapsed / PICKUP_HOLD_MS);
      setPickupProgress(progress);
      if (progress >= 1) {
        pickupCommitted.current = true;
        if (navigator.vibrate) navigator.vibrate(30);
        useCarryStore.getState().pickup({
          taskId: task.id,
          title: task.title,
          duration: task.duration || 30,
          fromDate: task.date,
          fromTime: task.time,
          pickedUpAt: Date.now(),
        });
        useScheduledDragStore.getState().cancel();
        pointerStartRef.current = null;
        setPickupProgress(0);
        return;
      }
      pickupRafRef.current = requestAnimationFrame(tick);
    };
    pickupRafRef.current = requestAnimationFrame(tick);
  }, [task.id, task.title, task.duration, task.date, task.time]);

  const handlePointerDown = useCallback((e: React.PointerEvent) => {
    if (isResizingThis) return;
    const target = e.target as HTMLElement;
    if (target.closest('button, input, textarea, [data-touch-ignore]')) return;
    if (useCarryStore.getState().carried) return;

    pointerStartRef.current = { x: e.clientX, y: e.clientY, pointerId: e.pointerId, time: Date.now() };
    pickupCommitted.current = false;
    dragActivated.current = false;

    const blockRect = elRef.current?.getBoundingClientRect();
    const grabOffset = blockRect ? e.clientY - blockRect.top : 0;
    dragOffsetRef.current = grabOffset;

    // Locked tasks: tap-to-edit only
    if (isLocked) {
      const onUp = () => {
        window.removeEventListener('pointerup', onUp);
        window.removeEventListener('pointercancel', onCancel);
        if (pointerStartRef.current) {
          pointerStartRef.current = null;
          handleTaskClick(task.id);
        }
      };
      const onCancel = () => {
        window.removeEventListener('pointerup', onUp);
        window.removeEventListener('pointercancel', onCancel);
        pointerStartRef.current = null;
      };
      window.addEventListener('pointerup', onUp);
      window.addEventListener('pointercancel', onCancel);
      return;
    }

    // Prepare drag store (not yet active)
    useScheduledDragStore.getState().startDrag({
      taskId: task.id,
      sourceDate: task.date,
      originalTime: task.time || '09:00',
      duration: task.duration || 30,
      grabOffsetY: grabOffset,
    });

    if (task.linked && task.linkedGroupId) {
      useScheduledDragStore.setState({ isLinkedTask: true });
    }

    // Start pickup hold timer (hold still = pick up into carry mode)
    startPickupTimer();
  }, [isLocked, isResizingThis, task.id, task.date, task.time, task.duration, task.title, task.linked, task.linkedGroupId, dragOffsetRef, handleTaskClick, startPickupTimer]);

  // Global pointermove/pointerup when drag is pending or active
  useEffect(() => {
    if (!pointerStartRef.current) return;
    const store = useScheduledDragStore.getState();
    if (store.taskId !== task.id) return;

    const handleMove = (e: PointerEvent) => {
      if (!pointerStartRef.current || pickupCommitted.current) return;
      const dx = e.clientX - pointerStartRef.current.x;
      const dy = e.clientY - pointerStartRef.current.y;
      const distance = Math.hypot(dx, dy);

      // If moved beyond stillness threshold, cancel pickup and activate drag
      if (distance >= STILLNESS_THRESHOLD && !dragActivated.current) {
        clearPickupHold();
        dragActivated.current = true;
      }

      const s = useScheduledDragStore.getState();
      if (!s.active) {
        // Activate drag immediately once movement exceeds threshold
        if (distance < DRAG_THRESHOLD) return;
        if (!dragActivated.current) {
          clearPickupHold();
          dragActivated.current = true;
        }
        useScheduledDragStore.getState().activate();
        didDragRef.current = true;
        lastPosition.current = { x: e.clientX, y: e.clientY };
        stationaryStart.current = Date.now();
      }

      // Find which column the pointer is over
      const col = findColumnAtPoint(e.clientX, e.clientY);
      if (col) {
        const colRect = col.element.getBoundingClientRect();
        const yInCol = e.clientY - colRect.top - useScheduledDragStore.getState().grabOffsetY;
        const rawMinutes = START_HOUR * 60 + (yInCol / hourHeight) * 60;
        const snapped = snapTo15(rawMinutes);
        useScheduledDragStore.getState().updatePosition(snapped);
        useScheduledDragStore.getState().setTargetDate(col.date);
      }

      // Track stationary hold for unlink gesture (only for linked tasks)
      const currentState = useScheduledDragStore.getState();
      if (currentState.active && currentState.isLinkedTask && !currentState.unlinkMode) {
        const now = Date.now();
        if (lastPosition.current) {
          const moveDist = Math.hypot(
            e.clientX - lastPosition.current.x,
            e.clientY - lastPosition.current.y
          );
          if (moveDist > STATIONARY_THRESHOLD) {
            lastPosition.current = { x: e.clientX, y: e.clientY };
            stationaryStart.current = now;
            clearUnlinkHold();
          } else if (!unlinkHoldTimer.current) {
            unlinkHoldTimer.current = setTimeout(() => {
              const s2 = useScheduledDragStore.getState();
              if (s2.active && s2.isLinkedTask && !s2.unlinkMode) {
                useScheduledDragStore.getState().setUnlinkMode(true);
                if (navigator.vibrate) navigator.vibrate(30);
              }
            }, UNLINK_HOLD_MS);
          }
        } else {
          lastPosition.current = { x: e.clientX, y: e.clientY };
          stationaryStart.current = now;
        }
      }
    };

    const handleUp = (e: PointerEvent) => {
      clearUnlinkHold();
      clearPickupHold();
      if (!pointerStartRef.current) return;
      if (pickupCommitted.current) {
        pointerStartRef.current = null;
        useScheduledDragStore.getState().cancel();
        return;
      }
      const s = useScheduledDragStore.getState();
      if (!s.active) {
        useScheduledDragStore.getState().cancel();
        handleTaskClick(task.id);
      }
      pointerStartRef.current = null;
      setTimeout(() => { didDragRef.current = false; }, 50);
    };

    const handleCancel = () => {
      clearUnlinkHold();
      clearPickupHold();
      useScheduledDragStore.getState().cancel();
      pointerStartRef.current = null;
      didDragRef.current = false;
    };

    window.addEventListener('pointermove', handleMove);
    window.addEventListener('pointerup', handleUp);
    window.addEventListener('pointercancel', handleCancel);
    return () => {
      window.removeEventListener('pointermove', handleMove);
      window.removeEventListener('pointerup', handleUp);
      window.removeEventListener('pointercancel', handleCancel);
    };
  });

  // Clear ref when drag ends externally
  const dragTaskId = useScheduledDragStore((s) => s.taskId);
  useEffect(() => {
    if (dragTaskId !== task.id) {
      pointerStartRef.current = null;
    }
  }, [dragTaskId, task.id]);

  const showHoldRing = pickupProgress > 0 && !dragActivated.current && !isLocked;

  return (
    <div
      ref={elRef}
      data-task-block
      onPointerDown={handlePointerDown}
      onContextMenu={(e) => e.preventDefault()}
      className={`absolute right-1 group select-none transition-[opacity,box-shadow] duration-200 ${
        isLocked
          ? 'cursor-default'
          : isResizingThis
            ? 'cursor-ns-resize'
            : 'cursor-grab active:cursor-grabbing'
      } ${isActive ? 'z-[15]' : 'z-10'} ${(isDraggingThis || isCarried) ? 'opacity-0' : 'opacity-100'}`}
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
              ? `${task.isRoutine ? 'bg-background/60 backdrop-blur-sm' : 'bg-card'} border border-border/60 border-dashed hover:border-[hsl(var(--task-hover))] hover:shadow-sm`
              : `${task.isRoutine ? 'bg-background/60 backdrop-blur-sm border border-[hsl(var(--task-border))]' : 'bg-card border border-[hsl(var(--task-border))]'} hover:border-[hsl(var(--task-hover))] hover:shadow-sm`
        } ${isOverdue ? 'border-destructive/30' : ''}`}
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

          <div className="flex flex-col justify-between h-full px-2 py-1 overflow-hidden">
          <div className="flex items-start justify-between">
            <div className="flex-1 min-w-0">
              <div className={`text-[12px] font-mono leading-tight truncate ${
                task.completed ? 'line-through text-muted-foreground/40' : isOverdue ? 'text-destructive/70 font-medium' : isActive ? 'text-foreground font-medium' : 'text-foreground/75'
              }`}>
                {task.title}
              </div>
              {height > 36 && task.time && showTimeLabels && (
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
            <button
              data-touch-ignore
              onClick={(e) => {
                e.stopPropagation();
                completeTask(task.id);
              }}
              className={`p-1 rounded-sm hover:text-primary hover:bg-primary/5 transition-all shrink-0 ml-1.5 ${
                task.completed ? 'text-primary' : 'text-muted-foreground/25'
              }`}
            >
              <Check size={14} />
            </button>
          </div>
          {height > 28 && (
            <div className="flex items-center gap-1 mt-auto">
              {task.type === 'recurring' && (
                <span className={`p-0.5 ${task.linked ? 'text-primary/40' : 'text-muted-foreground/20'}`} title={task.linked ? 'Linked' : 'Unlinked'}>
                  {task.linked ? <Link size={9} /> : <Unlink size={9} />}
                </span>
              )}
              <PriorityBadge priority={task.priority} />
            </div>
          )}
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
      {showHoldRing && (
        <div className="absolute inset-0 flex items-center justify-center z-30 pointer-events-none">
          <div className="bg-background/70 backdrop-blur-sm rounded-[2px] absolute inset-0" />
          <div className="relative z-10">
            <HoldToConfirmRing progress={dragHoldProgress} size={32} strokeWidth={2.5} />
          </div>
        </div>
      )}
    </div>
  );
}
