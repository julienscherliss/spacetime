import { useMemo } from 'react';
import { useTaskStore } from '@/store/taskStore';
import { TimelineColumn, HOURS } from '@/components/TimelineColumn';

interface WeekGridProps {
  weekOffset: number; // 0 = current week, -1 = last week, +1 = next week
  today: string;
  nowMinutes: number;
  hourHeight: number;
  routinesEnabled: boolean;
  label?: string;
}

function getWeekDays(offset: number, today: string) {
  const todayDate = new Date();
  const monday = new Date(todayDate);
  monday.setDate(todayDate.getDate() - ((todayDate.getDay() + 6) % 7) + offset * 7);

  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    const dateStr = d.toISOString().split('T')[0];
    return {
      date: dateStr,
      label: d.toLocaleDateString('en-US', { weekday: 'short' }).toUpperCase(),
      day: d.getDate(),
      month: d.toLocaleDateString('en-US', { month: 'short' }),
      isToday: dateStr === today,
    };
  });
}

export function formatWeekRange(days: { date: string; day: number; month: string }[]) {
  if (days.length === 0) return '';
  const first = days[0];
  const last = days[days.length - 1];
  if (first.month === last.month) {
    return `${first.month} ${first.day} – ${last.day}`;
  }
  return `${first.month} ${first.day} – ${last.month} ${last.day}`;
}

export function useWeekDays(offset: number, today: string) {
  return useMemo(() => getWeekDays(offset, today), [offset, today]);
}

export function WeekGrid({
  weekOffset,
  today,
  nowMinutes,
  hourHeight,
  routinesEnabled,
  label,
}: WeekGridProps) {
  const { tasks } = useTaskStore();
  const weekDays = useWeekDays(weekOffset, today);
  const rangeLabel = label || formatWeekRange(weekDays);

  return (
    <div>
      {/* Week label */}
      <div className="flex items-baseline gap-2 mb-1 px-0.5">
        <span className="text-[8px] font-mono tracking-[0.15em] text-muted-foreground/50 uppercase">
          {rangeLabel}
        </span>
        {weekOffset === 0 && (
          <span className="text-[7px] font-mono text-primary/50 tracking-widest">THIS WEEK</span>
        )}
      </div>

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
      <div className="flex">
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
          const dayTasks = tasks.filter((t) => t.date === day.date &&
            !(!routinesEnabled && t.isRoutine !== false && t.type === 'recurring'));
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
  );
}
