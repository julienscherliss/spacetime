import { useRef, useState, useCallback, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Layers, Check } from 'lucide-react';
import { Task, useTaskStore } from '@/store/taskStore';
import { formatTime12h } from '@/hooks/useCurrentTime';
import { useScheduledDragStore } from '@/store/scheduledDragStore';
import { START_HOUR } from '@/components/TimelineColumn';
import { getOccupiedSlots, findValidPosition } from '@/utils/collisionDetection';

interface GroupTimelineBlockProps {
  task: Task;
  top: number;
  height: number;
  isActive: boolean;
  showTimeLabels: boolean;
  formatDuration: (mins: number) => string;
  hourHeight: number;
  isResizingThis: boolean;
  resizePreview: { time: string; duration: number } | null;
  handleResizeStart: (
    e: React.MouseEvent | React.TouchEvent,
    task: Task,
    edge: 'top' | 'bottom',
  ) => void;
}

const LEFT_INSET_WITH_LABELS = '3.25rem';
const LEFT_INSET_WITHOUT_LABELS = '2px';

const DRAG_THRESHOLD = 8;

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

const snapTo15 = (mins: number) => Math.round(mins / 15) * 15;

/**
 * Compact "stacked" representation of a Group on the main timeline.
 *
 * - Single click → opens the GroupEditPanel.
 * - Double click → completes the entire Group (with confirm pulse).
 * - Drag → moves the Group like any other task block.
 * - Resize handles (top/bottom) → resize the Group span.
 * - Acts as a drop target when the user drags another scheduled task over it
 *   (handled by TimelineColumn's pointerup logic via the data attributes).
 */
