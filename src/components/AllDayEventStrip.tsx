import { useMemo } from 'react';
import { Calendar as CalIcon } from 'lucide-react';
import { useCalendarStore } from '@/store/calendarStore';

interface AllDayEventStripProps {
  dates: string[];
  compact?: boolean;
}

export function AllDayEventStrip({ dates, compact = false }: AllDayEventStripProps) {
  const events = useCalendarStore((s) => s.events);
  const calendars = useCalendarStore((s) => s.calendars);
  const setEditingEvent = useCalendarStore((s) => s.setEditingEvent);

  const eventsByDate = useMemo(() => {
    const grouped = new Map<string, typeof events>();

    dates.forEach((date) => {
      grouped.set(
        date,
        events.filter((event) => event.isAllDay && event.date === date)
      );
    });

    return grouped;
  }, [dates, events]);

  const hasAnyEvents = Array.from(eventsByDate.values()).some((dayEvents) => dayEvents.length > 0);

  if (!hasAnyEvents) return null;

  const renderEvent = (event: (typeof events)[number]) => {
    const calendar = calendars.find((cal) => cal.google_calendar_id === event.calendarId);

    return (
      <button
        key={event.id}
        onClick={() => setEditingEvent(event.id)}
        className="w-full rounded-sm border border-border/40 bg-muted/40 px-2 py-1.5 text-left transition-colors hover:bg-muted/60"
        style={{ borderLeftWidth: '3px', borderLeftColor: calendar?.color || 'hsl(var(--primary))' }}
      >
        <div className="flex items-center gap-1.5">
          <CalIcon size={9} className="shrink-0 text-muted-foreground/35" />
          <span className="truncate text-[10px] font-mono text-foreground/75">{event.title}</span>
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
          {dayEvents.map(renderEvent)}
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
                {dayEvents.map(renderEvent)}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}