import { useState, useRef, useCallback, useEffect } from 'react';
import { Clock, RotateCcw, Scan, Maximize } from 'lucide-react';
import { Popover, PopoverTrigger, PopoverContent } from '@/components/ui/popover';
import { Task } from '@/store/taskStore';
import { timeToMinutes } from '@/hooks/useCurrentTime';
import { START_HOUR, END_HOUR } from '@/components/TimelineColumn';
import { SCALE_MIN, SCALE_MAX } from '@/hooks/useTimeScale';

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
  // Find task that is currently active (now falls within its time range)
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

function animateZoom(
  el: HTMLElement,
  fromScale: number,
  toScale: number,
  fromScroll: number,
  toScroll: number,
  duration: number = 250,
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
    el.scrollTop = currentScroll;

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

  const fitToTasks = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;

    const bounds = getTaskBounds(tasks);
    if (!bounds) {
      // No tasks — center on current time
      const targetScroll = Math.max(0,
        ((nowMinutes - START_HOUR * 60) / 60) * hourHeight - el.clientHeight / 2
      );
      animateZoom(el, hourHeight, hourHeight, el.scrollTop, targetScroll, 250, () => {});
      return;
    }

    const { earliest, latest } = bounds;
    const spanMinutes = latest - earliest;
    const padding = 40;
    const viewportH = el.clientHeight - padding * 2;

    const spanHours = spanMinutes / 60;
    let targetScale = viewportH / spanHours;
    targetScale = Math.max(SCALE_MIN, Math.min(SCALE_MAX, targetScale));

    const midMin = (earliest + latest) / 2;
    const targetScroll = Math.max(0,
      ((midMin - START_HOUR * 60) / 60) * targetScale - el.clientHeight / 2
    );

    el.style.scrollBehavior = 'auto';
    animateZoom(el, hourHeight, targetScale, el.scrollTop, targetScroll, 250, (scale) => {
      setScale(scale);
    });
  }, [tasks, scrollRef, hourHeight, setScale, nowMinutes]);

  const focusCurrent = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;

    const centerMin = getActiveTaskCenter(tasks, nowMinutes);

    // Fixed 5-hour window
    const windowHours = 5;
    const targetScale = el.clientHeight / windowHours;
    const clampedScale = Math.max(SCALE_MIN, Math.min(SCALE_MAX, targetScale));

    const targetScroll = Math.max(0,
      ((centerMin - START_HOUR * 60) / 60) * clampedScale - el.clientHeight / 2
    );

    el.style.scrollBehavior = 'auto';
    animateZoom(el, hourHeight, clampedScale, el.scrollTop, targetScroll, 250, (scale) => {
      setScale(scale);
    });
    setMenuOpen(false);
  }, [scrollRef, hourHeight, nowMinutes, tasks, setScale]);

  const frameAll = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;

    // Zoom out to show full timeline
    const totalHours = END_HOUR - START_HOUR;
    let targetScale = el.clientHeight / totalHours;
    targetScale = Math.max(SCALE_MIN, Math.min(SCALE_MAX, targetScale));

    const midMin = ((START_HOUR + END_HOUR) / 2) * 60;
    const targetScroll = Math.max(0,
      ((midMin - START_HOUR * 60) / 60) * targetScale - el.clientHeight / 2
    );

    el.style.scrollBehavior = 'auto';
    animateZoom(el, hourHeight, targetScale, el.scrollTop, targetScroll, 250, (scale) => {
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

  return (
    <Popover open={menuOpen} onOpenChange={setMenuOpen}>
      <PopoverTrigger asChild>
        <button
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerCancel}
          onContextMenu={(e) => e.preventDefault()}
          className="p-1.5 rounded-sm text-muted-foreground/50 hover:text-foreground hover:bg-muted/50 transition-colors"
          title="Fit view to tasks (hold for options)"
        >
          <Scan size={16} strokeWidth={1.5} />
        </button>
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
            FIT ALL
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
  );
}
