import { useEffect, useRef } from 'react';
import { isNativePlatform } from '@/utils/nativePlatform';
import { useTaskStore } from '@/store/taskStore';
import { useTimezoneStore } from '@/store/timezoneStore';
import { syncTaskNotifications, getCurrentSyncFingerprint } from '@/utils/notificationService';
import type { Task } from '@/store/taskStore';
import type { NotificationLevel } from '@/utils/notificationService';

function notificationFingerprint(tasks: Task[], level: NotificationLevel, persistentOverdue: boolean): string {
  if (level === 'off') return 'off';
  const today = new Date().toISOString().split('T')[0];
  const parts = tasks
    .filter(t => t.date === today && t.time && !t.completed && !t.archivedAt && !t.inWaitingRoom)
    .map(t => `${t.id}:${t.date}:${t.time}:${t.duration}:${t.priority}:${t.title}:${t.completed}:${t.archivedAt || ''}:${t.inWaitingRoom || false}`)
    .sort();
  return `${level}:${persistentOverdue}:${parts.join('|')}`;
}

export function useNativeNotifications() {
  const tasks = useTaskStore((s) => s.tasks);
  const level = useTimezoneStore((s) => s.notificationLevel);
  const persistentOverdue = useTimezoneStore((s) => s.persistentOverdue);
  const lastFpRef = useRef('');
  const timerRef = useRef<ReturnType<typeof setTimeout>>();
  const mountedRef = useRef(false);

  useEffect(() => {
    if (!isNativePlatform()) return;

    const fp = notificationFingerprint(tasks, level, persistentOverdue);
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
      void syncTaskNotifications(tasks, level, false, persistentOverdue);
    }, delay);

    return () => clearTimeout(timerRef.current);
  }, [tasks, level, persistentOverdue]);
}
