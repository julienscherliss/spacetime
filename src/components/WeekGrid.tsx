import { useMemo } from 'react';
import { useTaskStore } from '@/store/taskStore';
import { TimelineColumn, HOURS } from '@/components/TimelineColumn';
import { formatHour12h } from '@/hooks/useCurrentTime';

interface WeekGridProps {
  weekOffset: number;
  today: string;
  nowMinutes: number;
  hourHeight: number;
  routinesEnabled: boolean;
  label?: string;
  compact?: boolean;
  dayCount?: number; // 3 for mobile, 7 for desktop
}

function getWeekDays(offset: number, today: string, count: number = 7) {
  const todayDate = new Date();
  if (count === 7) {
    // Full week starting Monday
    const monday = new Date(todayDate);
    monday.setDate(todayDate.getDate() - ((todayDate.getDay() + 6) % 7) + offset * 7);
    return Array.from({ length: 7 }, (_, i) => {
      const d = new Date(monday);
      d.setDate(monday.getDate() + i);
      const dateStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      return {
        date: dateStr,
        label: d.toLocaleDateString('en-US', { weekday: 'short' }).toUpperCase(),
        shortLabel: d.toLocaleDateString('en-US', { weekday: 'narrow' }).toUpperCase(),
        day: d.getDate(),
        month: d.toLocaleDateString('en-US', { month: 'short' }),
        isToday: dateStr === today,
      };
    });
  }
  // 3-day view centered on today + offset
  const center = new Date(todayDate);
  center.setDate(todayDate.getDate() + offset * count);
  return Array.from({ length: count }, (_, i) => {
    const d = new Date(center);
    d.setDate(center.getDate() + i);
    const dateStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    return {
      date: dateStr,
      label: d.toLocaleDateString('en-US', { weekday: 'short' }).toUpperCase(),
      shortLabel: d.toLocaleDateString('en-US', { weekday: 'narrow' }).toUpperCase(),
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

export function useWeekDays(offset: number, today: string, count: number = 7) {
  return useMemo(() => getWeekDays(offset, today, count), [offset, today, count]);
}

export function WeekGrid({
  weekOffset,
  today,
  nowMinutes,
  hourHeight,
  routinesEnabled,
  label,
  compact = false,
  dayCount = 7,
}: WeekGridProps) {
  const { tasks } = useTaskStore();
  const weekDays = useWeekDays(weekOffset, today, dayCount);
  const rangeLabel = label || formatWeekRange(weekDays);

  return (
    <div>
      {/* Week label */}
      <div className="flex items-baseline gap-2 mb-1 px-0.5">
        <span className="text-[10px] font-mono tracking-[0.12em] text-muted-foreground/50 uppercase">
          {rangeLabel}
        </span>
        {weekOffset === 0 && (
          <span className="text-[9px] font-mono text-primary/50 tracking-widest">
            {dayCount === 7 ? 'THIS WEEK' : 'NOW'}
          </span>
        )}
      </div>

      {/* Day headers */}
      <div className="flex">
        <div className={compact ? 'w-6 shrink-0' : 'w-[3.25rem] shrink-0'} />
        {weekDays.map((day) => (
          <div
            key={day.date}
            className={`flex-1 text-center py-1.5 border-b ${
              day.isToday ? 'border-primary/20' : 'border-border/40'
            }`}
          >
            <div className="text-[9px] font-mono tracking-[0.15em] text-muted-foreground/40">
              {compact ? day.shortLabel : day.label}
            </div>
            <div className={`text-sm font-display font-bold ${day.isToday ? 'text-primary' : 'text-foreground/50'}`}>
              {day.day}
            </div>
          </div>
        ))}
      </div>

      {/* Timeline */}
      <div className="flex">
        {/* Shared time labels */}
        <div className={`${compact ? 'w-6' : 'w-[3.25rem]'} shrink-0 relative`} style={{ height: HOURS.length * hourHeight }}>
          {HOURS.map((hour, i) => (
            <div
              key={hour}
              className={`absolute left-0 right-0 font-mono text-muted-foreground/60 font-medium text-right pr-1 -mt-2 select-none ${
                compact ? 'text-[8px]' : 'text-[10px]'
              }`}
              style={{ top: i * hourHeight }}
            >
              {compact ? `${hour > 12 ? hour - 12 : hour || 12}` : formatHour12h(hour)}
            </div>
          ))}
        </div>

        {/* Day columns */}
        {weekDays.map((day) => {
          const dayTasks = tasks.filter((t) => t.date === day.date && !t.inWaitingRoom &&
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
