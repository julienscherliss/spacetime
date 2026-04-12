import { useMemo } from 'react';
import { Calendar as CalIcon } from 'lucide-react';
import { useCalendarStore, eventSpansDate } from '@/store/calendarStore';

interface AllDayEventStripProps {
  dates: string[];
  compact?: boolean;
}

export function AllDayEventStrip({ dates, compact = false }: AllDayEventStripProps) {
  const events = useCalendarStore((s) => s.events);
  const calendars = useCalendarStore((s) => s.calendars);
  const completedEventIds = useCalendarStore((s) => s.completedEventIds);
  const deletedEventIds = useCalendarStore((s) => s.deletedEventIds);
  const setEditingEvent = useCalendarStore((s) => s.setEditingEvent);

  const eventsByDate = useMemo(() => {
    const grouped = new Map<string, typeof events>();
    const visibleCalIds = new Set(calendars.filter(c => c.visible).map(c => c.google_calendar_id));
    const visibleEvents = events.filter(e => !deletedEventIds.includes(e.id) && visibleCalIds.has(e.calendarId));

    dates.forEach((date) => {
      grouped.set(
        date,
        visibleEvents.filter((event) => event.isAllDay && eventSpansDate(event, date))
      );
    });

    return grouped;
  }, [dates, events, deletedEventIds, calendars]);

  const hasAnyEvents = Array.from(eventsByDate.values()).some((dayEvents) => dayEvents.length > 0);

  if (!hasAnyEvents) return null;

  const renderEvent = (event: (typeof events)[number], date: string) => {
    const calendar = calendars.find((cal) => cal.google_calendar_id === event.calendarId);
    const color = calendar?.color || 'hsl(var(--primary))';
    const isCompleted = completedEventIds.includes(event.id);
    const isMultiDay = !!event.endDate;
    const isStart = event.date === date;
    const isEnd = !event.endDate || event.endDate === date;

    return (
      <button
        key={`${event.id}-${date}`}
        onClick={() => setEditingEvent(event.id)}
        className={`w-full px-2 py-1.5 text-left transition-colors hover:bg-muted/60 ${
          isCompleted ? 'opacity-50' : ''
        } ${isMultiDay
          ? `${isStart ? 'rounded-l-sm' : ''} ${isEnd ? 'rounded-r-sm' : ''} ${!isStart && !isEnd ? '' : ''}`
          : 'rounded-sm'
        }`}
        style={{
          borderWidth: '1.5px',
          borderColor: color,
          borderStyle: 'solid',
          backgroundColor: isCompleted ? undefined : `${color}08`,
        }}
      >
        <div className="flex items-center gap-1.5">
          <CalIcon size={9} className="shrink-0 text-muted-foreground/35" />
          <span className={`truncate text-[10px] font-mono ${
            isCompleted ? 'line-through text-muted-foreground/30' : 'text-foreground/75'
          }`}>{event.title}</span>
        </div>
      </button>
    );
  };

  if (dates.length === 1) {
    const dayEvents = eventsByDate.get(dates[0]) || [];

    return (
      <div className="mt-2 mb-3 rounded-sm border border-border/30 bg-card/70 p-2">
        <div className="mb-2 text-[9px] font-mono tracking-[0.18em] text-muted-foreground/45">ALL DAY</div>
        <div className="space-y-1.5">
          {dayEvents.map(e => renderEvent(e, dates[0]))}
        </div>
      </div>
    );
  }

  return (
    <div className="mt-2 mb-3 overflow-hidden rounded-sm border border-border/30 bg-card/70">
      <div
        className="grid gap-px bg-border/20"
        style={{ gridTemplateColumns: `repeat(${dates.length}, minmax(0, 1fr))` }}
      >
        {dates.map((date) => {
          const dayEvents = eventsByDate.get(date) || [];

          return (
            <div key={date} className="min-w-0 bg-background/80 p-2">
              <div className="mb-1.5 text-[8px] font-mono tracking-[0.16em] text-muted-foreground/40">
                {new Date(`${date}T12:00:00`).toLocaleDateString('en-US', {
                  weekday: compact ? 'narrow' : 'short',
                })}
              </div>
              <div className="space-y-1">
                {dayEvents.map(e => renderEvent(e, date))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
