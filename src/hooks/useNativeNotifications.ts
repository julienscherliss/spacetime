import { useEffect, useRef } from 'react';
import { isNativePlatform } from '@/utils/nativePlatform';
import { useTaskStore } from '@/store/taskStore';
import { useTimezoneStore } from '@/store/timezoneStore';
import { syncTaskNotifications, getCurrentSyncFingerprint } from '@/utils/notificationService';
import type { Task } from '@/store/taskStore';
import type { NotificationLevel } from '@/utils/notificationService';

function notificationFingerprint(tasks: Task[], level: NotificationLevel): string {
  if (level === 'off') return 'off';
  const parts = tasks
    .filter(t => t.time && !t.completed)
    .map(t => `${t.id}:${t.date}:${t.time}:${t.duration}:${t.priority}:${t.title}:${t.completed}`)
    .sort();
  return `${level}:${parts.join('|')}`;
}

export function useNativeNotifications() {
  const tasks = useTaskStore((s) => s.tasks);
  const level = useTimezoneStore((s) => s.notificationLevel);
  const lastFpRef = useRef('');
  const timerRef = useRef<ReturnType<typeof setTimeout>>();
  const mountedRef = useRef(false);

  useEffect(() => {
    if (!isNativePlatform()) return;

    const fp = notificationFingerprint(tasks, level);
    if (fp === lastFpRef.current) return;

    const serviceFp = getCurrentSyncFingerprint();
    if (fp === serviceFp) {
      lastFpRef.current = fp;
      return;
    }

    lastFpRef.current = fp;

    const delay = !mountedRef.current ? 1500 : 500;
    mountedRef.current = true;

    clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      void syncTaskNotifications(tasks, level, false);
    }, delay);

    return () => clearTimeout(timerRef.current);
  }, [tasks, level]);
}
