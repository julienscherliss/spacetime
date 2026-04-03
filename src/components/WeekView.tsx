import { useState, useEffect, useRef, useCallback } from 'react';
import { useTaskStore } from '@/store/taskStore';
import { useCalendarStore } from '@/store/calendarStore';
import { useCurrentTime } from '@/hooks/useCurrentTime';
import { WeekGrid, useWeekDays } from '@/components/WeekGrid';
import { BlockedModal } from '@/components/BlockedModal';
import { ZoomControl } from '@/components/ZoomControl';
import { useTimeScale } from '@/hooks/useTimeScale';
import { ChevronLeft, ChevronRight, Layers, Square } from 'lucide-react';
import { useIsMobile } from '@/hooks/use-mobile';

export function WeekView() {
  const { routinesEnabled, generateRecurringInstances } = useTaskStore();
  const { minutes: nowMinutes, dateStr: today } = useCurrentTime(15000);
  const scrollRef = useRef<HTMLDivElement>(null);
  const [weekOffset, setWeekOffset] = useState(0);
  const [week2Offset, setWeek2Offset] = useState(1); // independent second week
  const [stacked, setStacked] = useState(false);
  const isMobile = useIsMobile();

  // Swipe state for mobile
  const touchStartRef = useRef<{ x: number; y: number } | null>(null);
  const [swipeOffset, setSwipeOffset] = useState(0);
  const [swiping, setSwiping] = useState(false);

  const {
    hourHeight, zoomIn, zoomOut, resetZoom, setScale,
    bindScrollZoom, bindPinchZoom,
    zoomPercent, isMin, isMax, isDefault,
  } = useTimeScale('week');

  const week1 = useWeekDays(weekOffset, today);
  const week2 = useWeekDays(stacked ? week2Offset : weekOffset + 1, today);

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

  // Mobile swipe for week navigation
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
            Week
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

        {/* Stacked toggle — desktop only */}
        {!isMobile && (
          <button
            onClick={() => {
              if (!stacked) setWeek2Offset(weekOffset + 1);
              setStacked(s => !s);
            }}
            className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-sm text-[10px] font-mono tracking-widest transition-colors border ${
              stacked
                ? 'text-primary border-primary/20 bg-primary/5'
                : 'text-muted-foreground/40 border-border hover:text-foreground hover:border-border'
            }`}
          >
            {stacked ? <Layers size={12} strokeWidth={1.5} /> : <Square size={12} strokeWidth={1.5} />}
            {stacked ? '2 WEEKS' : '1 WEEK'}
          </button>
        )}
      </div>

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
            />
          </div>

          {/* Second week (stacked mode) — with independent navigation */}
          {stacked && !isMobile && (
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
