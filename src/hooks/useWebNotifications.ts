import { useEffect, useRef } from 'react';
import { isNativePlatform } from '@/utils/nativePlatform';
import { useTaskStore } from '@/store/taskStore';
import { useTimezoneStore } from '@/store/timezoneStore';
import { syncWebNotifications, cancelAllWebNotifications } from '@/utils/webNotificationService';
import { syncNotificationSounds, cancelAllSounds } from '@/utils/notificationSoundService';
import type { Task } from '@/store/taskStore';
import type { NotificationLevel } from '@/utils/notificationService';

function fingerprint(tasks: Task[], level: NotificationLevel): string {
  if (level === 'off') return 'off';
  const parts = tasks
    .filter(t => t.time && !t.completed)
    .map(t => `${t.id}:${t.date}:${t.time}:${t.duration}:${t.priority}:${t.completed}`)
    .sort();
  return `${level}:${parts.join('|')}`;
}

export function useWebNotifications() {
  const tasks = useTaskStore(s => s.tasks);
  const level = useTimezoneStore(s => s.notificationLevel);
  const lastFpRef = useRef('');
  const timerRef = useRef<ReturnType<typeof setTimeout>>();

  useEffect(() => {
    // Web notifications only on non-native platforms
    if (isNativePlatform()) return;
    if (!('Notification' in window)) return;

    const fp = fingerprint(tasks, level);
    if (fp === lastFpRef.current) return;
    lastFpRef.current = fp;

    clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      syncWebNotifications(tasks, level);
      syncNotificationSounds(tasks, level);
    }, 500);

    return () => clearTimeout(timerRef.current);
  }, [tasks, level]);

  // Re-sync every minute (for time-based scheduling accuracy)
  useEffect(() => {
    if (isNativePlatform()) return;
    if (!('Notification' in window)) return;

    const interval = setInterval(() => {
      lastFpRef.current = ''; // force re-check
      const t = useTaskStore.getState().tasks;
      const l = useTimezoneStore.getState().notificationLevel;
      syncWebNotifications(t, l);
      syncNotificationSounds(t, l);
    }, 60_000);

    return () => {
      clearInterval(interval);
      cancelAllWebNotifications();
      cancelAllSounds();
    };
  }, []);
}
