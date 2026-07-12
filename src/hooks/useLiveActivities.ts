import { useEffect, useRef, useState } from 'react';
import { useTaskStore, type Task } from '@/store/taskStore';
import { useCurrentTime, timeToMinutes } from '@/hooks/useCurrentTime';
import { getLiveActivityPushTokens, syncLiveActivity, type LiveActivityPayload } from '@/native/liveActivities';
import { useLibraryStore } from '@/store/libraryStore';
import { resolveLiveActivitySymbolName } from '@/lib/liveActivitySymbols';
import { supabase } from '@/integrations/supabase/client';
import { clearLiveActivityRemoteState, syncLiveActivityRemoteState } from '@/lib/liveActivityRemoteSync';

function isoForDateTime(date: string, time: string) {
  return new Date(`${date}T${time}:00`).toISOString();
}

function addMinutesIso(date: string, time: string, duration: number) {
  const start = new Date(`${date}T${time}:00`);
  start.setMinutes(start.getMinutes() + duration);
  return start.toISOString();
}

function resolveActiveTask(tasks: Task[], today: string, nowMinutes: number, routinesEnabled: boolean) {
  const visibleScheduled = tasks
    .filter((task) =>
      !task.completed &&
      !task.archivedAt &&
      !task.inWaitingRoom &&
      task.date === today &&
      !!task.time &&
      !(!routinesEnabled && task.isRoutine !== false && task.type === 'recurring')
    )
    .sort((a, b) => (a.time || '').localeCompare(b.time || ''));

  const active = visibleScheduled.find((task) => {
    const start = timeToMinutes(task.time!);
    const end = start + (task.duration || 30);
    return nowMinutes >= start && nowMinutes < end;
  });

  const overdue = active
    ? null
    : [...visibleScheduled].reverse().find((task) => {
        const start = timeToMinutes(task.time!);
        const end = start + (task.duration || 30);
        return nowMinutes >= end;
      }) || null;

  const activeOrOverdue = active || overdue;

  if (!activeOrOverdue) return null;

  if (activeOrOverdue.type !== 'group') return activeOrOverdue;

  const child = tasks
    .filter((task) => task.groupId === activeOrOverdue.id && !task.completed && !task.archivedAt && task.time)
    .find((task) => {
      const start = timeToMinutes(task.time!);
      const end = start + (task.duration || 30);
      return active ? nowMinutes >= start && nowMinutes < end : nowMinutes >= end;
    });

  return child || activeOrOverdue;
}

function resolveNextTask(tasks: Task[], activeTask: Task, today: string, nowMinutes: number, routinesEnabled: boolean) {
  return tasks
    .filter((task) =>
      task.id !== activeTask.id &&
      !task.completed &&
      !task.archivedAt &&
      !task.inWaitingRoom &&
      task.date === today &&
      !!task.time &&
      timeToMinutes(task.time) >= nowMinutes &&
      !(!routinesEnabled && task.isRoutine !== false && task.type === 'recurring')
    )
    .sort((a, b) => timeToMinutes(a.time!) - timeToMinutes(b.time!))[0] || null;
}

function resolveUpcomingTask(tasks: Task[], today: string, nowMinutes: number, routinesEnabled: boolean) {
  return tasks
    .filter((task) =>
      !task.completed &&
      !task.archivedAt &&
      !task.inWaitingRoom &&
      task.date === today &&
      !!task.time &&
      timeToMinutes(task.time) > nowMinutes &&
      timeToMinutes(task.time) - nowMinutes <= 30 &&
      !(!routinesEnabled && task.isRoutine !== false && task.type === 'recurring')
    )
    .sort((a, b) => timeToMinutes(a.time!) - timeToMinutes(b.time!))[0] || null;
}

function resolveNextScheduledTask(tasks: Task[], today: string, nowMinutes: number, routinesEnabled: boolean) {
  return tasks
    .filter((task) =>
      !task.completed &&
      !task.archivedAt &&
      !task.inWaitingRoom &&
      !!task.date &&
      !!task.time &&
      (task.date > today || (task.date === today && timeToMinutes(task.time) > nowMinutes)) &&
      !(!routinesEnabled && task.isRoutine !== false && task.type === 'recurring')
    )
    .sort((a, b) => {
      const dateCompare = a.date.localeCompare(b.date);
      if (dateCompare !== 0) return dateCompare;
      return timeToMinutes(a.time!) - timeToMinutes(b.time!);
    })[0] || null;
}

