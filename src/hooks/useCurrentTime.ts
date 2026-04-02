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
