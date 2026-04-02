import { useMemo, useEffect } from 'react';
import { useTaskStore } from '@/store/taskStore';
import { useCurrentTime } from '@/hooks/useCurrentTime';
import { TimelineColumn, HOUR_HEIGHT, HOURS } from '@/components/TimelineColumn';
import { BlockedModal } from '@/components/BlockedModal';

export function WeekView() {
  const { tasks, generateRecurringInstances } = useTaskStore();
  const { minutes: nowMinutes, dateStr: today } = useCurrentTime(15000);

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

  return (
    <div className="px-2 py-5 overflow-x-auto">
      <div className="mb-4 px-2">
        <h2 className="text-lg font-display font-bold text-foreground tracking-tight">
          This Week
        </h2>
      </div>

      <div className="min-w-[860px]">
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
        <div className="flex overflow-y-auto" style={{ maxHeight: 'calc(100vh - 160px)' }}>
          {/* Shared time labels */}
          <div className="w-10 shrink-0 relative" style={{ height: HOURS.length * HOUR_HEIGHT }}>
            {HOURS.map((hour, i) => (
              <div
                key={hour}
                className="absolute left-0 right-0 text-[8px] font-mono text-muted-foreground/25 text-right pr-1.5 -mt-1.5 select-none"
                style={{ top: i * HOUR_HEIGHT }}
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
                />
              </div>
            );
          })}
        </div>
      </div>

      <BlockedModal taskId="" open={false} onClose={() => {}} />
    </div>
  );
}
