import { useState, useEffect, useRef, useCallback } from 'react';
import { useTrackpadSwipe } from '@/hooks/useTrackpadSwipe';
import { motion, AnimatePresence } from 'framer-motion';
import { useTaskStore } from '@/store/taskStore';
import { useTimezoneStore } from '@/store/timezoneStore';
import { shouldShowScheduledTask } from '@/utils/taskVisibility';
import { useCalendarStore } from '@/store/calendarStore';
import { useTouchDragStore } from '@/store/touchDragStore';
import { useScheduledDragStore } from '@/store/scheduledDragStore';
import { useCarryStore } from '@/store/carryStore';
import { useCurrentTime } from '@/hooks/useCurrentTime';
import { TimelineColumn, START_HOUR } from '@/components/TimelineColumn';
import { BlockedModal } from '@/components/BlockedModal';
import { useTimeScale, SCALE_MIN, SCALE_MAX, animatePinchZoom } from '@/hooks/useTimeScale';
import { ChevronLeft, ChevronRight, X, CornerUpLeft } from 'lucide-react';
import { FitViewButton } from '@/components/FitViewButton';
import { useIsMobile } from '@/hooks/use-mobile';
import { AllDayEventStrip } from '@/components/AllDayEventStrip';
import { TaskCluster } from '@/utils/taskClustering';

