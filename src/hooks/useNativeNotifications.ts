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
function notificationFingerprint(tasks: Task[], level: NotificationLevel): string {
  if (level === 'off') return 'off';

  const shouldNotify = (t: Task) => {
    if (level === 'all') return true;
    return (t.priority as number) >= 2;
  };

  const parts = tasks
    .filter(t => shouldNotify(t) && t.time && !t.completed)
    .map(t => `${t.id}:${t.date}:${t.time}:${t.priority}:${t.title}`)
    .sort();
  return `${level}:${parts.join('|')}`;
}

/**
 * Watches for notification-relevant task or setting changes on native platforms
 * and triggers a diff-based sync. No-op on web.
 *
 * Guards against:
 * - Re-syncing on every render (fingerprint check)
 * - Re-syncing on unrelated state changes (selective field extraction)
 * - Duplicate sync when SettingsPanel already did a forced sync (compares
 *   against the service's current fingerprint)
 * - Multiple syncs during startup (debounce + in-flight guard in service)
 */
export function useNativeNotifications() {
  const tasks = useTaskStore((s) => s.tasks);
  const level = useTimezoneStore((s) => s.notificationLevel);
  const lastFpRef = useRef('');
  const timerRef = useRef<ReturnType<typeof setTimeout>>();
  const mountedRef = useRef(false);

  useEffect(() => {
    if (!isNativePlatform()) return;

    const fp = notificationFingerprint(tasks, level);

    // Skip if nothing notification-relevant changed from this hook's perspective
    if (fp === lastFpRef.current) return;

    // Also skip if the service already synced with this exact fingerprint
    // (e.g. SettingsPanel did a forced sync that updated the service fingerprint)
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
      void syncTaskNotifications(tasks, level);
    }, delay);

    return () => clearTimeout(timerRef.current);
  }, [tasks, level]);
}
