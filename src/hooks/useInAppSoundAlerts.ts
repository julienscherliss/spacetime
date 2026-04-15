/**
 * Independent in-app sound alert system.
 * Runs completely separately from browser/native notifications.
 * Uses the same notification level settings but doesn't depend on
 * Notification API being available.
 */
import { useEffect, useRef } from 'react';
import { useTaskStore } from '@/store/taskStore';
import { useTimezoneStore } from '@/store/timezoneStore';
import { syncNotificationSounds, cancelAllSounds } from '@/utils/notificationSoundService';

export function useInAppSoundAlerts() {
  const tasks = useTaskStore(s => s.tasks);
  const level = useTimezoneStore(s => s.notificationLevel);
  const soundEnabled = useTimezoneStore(s => s.soundEnabled);
  const timerRef = useRef<ReturnType<typeof setTimeout>>();

  // Sync whenever tasks or settings change
  useEffect(() => {
    if (!soundEnabled || level === 'off') {
      cancelAllSounds();
      return;
    }

    clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      syncNotificationSounds(tasks, level);
    }, 300);

    return () => clearTimeout(timerRef.current);
  }, [tasks, level, soundEnabled]);

  // Re-sync every 30 seconds for time-accuracy (overdue reminders, countdowns)
  useEffect(() => {
    if (!soundEnabled || level === 'off') return;

    const interval = setInterval(() => {
      const t = useTaskStore.getState().tasks;
      const l = useTimezoneStore.getState().notificationLevel;
      const s = useTimezoneStore.getState().soundEnabled;
      if (!s || l === 'off') return;
      syncNotificationSounds(t, l);
    }, 30_000);

    return () => {
      clearInterval(interval);
      cancelAllSounds();
    };
  }, [soundEnabled, level]);
}