function addDaysToDate(dateStr: string, days: number): string {
  const d = new Date(dateStr + 'T12:00:00');
  d.setDate(d.getDate() + days);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function DayView() {
  const { tasks, routinesEnabled, generateRecurringInstances, navigateToDate, setNavigateToDate,
    currentDate, setCurrentDate,
    listReturnZoom, setListReturnZoom, showListReturn, setShowListReturn, setDaySubMode } = useTaskStore();
  const isMobile = useIsMobile();
  const { minutes: nowMinutes, dateStr: today } = useCurrentTime(15000);
  const [selectedDate, _setSelectedDate] = useState(navigateToDate || currentDate || today);
  const [helperDismissed, setHelperDismissed] = useState(false);

  const setSelectedDate = useCallback((dateOrFn: string | ((prev: string) => string)) => {
    _setSelectedDate(prev => {
      const next = typeof dateOrFn === 'function' ? dateOrFn(prev) : dateOrFn;
      setCurrentDate(next);
      return next;
    });
  }, [setCurrentDate]);

  useEffect(() => {
    if (navigateToDate) {
      setSelectedDate(navigateToDate);
      setNavigateToDate(null);
    }
  }, [navigateToDate, setNavigateToDate, setSelectedDate]);

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
  const zoomCancelRef = useRef<(() => void) | null>(null);

  const getTimelineDocTop = useCallback(() => {
    if (!scrollRef.current) return 0;
    return scrollRef.current.getBoundingClientRect().top + window.scrollY;
  }, []);

  const handleZoomToCluster = useCallback((cluster: TaskCluster, targetHourHeight: number, scrollToMin: number) => {
    // Cancel any in-flight zoom
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

    // Compute what minute is at the center of the restore scroll position
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

  useEffect(() => {
    generateRecurringInstances(selectedDate, selectedDate);
  }, [selectedDate, generateRecurringInstances]);

  const { connected, calendars, fetchEvents } = useCalendarStore();
  useEffect(() => {
    if (connected) fetchEvents(selectedDate, selectedDate);
  }, [selectedDate, connected, calendars, fetchEvents]);
  // Zoom to task time when coming from list view
  useEffect(() => {
    if (!listReturnZoom) return;
    const { taskTime, taskDuration } = listReturnZoom;
    const [h, m] = taskTime.split(':').map(Number);
    const taskStartMin = h * 60 + m;
    const taskEndMin = taskStartMin + taskDuration;
    // Pad proportionally: short tasks get a tight ~2-3hr window for precision,
    // long tasks expand context so the user sees most of their day.
    const padMin = Math.min(240, Math.max(75, taskDuration * 1.5));
    const windowStartMin = Math.max(0, taskStartMin - padMin);
    const windowEndMin = Math.min(24 * 60, taskEndMin + padMin);
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

  // Trackpad horizontal swipe for day navigation
  const dayContainerRef = useRef<HTMLDivElement>(null);
  useTrackpadSwipe({
    direction: 'horizontal',
    containerRef: dayContainerRef,
    threshold: 200,
    onSwipePositive: useCallback(() => setSelectedDate(d => addDaysToDate(d, -1)), []),
    onSwipeNegative: useCallback(() => setSelectedDate(d => addDaysToDate(d, 1)), []),
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

  // Swipe gesture handlers
  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    if (e.touches.length !== 1 || isNavigationGestureBlocked(e.target)) {
      resetSwipeGesture();
      return;
    }
    touchStartRef.current = {
      x: e.touches[0].clientX,
      y: e.touches[0].clientY,
      time: Date.now(),
    };
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
    if (!touchStartRef.current) return;
    const threshold = 60;
    if (Math.abs(swipeOffset) > threshold) {
      if (swipeOffset > 0) {
        setSelectedDate(d => addDaysToDate(d, -1));
      } else {
        setSelectedDate(d => addDaysToDate(d, 1));
      }
    }
    resetSwipeGesture();
  }, [isNavigationGestureBlocked, resetSwipeGesture, swipeOffset]);

  const goToToday = () => setSelectedDate(today);

  const showCompletedSetting = useTimezoneStore((s) => s.showCompletedTasks);
  const dayTasks = tasks.filter((t) => t.date === selectedDate &&
    !t.groupId && // hide Group children — they live inside the Group block
    shouldShowScheduledTask(t, { showCompleted: showCompletedSetting, routinesEnabled }));
  const completedCount = dayTasks.filter((t) => t.completed).length;
  const isToday = selectedDate === today;

  // Helper: has the user *completed* anything in the past 7 days (relative to today)?
  // Deleting tasks does not count — only completions suppress the helper.
  const sevenDaysAgo = (() => {
    const d = new Date(today + 'T12:00:00');
    d.setDate(d.getDate() - 7);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  })();
  const hasRecentCompletion = tasks.some(
    (t) => t.completed && !!t.date && t.date >= sevenDaysAgo && t.date <= today
  );
  const showFirstTimeHelper = dayTasks.length === 0 && !hasRecentCompletion;

  return (
    <div
      ref={dayContainerRef}
      className="max-w-3xl mx-auto px-3 sm:px-4"
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
    >
      {/* Sticky header: title + controls pinned together */}
      <div className="sticky top-[env(safe-area-inset-top)] sm:top-12 z-30 bg-background border-b border-border/30">
        <div className="pt-1 pb-0.5">
          <h2 className="font-display font-bold text-foreground tracking-tight" style={{ fontSize: 'var(--ui-text-3xl)' }}>
            {new Date(selectedDate + 'T12:00:00').toLocaleDateString('en-US', {
              weekday: 'long',
              month: 'long',
              day: 'numeric',
            })}
          </h2>
          <p className="font-mono text-muted-foreground/50 tracking-widest" style={{ fontSize: 'var(--ui-task-meta)' }}>
            {completedCount}/{dayTasks.length} COMPLETED
          </p>
        </div>
        <div className="py-1 flex items-center justify-between">
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
            hideButton={isMobile}
          />
        </div>
        </div>
      </div>

      <AllDayEventStrip dates={[selectedDate]} />

      {/* Calendar grid — flows naturally, no inner scroll */}
      <div
        ref={scrollRef}
        onPointerDown={(e) => {
          if (showFirstTimeHelper && !helperDismissed) {
            // Only dismiss when interacting with empty timeline space, not chrome
            const target = e.target as HTMLElement;
            if (!target.closest('button, input, textarea, a')) {
              setHelperDismissed(true);
            }
          }
        }}
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

      {dayTasks.length === 0 && !showFirstTimeHelper && (
        <div className="text-center py-20">
          <p className="text-muted-foreground/30 font-mono text-sm tracking-wider">NO TASKS</p>
        </div>
      )}

      <AnimatePresence>
        {showFirstTimeHelper && !helperDismissed && (
          <motion.div
            key="first-time-helper"
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4, scale: 0.98 }}
            transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
            className="pointer-events-none fixed inset-x-0 top-1/2 -translate-y-1/2 z-20 flex justify-center px-6"
          >
            <div className="max-w-sm text-center">
              <p className="font-display font-bold text-foreground tracking-tight text-2xl mb-3">
                Your day is empty
              </p>
              <p className="font-mono text-muted-foreground text-sm leading-relaxed tracking-wide">
                {isMobile ? 'Press' : 'Click'} and drag on the timeline to create a new task.
              </p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <BlockedModal taskId="" open={false} onClose={() => {}} />
    </div>
  );
}
