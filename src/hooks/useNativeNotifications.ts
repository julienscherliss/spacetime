import { useEffect, useRef } from 'react';
import { isNativePlatform } from '@/utils/nativePlatform';
import { useTaskStore } from '@/store/taskStore';
import { useTimezoneStore } from '@/store/timezoneStore';
import { syncTaskNotifications, getCurrentSyncFingerprint } from '@/utils/notificationService';
import type { Task } from '@/store/taskStore';
import type { NotificationLevel } from '@/utils/notificationService';

/**
 * Compute a fingerprint of only the notification-relevant fields.
 * Must match the logic in notificationService's buildFingerprint so the
 * hook can detect when the service already synced (via getCurrentSyncFingerprint).
 */
function notificationFingerprint(tasks: Task[], level: NotificationLevel, persistentOverdue: boolean): string {
  if (level === 'off') return 'off';

  const shouldNotify = (t: Task) => {
    if (level === 'all') return true;
    return (t.priority as number) >= 2;
  };

  const parts = tasks
    .filter(t => shouldNotify(t) && t.time && !t.completed)
    .map(t => `${t.id}:${t.date}:${t.time}:${t.priority}:${t.title}:${t.completed}`)
    .sort();
  return `${level}:po=${persistentOverdue}:${parts.join('|')}`;
}

/**
 * Watches for notification-relevant task or setting changes on native platforms
 * and triggers a diff-based sync. No-op on web.
 */
export function useNativeNotifications() {
  const tasks = useTaskStore((s) => s.tasks);
  const level = useTimezoneStore((s) => s.notificationLevel);
  const persistentOverdue = useTimezoneStore((s) => s.persistentOverdue);
  const lastFpRef = useRef('');
  const timerRef = useRef<ReturnType<typeof setTimeout>>();
  const mountedRef = useRef(false);
  const overdueIntervalRef = useRef<ReturnType<typeof setInterval>>();

  useEffect(() => {
    if (!isNativePlatform()) return;

    const fp = notificationFingerprint(tasks, level, persistentOverdue);

    // Skip if nothing notification-relevant changed from this hook's perspective
    if (fp === lastFpRef.current) return;

    // Also skip if the service already synced with this exact fingerprint
    const serviceFp = getCurrentSyncFingerprint();
    if (fp === serviceFp) {
      lastFpRef.current = fp;
      return;
    }

    lastFpRef.current = fp;

    // On first mount, use a longer debounce to let hydration settle
    const delay = !mountedRef.current ? 1500 : 500;
    mountedRef.current = true;

    // Debounce to batch rapid task mutations
    clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      void syncTaskNotifications(tasks, level, false, persistentOverdue);
    }, delay);

    return () => clearTimeout(timerRef.current);
  }, [tasks, level, persistentOverdue]);

  // When persistent overdue is ON, re-sync every 60s to extend the rolling window
  useEffect(() => {
    if (!isNativePlatform()) return;

    clearInterval(overdueIntervalRef.current);

    if (persistentOverdue && level !== 'off') {
      overdueIntervalRef.current = setInterval(() => {
        const currentTasks = useTaskStore.getState().tasks;
        const currentLevel = useTimezoneStore.getState().notificationLevel;
        void syncTaskNotifications(currentTasks, currentLevel, true, true);
      }, 60_000);
    }

    return () => clearInterval(overdueIntervalRef.current);
  }, [persistentOverdue, level]);
}
