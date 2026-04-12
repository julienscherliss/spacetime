import { useState, useRef, useCallback, useEffect } from 'react';
import { Clock, RotateCcw, Scan, Maximize } from 'lucide-react';
import { Popover, PopoverTrigger, PopoverContent } from '@/components/ui/popover';
import { Task } from '@/store/taskStore';
import { timeToMinutes } from '@/hooks/useCurrentTime';
import { START_HOUR, END_HOUR } from '@/components/TimelineColumn';
import { SCALE_MIN, SCALE_MAX, animatePinchZoom } from '@/hooks/useTimeScale';

/** Padding (px) above and below the framed area */
const FRAME_PADDING = 40;

function getStickyOffset(): number {
  return window.innerWidth < 640 ? 36 : 84;
}

function usableViewport(): number {
  const bottomNav = window.innerWidth < 640 ? 64 : 0;
  return window.innerHeight - getStickyOffset() - bottomNav;
}

interface FitViewButtonProps {
  tasks: Task[];
  scrollRef: React.RefObject<HTMLElement>;
  hourHeight: number;
  setScale: (v: number) => void;
  resetZoom: () => void;
  nowMinutes: number;
  hideButton?: boolean;
}

function getTaskBounds(tasks: Task[]): { earliest: number; latest: number } | null {
  const scheduled = tasks.filter(t => t.time && !t.completed);
  if (scheduled.length === 0) return null;

  let earliest = Infinity;
  let latest = -Infinity;

  for (const t of scheduled) {
    const start = timeToMinutes(t.time!);
    const end = start + (t.duration || 30);
    if (start < earliest) earliest = start;
    if (end > latest) latest = end;
  }

  return { earliest, latest };
}

function getActiveTaskCenter(tasks: Task[], nowMinutes: number): number {
  const active = tasks.find(t => {
    if (!t.time || t.completed) return false;
    const start = timeToMinutes(t.time);
    const end = start + (t.duration || 30);
    return nowMinutes >= start && nowMinutes < end;
  });

  if (active) {
    const start = timeToMinutes(active.time!);
    return start + (active.duration || 30) / 2;
  }

  return nowMinutes;
}

function getTimelineDocTop(scrollRef: React.RefObject<HTMLElement>): number {
  if (!scrollRef.current) return 0;
  const rect = scrollRef.current.getBoundingClientRect();
  return rect.top + window.scrollY;
}