function taskPayload(task: Task, categories: ReturnType<typeof useLibraryStore.getState>['categories'], nextTask?: Task | null): LiveActivityPayload {
  return {
    active: true,
    taskId: task.id,
    title: task.title,
    category: task.category || null,
    symbolName: resolveLiveActivitySymbolName(task, categories),
    isFreeTime: false,
    startAt: isoForDateTime(task.date, task.time!),
    endAt: addMinutesIso(task.date, task.time!, task.duration || 30),
    nextTitle: nextTask?.title || null,
    nextStartAt: nextTask?.time ? isoForDateTime(nextTask.date, nextTask.time) : null,
  };
}

export function useLiveActivities() {
  const tasks = useTaskStore((state) => state.tasks);
  const routinesEnabled = useTaskStore((state) => state.routinesEnabled);
  const categories = useLibraryStore((state) => state.categories);
  const { minutes: nowMinutes, dateStr: today } = useCurrentTime(15000);
  const [userId, setUserId] = useState<string | null>(null);
  const lastSignature = useRef<string>('');
  const lastRemoteSignature = useRef<string>('');

  useEffect(() => {
    let cancelled = false;
    supabase.auth.getUser().then(({ data }) => {
      if (!cancelled) setUserId(data.user?.id ?? null);
    });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUserId(session?.user.id ?? null);
    });
    return () => {
      cancelled = true;
      subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    const activeTask = resolveActiveTask(tasks, today, nowMinutes, routinesEnabled);
    const nextTask = activeTask ? resolveNextTask(tasks, activeTask, today, nowMinutes, routinesEnabled) : null;
    const upcomingTask = activeTask ? null : resolveUpcomingTask(tasks, today, nowMinutes, routinesEnabled);
    const nextScheduledTask = activeTask ? null : resolveNextScheduledTask(tasks, today, nowMinutes, routinesEnabled);
    const symbolName = activeTask ? resolveLiveActivitySymbolName(activeTask, categories) : 'timer';
    const localSignature = activeTask
      ? [
          activeTask.id,
          activeTask.title,
          activeTask.category || '',
          activeTask.icon || '',
          symbolName,
          activeTask.date,
          activeTask.time,
          activeTask.duration || 30,
          nextTask?.id || '',
          nextTask?.title || '',
          nextTask?.time || '',
        ].join('|')
      : upcomingTask
        ? ['free', upcomingTask.id, upcomingTask.title, upcomingTask.time].join('|')
        : 'none';

    const remoteSignature = activeTask
      ? localSignature
      : nextScheduledTask
        ? [
            'scheduled',
            nextScheduledTask.id,
            nextScheduledTask.title,
            nextScheduledTask.category || '',
            nextScheduledTask.icon || '',
            nextScheduledTask.date,
            nextScheduledTask.time,
            nextScheduledTask.duration || 30,
          ].join('|')
        : 'none';

    let localPayload: LiveActivityPayload;
    let remotePayload: LiveActivityPayload;
    if (!activeTask?.time) {
      if (upcomingTask?.time) {
        localPayload = {
          active: true,
          taskId: upcomingTask.id,
          title: 'Free time',
          category: null,
          symbolName: 'sparkles',
          isFreeTime: true,
          startAt: new Date().toISOString(),
          endAt: isoForDateTime(upcomingTask.date, upcomingTask.time),
          nextTitle: upcomingTask.title,
          nextStartAt: isoForDateTime(upcomingTask.date, upcomingTask.time),
        };
        remotePayload = nextScheduledTask?.time ? taskPayload(nextScheduledTask, categories) : localPayload;
      } else {
        localPayload = { active: false };
        remotePayload = nextScheduledTask?.time ? taskPayload(nextScheduledTask, categories) : { active: false };
      }
    } else {
      localPayload = taskPayload(activeTask, categories, nextTask);
      remotePayload = localPayload;
    }

    const shouldSyncNative = localSignature !== lastSignature.current;
    const shouldSyncRemote = !!userId && remoteSignature !== lastRemoteSignature.current;

    if (!shouldSyncNative && !shouldSyncRemote) return;

    if (shouldSyncNative) lastSignature.current = localSignature;
    if (shouldSyncRemote) lastRemoteSignature.current = remoteSignature;

    void (async () => {
      let activityToken: string | null = null;
      if (shouldSyncNative) {
        const result = await syncLiveActivity(localPayload);
        activityToken = result?.activityToken ?? null;
      }

      if (!shouldSyncRemote) return;

      if (!remotePayload.active) {
        await clearLiveActivityRemoteState(userId, remoteSignature);
        return;
      }

      const tokens = await getLiveActivityPushTokens();
      await syncLiveActivityRemoteState({
        userId,
        payload: remotePayload,
        signature: remoteSignature,
        tokens,
        activityToken,
      });
    })();
  }, [tasks, categories, today, nowMinutes, routinesEnabled, userId]);
}
