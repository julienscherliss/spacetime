import { useState, useEffect } from 'react';

export function useCurrentTime(intervalMs = 30000) {
  const [now, setNow] = useState(new Date());

  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);

  const minutes = now.getHours() * 60 + now.getMinutes();
  const dateStr = now.toISOString().split('T')[0];

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
  return {
    start: monday.toISOString().split('T')[0],
    end: sunday.toISOString().split('T')[0],
  };
}