export function GroupTimelineBlock({
  task,
  top,
  height,
  isActive,
  showTimeLabels,
  formatDuration,
  hourHeight,
  isResizingThis,
  resizePreview,
  handleResizeStart,
}: GroupTimelineBlockProps) {
  const setEditingTask = useTaskStore((s) => s.setEditingTask);
  const completeGroup = useTaskStore((s) => s.completeGroup);
  const childCount = useTaskStore((s) =>
    s.tasks.filter((t) => t.groupId === task.id && !t.archivedAt).length,
  );
  const completedCount = useTaskStore((s) =>
    s.tasks.filter((t) => t.groupId === task.id && !t.archivedAt && t.completed).length,
  );

  const isDraggingThis = useScheduledDragStore((s) => s.active && s.taskId === task.id);
  const dragHoverTargetId = useScheduledDragStore((s) =>
    s.active && s.taskId !== task.id ? s.dropTargetGroupId : null,
  );
  const isDropHover = dragHoverTargetId === task.id;

  const [confirming, setConfirming] = useState(false);
  const clickTimer = useRef<number | null>(null);
  const elRef = useRef<HTMLDivElement | null>(null);

  // ── Drag-to-move (mirrors TimelineTaskBlock's simpler path) ──────────────
  const pointerStartRef = useRef<{ x: number; y: number; pointerId: number } | null>(null);
  const dragActivated = useRef(false);
  const grabOffsetRef = useRef(0);
  const suppressClickRef = useRef(false);

  const handlePointerDown = useCallback(
    (e: React.PointerEvent) => {
      if (isResizingThis) return;
      const target = e.target as HTMLElement;
      if (target.closest('button, input, textarea, [data-touch-ignore]')) return;

      pointerStartRef.current = { x: e.clientX, y: e.clientY, pointerId: e.pointerId };
      dragActivated.current = false;
      const rect = elRef.current?.getBoundingClientRect();
      grabOffsetRef.current = rect ? e.clientY - rect.top : 0;

      // Prime the scheduled drag store but don't activate yet.
      useScheduledDragStore.getState().startDrag({
        taskId: task.id,
        sourceDate: task.date,
        originalTime: task.time || '09:00',
        duration: task.duration || 30,
        grabOffsetY: grabOffsetRef.current,
      });
    },
    [isResizingThis, task.id, task.date, task.time, task.duration],
  );

  // Global pointermove / up while a press is in progress on this group
  useEffect(() => {
    const handleMove = (e: PointerEvent) => {
      if (!pointerStartRef.current) return;
      const dx = e.clientX - pointerStartRef.current.x;
      const dy = e.clientY - pointerStartRef.current.y;
      const distance = Math.hypot(dx, dy);

      const s = useScheduledDragStore.getState();
      if (!s.active) {
        if (distance < DRAG_THRESHOLD) return;
        useScheduledDragStore.getState().activate();
        dragActivated.current = true;
        suppressClickRef.current = true;
      }

      const col = findColumnAtPoint(e.clientX, e.clientY);
      if (col) {
        const colRect = col.element.getBoundingClientRect();
        const yInCol = e.clientY - colRect.top - useScheduledDragStore.getState().grabOffsetY;
        const rawMinutes = START_HOUR * 60 + (yInCol / hourHeight) * 60;
        const snapped = snapTo15(rawMinutes);

        const taskDuration = task.duration || 30;
        const allTasks = useTaskStore.getState().tasks;
        const routinesOn = useTaskStore.getState().routinesEnabled;
        const occupied = getOccupiedSlots(allTasks, col.date, task.id, routinesOn);
        const { startMin: clamped, blocked } = findValidPosition(snapped, taskDuration, occupied);

        // Priority-constraint violations are no longer marked as blocked during
        // drag — the drop triggers the Reflection prompt instead.
        const moveBlocked = blocked;

        useScheduledDragStore.getState().updatePosition(clamped);
        useScheduledDragStore.getState().setTargetDate(col.date);
        useScheduledDragStore.getState().setBlocked(moveBlocked);
      }
    };

    const handleUp = () => {
      if (!pointerStartRef.current) return;
      pointerStartRef.current = null;
      const s = useScheduledDragStore.getState();
      if (!s.active) {
        // Treat as a click — let the onClick fire normally.
        useScheduledDragStore.getState().cancel();
      }
      // If active, TimelineColumn's global pointerup commits the drop.
      // Reset suppressClick after the click event has fired.
      setTimeout(() => {
        suppressClickRef.current = false;
      }, 50);
    };

    const handleCancel = () => {
      pointerStartRef.current = null;
      useScheduledDragStore.getState().cancel();
      setTimeout(() => {
        suppressClickRef.current = false;
      }, 50);
    };

    window.addEventListener('pointermove', handleMove);
    window.addEventListener('pointerup', handleUp);
    window.addEventListener('pointercancel', handleCancel);
    return () => {
      window.removeEventListener('pointermove', handleMove);
      window.removeEventListener('pointerup', handleUp);
      window.removeEventListener('pointercancel', handleCancel);
    };
  }, [hourHeight, task.id, task.date, task.duration]);

  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (suppressClickRef.current) return;
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
    if (suppressClickRef.current) return;
    if (clickTimer.current !== null) {
      window.clearTimeout(clickTimer.current);
      clickTimer.current = null;
    }
    setConfirming(true);
    window.setTimeout(() => {
      completeGroup(task.id);
    }, 180);
  };

  const isShort = height < 36;
  const showResizeHandles = height >= 18;

  return (
    <div
      ref={elRef}
      data-task-block
      data-group-block
      data-group-id={task.id}
      onPointerDown={handlePointerDown}
      onContextMenu={(e) => e.preventDefault()}
      className={`absolute right-1 group select-none ${
        isActive ? 'z-[15]' : 'z-10'
      } ${isDraggingThis ? 'opacity-0' : 'opacity-100'} cursor-grab active:cursor-grabbing`}
      style={{
        top,
        height,
        left: showTimeLabels ? LEFT_INSET_WITH_LABELS : LEFT_INSET_WITHOUT_LABELS,
        touchAction: 'none',
        WebkitUserSelect: 'none',
      }}
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

      {/* Main block — div (not button) so pointer drag works cleanly */}
      <motion.div
        role="button"
        tabIndex={0}
        onClick={handleClick}
        onDoubleClick={handleDoubleClick}
        animate={confirming ? { scale: 0.96 } : { scale: 1 }}
        transition={{ duration: 0.15 }}
        className={`absolute inset-0 rounded-sm border text-left overflow-hidden transition-colors ${
          confirming
            ? 'bg-primary text-primary-foreground border-primary'
            : isDropHover
            ? 'bg-primary/10 border-primary'
            : isActive
            ? 'bg-card border-primary/40'
            : 'bg-card border-border hover:border-foreground/30'
        }`}
        title={`${task.title} — double-click to complete the whole Group, drag tasks here to add them`}
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
                <div
                  className={`text-[9px] font-mono tracking-wide mt-0.5 ${
                    confirming ? 'text-primary-foreground/80' : 'text-muted-foreground/60'
                  }`}
                >
                  {childCount === 0
                    ? 'Empty Group'
                    : `${completedCount}/${childCount} task${childCount === 1 ? '' : 's'}`}
                </div>
              )}
            </div>
          </div>

          {showTimeLabels && !isShort && task.time && task.duration && (
            <div
              className={`text-[9px] font-mono tracking-wider self-end ${
                confirming ? 'text-primary-foreground/70' : 'text-muted-foreground/50'
              }`}
            >
              {formatTime12h(task.time)} · {formatDuration(task.duration)}
            </div>
          )}
        </div>

        {confirming && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <Check size={18} strokeWidth={2} />
          </div>
        )}
      </motion.div>

      {/* Resize handles (top + bottom) */}
      {showResizeHandles && (
        <>
          <div
            data-touch-ignore
            onMouseDown={(e) => handleResizeStart(e, task, 'top')}
            onTouchStart={(e) => handleResizeStart(e, task, 'top')}
            className="absolute top-0 right-0 cursor-ns-resize z-20 opacity-0 group-hover:opacity-100 touch:opacity-100 flex items-start justify-end pr-1 pt-[2px]"
            style={{ width: 'var(--ui-resize-w)', height: 'var(--ui-resize-handle)', touchAction: 'none' }}
          >
            <svg width="8" height="8" viewBox="0 0 8 8" className="text-muted-foreground/40">
              <line x1="1" y1="7" x2="7" y2="1" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
              <line x1="4" y1="7" x2="7" y2="4" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
            </svg>
          </div>
          <div
            data-touch-ignore
            onMouseDown={(e) => handleResizeStart(e, task, 'bottom')}
            onTouchStart={(e) => handleResizeStart(e, task, 'bottom')}
            className="absolute bottom-0 right-0 cursor-ns-resize z-20 opacity-0 group-hover:opacity-100 touch:opacity-100 flex items-end justify-end pr-1 pb-[2px]"
            style={{ width: 'var(--ui-resize-w)', height: 'var(--ui-resize-handle)', touchAction: 'none' }}
          >
            <svg width="8" height="8" viewBox="0 0 8 8" className="text-muted-foreground/40">
              <line x1="1" y1="1" x2="7" y2="7" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
              <line x1="4" y1="1" x2="7" y2="4" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
            </svg>
          </div>
        </>
      )}

      {isResizingThis && resizePreview && (
        <div className="absolute -right-1 top-1/2 -translate-y-1/2 translate-x-full z-30 px-2 py-1 rounded-sm bg-card border border-border shadow-sm pointer-events-none">
          <span className="text-[10px] font-mono text-foreground/70 whitespace-nowrap">
            {formatTime12h(resizePreview.time)} · {formatDuration(resizePreview.duration)}
          </span>
        </div>
      )}
    </div>
  );
}
