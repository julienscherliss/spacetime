import { useState, useEffect, useRef, useCallback } from 'react';
import { useTrackpadSwipe } from '@/hooks/useTrackpadSwipe';
import { useTouchDragStore } from '@/store/touchDragStore';
import { useScheduledDragStore } from '@/store/scheduledDragStore';
import { useCarryStore } from '@/store/carryStore';
import { motion } from 'framer-motion';
import { useTaskStore } from '@/store/taskStore';
import { useCalendarStore } from '@/store/calendarStore';
import { useCurrentTime } from '@/hooks/useCurrentTime';
import { WeekGrid, WeekDayHeaders, useWeekDays } from '@/components/WeekGrid';
import { BlockedModal } from '@/components/BlockedModal';
import { useTimeScale, SCALE_MIN, SCALE_MAX, animatePinchZoom } from '@/hooks/useTimeScale';
import { ChevronLeft, ChevronRight, X } from 'lucide-react';
import { FitViewButton } from '@/components/FitViewButton';
import { useIsMobile } from '@/hooks/use-mobile';
import { AllDayEventStrip } from '@/components/AllDayEventStrip';
import { START_HOUR } from '@/components/TimelineColumn';
import { TaskCluster } from '@/utils/taskClustering';

export function WeekView() {
  const { tasks, routinesEnabled, generateRecurringInstances } = useTaskStore();
  const { minutes: nowMinutes, dateStr: today } = useCurrentTime(15000);
  const scrollRef = useRef<HTMLDivElement>(null);
  const [weekOffset, setWeekOffset] = useState(0);
  const isMobile = useIsMobile();

  const touchStartRef = useRef<{ x: number; y: number } | null>(null);
  const [swipeOffset, setSwipeOffset] = useState(0);
  const [swiping, setSwiping] = useState(false);

  const dayCount = isMobile ? 3 : 7;

  const {
    hourHeight, setScale, resetZoom,
    bindScrollZoom, bindPinchZoom,
  } = useTimeScale('week');

  // Cluster zoom state
  const [clusterZoomed, setClusterZoomed] = useState(false);
  const preClusterScaleRef = useRef<number | null>(null);
  const preClusterScrollRef = useRef<number | null>(null);
  const zoomCancelRef = useRef<(() => void) | null>(null);

  const getTimelineDocTop = useCallback(() => {
    if (!scrollRef.current) return 0;
    return scrollRef.current.getBoundingClientRect().top + window.scrollY;
  }, []);

  const handleZoomToCluster = useCallback((cluster: TaskCluster, targetHourHeight: number, scrollToMin: number) => {
    zoomCancelRef.current?.();

    preClusterScaleRef.current = hourHeight;
    preClusterScrollRef.current = window.scrollY;

    const stickyOffset = window.innerWidth < 640 ? 36 : 84;
    const viewportH = window.innerHeight - stickyOffset;

    setClusterZoomed(true);

    zoomCancelRef.current = animatePinchZoom({
      fromScale: hourHeight,
      toScale: targetHourHeight,
      focalMin: scrollToMin,
      focalViewportY: stickyOffset + viewportH / 2,
      timelineDocTop: getTimelineDocTop(),
      duration: 300,
      setScale,
      onComplete: () => { zoomCancelRef.current = null; },
    });
  }, [hourHeight, setScale, getTimelineDocTop]);

  const handleExitClusterZoom = useCallback(() => {
    zoomCancelRef.current?.();

    if (preClusterScaleRef.current === null) {
      setClusterZoomed(false);
      return;
    }
    const restoreScale = preClusterScaleRef.current;
    const restoreScroll = preClusterScrollRef.current ?? 0;

    const stickyOffset = window.innerWidth < 640 ? 36 : 84;
    const viewportH = window.innerHeight - stickyOffset;
    const timelineDocTop = getTimelineDocTop();
    const centerDocY = restoreScroll + stickyOffset + viewportH / 2;
    const centerMin = START_HOUR * 60 + ((centerDocY - timelineDocTop) / restoreScale) * 60;

    zoomCancelRef.current = animatePinchZoom({
      fromScale: hourHeight,
      toScale: restoreScale,
      focalMin: centerMin,
      focalViewportY: stickyOffset + viewportH / 2,
      timelineDocTop,
      duration: 300,
      setScale,
      onComplete: () => {
        zoomCancelRef.current = null;
        setClusterZoomed(false);
        preClusterScaleRef.current = null;
        preClusterScrollRef.current = null;
      },
    });
  }, [hourHeight, setScale, getTimelineDocTop]);

  const week = useWeekDays(weekOffset, today, dayCount);

  useEffect(() => {
    const start = week[0]?.date;
    const end = week[week.length - 1]?.date;
    if (start && end) {
      generateRecurringInstances(start, end);
    }
  }, [week, generateRecurringInstances]);

  const { connected, calendars, fetchEvents } = useCalendarStore();
  useEffect(() => {
    const start = week[0]?.date;
    const end = week[week.length - 1]?.date;
    if (connected && start && end) fetchEvents(start, end);
  }, [week, connected, calendars, fetchEvents]);

  // Bind zoom gestures to the page-level scroll
  useEffect(() => {
    const el = document.documentElement;
    const cleanScroll = bindScrollZoom(el);
    const cleanPinch = bindPinchZoom(el);
    return () => { cleanScroll?.(); cleanPinch?.(); };
  }, [bindScrollZoom, bindPinchZoom]);

  // Trackpad horizontal swipe for week navigation
  const weekContainerRef = useRef<HTMLDivElement>(null);
  useTrackpadSwipe({
    direction: 'horizontal',
    containerRef: weekContainerRef,
    threshold: 200,
    onSwipePositive: useCallback(() => setWeekOffset(o => o - 1), []),
    onSwipeNegative: useCallback(() => setWeekOffset(o => o + 1), []),
  });

  const resetSwipeGesture = useCallback(() => {
    setSwipeOffset(0);
    setSwiping(false);
    touchStartRef.current = null;
  }, []);

  const isNavigationGestureBlocked = useCallback((target?: EventTarget | null) => {
    const el = target as HTMLElement | null;
    if (el?.closest('[data-task-block], [data-cluster-block], button, input, textarea, select, [data-touch-ignore]')) {
      return true;
    }

    const scheduledDrag = useScheduledDragStore.getState();
    return Boolean(
      useTouchDragStore.getState().dragging ||
      useCarryStore.getState().carried ||
      scheduledDrag.taskId ||
      scheduledDrag.active
    );
  }, []);

  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    if (e.touches.length !== 1 || isNavigationGestureBlocked(e.target)) {
      resetSwipeGesture();
      return;
    }
    touchStartRef.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
  }, [isNavigationGestureBlocked, resetSwipeGesture]);

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    if (isNavigationGestureBlocked(e.target)) {
      resetSwipeGesture();
      return;
    }
    if (!touchStartRef.current || e.touches.length !== 1) return;
    const dx = e.touches[0].clientX - touchStartRef.current.x;
    const dy = e.touches[0].clientY - touchStartRef.current.y;
    if (Math.abs(dx) > Math.abs(dy) && Math.abs(dx) > 10) {
      setSwiping(true);
      setSwipeOffset(dx);
    }
  }, [isNavigationGestureBlocked, resetSwipeGesture]);

  const handleTouchEnd = useCallback((e: React.TouchEvent) => {
    if (isNavigationGestureBlocked(e.target)) {
      resetSwipeGesture();
      return;
    }
    if (Math.abs(swipeOffset) > 60) {
      if (swipeOffset > 0) {
        setWeekOffset(o => o - 1);
      } else {
        setWeekOffset(o => o + 1);
      }
    }
    resetSwipeGesture();
  }, [isNavigationGestureBlocked, resetSwipeGesture, swipeOffset]);

  const goToCurrentWeek = () => setWeekOffset(0);
  const isCurrentWeek = weekOffset === 0;

  // Month label
  const monthLabel = (() => {
    if (week.length === 0) return '';
    const startDate = new Date(week[0].date + 'T12:00:00');
    const endDate = new Date(week[week.length - 1].date + 'T12:00:00');
    const startMonth = startDate.toLocaleDateString('en-US', { month: 'long' });
    const endMonth = endDate.toLocaleDateString('en-US', { month: 'long' });
    return startMonth === endMonth ? startMonth : `${startDate.toLocaleDateString('en-US', { month: 'short' })} / ${endDate.toLocaleDateString('en-US', { month: 'short' })}`;
  })();

  // Visible tasks for fit button
  const visibleDates = new Set(week.map(d => d.date));
  const visibleTasks = tasks.filter(t =>
    visibleDates.has(t.date) && !t.inWaitingRoom && !t.archivedAt &&
    !(!routinesEnabled && t.isRoutine !== false && t.type === 'recurring')
  );

  // Navigation controls placed in the sticky header gutter
  return (
    <div
      ref={weekContainerRef}
      className="w-full px-2 sm:px-3 lg:px-4"
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
    >
      {/* Sticky header: title row + weekday headers pinned together */}
      <div className="sticky top-0 sm:top-12 z-30 bg-background border-b border-border/30">
        <div className="pt-3 pb-2 flex items-center gap-2">
          <button onClick={goToCurrentWeek} className="text-lg sm:text-xl font-display font-bold text-foreground tracking-tight hover:text-primary transition-colors">
            {monthLabel}
          </button>
          <button
            onClick={() => setWeekOffset(o => o - 1)}
            className="p-1 rounded-sm text-muted-foreground/40 hover:text-foreground transition-colors"
          >
            <ChevronLeft size={16} strokeWidth={1.5} />
          </button>
          <button
            onClick={() => setWeekOffset(o => o + 1)}
            className="p-1 rounded-sm text-muted-foreground/40 hover:text-foreground transition-colors"
          >
            <ChevronRight size={16} strokeWidth={1.5} />
          </button>
        </div>
        <div className="flex items-center justify-between">
          <div className="flex-1 min-w-0">
            <WeekDayHeaders
              weekOffset={weekOffset}
              today={today}
              compact={isMobile}
              dayCount={dayCount}
              controls={null}
            />
          </div>
          <div className="flex items-center gap-1 pr-1 shrink-0 self-center">
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
              tasks={visibleTasks}
              scrollRef={scrollRef as React.RefObject<HTMLElement>}
              hourHeight={hourHeight}
              setScale={setScale}
              resetZoom={resetZoom}
              nowMinutes={nowMinutes}
              hideButton={isMobile}
            />
          </div>
        </div>
      </div>

      <div className={`${isMobile ? 'pl-6' : 'pl-[3.25rem]'}`}>
        <AllDayEventStrip dates={week.map((day) => day.date)} compact={isMobile} />
      </div>

      {/* Calendar grid — flows naturally, no inner scroll */}
      <div
        ref={scrollRef}
        style={{
          transform: swiping ? `translateX(${swipeOffset * 0.2}px)` : 'none',
          overflow: 'hidden',
        }}
      >
        <WeekGrid
          weekOffset={weekOffset}
          today={today}
          nowMinutes={nowMinutes}
          hourHeight={hourHeight}
          routinesEnabled={routinesEnabled}
          compact={isMobile}
          dayCount={dayCount}
          onZoomToCluster={handleZoomToCluster}
        />
      </div>

      <BlockedModal taskId="" open={false} onClose={() => {}} />
    </div>
  );
}
