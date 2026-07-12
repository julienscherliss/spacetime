import type { Task } from '@/store/taskStore';

export function isCompletedArchiveTask(task: Task) {
  return !!task.archivedAt && task.completed && task.archiveReason !== 'deleted';
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
