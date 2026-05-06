import type { Task } from '@/store/taskStore';

export function shouldShowScheduledTask(
  task: Task,
  { showCompleted, routinesEnabled }: { showCompleted: boolean; routinesEnabled: boolean },
) {
  if (task.inWaitingRoom) return false;
  if (task.archiveReason === 'deleted') return false;

  const isCompletedArchive = !!task.archivedAt && task.completed && task.archiveReason === 'completed';
  if (task.archivedAt && !(showCompleted && isCompletedArchive)) return false;

  const isRoutineTask = task.isRoutine !== false && task.type === 'recurring';
  if (!routinesEnabled && isRoutineTask && !isCompletedArchive) return false;

  return true;
}