import { useState, useEffect, useRef, useCallback } from 'react';
import { motion } from 'framer-motion';
import { useTaskStore } from '@/store/taskStore';
import { useCalendarStore } from '@/store/calendarStore';
import { useCurrentTime } from '@/hooks/useCurrentTime';
import { WeekGrid, WeekDayHeaders, useWeekDays } from '@/components/WeekGrid';
import { BlockedModal } from '@/components/BlockedModal';
import { useTimeScale, SCALE_MIN, SCALE_MAX } from '@/hooks/useTimeScale';
import { ChevronLeft, ChevronRight, X } from 'lucide-react';
import { FitViewButton } from '@/components/FitViewButton';
import { useIsMobile } from '@/hooks/use-mobile';
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

  const week = useWeekDays(weekOffset, today, dayCount);

  useEffect(() => {
    const start = week[0]?.date;
    const end = week[week.length - 1]?.date;
    if (start && end) {
      generateRecurringInstances(start, end);
    }
  }, [week, generateRecurringInstances]);

  const { connected, fetchEvents } = useCalendarStore();
  useEffect(() => {
    const start = week[0]?.date;
    const end = week[week.length - 1]?.date;
    if (connected && start && end) fetchEvents(start, end);
  }, [week, connected]);

  // Bind zoom gestures to the page-level scroll
  useEffect(() => {
    const el = document.documentElement;
    const cleanScroll = bindScrollZoom(el);
    const cleanPinch = bindPinchZoom(el);
    return () => { cleanScroll?.(); cleanPinch?.(); };
  }, [bindScrollZoom, bindPinchZoom]);

  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    if (e.touches.length !== 1) return;
    touchStartRef.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
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
    if (Math.abs(swipeOffset) > 60) {
      if (swipeOffset > 0) {
        setWeekOffset(o => o - 1);
      } else {
        setWeekOffset(o => o + 1);
      }
    }
    setSwipeOffset(0);
    setSwiping(false);
    touchStartRef.current = null;
  }, [swipeOffset]);

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
  const headerControls = (
    <div className="flex flex-col items-center gap-0.5 pb-0.5">
      <button
        onClick={() => setWeekOffset(o => o - 1)}
        className="p-0.5 rounded-sm text-muted-foreground/40 hover:text-foreground transition-colors"
      >
        <ChevronLeft size={12} strokeWidth={1.5} />
      </button>
      <button
        onClick={goToCurrentWeek}
        className={`text-[7px] font-mono tracking-wider leading-none transition-colors ${
          isCurrentWeek ? 'text-primary' : 'text-muted-foreground/40 hover:text-foreground'
        }`}
      >
        NOW
      </button>
      <button
        onClick={() => setWeekOffset(o => o + 1)}
        className="p-0.5 rounded-sm text-muted-foreground/40 hover:text-foreground transition-colors"
      >
        <ChevronRight size={12} strokeWidth={1.5} />
      </button>
    </div>
  );

  return (
    <div
      className="w-full px-2 sm:px-3 lg:px-4"
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
    >
      {/* Bold title row — scrolls away naturally */}
      <div className="pt-3 pb-2">
        <h2 className="text-lg sm:text-xl font-display font-bold text-foreground tracking-tight">
          {monthLabel}
        </h2>
      </div>

      {/* Sticky weekday/date header with controls */}
      <div className="sticky top-12 z-30 bg-background border-b border-border/30">
        <div className="flex items-center justify-between">
          <div className="flex-1 min-w-0">
            <WeekDayHeaders
              weekOffset={weekOffset}
              today={today}
              compact={isMobile}
              dayCount={dayCount}
              controls={headerControls}
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
            />
          </div>
        </div>
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
