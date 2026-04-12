import { useState, useRef, useCallback, useEffect } from 'react';
import { Clock, RotateCcw, Scan, Maximize } from 'lucide-react';
import { Popover, PopoverTrigger, PopoverContent } from '@/components/ui/popover';
import { Task } from '@/store/taskStore';
import { timeToMinutes } from '@/hooks/useCurrentTime';
import { START_HOUR, END_HOUR } from '@/components/TimelineColumn';
import { SCALE_MIN, SCALE_MAX } from '@/hooks/useTimeScale';

/** Padding (px) above and below the framed area */
const FRAME_PADDING = 40;

/** Height of sticky elements above the timeline content.
 *  Mobile: sticky controls sit at top-0 (~36px), bottom nav is 64px.
 *  Desktop: top nav (48px) + sticky controls (~36px) = 84px.
 */
function getStickyOffset(): number {
  return window.innerWidth < 640 ? 36 : 84;
}

/** Usable viewport height below sticky elements (and above bottom nav on mobile) */
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

/**
 * Returns the document-level top offset of the timeline content area.
 * This is where minute 0 of START_HOUR lives in document coordinates.
 */
function getTimelineDocTop(scrollRef: React.RefObject<HTMLElement>): number {
  if (!scrollRef.current) return 0;
  const rect = scrollRef.current.getBoundingClientRect();
  return rect.top + window.scrollY;
}

/** Convert a minute value to a document Y position given hourHeight and timeline origin */
function minToDocY(min: number, hourHeight: number, timelineTop: number): number {
  return timelineTop + ((min - START_HOUR * 60) / 60) * hourHeight;
}


function animateZoom(
  fromScale: number,
  toScale: number,
  fromScroll: number,
  toScroll: number,
  duration: number,
  onFrame: (scale: number) => void,
) {
  const startTime = performance.now();

  function easeInOut(t: number) {
    return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
  }

  function tick(now: number) {
    const elapsed = now - startTime;
    const progress = Math.min(1, elapsed / duration);
    const eased = easeInOut(progress);

    const currentScale = fromScale + (toScale - fromScale) * eased;
    const currentScroll = fromScroll + (toScroll - fromScroll) * eased;

    onFrame(currentScale);
    window.scrollTo({ top: currentScroll, behavior: 'auto' });

    if (progress < 1) {
      requestAnimationFrame(tick);
    }
  }

  requestAnimationFrame(tick);
}

export function FitViewButton({ tasks, scrollRef, hourHeight, setScale, resetZoom, nowMinutes }: FitViewButtonProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const didLongPress = useRef(false);
  const pointerMoved = useRef(false);
  const startPos = useRef<{ x: number; y: number } | null>(null);
  const lastTapTime = useRef(0);

  const fitToTasks = useCallback(() => {
    const bounds = getTaskBounds(tasks);
    const viewH = usableViewport();
    const timelineTop = getTimelineDocTop(scrollRef);

    if (!bounds) {
      // No tasks — center on current time
      const nowDocY = minToDocY(nowMinutes, hourHeight, timelineTop);
      const targetScroll = Math.max(0, nowDocY - getStickyOffset() - viewH / 2);
      animateZoom(hourHeight, hourHeight, window.scrollY, targetScroll, 250, () => {});
      return;
    }

    const { earliest, latest } = bounds;
    const spanMinutes = latest - earliest;
    const spanHours = spanMinutes / 60;

    // Calculate scale to fit the task span within usable viewport with padding
    let targetScale = (viewH - FRAME_PADDING * 2) / spanHours;
    targetScale = Math.max(SCALE_MIN, Math.min(SCALE_MAX, targetScale));

    // No artificial cap — zoom as much as needed to fit tasks in view

    // Recalculate positions with new scale — timeline top stays the same
    const midMin = (earliest + latest) / 2;
    const midDocY = timelineTop + ((midMin - START_HOUR * 60) / 60) * targetScale;
    const targetScroll = Math.max(0, midDocY - getStickyOffset() - viewH / 2);

    animateZoom(hourHeight, targetScale, window.scrollY, targetScroll, 250, (scale) => {
      setScale(scale);
    });
  }, [tasks, scrollRef, hourHeight, setScale, nowMinutes]);

  const focusCurrent = useCallback(() => {
    const viewH = usableViewport();
    const timelineTop = getTimelineDocTop(scrollRef);
    const centerMin = getActiveTaskCenter(tasks, nowMinutes);

    // Fixed 5-hour window
    const windowHours = 5;
    let targetScale = viewH / windowHours;
    targetScale = Math.max(SCALE_MIN, Math.min(SCALE_MAX, targetScale));

    const centerDocY = timelineTop + ((centerMin - START_HOUR * 60) / 60) * targetScale;
    const targetScroll = Math.max(0, centerDocY - getStickyOffset() - viewH / 2);

    animateZoom(hourHeight, targetScale, window.scrollY, targetScroll, 250, (scale) => {
      setScale(scale);
    });
    setMenuOpen(false);
  }, [scrollRef, hourHeight, nowMinutes, tasks, setScale]);

  const frameAll = useCallback(() => {
    const viewH = usableViewport();
    const timelineTop = getTimelineDocTop(scrollRef);

    // Show full timeline
    const totalHours = END_HOUR - START_HOUR;
    let targetScale = (viewH - FRAME_PADDING) / totalHours;
    targetScale = Math.max(SCALE_MIN, Math.min(SCALE_MAX, targetScale));

    const midMin = ((START_HOUR + END_HOUR) / 2) * 60;
    const midDocY = timelineTop + ((midMin - START_HOUR * 60) / 60) * targetScale;
    const targetScroll = Math.max(0, midDocY - getStickyOffset() - viewH / 2);

    animateZoom(hourHeight, targetScale, window.scrollY, targetScroll, 250, (scale) => {
      setScale(scale);
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
      fitToTasks();
    }
    startPos.current = null;
  }, [fitToTasks]);

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

  return (
    <div className="relative">
      <button
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerCancel}
        onClick={(e) => e.preventDefault()}
        onContextMenu={(e) => e.preventDefault()}
        className="p-1.5 rounded-sm text-muted-foreground/50 hover:text-foreground hover:bg-muted/50 transition-colors touch-none select-none"
        title="Fit tasks (hold for options)"
      >
        <Scan size={16} strokeWidth={1.5} />
      </button>
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
