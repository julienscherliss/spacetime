import { useState, useEffect } from 'react';
import { useTimezoneStore, getTodayInTz } from '@/store/timezoneStore';

export function useCurrentTime(intervalMs = 30000) {
  const [now, setNow] = useState(new Date());
  const timezone = useTimezoneStore((s) => s.timezone);

  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);

  // Get current time in the user's timezone
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    hour: 'numeric',
    minute: 'numeric',
    hour12: false,
  });
  const parts = formatter.formatToParts(now);
  const hour = parseInt(parts.find(p => p.type === 'hour')?.value || '0');
  const minute = parseInt(parts.find(p => p.type === 'minute')?.value || '0');
  const minutes = hour * 60 + minute;
  const dateStr = getTodayInTz(timezone);

  return { now, minutes, dateStr };
}

export function timeToMinutes(time: string): number {
  const [h, m] = time.split(':').map(Number);
  return h * 60 + m;
}

export function minutesToTime(mins: number): string {
  const h = Math.floor(Math.max(0, mins) / 60).toString().padStart(2, '0');
  const m = (Math.max(0, mins) % 60).toString().padStart(2, '0');
  return `${h}:${m}`;
}

/** Convert "HH:MM" or minutes to 12-hour format like "9:00 AM" */
export function formatTime12h(time: string | number): string {
  let totalMins: number;
  if (typeof time === 'number') {
    totalMins = Math.max(0, time);
  } else {
    const [h, m] = time.split(':').map(Number);
    totalMins = h * 60 + m;
  }
  const h24 = Math.floor(totalMins / 60);
  const m = totalMins % 60;
  const period = h24 >= 12 ? 'PM' : 'AM';
  const h12 = h24 === 0 ? 12 : h24 > 12 ? h24 - 12 : h24;
  return `${h12}:${m.toString().padStart(2, '0')} ${period}`;
}

/** Format hour number (0-23) to 12h label like "9 AM" */
export function formatHour12h(hour: number): string {
  const period = hour >= 12 ? 'PM' : 'AM';
  const h12 = hour === 0 ? 12 : hour > 12 ? hour - 12 : hour;
  return `${h12} ${period}`;
}

export function snapTo15(mins: number): number {
  return Math.round(mins / 15) * 15;
}

export function getWeekBounds(dateStr: string) {
  const d = new Date(dateStr + 'T12:00:00');
  const day = d.getDay();
  const monday = new Date(d);
  monday.setDate(d.getDate() - ((day + 6) % 7));
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  const fmt = (dt: Date) => `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`;
  return {
    start: fmt(monday),
    end: fmt(sunday),
  };
}
