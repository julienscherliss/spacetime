/**
 * Unified foreground reminder hook.
 *
 * Replaces the separate useInAppSoundAlerts, useWebNotifications,
 * and partially useNativeNotifications with a single centralized
 * reminder engine that drives sound, visual, and browser notification
 * delivery from one shared timeline.
 */
import { useEffect, useRef } from 'react';
import { useTaskStore } from '@/store/taskStore';
import { useTimezoneStore } from '@/store/timezoneStore';
import {
  updateReminderEngine,
  startReminderEngine,
  stopReminderEngine,
} from '@/utils/reminderEngine';

export function useForegroundReminders() {
  const tasks = useTaskStore(s => s.tasks);
  const level = useTimezoneStore(s => s.notificationLevel);
  const soundEnabled = useTimezoneStore(s => s.soundEnabled);
  const persistentOverdue = useTimezoneStore(s => s.persistentOverdue);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>();

  // Start/stop engine on mount/unmount
  useEffect(() => {
    startReminderEngine();
    return () => stopReminderEngine();
  }, []);

  // Update engine when tasks or settings change (debounced)
  useEffect(() => {
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      updateReminderEngine(tasks, level, soundEnabled, persistentOverdue);
    }, 200);

    return () => clearTimeout(debounceRef.current);
  }, [tasks, level, soundEnabled, persistentOverdue]);

  // Handle visibility changes (tab focus/blur, sleep/wake)
  useEffect(() => {
    const handleVisibility = () => {
      if (document.visibilityState === 'visible') {
        // Force re-evaluate on wake/focus
        const t = useTaskStore.getState().tasks;
        const l = useTimezoneStore.getState().notificationLevel;
        const s = useTimezoneStore.getState().soundEnabled;
        const p = useTimezoneStore.getState().persistentOverdue;
        updateReminderEngine(t, l, s, p);
      }
    };

    document.addEventListener('visibilitychange', handleVisibility);
    return () => document.removeEventListener('visibilitychange', handleVisibility);
  }, []);
}
