import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { NotificationLevel } from '@/utils/notificationService';

export type MobilityMode = 'disabled' | 'normal' | 'elite';

interface TimezoneState {
  timezone: string;
  routinesFixedTime: boolean;
  autoDetect: boolean;
  darkMode: boolean;
  mobilityMode: MobilityMode;
  notificationLevel: NotificationLevel;
  persistentOverdue: boolean;
  showCompletedTasks: boolean;
  setTimezone: (tz: string) => void;
  setRoutinesFixedTime: (v: boolean) => void;
  setAutoDetect: (v: boolean) => void;
  setDarkMode: (v: boolean) => void;
  setMobilityMode: (mode: MobilityMode) => void;
  setNotificationLevel: (level: NotificationLevel) => void;
  setPersistentOverdue: (v: boolean) => void;
  setShowCompletedTasks: (v: boolean) => void;
}

export const useTimezoneStore = create<TimezoneState>()(
  persist(
    (set) => ({
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      routinesFixedTime: true,
      autoDetect: true,
      darkMode: false,
      mobilityMode: 'normal',
      notificationLevel: 'important',
      persistentOverdue: false,
      showCompletedTasks: false,
      setTimezone: (tz: string) => set({ timezone: tz }),
      setRoutinesFixedTime: (v: boolean) => set({ routinesFixedTime: v }),
      setAutoDetect: (v: boolean) => set({ autoDetect: v }),
      setDarkMode: (v: boolean) => {
        document.documentElement.classList.toggle('dark', v);
        set({ darkMode: v });
      },
      setMobilityMode: (mode: MobilityMode) => set({ mobilityMode: mode }),
      setNotificationLevel: (level: NotificationLevel) => set({ notificationLevel: level }),
      setPersistentOverdue: (v: boolean) => set({ persistentOverdue: v }),
      setShowCompletedTasks: (v: boolean) => set({ showCompletedTasks: v }),
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
