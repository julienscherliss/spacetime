import type { Task } from '@/store/taskStore';

export type FocusEntryPanel = 'completed' | 'detail';
export type AppEntryDestination =
  | { view: 'day'; date: string; reason: 'overdue' | 'idle' }
  | { view: 'focus'; date: string; panel: FocusEntryPanel; taskId: string };

/** One instant supplies both the date and clock, including at zoned midnight. */
export function getAppClock(now: Date, timezone: string) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).formatToParts(now);
  const value = (type: Intl.DateTimeFormatPartTypes) => parts.find(p => p.type === type)!.value;
  return { date: `${value('year')}-${value('month')}-${value('day')}`,
    minutes: Number(value('hour')) * 60 + Number(value('minute')) };
}

export function scheduledWindow(task: Task) {
  if (!task.time || !/^\d{2}:\d{2}(?::\d{2})?$/.test(task.time)) return null;
  const [hour, minute, second = 0] = task.time.split(':').map(Number);
  if (hour > 23 || minute > 59 || second > 59) return null;
  const duration = task.duration || 30;
  if (!Number.isFinite(duration) || duration < 0) return null;
  const start = hour * 60 + minute;
  return { start, end: start + duration };
}

export function eligibleTodayTasks(tasks: Task[], date: string, routinesEnabled: boolean) {
  const eligible = (t: Task) => t.date === date && !t.completed && !t.archivedAt &&
    t.archiveReason !== 'deleted' && !t.inWaitingRoom &&
    !(!routinesEnabled && t.isRoutine !== false &&
      (t.isRoutine === true || t.type === 'recurring' || !!t.recurrence));
  const parents = new Map(tasks.filter(t => t.type === 'group').map(t => [t.id, t]));
  return tasks.filter(t => eligible(t) && (!t.groupId ||
    (parents.has(t.groupId) && eligible(parents.get(t.groupId)!))));
}

export function resolveFocusTask(root: Task | undefined, eligible: Task[], minutes: number) {
  if (!root || root.type !== 'group') return { activeTask: root, parentGroup: undefined };
  const children = eligible.filter(t => t.groupId === root.id)
    .sort((a, b) => (a.groupOrder ?? 0) - (b.groupOrder ?? 0));
  const live = children.find(t => {
    const window = scheduledWindow(t);
    return window && minutes >= window.start && minutes < window.end;
  });
  return { activeTask: live || children[0] || root, parentGroup: root };
}

/** Containers select a child for Focus; children retain their own overdue status. */
export function getFocusSchedule(tasks: Task[], date: string, minutes: number, routinesEnabled: boolean) {
  const eligible = eligibleTodayTasks(tasks, date, routinesEnabled);
  const roots = eligible.filter(t => !t.groupId && scheduledWindow(t))
    .sort((a, b) => scheduledWindow(a)!.start - scheduledWindow(b)!.start);
  const activeRoot = roots.find(t => {
    const window = scheduledWindow(t)!;
    return minutes >= window.start && minutes < window.end;
  });
  const overdue = eligible.some(t => {
    const window = scheduledWindow(t);
    return window && minutes >= window.end;
  });
  return { eligible, roots, activeRoot, overdue, ...resolveFocusTask(activeRoot, eligible, minutes) };
}

export function chooseAppEntryDestination(tasks: Task[], routinesEnabled: boolean, timezone: string,
  now = new Date()): AppEntryDestination {
  const { date, minutes } = getAppClock(now, timezone);
  const { overdue, activeTask } = getFocusSchedule(tasks, date, minutes, routinesEnabled);
  if (overdue) return { view: 'day', date, reason: 'overdue' };
  if (!activeTask) return { view: 'day', date, reason: 'idle' };
  return { view: 'focus', date, panel: activeTask.subtasks?.length ? 'detail' : 'completed', taskId: activeTask.id };
}
