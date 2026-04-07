import { useState, useEffect, useRef, useCallback } from 'react';
import { motion } from 'framer-motion';
import { useTaskStore } from '@/store/taskStore';
import { useCalendarStore } from '@/store/calendarStore';
import { useTouchDragStore } from '@/store/touchDragStore';
import { useScheduledDragStore } from '@/store/scheduledDragStore';
import { useCarryStore } from '@/store/carryStore';
import { useCurrentTime, formatTime12h } from '@/hooks/useCurrentTime';
import { TimelineColumn, START_HOUR } from '@/components/TimelineColumn';
import { BlockedModal } from '@/components/BlockedModal';
import { ZoomControl } from '@/components/ZoomControl';
import { useTimeScale, SCALE_MIN, SCALE_MAX } from '@/hooks/useTimeScale';
import { ChevronLeft, ChevronRight, X } from 'lucide-react';
import { TaskCluster } from '@/utils/taskClustering';

function addDaysToDate(dateStr: string, days: number): string {
  const d = new Date(dateStr + 'T12:00:00');
  d.setDate(d.getDate() + days);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function DayView() {
  const { tasks, routinesEnabled, generateRecurringInstances, navigateToDate, setNavigateToDate } = useTaskStore();
  const { minutes: nowMinutes, dateStr: today } = useCurrentTime(15000);
  const [selectedDate, setSelectedDate] = useState(navigateToDate || today);

  // Handle navigation from calendar view
  useEffect(() => {
    if (navigateToDate) {
      setSelectedDate(navigateToDate);
      setNavigateToDate(null);
    }
  }, [navigateToDate, setNavigateToDate]);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Swipe state
  const touchStartRef = useRef<{ x: number; y: number; time: number } | null>(null);
  const [swipeOffset, setSwipeOffset] = useState(0);
  const [swiping, setSwiping] = useState(false);

  const {
    hourHeight, zoomIn, zoomOut, resetZoom, setScale,
    bindScrollZoom, bindPinchZoom,
    zoomPercent, isMin, isMax, isDefault,
  } = useTimeScale('day');

  // Cluster zoom state
  const [clusterZoomed, setClusterZoomed] = useState(false);
  const preClusterScaleRef = useRef<number | null>(null);
  const preClusterScrollRef = useRef<number | null>(null);

  // Animated zoom state
  const [isZoomAnimating, setIsZoomAnimating] = useState(false);

  const handleZoomToCluster = useCallback((cluster: TaskCluster, targetHourHeight: number, scrollToMin: number) => {
    if (!scrollRef.current) return;
    const el = scrollRef.current;

    // Save pre-zoom state for exit
    preClusterScaleRef.current = hourHeight;
    preClusterScrollRef.current = el.scrollTop;

    const clamped = Math.min(SCALE_MAX, Math.max(SCALE_MIN, targetHourHeight));
    const viewportH = el.clientHeight;

    // Pre-compute the exact scroll position at the NEW scale
    const clusterCenterMin = (cluster.startMin + cluster.endMin) / 2;
    const targetScrollTop = Math.max(0,
      ((clusterCenterMin - START_HOUR * 60) / 60) * clamped - viewportH / 2
    );

    // Start animated zoom transition
    setIsZoomAnimating(true);
    el.style.scrollBehavior = 'auto';

    // Apply zoom + scroll synchronously
    setScale(clamped);
    setClusterZoomed(true);

    queueMicrotask(() => {
      el.scrollTop = targetScrollTop;
      requestAnimationFrame(() => {
        el.style.scrollBehavior = '';
        // End animation after CSS transition completes
        setTimeout(() => setIsZoomAnimating(false), 350);
      });
    });
  }, [hourHeight, setScale]);

  const handleExitClusterZoom = useCallback(() => {
    if (!scrollRef.current || preClusterScaleRef.current === null) {
      setClusterZoomed(false);
      return;
    }
    const el = scrollRef.current;
    const restoreScale = preClusterScaleRef.current;
    const restoreScroll = preClusterScrollRef.current ?? 0;

    setIsZoomAnimating(true);
    el.style.scrollBehavior = 'auto';
    setScale(restoreScale);

    queueMicrotask(() => {
      el.scrollTop = restoreScroll;
      requestAnimationFrame(() => {
        el.style.scrollBehavior = '';
        setTimeout(() => setIsZoomAnimating(false), 350);
      });
    });

    setClusterZoomed(false);
    preClusterScaleRef.current = null;
    preClusterScrollRef.current = null;
  }, [setScale]);

  useEffect(() => {
    generateRecurringInstances(selectedDate, selectedDate);
  }, [selectedDate, generateRecurringInstances]);

  const { connected, fetchEvents } = useCalendarStore();
  useEffect(() => {
    if (connected) fetchEvents(selectedDate, selectedDate);
  }, [selectedDate, connected]);

  // Lock scroll during active touch drag
  const isDragging = useTouchDragStore((s) => !!s.dragging);
  const isScheduledDragging = useScheduledDragStore((s) => s.active);
  const anyDragging = isDragging || isScheduledDragging;

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const cleanScroll = bindScrollZoom(el);
    const cleanPinch = bindPinchZoom(el);
    return () => { cleanScroll?.(); cleanPinch?.(); };
  }, [bindScrollZoom, bindPinchZoom]);

  // Prevent scroll container from scrolling while dragging a task
  useEffect(() => {
    const el = scrollRef.current;
    if (!el || !anyDragging) return;
    const prevent = (e: TouchEvent) => { e.preventDefault(); };
    el.addEventListener('touchmove', prevent, { passive: false });
    return () => el.removeEventListener('touchmove', prevent);
  }, [anyDragging]);

  // Track scroll end for carry mode cooldown
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    let scrollTimer: ReturnType<typeof setTimeout> | null = null;
    const onScroll = () => {
      if (scrollTimer) clearTimeout(scrollTimer);
      scrollTimer = setTimeout(() => {
        useCarryStore.getState().markScrollEnd();
      }, 50);
    };
    el.addEventListener('scroll', onScroll, { passive: true });
    return () => el.removeEventListener('scroll', onScroll);
  }, []);

  // Swipe gesture handlers
  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    if (e.touches.length !== 1) return;
    touchStartRef.current = {
      x: e.touches[0].clientX,
      y: e.touches[0].clientY,
      time: Date.now(),
    };
  }, []);

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    if (!touchStartRef.current || e.touches.length !== 1) return;
    const dx = e.touches[0].clientX - touchStartRef.current.x;
    const dy = e.touches[0].clientY - touchStartRef.current.y;
    // Only swipe if horizontal movement dominates
    if (Math.abs(dx) > Math.abs(dy) && Math.abs(dx) > 10) {
      setSwiping(true);
      setSwipeOffset(dx);
    }
  }, []);

  const handleTouchEnd = useCallback(() => {
    if (!touchStartRef.current) return;
    const threshold = 60;
    if (Math.abs(swipeOffset) > threshold) {
      if (swipeOffset > 0) {
        setSelectedDate(d => addDaysToDate(d, -1));
      } else {
        setSelectedDate(d => addDaysToDate(d, 1));
      }
    }
    setSwipeOffset(0);
    setSwiping(false);
    touchStartRef.current = null;
  }, [swipeOffset]);

  const goToToday = () => setSelectedDate(today);

  const dayTasks = tasks.filter((t) => t.date === selectedDate && !t.inWaitingRoom && !t.archivedAt &&
    !(!routinesEnabled && t.isRoutine !== false && t.type === 'recurring'));
  const completedCount = dayTasks.filter((t) => t.completed).length;
  const isToday = selectedDate === today;

  return (
    <div className="max-w-3xl mx-auto px-3 sm:px-4 py-4">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h2 className="text-base sm:text-lg font-display font-bold text-foreground tracking-tight">
            {new Date(selectedDate + 'T12:00:00').toLocaleDateString('en-US', {
              weekday: 'long',
              month: 'long',
              day: 'numeric',
            })}
          </h2>
          <p className="text-[10px] font-mono text-muted-foreground/50 mt-0.5 tracking-widest">
            {completedCount}/{dayTasks.length} COMPLETED
          </p>
        </div>

        {/* Day navigation */}
        <div className="flex items-center gap-0.5">
          <button
            onClick={() => setSelectedDate(d => addDaysToDate(d, -1))}
            className="p-1.5 rounded-sm text-muted-foreground/50 hover:text-foreground hover:bg-muted/50 transition-colors"
          >
            <ChevronLeft size={16} strokeWidth={1.5} />
          </button>
          <button
            onClick={goToToday}
            className={`px-2.5 py-1 rounded-sm text-[10px] font-mono tracking-widest transition-colors ${
              isToday
                ? 'text-primary bg-primary/5'
                : 'text-muted-foreground/50 hover:text-foreground hover:bg-muted/50'
            }`}
          >
            TODAY
          </button>
          <button
            onClick={() => setSelectedDate(d => addDaysToDate(d, 1))}
            className="p-1.5 rounded-sm text-muted-foreground/50 hover:text-foreground hover:bg-muted/50 transition-colors"
          >
            <ChevronRight size={16} strokeWidth={1.5} />
          </button>
        </div>
      </div>

      {/* Progress */}
      <div className="h-px bg-border/40 mb-4 overflow-hidden">
        <motion.div
          className="h-full bg-primary/50"
          initial={{ width: 0 }}
          animate={{ width: dayTasks.length > 0 ? `${(completedCount / dayTasks.length) * 100}%` : '0%' }}
          transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
        />
      </div>

      {/* Cluster zoom exit */}
      {clusterZoomed && (
        <motion.div
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-3 flex items-center justify-center"
        >
          <button
            onClick={handleExitClusterZoom}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-muted/60 border border-border/40 text-[10px] font-mono text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
          >
            <X size={12} />
            <span className="tracking-wider">EXIT ZOOM</span>
          </button>
        </motion.div>
      )}

      {/* Timeline + Zoom control */}
      <div className="flex gap-2 sm:gap-3">
        <div
          ref={scrollRef}
          className="flex-1 overflow-y-auto overflow-x-hidden"
          style={{ maxHeight: 'calc(100vh - 180px)', WebkitOverflowScrolling: 'touch' }}
          onTouchStart={handleTouchStart}
          onTouchMove={handleTouchMove}
          onTouchEnd={handleTouchEnd}
        >
          <div
            style={{
              transform: swiping ? `translateX(${swipeOffset * 0.3}px)` : 'none',
              transition: swiping ? 'none' : isZoomAnimating
                ? 'transform 0.2s ease-out'
                : 'transform 0.2s ease-out',
            }}
          >
            <TimelineColumn
              date={selectedDate}
              tasks={dayTasks}
              nowMinutes={nowMinutes}
              isToday={isToday}
              showTimeLabels
              hourHeight={hourHeight}
              onZoomToCluster={handleZoomToCluster}
            />
          </div>
        </div>

        <div className="shrink-0 pt-2 hidden sm:block">
          <ZoomControl
            onZoomIn={zoomIn}
            onZoomOut={zoomOut}
            onReset={resetZoom}
            onSetScale={setScale}
            zoomPercent={zoomPercent}
            isMin={isMin}
            isMax={isMax}
            isDefault={isDefault}
          />
        </div>
      </div>

      {/* Completed */}
      {dayTasks.filter((t) => t.completed).length > 0 && (
        <div className="mt-4 pt-3 border-t border-border/30">
          <div className="text-[10px] font-mono text-muted-foreground/30 tracking-widest mb-1">COMPLETED</div>
          {dayTasks.filter((t) => t.completed).map((task) => (
            <div key={task.id} className="flex items-center gap-3 py-0.5 opacity-30">
              <span className="text-[10px] font-mono text-muted-foreground w-16">{task.time ? formatTime12h(task.time) : ''}</span>
              <span className="text-[11px] font-mono line-through text-muted-foreground">{task.title}</span>
            </div>
          ))}
        </div>
      )}

      {dayTasks.length === 0 && (
        <div className="text-center py-20">
          <p className="text-muted-foreground/30 font-mono text-sm tracking-wider">NO TASKS</p>
        </div>
      )}

      <BlockedModal taskId="" open={false} onClose={() => {}} />
    </div>
  );
}
