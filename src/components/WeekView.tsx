import { useMemo, useEffect, useRef } from 'react';
import { useTaskStore } from '@/store/taskStore';
import { useCurrentTime } from '@/hooks/useCurrentTime';
import { TimelineColumn, HOURS } from '@/components/TimelineColumn';
import { BlockedModal } from '@/components/BlockedModal';
import { ZoomControl } from '@/components/ZoomControl';
import { useTimeScale } from '@/hooks/useTimeScale';

export function WeekView() {
  const { tasks, generateRecurringInstances } = useTaskStore();
  const { minutes: nowMinutes, dateStr: today } = useCurrentTime(15000);
  const scrollRef = useRef<HTMLDivElement>(null);

  const {
    hourHeight, zoomIn, zoomOut, resetZoom, setScale,
    bindScrollZoom, bindPinchZoom,
    zoomPercent, isMin, isMax, isDefault,
  } = useTimeScale('week');

  const weekDays = useMemo(() => {
    const todayDate = new Date();
    const monday = new Date(todayDate);
    monday.setDate(todayDate.getDate() - ((todayDate.getDay() + 6) % 7));

    return Array.from({ length: 7 }, (_, i) => {
      const d = new Date(monday);
      d.setDate(monday.getDate() + i);
      const dateStr = d.toISOString().split('T')[0];
      return {
        date: dateStr,
        label: d.toLocaleDateString('en-US', { weekday: 'short' }).toUpperCase(),
        day: d.getDate(),
        isToday: dateStr === today,
      };
    });
  }, [today]);

  useEffect(() => {
    if (weekDays.length > 0) {
      generateRecurringInstances(weekDays[0].date, weekDays[weekDays.length - 1].date);
    }
  }, [weekDays, generateRecurringInstances]);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const cleanScroll = bindScrollZoom(el);
    const cleanPinch = bindPinchZoom(el);
    return () => { cleanScroll?.(); cleanPinch?.(); };
  }, [bindScrollZoom, bindPinchZoom]);

  return (
    <div className="px-2 py-5 overflow-x-auto">
      <div className="mb-4 px-2">
        <h2 className="text-lg font-display font-bold text-foreground tracking-tight">
          This Week
        </h2>
      </div>

      <div className="flex gap-2">
        <div className="flex-1 min-w-[860px]">
          {/* Day headers */}
          <div className="flex">
            <div className="w-10 shrink-0" />
            {weekDays.map((day) => (
              <div
                key={day.date}
                className={`flex-1 text-center py-1.5 border-b ${
                  day.isToday ? 'border-primary/20' : 'border-border/40'
                }`}
              >
                <div className="text-[7px] font-mono tracking-[0.2em] text-muted-foreground/40">
                  {day.label}
                </div>
                <div className={`text-xs font-display font-bold ${day.isToday ? 'text-primary' : 'text-foreground/50'}`}>
                  {day.day}
                </div>
              </div>
            ))}
          </div>

          {/* Timeline */}
          <div ref={scrollRef} className="flex overflow-y-auto" style={{ maxHeight: 'calc(100vh - 160px)' }}>
            {/* Shared time labels */}
            <div className="w-10 shrink-0 relative" style={{ height: HOURS.length * hourHeight }}>
              {HOURS.map((hour, i) => (
                <div
                  key={hour}
                  className="absolute left-0 right-0 text-[8px] font-mono text-muted-foreground/50 font-medium text-right pr-1.5 -mt-1.5 select-none"
                  style={{ top: i * hourHeight }}
                >
                  {hour.toString().padStart(2, '0')}
                </div>
              ))}
            </div>

            {/* Day columns */}
            {weekDays.map((day) => {
              const dayTasks = tasks.filter((t) => t.date === day.date);
              return (
                <div
                  key={day.date}
                  className={`flex-1 border-l border-border/25 ${day.isToday ? 'bg-primary/[0.015]' : ''}`}
                >
                  <TimelineColumn
                    date={day.date}
                    tasks={dayTasks}
                    nowMinutes={nowMinutes}
                    isToday={day.isToday}
                    showTimeLabels={false}
                    hourHeight={hourHeight}
                  />
                </div>
              );
            })}
          </div>
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
