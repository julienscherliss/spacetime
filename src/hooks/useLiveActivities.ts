import { useEffect, useRef } from 'react';
import { useTaskStore, type Task } from '@/store/taskStore';
import { useCurrentTime, timeToMinutes } from '@/hooks/useCurrentTime';
import { syncLiveActivity } from '@/native/liveActivities';
import { useLibraryStore } from '@/store/libraryStore';
import { resolveLiveActivitySymbolName } from '@/lib/liveActivitySymbols';

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

export function useLiveActivities() {
  const tasks = useTaskStore((state) => state.tasks);
  const routinesEnabled = useTaskStore((state) => state.routinesEnabled);
  const categories = useLibraryStore((state) => state.categories);
  const { minutes: nowMinutes, dateStr: today } = useCurrentTime(15000);
  const lastSignature = useRef<string>('');

  useEffect(() => {
    const activeTask = resolveActiveTask(tasks, today, nowMinutes, routinesEnabled);
    const nextTask = activeTask ? resolveNextTask(tasks, activeTask, today, nowMinutes, routinesEnabled) : null;
    const upcomingTask = activeTask ? null : resolveUpcomingTask(tasks, today, nowMinutes, routinesEnabled);
    const symbolName = activeTask ? resolveLiveActivitySymbolName(activeTask, categories) : 'timer';
    const signature = activeTask
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

    if (signature === lastSignature.current) return;
    lastSignature.current = signature;

    if (!activeTask?.time) {
      if (upcomingTask?.time) {
        void syncLiveActivity({
          active: true,
          taskId: `free-${upcomingTask.id}`,
          title: 'Free time',
          category: null,
          symbolName: 'sparkles',
          isFreeTime: true,
          startAt: new Date().toISOString(),
          endAt: isoForDateTime(upcomingTask.date, upcomingTask.time),
          nextTitle: upcomingTask.title,
          nextStartAt: isoForDateTime(upcomingTask.date, upcomingTask.time),
        });
        return;
      }

      void syncLiveActivity({ active: false });
      return;
    }

    void syncLiveActivity({
      active: true,
      taskId: activeTask.id,
      title: activeTask.title,
      category: activeTask.category || null,
      symbolName,
      isFreeTime: false,
      startAt: isoForDateTime(activeTask.date, activeTask.time),
      endAt: addMinutesIso(activeTask.date, activeTask.time, activeTask.duration || 30),
      nextTitle: nextTask?.title || null,
      nextStartAt: nextTask?.time ? isoForDateTime(nextTask.date, nextTask.time) : null,
    });
  }, [tasks, categories, today, nowMinutes, routinesEnabled]);
}
