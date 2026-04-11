import { useEffect, useRef } from 'react';
import { isNative } from '@/utils/nativePlatform';
import { useTaskStore } from '@/store/taskStore';
import { useTimezoneStore } from '@/store/timezoneStore';
import {
  rescheduleAllNotifications,
  requestNotificationPermission,
} from '@/utils/nativeNotifications';

/**
 * Watches for task or notification-level changes on native platforms
 * and reschedules all local notifications accordingly.
 * No-op on web.
 */
export function useNativeNotifications() {
  if (!isNative) return;

  const tasks = useTaskStore((s) => s.tasks);
  const level = useTimezoneStore((s) => s.notificationLevel);
  const didInit = useRef(false);

  useEffect(() => {
    if (level === 'off') return;

    // Request permission once on first meaningful render
    if (!didInit.current) {
      didInit.current = true;
      requestNotificationPermission();
    }

    rescheduleAllNotifications(tasks, level);
  }, [tasks, level]);
}
