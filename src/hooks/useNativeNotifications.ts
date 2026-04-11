import { useEffect } from 'react';
import { isNative } from '@/utils/nativePlatform';
import { useTaskStore } from '@/store/taskStore';
import { useTimezoneStore } from '@/store/timezoneStore';
import {
  checkNotificationPermission,
  rescheduleAllNotifications,
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

  useEffect(() => {
    void (async () => {
      if (level === 'off') {
        await rescheduleAllNotifications(tasks, 'off');
        return;
      }

      const permission = await checkNotificationPermission();
      console.log('[notifications] startup reschedule gate', { permission, level });
      if (permission !== 'granted') return;

      await rescheduleAllNotifications(tasks, level);
    })();
  }, [tasks, level]);
}
