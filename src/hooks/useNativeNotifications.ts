import { useEffect, useRef } from 'react';
import { isNativePlatform } from '@/utils/nativePlatform';
import { useTaskStore } from '@/store/taskStore';
import { useTimezoneStore } from '@/store/timezoneStore';
import { syncTaskNotifications } from '@/utils/notificationService';
import type { Task } from '@/store/taskStore';
import type { NotificationLevel } from '@/utils/notificationService';

/**
 * Compute a fingerprint of only the notification-relevant fields.
 * This prevents re-syncing when unrelated task fields change (e.g. description edits).
 */
function notificationFingerprint(tasks: Task[], level: NotificationLevel): string {
  if (level === 'off') return 'off';
  const parts = tasks
    .filter(t => !t.completed && t.time)
    .map(t => `${t.id}|${t.date}|${t.time}|${t.priority}|${t.title}`)
    .sort();
  return `${level}:${parts.join(',')}`;
}

/**
 * Watches for notification-relevant task or setting changes on native platforms
 * and triggers a diff-based sync. No-op on web.
 *
 * Guards against:
 * - Re-syncing on every render (fingerprint check)
 * - Re-syncing on unrelated state changes (selective field extraction)
 * - Multiple syncs during startup (debounce + in-flight guard in service)
 */
export function useNativeNotifications() {
  const tasks = useTaskStore((s) => s.tasks);
  const level = useTimezoneStore((s) => s.notificationLevel);
  const lastFpRef = useRef('');
  const timerRef = useRef<ReturnType<typeof setTimeout>>();

  useEffect(() => {
    if (!isNativePlatform()) return;

    const fp = notificationFingerprint(tasks, level);

    // Skip if nothing notification-relevant changed
    if (fp === lastFpRef.current) return;
    lastFpRef.current = fp;

    // Debounce: wait 500ms after last change to batch rapid task mutations
    clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      void syncTaskNotifications(tasks, level);
    }, 500);

    return () => clearTimeout(timerRef.current);
  }, [tasks, level]);
}
