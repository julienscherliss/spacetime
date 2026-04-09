import { useState, useEffect, useRef, useCallback } from 'react';
import { motion } from 'framer-motion';
import { useTaskStore } from '@/store/taskStore';
import { useCalendarStore } from '@/store/calendarStore';
import { useTouchDragStore } from '@/store/touchDragStore';
import { useScheduledDragStore } from '@/store/scheduledDragStore';
import { useCarryStore } from '@/store/carryStore';
import { useCurrentTime } from '@/hooks/useCurrentTime';
import { TimelineColumn, START_HOUR } from '@/components/TimelineColumn';
import { BlockedModal } from '@/components/BlockedModal';
import { useTimeScale, SCALE_MIN, SCALE_MAX } from '@/hooks/useTimeScale';
import { ChevronLeft, ChevronRight, X, CornerUpLeft } from 'lucide-react';
import { FitViewButton } from '@/components/FitViewButton';
import { TaskCluster } from '@/utils/taskClustering';

function addDaysToDate(dateStr: string, days: number): string {
  const d = new Date(dateStr + 'T12:00:00');
  d.setDate(d.getDate() + days);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function DayView() {
  const { tasks, routinesEnabled, generateRecurringInstances, navigateToDate, setNavigateToDate,
    listReturnZoom, setListReturnZoom, showListReturn, setShowListReturn, setDaySubMode } = useTaskStore();
  const { minutes: nowMinutes, dateStr: today } = useCurrentTime(15000);
  const [selectedDate, setSelectedDate] = useState(navigateToDate || today);

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
    hourHeight, resetZoom, setScale,
    bindScrollZoom, bindPinchZoom,
  } = useTimeScale('day');

  // Cluster zoom state
  const [clusterZoomed, setClusterZoomed] = useState(false);
  const preClusterScaleRef = useRef<number | null>(null);
  const preClusterScrollRef = useRef<number | null>(null);

  const handleZoomToCluster = useCallback((cluster: TaskCluster, targetHourHeight: number, scrollToMin: number) => {
    preClusterScaleRef.current = hourHeight;
    preClusterScrollRef.current = window.scrollY;

    const clamped = Math.min(SCALE_MAX, Math.max(SCALE_MIN, targetHourHeight));
    const stickyOffset = 96;
    const viewportH = window.innerHeight - stickyOffset;
    const clusterCenterMin = (cluster.startMin + cluster.endMin) / 2;
    const timelineTop = scrollRef.current
      ? scrollRef.current.getBoundingClientRect().top + window.scrollY
      : 0;

    setScale(clamped);
    setClusterZoomed(true);

    const centerDocY = timelineTop + ((clusterCenterMin - START_HOUR * 60) / 60) * clamped;
    const targetScrollTop = Math.max(0, centerDocY - stickyOffset - viewportH / 2);

    queueMicrotask(() => {
      window.scrollTo({ top: targetScrollTop, behavior: 'auto' });
    });
  }, [hourHeight, setScale]);

  const handleExitClusterZoom = useCallback(() => {
    if (preClusterScaleRef.current === null) {
      setClusterZoomed(false);
      return;
    }
    const restoreScale = preClusterScaleRef.current;
    const restoreScroll = preClusterScrollRef.current ?? 0;

    setScale(restoreScale);

    queueMicrotask(() => {
      window.scrollTo({ top: restoreScroll, behavior: 'auto' });
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
  // Zoom to task time when coming from list view
  useEffect(() => {
    if (!listReturnZoom) return;
    const { taskTime, taskDuration } = listReturnZoom;
    const [h, m] = taskTime.split(':').map(Number);
    const taskStartMin = h * 60 + m;
    const taskEndMin = taskStartMin + taskDuration;
    const windowStartMin = Math.max(0, taskStartMin - 120);
    const windowEndMin = Math.min(24 * 60, taskEndMin + 120);
    const windowHours = (windowEndMin - windowStartMin) / 60;
    const stickyOffset = 96;
    const viewportH = window.innerHeight - stickyOffset;
    const targetHourHeight = Math.min(SCALE_MAX, Math.max(SCALE_MIN, viewportH / windowHours));

    setScale(targetHourHeight);
    setListReturnZoom(null);

    // Wait for layout with new scale, then scroll
    requestAnimationFrame(() => {
      const timelineTop = scrollRef.current
        ? scrollRef.current.getBoundingClientRect().top + window.scrollY
        : 0;
      const windowCenterMin = (windowStartMin + windowEndMin) / 2;
      const centerDocY = timelineTop + ((windowCenterMin - START_HOUR * 60) / 60) * targetHourHeight;
      const scrollTarget = Math.max(0, centerDocY - stickyOffset - viewportH / 2);
      window.scrollTo({ top: scrollTarget, behavior: 'auto' });
    });
  }, [listReturnZoom, setListReturnZoom, setScale]);

  
  // Bind zoom gestures to the page-level scroll container
  useEffect(() => {
    const el = document.documentElement;
    const cleanScroll = bindScrollZoom(el);
    const cleanPinch = bindPinchZoom(el);
    return () => { cleanScroll?.(); cleanPinch?.(); };
  }, [bindScrollZoom, bindPinchZoom]);

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
    <div
      className="max-w-3xl mx-auto px-3 sm:px-4"
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
    >
      {/* Bold title row — scrolls away naturally */}
      <div className="pt-3 pb-2">
        <h2 className="text-lg sm:text-xl font-display font-bold text-foreground tracking-tight">
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

      {/* Sticky compact control row */}
      <div className="sticky top-10 sm:top-12 z-30 bg-background py-2.5 flex items-center justify-between border-b border-border/30">
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

        <div className="flex items-center gap-1">
          {showListReturn && (
            <button
              onClick={() => {
                setShowListReturn(false);
                setDaySubMode('list');
              }}
              className="flex items-center gap-1 px-2 py-1 rounded-md bg-muted/60 border border-border/40 text-[10px] font-mono text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
            >
              <CornerUpLeft size={10} />
              <span className="tracking-wider">LIST</span>
            </button>
          )}
          {clusterZoomed && (
            <button
              onClick={handleExitClusterZoom}
              className="flex items-center gap-1 px-2 py-1 rounded-md bg-muted/60 border border-border/40 text-[10px] font-mono text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
            >
              <X size={10} />
              <span className="tracking-wider">EXIT ZOOM</span>
            </button>
          )}
          <FitViewButton
            tasks={dayTasks}
            scrollRef={scrollRef as React.RefObject<HTMLElement>}
            hourHeight={hourHeight}
            setScale={setScale}
            resetZoom={resetZoom}
            nowMinutes={nowMinutes}
          />
        </div>
      </div>

      {/* Calendar grid — flows naturally, no inner scroll */}
      <div
        ref={scrollRef}
        style={{
          transform: swiping ? `translateX(${swipeOffset * 0.3}px)` : 'none',
          overflow: 'hidden',
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

      {dayTasks.length === 0 && (
        <div className="text-center py-20">
          <p className="text-muted-foreground/30 font-mono text-sm tracking-wider">NO TASKS</p>
        </div>
      )}

      <BlockedModal taskId="" open={false} onClose={() => {}} />
    </div>
  );
}
