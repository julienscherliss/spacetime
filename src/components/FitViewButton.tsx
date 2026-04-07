import { useState, useRef, useCallback, useEffect } from 'react';
import { Maximize2, Clock, RotateCcw, Scan } from 'lucide-react';
import { Popover, PopoverTrigger, PopoverContent } from '@/components/ui/popover';
import { Task } from '@/store/taskStore';
import { timeToMinutes } from '@/hooks/useCurrentTime';
import { START_HOUR, END_HOUR } from '@/components/TimelineColumn';
import { SCALE_MIN, SCALE_MAX, SCALE_DEFAULT } from '@/hooks/useTimeScale';

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
  const [longPressOpen, setLongPressOpen] = useState(false);
  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const didLongPress = useRef(false);

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
    const padding = 40; // px padding top + bottom
    const viewportH = el.clientHeight - padding * 2;

    // Calculate scale to fit
    const spanHours = spanMinutes / 60;
    let targetScale = viewportH / spanHours;
    targetScale = Math.max(SCALE_MIN, Math.min(SCALE_MAX, targetScale));

    // Calculate target scroll to center the tasks
    const midMin = (earliest + latest) / 2;
    const targetScroll = Math.max(0,
      ((midMin - START_HOUR * 60) / 60) * targetScale - el.clientHeight / 2
    );

    const fromScale = hourHeight;
    const fromScroll = el.scrollTop;

    el.style.scrollBehavior = 'auto';
    animateZoom(el, fromScale, targetScale, fromScroll, targetScroll, 250, (scale) => {
      setScale(scale);
    });
  }, [tasks, scrollRef, hourHeight, setScale, nowMinutes]);

  const focusCurrentTime = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    const targetScroll = Math.max(0,
      ((nowMinutes - START_HOUR * 60) / 60) * hourHeight - el.clientHeight / 2
    );
    el.style.scrollBehavior = 'auto';
    animateZoom(el, hourHeight, hourHeight, el.scrollTop, targetScroll, 250, () => {});
    setLongPressOpen(false);
  }, [scrollRef, hourHeight, nowMinutes]);

  const handleReset = useCallback(() => {
    resetZoom();
    setLongPressOpen(false);
  }, [resetZoom]);

  const handlePointerDown = useCallback(() => {
    didLongPress.current = false;
    longPressTimer.current = setTimeout(() => {
      didLongPress.current = true;
      setLongPressOpen(true);
    }, 500);
  }, []);

  const handlePointerUp = useCallback(() => {
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
    if (!didLongPress.current) {
      fitToTasks();
    }
  }, [fitToTasks]);

  const handlePointerCancel = useCallback(() => {
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
  }, []);

  useEffect(() => {
    return () => {
      if (longPressTimer.current) clearTimeout(longPressTimer.current);
    };
  }, []);

  return (
    <Popover open={longPressOpen} onOpenChange={setLongPressOpen}>
      <PopoverTrigger asChild>
        <button
          onPointerDown={handlePointerDown}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerCancel}
          onContextMenu={(e) => e.preventDefault()}
          className="p-1.5 rounded-sm text-muted-foreground/50 hover:text-foreground hover:bg-muted/50 transition-colors"
          title="Fit view to tasks"
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
            onClick={() => { fitToTasks(); setLongPressOpen(false); }}
            className="flex items-center gap-2 px-2 py-1.5 rounded-sm text-[10px] font-mono tracking-wider text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors w-full text-left"
          >
            <Scan size={11} strokeWidth={1.5} />
            FIT TASKS
          </button>
          <button
            onClick={focusCurrentTime}
            className="flex items-center gap-2 px-2 py-1.5 rounded-sm text-[10px] font-mono tracking-wider text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors w-full text-left"
          >
            <Clock size={11} strokeWidth={1.5} />
            FOCUS NOW
          </button>
          <button
            onClick={handleReset}
            className="flex items-center gap-2 px-2 py-1.5 rounded-sm text-[10px] font-mono tracking-wider text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors w-full text-left"
          >
            <RotateCcw size={11} strokeWidth={1.5} />
            RESET ZOOM
          </button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
