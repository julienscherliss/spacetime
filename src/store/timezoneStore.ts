import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface TimezoneState {
  timezone: string;
  setTimezone: (tz: string) => void;
}

export const useTimezoneStore = create<TimezoneState>()(
  persist(
    (set) => ({
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      setTimezone: (tz: string) => set({ timezone: tz }),
    }),
    { name: 'do-timezone' }
  )
);

/** Format a local date string for display in the user's chosen timezone */
export function formatDateInTz(dateStr: string, tz: string): string {
  const d = new Date(dateStr + 'T12:00:00');
  return d.toLocaleDateString('en-US', { timeZone: tz, weekday: 'short', month: 'short', day: 'numeric' });
}

/** Get the current date string (YYYY-MM-DD) in the user's chosen timezone */
export function getTodayInTz(tz: string): string {
  const now = new Date();
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(now);
  const y = parts.find(p => p.type === 'year')!.value;
  const m = parts.find(p => p.type === 'month')!.value;
  const d = parts.find(p => p.type === 'day')!.value;
  return `${y}-${m}-${d}`;
}

/** Get short timezone label like "EST", "PST", "CET" */
export function getTzAbbr(tz: string): string {
  const fmt = new Intl.DateTimeFormat('en-US', { timeZone: tz, timeZoneName: 'short' });
  const parts = fmt.formatToParts(new Date());
  return parts.find(p => p.type === 'timeZoneName')?.value || tz;
}

/** Common timezone list for the selector */
export const TIMEZONES: string[] = (Intl as any).supportedValuesOf('timeZone');
