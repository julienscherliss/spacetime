import { MutableRefObject, useRef, useCallback, useEffect, useState } from 'react';
import { Check } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useTimezoneStore, getTodayInTz } from '@/store/timezoneStore';
import { Task, useTaskStore } from '@/store/taskStore';
import { HoldToConfirmRing } from '@/components/HoldToConfirmRing';
import { formatTime12h } from '@/hooks/useCurrentTime';
import { useScheduledDragStore } from '@/store/scheduledDragStore';
import { useCarryStore } from '@/store/carryStore';
import { useDragHandoffStore } from '@/store/dragHandoffStore';
import { useColorSchemeStore } from '@/store/colorSchemeStore';
import { START_HOUR } from '@/components/TimelineColumn';
import { getOccupiedSlots, findValidPosition } from '@/utils/collisionDetection';
import { TASK_TEXT_FIT_PX, TASK_TEXT_FIT_PX_COMFORT } from '@/utils/taskClustering';


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
  hasRoutineConflict?: boolean;
  isCompact?: boolean;
  onZoomIn?: () => void;
  /** Lane index (0-based) when this task shares its time slot with others. */
  laneIndex?: number;
  /** Total number of lanes in the overlap group. 1 = full width. */
  laneCount?: number;
}

const DRAG_THRESHOLD = 8;
const LOCK_MS = 250;        // 0–0.25s: no movement allowed
const PICKUP_START_MS = 500; // 0.5s after press: pickup ring begins
const PICKUP_FILL_MS = 500;  // ring fills over 0.5s (completes at 1.0s)
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
  hasRoutineConflict = false,
  isCompact = false,
  onZoomIn,
  laneIndex = 0,
  laneCount = 1,
}: TimelineTaskBlockProps) {
  const taskMinutes = task.time ? parseInt(task.time.split(':')[0], 10) * 60 + parseInt(task.time.split(':')[1], 10) : 0;
  const taskEndMinutes = taskMinutes + (task.duration || 30);
  // Visual lock styling — driven by priority, independent of drag-gating.
  // (`isLocked` prop only controls interaction behavior now.)
  const lockedVisuals = task.priority >= 3;
  // FIXED (priority 2) gets the full active accent fill; LOCKED (3) gets black fill.
  const fixedVisuals = task.priority === 2;
  const timezone = useTimezoneStore((s) => s.timezone);
  const todayStr = getTodayInTz(timezone);
  const isPastDate = task.date < todayStr;
  const isTodayDate = task.date === todayStr;
  const isOverdue = !task.completed && !!task.time && (isPastDate || (isTodayDate && taskEndMinutes < nowMinutes));
  const isDraggingThis = useScheduledDragStore((s) => s.active && s.taskId === task.id);
  const isCarried = useCarryStore((s) => s.carried?.taskId === task.id);

  // Each priority renders directly from its scheme stroke + fill so editing
  // the scheme has a 1:1 visible effect on tasks.
  // FLEX(0) + SEMI(1): subtle stroke + soft fill tint, light text.
  // FIXED(2) + LOCK(3): full filled treatment, white/light text.
  const flexVisuals = task.priority === 0;
  const semiVisuals = task.priority === 1;

  // Minimal dot rendering mode (set in Visual Themes panel). When on, every
  // task block uses the same neutral surface and shows the priority color as
  // a small filled circle next to the title instead of a full color fill.
  const dotMode = useColorSchemeStore((s) => s.dotMode);
  // Pull the active scheme so the dot gets the user's chosen fill colors
  // even when we bypass the per-priority CSS variables for the block fill.
  const activeScheme = useColorSchemeStore((s) => s.getActiveScheme());
  const dotFillRaw = activeScheme.priorities[task.priority as 0 | 1 | 2 | 3]?.fill
    ?? activeScheme.priorities[0].fill;
  const dotStrokeRaw = activeScheme.priorities[task.priority as 0 | 1 | 2 | 3]?.stroke
    ?? activeScheme.priorities[0].stroke;
  // Always use the scheme's FILL color for the dot so the indicator matches
  // exactly what the user picked in the theme editor.
  const dotColor = dotFillRaw;

  const snapTo15 = (mins: number) => Math.round(mins / 15) * 15;

  const pointerStartRef = useRef<{ x: number; y: number; pointerId: number; time: number } | null>(null);
  const elRef = useRef<HTMLDivElement | null>(null);
  const pickupRafRef = useRef<number | null>(null);
  const pickupStartTime = useRef<number | null>(null);
  const [pickupProgress, setPickupProgress] = useState(0);
  const [dragReady, setDragReady] = useState(false);
  const pickupCommitted = useRef(false);
  const dragActivated = useRef(false);
  const dragReadyFired = useRef(false);

  const clearPickupHold = () => {
    if (pickupRafRef.current) {
      cancelAnimationFrame(pickupRafRef.current);
      pickupRafRef.current = null;
    }
    pickupStartTime.current = null;
    setPickupProgress(0);
  };

  const startPickupTimer = useCallback(() => {
    // Pickup ring starts at PICKUP_START_MS and fills over PICKUP_FILL_MS
    pickupStartTime.current = performance.now();
    setPickupProgress(0);
    const tick = () => {
      if (!pickupStartTime.current || pickupCommitted.current || dragActivated.current) return;
      const elapsed = performance.now() - pickupStartTime.current;
      
      // At LOCK_MS, fire "drag ready" haptic + visual cue
      if (elapsed >= LOCK_MS && !dragReadyFired.current) {
        dragReadyFired.current = true;
        setDragReady(true);
        if (navigator.vibrate) navigator.vibrate(15);
      }
      
      // Before PICKUP_START_MS, no ring — just waiting
      if (elapsed < PICKUP_START_MS) {
        pickupRafRef.current = requestAnimationFrame(tick);
        return;
      }
      
      // Ring fills from PICKUP_START_MS to PICKUP_START_MS + PICKUP_FILL_MS
      const ringElapsed = elapsed - PICKUP_START_MS;
      const progress = Math.min(1, ringElapsed / PICKUP_FILL_MS);
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

  // Stop touch bubbling so parent day/week swipe handlers never treat a task drag
  // as a view-navigation gesture. Multi-touch still cancels pending pickup/drag.
  const handleTouchStartMulti = useCallback((e: React.TouchEvent) => {
    e.stopPropagation();

    if (e.touches.length > 1) {
      clearPickupHold();
      if (pointerStartRef.current) {
        pointerStartRef.current = null;
        useScheduledDragStore.getState().cancel();
        dragActivated.current = false;
        pickupCommitted.current = false;
      }
    }
  }, []);

  const handlePointerDown = useCallback((e: React.PointerEvent) => {
    if (isResizingThis) return;
    const target = e.target as HTMLElement;
    if (target.closest('button, input, textarea, [data-touch-ignore]')) return;
    if (useCarryStore.getState().carried) return;

    pointerStartRef.current = { x: e.clientX, y: e.clientY, pointerId: e.pointerId, time: Date.now() };
    pickupCommitted.current = false;
    dragActivated.current = false;
    dragReadyFired.current = false;
    setDragReady(false);

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

  // Consume a drag handoff from DayListView: when the user starts dragging a
  // task in list view, we portal them into the timeline and replay a
  // synthetic pointerdown on this block itself. Starting from the actual block
  // rect avoids using stale list-view coordinates after the view swap.
  useEffect(() => {
    const handoff = useDragHandoffStore.getState().handoff;
    if (!handoff || handoff.taskId !== task.id) return;
    if (Date.now() - handoff.startedAt > 1500) return;
    const el = elRef.current;
    if (!el) return;
    // Mark consumed immediately to avoid re-firing on re-renders.
    useDragHandoffStore.getState().setHandoff(null);
    // Defer one frame so layout is committed and getBoundingClientRect is real.
    const raf = requestAnimationFrame(() => {
      const rect = el.getBoundingClientRect();
      const clientX = rect.left + rect.width / 2;
      const clientY = rect.top + Math.min(rect.height / 2, 24);
      const synthetic = new PointerEvent('pointerdown', {
        bubbles: true,
        cancelable: true,
        pointerId: handoff.pointerId,
        pointerType: 'touch',
        clientX,
        clientY,
        button: 0,
        buttons: 1,
      });
      el.dispatchEvent(synthetic);
    });
    return () => cancelAnimationFrame(raf);
  }, [task.id]);

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
      const elapsed = Date.now() - pointerStartRef.current.time;

      // Phase 1: 0–0.5s — lock in place, no movement allowed
      if (elapsed < LOCK_MS) return;

      // If moved beyond stillness threshold, cancel pickup and activate drag
      if (distance >= STILLNESS_THRESHOLD && !dragActivated.current) {
        clearPickupHold();
        dragActivated.current = true;
        setDragReady(false);
      }

      const s = useScheduledDragStore.getState();
      if (!s.active) {
        // Activate drag once movement exceeds threshold (only after LOCK_MS)
        if (distance < DRAG_THRESHOLD) return;
        if (!dragActivated.current) {
          clearPickupHold();
          dragActivated.current = true;
        }
        useScheduledDragStore.getState().activate();
        didDragRef.current = true;
      }

      // Find which column the pointer is over
      const col = findColumnAtPoint(e.clientX, e.clientY);
      if (col) {
        const colRect = col.element.getBoundingClientRect();
        const yInCol = e.clientY - colRect.top - useScheduledDragStore.getState().grabOffsetY;
        const rawMinutes = START_HOUR * 60 + (yInCol / hourHeight) * 60;
        const snapped = snapTo15(rawMinutes);

        const taskDuration = task.duration || 30;
        const allTasks = useTaskStore.getState().tasks;
        const routinesOn = useTaskStore.getState().routinesEnabled;

        // Relink detection BEFORE collision clamping: use raw snapped position
        let relinkTarget: string | null = null;
        if (!task.linked) {
          const dragStart = snapped;
          const dragEnd = snapped + taskDuration;
          for (const t of allTasks) {
            if (t.id === task.id || t.completed || t.archivedAt) continue;
            if (t.date !== col.date || !t.time) continue;
            if (t.title === task.title && (t.duration || 30) === taskDuration) {
              const tStartMin = parseInt(t.time.split(':')[0]) * 60 + parseInt(t.time.split(':')[1]);
              const tEnd = tStartMin + (t.duration || 30);
              if (dragStart < tEnd && dragEnd > tStartMin) {
                relinkTarget = t.id;
                break;
              }
            }
          }
        }

        if (relinkTarget) {
          // Snap to target's position, skip collision detection
          const target = allTasks.find(t => t.id === relinkTarget)!;
          const targetMin = parseInt(target.time!.split(':')[0]) * 60 + parseInt(target.time!.split(':')[1]);
          useScheduledDragStore.getState().updatePosition(targetMin);
          useScheduledDragStore.getState().setTargetDate(col.date);
          useScheduledDragStore.getState().setBlocked(false);
          useScheduledDragStore.getState().setCopyMode(false);
          useScheduledDragStore.getState().setUnlinkMode(false);
          useScheduledDragStore.getState().setRelinkMode(true, relinkTarget);
        } else {
          // Normal collision detection
          const occupiedSlots = getOccupiedSlots(allTasks, col.date, task.id, routinesOn);
          const { startMin: clampedMin, blocked } = findValidPosition(snapped, taskDuration, occupiedSlots);

          // NOTE: We intentionally no longer mark priority-constraint violations
          // as "blocked" during drag. The drop is allowed to proceed and the
          // Reflection prompt takes over. Only physical collisions stay red.
          const moveBlocked = blocked;

          useScheduledDragStore.getState().updatePosition(clampedMin);
          useScheduledDragStore.getState().setTargetDate(col.date);
          useScheduledDragStore.getState().setBlocked(moveBlocked);
          useScheduledDragStore.getState().setRelinkMode(false, null);

          // Copy mode: pointer in rightmost 40px of column
          const currentDragState = useScheduledDragStore.getState();
          const copyZone = colRect.right - 40;
          const inCopyZone = e.clientX >= copyZone && !moveBlocked;
          if (currentDragState.isLinkedTask) {
            useScheduledDragStore.getState().setUnlinkMode(inCopyZone);
            useScheduledDragStore.getState().setCopyMode(false);
          } else {
            useScheduledDragStore.getState().setCopyMode(inCopyZone);
            useScheduledDragStore.getState().setUnlinkMode(false);
          }
        }
      }
    };

    const handleUp = (e: PointerEvent) => {
      clearPickupHold();
      setDragReady(false);
      if (!pointerStartRef.current) return;
      if (pickupCommitted.current) {
        pointerStartRef.current = null;
        useScheduledDragStore.getState().cancel();
        return;
      }
      const s = useScheduledDragStore.getState();
      if (!s.active) {
        useScheduledDragStore.getState().cancel();
        // Defer single click to allow double-click detection
        if (clickTimerRef.current) {
          clearTimeout(clickTimerRef.current);
          clickTimerRef.current = null;
          handleDoubleComplete();
        } else {
          clickTimerRef.current = setTimeout(() => {
            clickTimerRef.current = null;
            if (isCompact && onZoomIn) {
              onZoomIn();
            } else {
              handleTaskClick(task.id);
            }
          }, 250);
        }
      }
      pointerStartRef.current = null;
      setTimeout(() => { didDragRef.current = false; }, 50);
    };

    const handleCancel = () => {
      clearPickupHold();
      setDragReady(false);
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

  const comfortMode = useTimezoneStore((s) => s.comfortMode);
  const titleThreshold = comfortMode ? TASK_TEXT_FIT_PX_COMFORT : TASK_TEXT_FIT_PX;
  const metaThreshold = titleThreshold + (comfortMode ? 14 : 13);
  const footerThreshold = titleThreshold + (comfortMode ? 6 : 5);

  const showHoldRing = pickupProgress > 0 && !dragActivated.current && !isLocked;
  const canShowTitle = !isCompact && height >= titleThreshold;
  const canShowActiveMeta = !isCompact && height > metaThreshold;
  const canShowFooter = !isCompact && height > footerThreshold;
  const canShowResizeHandles = !isCompact && height >= 18;

  // Double-click/tap to complete
  const clickTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [completionFlash, setCompletionFlash] = useState(false);

  const handleDoubleComplete = useCallback(() => {
    if (task.completed) {
      // Uncomplete
      useTaskStore.getState().uncompleteTask(task.id);
      if (navigator.vibrate) navigator.vibrate(20);
    } else {
      setCompletionFlash(true);
      if (navigator.vibrate) navigator.vibrate(20);
      setTimeout(() => {
        completeTask(task.id);
        setCompletionFlash(false);
      }, 400);
    }
  }, [completeTask, task.id, task.completed]);

  return (
    <div
      ref={elRef}
      data-task-block
      onPointerDown={handlePointerDown}
      onTouchStart={handleTouchStartMulti}
      
      className={`absolute ${laneCount > 1 ? '' : 'right-1'} group select-none transition-[opacity,box-shadow] duration-200 ${
        isLocked
          ? 'cursor-default'
          : isResizingThis
            ? 'cursor-ns-resize'
            : 'cursor-grab active:cursor-grabbing'
      } ${
        isActive
          ? 'z-[20]'
          : hasRoutineConflict
            ? 'z-[16]'
            : flexVisuals
              ? 'z-[14]' // FLEX floats highest — its shadow lands on neighbors below
              : semiVisuals
                ? 'z-[13]'
                : fixedVisuals
                  ? 'z-[12]'
                  : lockedVisuals
                    ? 'z-[11]' // LOCK sits flat at the bottom of the stack
                    : 'z-10'
      } ${(isDraggingThis || isCarried) ? 'opacity-0' : 'opacity-100'}`}
      style={(() => {
        const leftBase = showTimeLabels ? '3.25rem' : '2px';
        const rightBase = '0.25rem'; // matches `right-1`
        const laneGapPx = 3;
        const baseStyle: React.CSSProperties = {
          top,
          height,
          left: leftBase,
          touchAction: isLocked ? 'auto' : 'none',
          WebkitUserSelect: 'none',
          WebkitTouchCallout: 'none',
          userSelect: 'none',
          transition: 'opacity 200ms, box-shadow 200ms, transform 150ms ease-out',
          transform: dragReady && !dragActivated.current ? 'scale(1.02)' : undefined,
          boxShadow: dragReady && !dragActivated.current ? '0 4px 12px hsl(var(--primary) / 0.12)' : undefined,
        };
        if (laneCount > 1) {
          // Split the horizontal space between leftBase and rightBase into
          // `laneCount` columns and place this block into `laneIndex`.
          const laneWidthExpr = `((100% - ${leftBase} - ${rightBase}) / ${laneCount})`;
          baseStyle.left = `calc(${leftBase} + ${laneIndex} * ${laneWidthExpr})`;
          baseStyle.width = `calc(${laneWidthExpr} - ${laneGapPx}px)`;
          baseStyle.right = 'auto';
        }
        return baseStyle;
      })()}
    >
      <div
        className={`h-full rounded-[2px] transition-all duration-200 ${
          task.completed
            ? ''
            : dotMode
            ? 'bg-card hover:shadow-sm'
            : lockedVisuals
            ? 'shadow-sm'
            : fixedVisuals
              ? 'shadow-sm'
              : isActive
                ? 'bg-card shadow-sm'
                : hasRoutineConflict
                  ? 'bg-card shadow-sm'
                  : showUnlinkedOutline
                    ? 'bg-card border-dashed hover:shadow-sm'
                    : 'bg-card hover:shadow-sm'
        } ${isOverdue && !hasRoutineConflict ? '' : ''}`}
        style={{
          backgroundColor: task.completed
            ? 'hsl(var(--surface-inset))'
            : dotMode
              ? 'hsl(var(--muted))'
              : lockedVisuals
                ? 'hsl(var(--locked-fill))'
                : fixedVisuals
                  ? 'hsl(var(--fixed-fill))'
                  : semiVisuals
                    ? `hsl(var(--priority-1-fill))`
                    : flexVisuals
                      ? `hsl(var(--priority-0-fill))`
                      : undefined,
          border: task.completed
            ? '1px solid hsl(0 0% 0% / 0.14)'
            : dotMode
              ? '1.5px solid hsl(var(--background))'
              : lockedVisuals
                ? '1.5px solid hsl(var(--locked-stroke))'
                : fixedVisuals
                  ? '1.5px solid hsl(var(--fixed-stroke))'
                  : semiVisuals && !isActive && !hasRoutineConflict
                    ? `1.5px solid hsl(var(--priority-1))`
                    : flexVisuals && !isActive && !hasRoutineConflict
                      ? `1px solid hsl(var(--priority-0))`
                      : isActive
                        ? '1px solid hsl(var(--primary) / 0.2)'
                        : hasRoutineConflict
                          ? '1px solid hsl(var(--routine-conflict) / 0.5)'
                          : isOverdue
                            ? '1px solid hsl(var(--destructive) / 0.3)'
                            : showUnlinkedOutline
                              ? '1px dashed hsl(var(--border) / 0.6)'
                              : '1px solid hsl(var(--task-border))',
          // Z-hierarchy by priority: FLEX floats highest, LOCK sits flat.
          // Soft, diffuse drop shadows mimic the reference's elevated tile look.
          // Use a fixed black for drop shadows so they read on both light and
          // dark surfaces (foreground inverts to white in dark mode, which
          // would create an unwanted glow rather than a shadow).
          boxShadow: task.completed
            ? 'inset 0 1px 2px hsl(0 0% 0% / 0.14), inset 0 3px 8px hsl(0 0% 0% / 0.10)'
            : lockedVisuals
              ? '0 0 0 0 transparent' // LOCK — flat, sits on the surface
              : fixedVisuals
                ? '0 1px 2px hsl(0 0% 0% / 0.08), 0 1px 1px hsl(0 0% 0% / 0.05)'
                : semiVisuals
                  ? '0 3px 6px -2px hsl(0 0% 0% / 0.14), 0 2px 3px -2px hsl(0 0% 0% / 0.09), 0 1px 1px hsl(0 0% 0% / 0.06)'
                  : flexVisuals
                    ? '0 7px 14px -5px hsl(0 0% 0% / 0.21), 0 4px 8px -3px hsl(0 0% 0% / 0.14), 0 2px 2px hsl(0 0% 0% / 0.08)'
                    : '0 1px 2px 0 hsl(0 0% 0% / 0.08)',
        }}
      >
        {!isLocked && canShowResizeHandles && (
          <div
            data-touch-ignore
            onMouseDown={(e) => handleResizeStart(e, task, 'top')}
            onTouchStart={(e) => handleResizeStart(e, task, 'top')}
            className="absolute top-0 right-0 cursor-ns-resize z-20 opacity-0 group-hover:opacity-100 touch:opacity-100 flex items-start justify-end pr-1 pt-[2px]"
            style={{ width: 'var(--ui-resize-w)', height: 'var(--ui-resize-handle)', touchAction: 'none' }}
          >
            <svg width="8" height="8" viewBox="0 0 8 8" className="text-muted-foreground/30 group-hover:text-muted-foreground/60 transition-colors">
              <line x1="1" y1="7" x2="7" y2="1" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
              <line x1="4" y1="7" x2="7" y2="4" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
            </svg>
          </div>
        )}

        <div className={`h-full overflow-hidden ${isCompact ? 'flex items-center px-1' : 'flex flex-col justify-between py-1'}`} style={{ paddingLeft: isCompact ? undefined : 'var(--ui-space-md)', paddingRight: isCompact ? undefined : 'var(--ui-space-md)' }}>
          {isCompact ? (
            <div className="h-[2px] w-full rounded-full bg-foreground/20" title={task.title} />
          ) : (
            <>
              <div className="flex items-start justify-between">
                <div className="flex-1 min-w-0">
                  {canShowTitle && (
                      <div
                        className={`font-mono leading-tight truncate flex items-center gap-1.5 ${
                          task.completed
                            ? 'line-through text-muted-foreground/70'
                            : dotMode
                              ? (isOverdue ? 'text-destructive/70 font-medium' : 'text-foreground/80')
                              : lockedVisuals
                                ? 'font-medium'
                                : fixedVisuals
                                  ? 'font-medium'
                                  : isOverdue
                                    ? 'text-destructive/70 font-medium'
                                    : isActive
                                      ? 'text-foreground font-medium'
                                      : 'text-foreground/75'
                        }`}
                        style={{
                          fontSize: 'var(--ui-task-title)',
                          lineHeight: 'var(--ui-leading-tight)',
                          ...(!dotMode && lockedVisuals && !task.completed
                            ? { color: 'hsl(var(--locked-text))' }
                            : !dotMode && fixedVisuals && !task.completed
                              ? { color: 'hsl(var(--fixed-text))' }
                              : {}),
                        }}
                      >
                      {dotMode && (
                        <span
                          aria-hidden
                          className="shrink-0 rounded-full"
                          style={{
                            width: 8,
                            height: 8,
                            backgroundColor: `hsl(${dotColor})`,
                          }}
                          title={`Priority ${task.priority}`}
                        />
                      )}
                      <span className="truncate">{task.title}</span>
                    </div>
                  )}
                  {canShowActiveMeta && isActive && (
                    <div className="flex items-center gap-1.5 mt-0.5">
                      <span
                        className={`font-mono ${dotMode ? 'text-foreground/70' : 'text-white'}`}
                        style={{ fontSize: 'var(--ui-task-meta)' }}
                      >
                        {formatDuration(Math.max(0, taskMinutes + (task.duration || 30) - nowMinutes))} left
                      </span>
                    </div>
                  )}
                </div>
              </div>
              {canShowFooter && (
                <div className="flex items-center gap-1 mt-auto">
                  {hasRoutineConflict && (
                    <span className="font-mono tracking-wider uppercase text-[hsl(var(--routine-conflict-foreground))]" style={{ fontSize: 'var(--ui-task-badge)' }} title="Conflicts with routine">
                      ⚠ CONFLICT
                    </span>
                  )}
                </div>
              )}
            </>
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

        {!isLocked && canShowResizeHandles && (
          <div
            data-touch-ignore
            onMouseDown={(e) => handleResizeStart(e, task, 'bottom')}
            onTouchStart={(e) => handleResizeStart(e, task, 'bottom')}
            className="absolute bottom-0 right-0 cursor-ns-resize z-20 opacity-0 group-hover:opacity-100 touch:opacity-100 flex items-end justify-end pr-1 pb-[2px]"
            style={{ width: 'var(--ui-resize-w)', height: 'var(--ui-resize-handle)', touchAction: 'none' }}
          >
            <svg width="8" height="8" viewBox="0 0 8 8" className="text-muted-foreground/30 group-hover:text-muted-foreground/60 transition-colors">
              <line x1="1" y1="1" x2="7" y2="7" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
              <line x1="4" y1="1" x2="7" y2="4" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
            </svg>
          </div>
        )}
      </div>
      {showHoldRing && (
        <div className="absolute inset-0 flex items-center justify-center z-30 pointer-events-none">
          <div className="bg-background/70 backdrop-blur-sm rounded-[2px] absolute inset-0" />
          <div className="relative z-10">
            <HoldToConfirmRing progress={pickupProgress} size={32} strokeWidth={2.5} label="HOLD TO PICK UP" />
          </div>
        </div>
      )}
      <AnimatePresence>
        {completionFlash && (
          <motion.div
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 1.1 }}
            transition={{ duration: 0.35, ease: 'easeOut' }}
            className="absolute inset-0 flex items-center justify-center z-40 pointer-events-none rounded-[2px] bg-primary/10"
          >
            <motion.div
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              transition={{ type: 'spring', stiffness: 400, damping: 15 }}
            >
              <Check size={24} className="text-primary" strokeWidth={3} />
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
