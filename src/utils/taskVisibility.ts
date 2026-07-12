import type { Task } from '@/store/taskStore';

export function isCompletedArchiveTask(task: Task) {
  return !!task.archivedAt && task.completed && task.archiveReason !== 'deleted';
}

export function getLocalDateKeyFromIso(iso: string) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return undefined;
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

export function getLocalTimeKeyFromIso(iso: string) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return undefined;
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
}

export function getTaskScheduleDate(task: Task) {
  if (task.date) return task.date;
  if (!isCompletedArchiveTask(task) || !task.archivedAt) return task.date;
  return getLocalDateKeyFromIso(task.archivedAt) || task.date;
}

export function getTaskScheduleTime(task: Task) {
  if (task.time) return task.time;
  if (!isCompletedArchiveTask(task) || !task.archivedAt) return task.time;
  return getLocalTimeKeyFromIso(task.archivedAt) || task.time;
}

export function isTaskScheduledForDate(task: Task, date: string) {
  return getTaskScheduleDate(task) === date;
}

export function shouldShowScheduledTask(
  task: Task,
  { showCompleted, routinesEnabled }: { showCompleted: boolean; routinesEnabled: boolean },
) {
  if (task.inWaitingRoom) return false;
  if (task.archiveReason === 'deleted') return false;

  const isCompletedArchive = isCompletedArchiveTask(task);
  if (task.archivedAt && !(showCompleted && isCompletedArchive)) return false;

  const isRoutineTask = task.isRoutine !== false && task.type === 'recurring';
  if (!routinesEnabled && isRoutineTask && !isCompletedArchive) return false;

  return true;
}
