import { useState, useEffect, useRef, useCallback } from 'react';
import { motion } from 'framer-motion';
import { useTaskStore } from '@/store/taskStore';
import { useCalendarStore } from '@/store/calendarStore';
import { useCurrentTime } from '@/hooks/useCurrentTime';
import { WeekGrid, useWeekDays } from '@/components/WeekGrid';
import { BlockedModal } from '@/components/BlockedModal';
import { ZoomControl } from '@/components/ZoomControl';
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
    hourHeight, zoomIn, zoomOut, resetZoom, setScale,
    bindScrollZoom, bindPinchZoom,
    zoomPercent, isMin, isMax, isDefault,
  } = useTimeScale('week');

  // Cluster zoom state
  const [clusterZoomed, setClusterZoomed] = useState(false);
  const preClusterScaleRef = useRef<number | null>(null);
  const preClusterScrollRef = useRef<number | null>(null);

  const handleZoomToCluster = useCallback((cluster: TaskCluster, targetHourHeight: number, scrollToMin: number) => {
    if (!scrollRef.current) return;
    const el = scrollRef.current;
    preClusterScaleRef.current = hourHeight;
    preClusterScrollRef.current = el.scrollTop;

    const clamped = Math.min(SCALE_MAX, Math.max(SCALE_MIN, targetHourHeight));
    const viewportH = el.clientHeight;
    const clusterCenterMin = (cluster.startMin + cluster.endMin) / 2;

    el.style.scrollBehavior = 'auto';
    setScale(clamped);
    setClusterZoomed(true);

    const targetScrollTop = Math.max(0,
      ((clusterCenterMin - START_HOUR * 60) / 60) * clamped - viewportH / 2
    );

    queueMicrotask(() => {
      el.scrollTop = targetScrollTop;
      requestAnimationFrame(() => {
        el.style.scrollBehavior = '';
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

    el.style.scrollBehavior = 'auto';
    setScale(restoreScale);

    queueMicrotask(() => {
      el.scrollTop = restoreScroll;
      requestAnimationFrame(() => {
        el.style.scrollBehavior = '';
      });
    });

    setClusterZoomed(false);
    preClusterScaleRef.current = null;
    preClusterScrollRef.current = null;
  }, [hourHeight, setScale]);

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

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
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

  // Date range label
  const rangeLabel = (() => {
    if (week.length === 0) return '';
    const startDate = new Date(week[0].date + 'T12:00:00');
    const endDate = new Date(week[week.length - 1].date + 'T12:00:00');
    const sameMonth = startDate.getMonth() === endDate.getMonth();
    if (sameMonth) {
      return `${startDate.toLocaleDateString('en-US', { month: 'long' })} ${startDate.getDate()}–${endDate.getDate()}`;
    }
    return `${startDate.toLocaleDateString('en-US', { month: 'short' })} ${startDate.getDate()} – ${endDate.toLocaleDateString('en-US', { month: 'short' })} ${endDate.getDate()}`;
  })();

  // Visible tasks for fit button
  const visibleDates = new Set(week.map(d => d.date));
  const visibleTasks = tasks.filter(t =>
    visibleDates.has(t.date) && !t.inWaitingRoom && !t.archivedAt &&
    !(!routinesEnabled && t.isRoutine !== false && t.type === 'recurring')
  );
  const completedCount = visibleTasks.filter(t => t.completed).length;

  return (
    <div className="max-w-3xl mx-auto px-3 sm:px-4 py-4">
      {/* Header — matches Day view structure */}
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h2 className="text-base sm:text-lg font-display font-bold text-foreground tracking-tight">
            {rangeLabel}
          </h2>
          <p className="text-[10px] font-mono text-muted-foreground/50 mt-0.5 tracking-widest">
            {completedCount}/{visibleTasks.length} COMPLETED
          </p>
        </div>

        {/* Navigation — same rhythm as Day view */}
        <div className="flex items-center gap-0.5">
          <button
            onClick={() => setWeekOffset(o => o - 1)}
            className="p-1.5 rounded-sm text-muted-foreground/50 hover:text-foreground hover:bg-muted/50 transition-colors"
          >
            <ChevronLeft size={16} strokeWidth={1.5} />
          </button>
          <button
            onClick={goToCurrentWeek}
            className={`px-2.5 py-1 rounded-sm text-[10px] font-mono tracking-widest transition-colors ${
              isCurrentWeek
                ? 'text-primary bg-primary/5'
                : 'text-muted-foreground/50 hover:text-foreground hover:bg-muted/50'
            }`}
          >
            TODAY
          </button>
          <button
            onClick={() => setWeekOffset(o => o + 1)}
            className="p-1.5 rounded-sm text-muted-foreground/50 hover:text-foreground hover:bg-muted/50 transition-colors"
          >
            <ChevronRight size={16} strokeWidth={1.5} />
          </button>
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

      {/* Progress — matches Day view */}
      <div className="h-px bg-border/40 mb-4 overflow-hidden">
        <motion.div
          className="h-full bg-primary/50"
          initial={{ width: 0 }}
          animate={{ width: visibleTasks.length > 0 ? `${(completedCount / visibleTasks.length) * 100}%` : '0%' }}
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
          className={`flex-1 overflow-y-auto overflow-x-hidden ${!isMobile ? 'min-w-[860px]' : ''}`}
          style={{ maxHeight: 'calc(100vh - 180px)', WebkitOverflowScrolling: 'touch' }}
          onTouchStart={handleTouchStart}
          onTouchMove={handleTouchMove}
          onTouchEnd={handleTouchEnd}
        >
          <div
            style={{
              transform: swiping ? `translateX(${swipeOffset * 0.2}px)` : 'none',
              transition: swiping ? 'none' : 'none',
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
        </div>

        {/* Zoom control — desktop only */}
        {!isMobile && (
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
        )}
      </div>

      <BlockedModal taskId="" open={false} onClose={() => {}} />
    </div>
  );
}
