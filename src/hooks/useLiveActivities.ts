import { useEffect, useRef, useState } from 'react';
import { Capacitor } from '@capacitor/core';
import { App } from '@capacitor/app';
import { useTaskStore, type Task } from '@/store/taskStore';
import { useCurrentTime, timeToMinutes } from '@/hooks/useCurrentTime';
import { getLiveActivityPushTokens, syncLiveActivity, type LiveActivityPayload } from '@/native/liveActivities';
import { useLibraryStore } from '@/store/libraryStore';
import { resolveLiveActivitySymbolName } from '@/lib/liveActivitySymbols';
import { supabase } from '@/integrations/supabase/client';
import { syncLiveActivityRemoteState } from '@/lib/liveActivityRemoteSync';

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
  const { now, minutes: nowMinutes, dateStr: today } = useCurrentTime(15000);
  const [userId, setUserId] = useState<string | null>(null);
  const lastSignature = useRef<string>('');
  const lastRemoteSignature = useRef<string>('');
  const syncInFlight = useRef(false);
  const lastTokenSignature = useRef('');
  const authOwner = useRef({ userId: null as string | null, generation: 0, mounted: true });
  const pendingRefresh = useRef(false);
  const [completionVersion, setCompletionVersion] = useState(0);
  const [foregroundVersion, setForegroundVersion] = useState(0);

  useEffect(() => {
    if (!Capacitor.isNativePlatform() || Capacitor.getPlatform() !== 'ios') return;
    let disposed = false;
    const listener = App.addListener('appStateChange', ({ isActive }) => {
      if (!isActive || disposed) return;
      lastSignature.current = '';
      lastRemoteSignature.current = '';
      setForegroundVersion((value) => value + 1);
    });
    return () => {
      disposed = true;
      void listener.then((handle) => handle.remove());
    };
  }, []);

  useEffect(() => {
    authOwner.current.mounted = true;
    let authEventReceived = false;
    let disposed = false;
    const updateOwner = (id: string | null) => {
      if (disposed || !authOwner.current.mounted) return;
      if (authOwner.current.userId !== id) {
        authOwner.current = { userId: id, generation: authOwner.current.generation + 1, mounted: true };
        lastSignature.current = '';
        lastRemoteSignature.current = '';
        lastTokenSignature.current = '';
      }
      setUserId(id);
    };
    supabase.auth.getUser().then(({ data }) => {
      if (!authEventReceived) updateOwner(data.user?.id ?? null);
    });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      authEventReceived = true;
      updateOwner(session?.user.id ?? null);
    });
    return () => {
      disposed = true;
      authOwner.current = { userId: null, generation: authOwner.current.generation + 1, mounted: false };
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
    const remoteKey = `${userId ?? ''}:${remoteSignature}`;
    const shouldSyncRemote = !!userId && remoteKey !== lastRemoteSignature.current;

    const nativeIos = Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'ios';
    // Read a bounded snapshot on each 15-second tick, independent of task edits.
    // Unchanged credentials do not cause a backend write after registration.
    if (!shouldSyncNative && !shouldSyncRemote && !(nativeIos && userId)) return;
    if (syncInFlight.current) {
      pendingRefresh.current = true;
      return;
    }
    const ownerGeneration = authOwner.current.generation;
    const isCurrent = () => authOwner.current.mounted &&
      authOwner.current.generation === ownerGeneration && authOwner.current.userId === userId;
    syncInFlight.current = true;

    void (async () => {
      try {
        let activityToken: string | null = null;
        if (shouldSyncNative) {
          const result = await syncLiveActivity(localPayload);
          if (!isCurrent()) return;
          activityToken = result?.activityToken ?? null;
          if (!nativeIos || (result?.active === localPayload.active && (!localPayload.active || activityToken))) {
            lastSignature.current = localSignature;
          }
        }

        if (!userId || !isCurrent()) return;
        const tokens = await getLiveActivityPushTokens();
        if (!isCurrent() || (nativeIos && !tokens)) return;
        const tokenSignature = JSON.stringify([
          tokens?.pushToStartToken ?? null, tokens?.apnsEnvironment ?? null,
          tokens?.bundleIdentifier ?? null, tokens?.available ?? null,
          tokens?.activityTaskIds ?? [], tokens?.activityTokens ?? [],
        ]);
        const registrationPending = nativeIos && (!tokens ||
          (tokens.supportsPushToStart && !tokens.pushToStartToken));
        if (!shouldSyncRemote && !shouldSyncNative && !registrationPending &&
            tokenSignature === lastTokenSignature.current) return;
        const localActivityTaskId = tokens?.activityTaskIds
          ? tokens.activityTaskIds.find((id) => id === localPayload.taskId) ?? tokens.activityTaskIds[0] ?? null
          : undefined;
        await syncLiveActivityRemoteState({
          userId,
          payload: remotePayload,
          signature: remoteSignature,
          tokens,
          activityToken,
          localActivityTaskId,
          isCurrent,
        });
        if (isCurrent() && !registrationPending) {
          lastRemoteSignature.current = remoteKey;
          lastTokenSignature.current = tokenSignature;
        }
      } catch (error) {
        console.warn('[live-activity] remote sync failed', error);
      } finally {
        syncInFlight.current = false;
        if (pendingRefresh.current && authOwner.current.mounted) {
          pendingRefresh.current = false;
          setCompletionVersion((value) => value + 1);
        }
      }
    })();
  }, [tasks, categories, today, nowMinutes, now, routinesEnabled, userId, foregroundVersion, completionVersion]);
}
