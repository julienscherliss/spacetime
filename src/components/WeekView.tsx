import { useState, useEffect, useRef, useCallback } from 'react';
import { motion } from 'framer-motion';
import { useTaskStore } from '@/store/taskStore';
import { useCalendarStore } from '@/store/calendarStore';
import { useCurrentTime } from '@/hooks/useCurrentTime';
import { WeekGrid, useWeekDays } from '@/components/WeekGrid';
import { BlockedModal } from '@/components/BlockedModal';
import { ZoomControl } from '@/components/ZoomControl';
import { useTimeScale, SCALE_MIN, SCALE_MAX } from '@/hooks/useTimeScale';
import { ChevronLeft, ChevronRight, Layers, Square, X } from 'lucide-react';
import { useIsMobile } from '@/hooks/use-mobile';
import { START_HOUR } from '@/components/TimelineColumn';
import { TaskCluster } from '@/utils/taskClustering';

export function WeekView() {
  const { routinesEnabled, generateRecurringInstances } = useTaskStore();
  const { minutes: nowMinutes, dateStr: today } = useCurrentTime(15000);
  const scrollRef = useRef<HTMLDivElement>(null);
  const [weekOffset, setWeekOffset] = useState(0);
  const [week2Offset, setWeek2Offset] = useState(1);
  const [stacked, setStacked] = useState(false);
  const preStackScaleRef = useRef<number | null>(null);
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
    preClusterScaleRef.current = hourHeight;
    preClusterScrollRef.current = scrollRef.current.scrollTop;
    setClusterZoomed(true);
    const clamped = Math.min(SCALE_MAX, Math.max(SCALE_MIN, targetHourHeight));
    setScale(clamped);
    requestAnimationFrame(() => {
      if (!scrollRef.current) return;
      const viewportH = scrollRef.current.clientHeight;
      const targetScrollTop = ((scrollToMin - START_HOUR * 60) / 60) * clamped - viewportH / 2;
      scrollRef.current.scrollTo({ top: Math.max(0, targetScrollTop), behavior: 'smooth' });
    });
  }, [hourHeight, setScale]);

  const handleExitClusterZoom = useCallback(() => {
    if (preClusterScaleRef.current !== null) {
      setScale(preClusterScaleRef.current);
      requestAnimationFrame(() => {
        if (scrollRef.current && preClusterScrollRef.current !== null) {
          scrollRef.current.scrollTo({ top: preClusterScrollRef.current, behavior: 'smooth' });
        }
      });
    }
    setClusterZoomed(false);
    preClusterScaleRef.current = null;
    preClusterScrollRef.current = null;
  }, [setScale]);

  const week1 = useWeekDays(weekOffset, today, dayCount);
  const week2 = useWeekDays(stacked ? week2Offset : weekOffset + 1, today, dayCount);

  useEffect(() => {
    const start = week1[0]?.date;
    const end = stacked ? week2[week2.length - 1]?.date : week1[week1.length - 1]?.date;
    if (start && end) {
      generateRecurringInstances(start, end);
    }
  }, [week1, week2, stacked, generateRecurringInstances]);

  const { connected, fetchEvents } = useCalendarStore();
  useEffect(() => {
    const start = week1[0]?.date;
    const end = stacked ? week2[week2.length - 1]?.date : week1[week1.length - 1]?.date;
    if (connected && start && end) fetchEvents(start, end);
  }, [week1, week2, stacked, connected]);

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

  return (
    <div className="px-2 sm:px-3 py-4 overflow-x-hidden">
      {/* Header */}
      <div className="mb-4 px-1 sm:px-2 flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-2 sm:gap-3">
          <h2 className="text-base sm:text-lg font-display font-bold text-foreground tracking-tight">
            {isMobile ? '3-Day' : 'Week'}
          </h2>

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
                weekOffset === 0
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
          </div>
        </div>

        <button
          onClick={() => {
            if (!stacked) {
              setWeek2Offset(weekOffset + 1);
              preStackScaleRef.current = hourHeight;
              const available = window.innerHeight - 120;
              const fitScale = Math.floor(available / (24 * 2));
              setScale(Math.max(fitScale, 10));
            } else {
              if (preStackScaleRef.current !== null) {
                setScale(preStackScaleRef.current);
                preStackScaleRef.current = null;
              }
            }
            setStacked(s => !s);
          }}
          className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-sm text-[10px] font-mono tracking-widest transition-colors border ${
            stacked
              ? 'text-primary border-primary/20 bg-primary/5'
              : 'text-muted-foreground/40 border-border hover:text-foreground hover:border-border'
          }`}
        >
          {stacked ? <Layers size={12} strokeWidth={1.5} /> : <Square size={12} strokeWidth={1.5} />}
          {stacked ? '2×' : '1×'}
        </button>
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

      <div className="flex gap-2">
        <div
          ref={scrollRef}
          className={`flex-1 overflow-y-auto overflow-x-hidden ${!isMobile ? 'min-w-[860px]' : ''}`}
          style={{ maxHeight: 'calc(100vh - 160px)', WebkitOverflowScrolling: 'touch' }}
          onTouchStart={handleTouchStart}
          onTouchMove={handleTouchMove}
          onTouchEnd={handleTouchEnd}
        >
          <div
            style={{
              transform: swiping ? `translateX(${swipeOffset * 0.2}px)` : 'none',
              transition: swiping ? 'none' : 'transform 0.2s ease-out',
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

          {/* Second week (stacked mode) */}
          {stacked && (
            <div className="mt-4 pt-3 border-t border-border/30">
              <div className="flex items-center gap-2 mb-2 px-0.5">
                <button
                  onClick={() => setWeek2Offset(o => o - 1)}
                  className="p-1 rounded-sm text-muted-foreground/40 hover:text-foreground hover:bg-muted/50 transition-colors"
                >
                  <ChevronLeft size={14} strokeWidth={1.5} />
                </button>
                <span className="text-[10px] font-mono text-muted-foreground/50 tracking-wider">
                  WEEK 2
                </span>
                <button
                  onClick={() => setWeek2Offset(o => o + 1)}
                  className="p-1 rounded-sm text-muted-foreground/40 hover:text-foreground hover:bg-muted/50 transition-colors"
                >
                  <ChevronRight size={14} strokeWidth={1.5} />
                </button>
              </div>
              <WeekGrid
                weekOffset={week2Offset}
                today={today}
                nowMinutes={nowMinutes}
                hourHeight={hourHeight}
                routinesEnabled={routinesEnabled}
                compact={isMobile}
                dayCount={dayCount}
              />
            </div>
          )}
        </div>

        {/* Zoom control — desktop only */}
        {!isMobile && (
          <div className="shrink-0 pt-12">
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