export function FitViewButton({ tasks, scrollRef, hourHeight, setScale, resetZoom, nowMinutes, hideButton }: FitViewButtonProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const didLongPress = useRef(false);
  const pointerMoved = useRef(false);
  const startPos = useRef<{ x: number; y: number } | null>(null);
  const lastTapTime = useRef(0);
  const zoomCancelRef = useRef<(() => void) | null>(null);

  const fitToTasks = useCallback(() => {
    zoomCancelRef.current?.();
    const bounds = getTaskBounds(tasks);
    const viewH = usableViewport();
    const stickyOffset = getStickyOffset();
    const timelineTop = getTimelineDocTop(scrollRef);

    if (!bounds) {
      // No tasks — animate to center on current time
      zoomCancelRef.current = animatePinchZoom({
        fromScale: hourHeight,
        toScale: hourHeight,
        focalMin: nowMinutes,
        focalViewportY: stickyOffset + viewH / 2,
        timelineDocTop: timelineTop,
        duration: 250,
        setScale,
        onComplete: () => { zoomCancelRef.current = null; },
      });
      return;
    }

    const { earliest, latest } = bounds;
    const spanHours = (latest - earliest) / 60;
    let targetScale = (viewH - FRAME_PADDING * 2) / spanHours;
    targetScale = Math.max(SCALE_MIN, Math.min(SCALE_MAX, targetScale));

    const midMin = (earliest + latest) / 2;

    zoomCancelRef.current = animatePinchZoom({
      fromScale: hourHeight,
      toScale: targetScale,
      focalMin: midMin,
      focalViewportY: stickyOffset + viewH / 2,
      timelineDocTop: timelineTop,
      duration: 250,
      setScale,
      onComplete: () => { zoomCancelRef.current = null; },
    });
  }, [tasks, scrollRef, hourHeight, setScale, nowMinutes]);

  const focusCurrent = useCallback(() => {
    zoomCancelRef.current?.();
    const viewH = usableViewport();
    const stickyOffset = getStickyOffset();
    const timelineTop = getTimelineDocTop(scrollRef);
    const centerMin = getActiveTaskCenter(tasks, nowMinutes);

    const windowHours = 5;
    let targetScale = viewH / windowHours;
    targetScale = Math.max(SCALE_MIN, Math.min(SCALE_MAX, targetScale));

    zoomCancelRef.current = animatePinchZoom({
      fromScale: hourHeight,
      toScale: targetScale,
      focalMin: centerMin,
      focalViewportY: stickyOffset + viewH / 2,
      timelineDocTop: timelineTop,
      duration: 250,
      setScale,
      onComplete: () => { zoomCancelRef.current = null; },
    });
    setMenuOpen(false);
  }, [scrollRef, hourHeight, nowMinutes, tasks, setScale]);

  const frameAll = useCallback(() => {
    zoomCancelRef.current?.();
    const viewH = usableViewport();
    const stickyOffset = getStickyOffset();
    const timelineTop = getTimelineDocTop(scrollRef);

    const totalHours = END_HOUR - START_HOUR;
    let targetScale = (viewH - FRAME_PADDING) / totalHours;
    targetScale = Math.max(SCALE_MIN, Math.min(SCALE_MAX, targetScale));

    const midMin = ((START_HOUR + END_HOUR) / 2) * 60;

    zoomCancelRef.current = animatePinchZoom({
      fromScale: hourHeight,
      toScale: targetScale,
      focalMin: midMin,
      focalViewportY: stickyOffset + viewH / 2,
      timelineDocTop: timelineTop,
      duration: 250,
      setScale,
      onComplete: () => { zoomCancelRef.current = null; },
    });
    setMenuOpen(false);
  }, [scrollRef, hourHeight, setScale]);

  const handlePointerDown = useCallback((e: React.PointerEvent) => {
    didLongPress.current = false;
    pointerMoved.current = false;
    startPos.current = { x: e.clientX, y: e.clientY };

    longPressTimer.current = setTimeout(() => {
      didLongPress.current = true;
      setMenuOpen(true);
    }, 400);
  }, []);

  const handlePointerMove = useCallback((e: React.PointerEvent) => {
    if (!startPos.current) return;
    const dx = Math.abs(e.clientX - startPos.current.x);
    const dy = Math.abs(e.clientY - startPos.current.y);
    if (dx > 5 || dy > 5) {
      pointerMoved.current = true;
      if (longPressTimer.current) {
        clearTimeout(longPressTimer.current);
        longPressTimer.current = null;
      }
    }
  }, []);

  const handlePointerUp = useCallback(() => {
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
    if (!didLongPress.current && !pointerMoved.current) {
      const now = Date.now();
      if (now - lastTapTime.current < 350) {
        focusCurrent();
        lastTapTime.current = 0;
      } else {
        lastTapTime.current = now;
        fitToTasks();
      }
    }
    startPos.current = null;
  }, [fitToTasks, focusCurrent]);

  const handlePointerCancel = useCallback(() => {
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
    startPos.current = null;
  }, []);

  useEffect(() => {
    return () => {
      if (longPressTimer.current) clearTimeout(longPressTimer.current);
      zoomCancelRef.current?.();
    };
  }, []);

  // Listen for external events (from mobile bottom nav)
  useEffect(() => {
    const handleFit = () => fitToTasks();
    const handleFocus = () => focusCurrent();
    const handleFrame = () => frameAll();
    window.addEventListener('fit-to-tasks', handleFit);
    window.addEventListener('focus-current', handleFocus);
    window.addEventListener('frame-all', handleFrame);
    return () => {
      window.removeEventListener('fit-to-tasks', handleFit);
      window.removeEventListener('focus-current', handleFocus);
      window.removeEventListener('frame-all', handleFrame);
    };
  }, [fitToTasks, focusCurrent, frameAll]);

  if (hideButton) return null;

  return (
    <div className="flex items-center gap-0.5">
      {/* Fit Tasks button — Scan icon with "T" */}
      <button
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerCancel}
        onClick={(e) => e.preventDefault()}
        onContextMenu={(e) => e.preventDefault()}
        className="relative p-1.5 rounded-sm text-muted-foreground/50 hover:text-foreground hover:bg-muted/50 transition-colors touch-none select-none"
        title="Fit tasks (double-tap to focus)"
      >
        <Scan size={16} strokeWidth={1.5} />
        <span className="absolute inset-0 flex items-center justify-center text-[7px] font-mono font-bold leading-none pointer-events-none" style={{ marginTop: '0.5px' }}>
          T
        </span>
      </button>

      {/* Frame All button — Scan icon with "A" */}
      <button
        onClick={frameAll}
        onContextMenu={(e) => e.preventDefault()}
        className="relative p-1.5 rounded-sm text-muted-foreground/50 hover:text-foreground hover:bg-muted/50 transition-colors touch-none select-none"
        title="Frame all hours"
      >
        <Scan size={16} strokeWidth={1.5} />
        <span className="absolute inset-0 flex items-center justify-center text-[7px] font-mono font-bold leading-none pointer-events-none" style={{ marginTop: '0.5px' }}>
          A
        </span>
      </button>

      {/* Long-press popover (still available from fit-tasks button) */}
      <Popover open={menuOpen} onOpenChange={setMenuOpen}>
        <PopoverTrigger asChild>
          <span className="absolute inset-0 pointer-events-none" />
        </PopoverTrigger>
        <PopoverContent
          className="w-36 p-1.5"
          align="end"
          sideOffset={6}
        >
          <div className="flex flex-col gap-0.5">
            <button
              onClick={() => { fitToTasks(); setMenuOpen(false); }}
              className="flex items-center gap-2 px-2 py-1.5 rounded-sm text-[10px] font-mono tracking-wider text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors w-full text-left"
            >
              <Scan size={11} strokeWidth={1.5} />
              FIT TASKS
            </button>
            <button
              onClick={focusCurrent}
              className="flex items-center gap-2 px-2 py-1.5 rounded-sm text-[10px] font-mono tracking-wider text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors w-full text-left"
            >
              <Clock size={11} strokeWidth={1.5} />
              FOCUS
            </button>
            <button
              onClick={frameAll}
              className="flex items-center gap-2 px-2 py-1.5 rounded-sm text-[10px] font-mono tracking-wider text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors w-full text-left"
            >
              <Maximize size={11} strokeWidth={1.5} />
              FRAME ALL
            </button>
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
}
