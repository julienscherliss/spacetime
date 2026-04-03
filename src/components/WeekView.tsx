import { useState, useEffect, useRef } from 'react';
import { useTaskStore } from '@/store/taskStore';
import { useCalendarStore } from '@/store/calendarStore';
import { useCurrentTime } from '@/hooks/useCurrentTime';
import { WeekGrid, useWeekDays } from '@/components/WeekGrid';
import { BlockedModal } from '@/components/BlockedModal';
import { ZoomControl } from '@/components/ZoomControl';
import { useTimeScale } from '@/hooks/useTimeScale';
import { ChevronLeft, ChevronRight, Layers, Square } from 'lucide-react';

export function WeekView() {
  const { routinesEnabled, generateRecurringInstances } = useTaskStore();
  const { minutes: nowMinutes, dateStr: today } = useCurrentTime(15000);
  const scrollRef = useRef<HTMLDivElement>(null);
  const [weekOffset, setWeekOffset] = useState(0);
  const [stacked, setStacked] = useState(false);

  const {
    hourHeight, zoomIn, zoomOut, resetZoom, setScale,
    bindScrollZoom, bindPinchZoom,
    zoomPercent, isMin, isMax, isDefault,
  } = useTimeScale('week');

  // Generate recurring instances for visible range
  const week1 = useWeekDays(weekOffset, today);
  const week2 = useWeekDays(weekOffset + 1, today);

  useEffect(() => {
    const start = week1[0]?.date;
    const end = stacked ? week2[week2.length - 1]?.date : week1[week1.length - 1]?.date;
    if (start && end) {
      generateRecurringInstances(start, end);
    }
  }, [week1, week2, stacked, generateRecurringInstances]);

  // Fetch Google Calendar events for visible weeks
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

  const goToCurrentWeek = () => setWeekOffset(0);

  return (
    <div className="px-2 py-5 overflow-x-auto">
      {/* Header */}
      <div className="mb-4 px-2 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h2 className="text-lg font-display font-bold text-foreground tracking-tight">
            Week
          </h2>

          {/* Week navigation */}
          <div className="flex items-center gap-0.5">
            <button
              onClick={() => setWeekOffset(o => o - 1)}
              className="p-1 rounded-sm text-muted-foreground/50 hover:text-foreground hover:bg-muted/50 transition-colors"
            >
              <ChevronLeft size={14} strokeWidth={1.5} />
            </button>
            <button
              onClick={goToCurrentWeek}
              className={`px-2 py-0.5 rounded-sm text-[8px] font-mono tracking-widest transition-colors ${
                weekOffset === 0
                  ? 'text-primary bg-primary/5'
                  : 'text-muted-foreground/50 hover:text-foreground hover:bg-muted/50'
              }`}
            >
              TODAY
            </button>
            <button
              onClick={() => setWeekOffset(o => o + 1)}
              className="p-1 rounded-sm text-muted-foreground/50 hover:text-foreground hover:bg-muted/50 transition-colors"
            >
              <ChevronRight size={14} strokeWidth={1.5} />
            </button>
          </div>
        </div>

        {/* Stacked toggle */}
        <button
          onClick={() => setStacked(s => !s)}
          className={`flex items-center gap-1.5 px-2 py-1 rounded-sm text-[8px] font-mono tracking-widest transition-colors border ${
            stacked
              ? 'text-primary border-primary/20 bg-primary/5'
              : 'text-muted-foreground/40 border-border hover:text-foreground hover:border-border'
          }`}
          title={stacked ? 'Switch to single week' : 'Switch to stacked weeks'}
        >
          {stacked ? <Layers size={10} strokeWidth={1.5} /> : <Square size={10} strokeWidth={1.5} />}
          {stacked ? '2 WEEKS' : '1 WEEK'}
        </button>
      </div>

      <div className="flex gap-2">
        <div
          ref={scrollRef}
          className="flex-1 min-w-[860px] overflow-y-auto"
          style={{ maxHeight: 'calc(100vh - 160px)' }}
        >
          {/* First week */}
          <WeekGrid
            weekOffset={weekOffset}
            today={today}
            nowMinutes={nowMinutes}
            hourHeight={hourHeight}
            routinesEnabled={routinesEnabled}
          />

          {/* Second week (stacked mode) */}
          {stacked && (
            <div className="mt-4 pt-3 border-t border-border/30">
              <WeekGrid
                weekOffset={weekOffset + 1}
                today={today}
                nowMinutes={nowMinutes}
                hourHeight={hourHeight}
                routinesEnabled={routinesEnabled}
              />
            </div>
          )}
        </div>

        {/* Zoom control */}
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
      </div>

      <BlockedModal taskId="" open={false} onClose={() => {}} />
    </div>
  );
}
