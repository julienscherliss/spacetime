import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { getWeekBounds } from '@/hooks/useCurrentTime';
import type { Subtask } from '@/components/SubtaskList';
import { useTimezoneStore } from '@/store/timezoneStore';
import { cancelNotificationsForTask } from '@/utils/notificationService';
import { cancelWebNotificationsForTask } from '@/utils/webNotificationService';
import { playUISound } from '@/utils/soundEngine';
import { getOccupiedSlots, findValidPosition } from '@/utils/collisionDetection';
import { timeToMinutes, minutesToTime } from '@/hooks/useCurrentTime';

export type Priority = 0 | 1 | 2 | 3;
export type TaskType = 'one-time' | 'recurring';
export type ViewMode = 'focus' | 'day' | 'week' | 'calendar';
export type DaySubMode = 'timeline' | 'list';

export type CustomUnit = 'days' | 'weeks' | 'months' | 'years';

export type RecurrencePattern =
  | { type: 'daily' }
  | { type: 'weekly'; days: number[] }
  | { type: 'monthly'; dayOfMonth: number }
  | { type: 'yearly'; month: number; dayOfMonth: number }
  | { type: 'weekdays' }
  | { type: 'custom'; interval: number; unit: CustomUnit; days?: number[] };

export interface Task {
  id: string;
  title: string;
  category?: string;
  description?: string;
  subtasks?: Subtask[];
  type: TaskType;
  priority: Priority;
  originalPriority: Priority;
  date: string;
  time?: string;
  duration?: number;
  completed: boolean;
  createdAt: string;
  moveCount: number;
  recurrence?: RecurrencePattern;
  recurrenceParentId?: string;
  isRecurrenceInstance?: boolean;
  isRoutine?: boolean;
  linked?: boolean;
  seriesId?: string;
  linkedGroupId?: string;
  detachedFromSeries?: boolean;
  inWaitingRoom?: boolean;
  waitingRoomCount?: number;
  dueDate?: string;
  archivedAt?: string;
  archiveReason?: 'completed' | 'deleted';
  attachments?: { name: string; url: string; type: string }[];
  reminders?: number[];
}

export interface DailyStats {
  completed: number;
  total: number;
  pushed: number;
}

export type MoveValidation =
  | { allowed: true }
  | { allowed: false; reason: string };

export interface ListReturnZoom {
  taskTime: string;
  taskDuration: number;
}

interface TaskState {
  tasks: Task[];
  viewMode: ViewMode;
  daySubMode: DaySubMode;
  routinesEnabled: boolean;
  focusTaskId: string | null;
  editingTaskId: string | null;
  showCompletionStats: boolean;
  dailyStats: DailyStats | null;
  navigateToDate: string | null;
  currentDate: string | null;
  listReturnZoom: ListReturnZoom | null;
  showListReturn: boolean;

  setViewMode: (mode: ViewMode) => void;
  setDaySubMode: (mode: DaySubMode) => void;
  setNavigateToDate: (date: string | null) => void;
  setCurrentDate: (date: string | null) => void;
  setListReturnZoom: (zoom: ListReturnZoom | null) => void;
  setShowListReturn: (show: boolean) => void;
  toggleRoutines: () => void;
  addTask: (task: Omit<Task, 'id' | 'createdAt' | 'completed' | 'moveCount' | 'originalPriority'> & { isRoutine?: boolean }) => void;
  updateTask: (id: string, updates: Partial<Task>) => void;
  updateFutureInstances: (taskId: string, fromDate: string, updates: Partial<Task>) => void;
  completeTask: (id: string) => void;
  uncompleteTask: (id: string) => void;
  deleteTask: (id: string) => void;
  archiveTask: (id: string, reason: 'completed' | 'deleted') => void;
  restoreTask: (id: string) => void;
  getArchivedTasks: () => Task[];
  deleteFutureInstances: (parentId: string, fromDate: string) => void;
  removeInstances: (parentId: string) => void;
  deleteRecurrenceSeries: (parentId: string) => void;
  canMoveTask: (id: string, newDate: string) => MoveValidation;
  moveTask: (id: string, newDate: string, newTime?: string) => { blocked: boolean };
  resizeTask: (id: string, newTime: string, newDuration: number) => void;
  reorderTask: (id: string, newTime: string) => void;
  skipFocusTask: () => void;
  setFocusTask: (id: string | null) => void;
  setEditingTask: (id: string | null) => void;
  getTasksForDate: (date: string) => Task[];
  getCurrentFocusTask: () => Task | undefined;
  getNextTask: (currentId: string) => Task | undefined;
  getDailyStats: () => DailyStats;
  dismissCompletionStats: () => void;
  generateRecurringInstances: (startDate: string, endDate: string) => void;
  moveOverdueToWaitingRoom: () => void;
  linkSeriesFromDate: (taskId: string, fromDate: string, linked: boolean) => void;
}

const generateId = () => crypto.randomUUID();

function deriveType(recurrence?: RecurrencePattern): TaskType {
  return recurrence ? 'recurring' : 'one-time';
}

function getLinkedScheduleTargetIds(tasks: Task[], activeTask: Task): Set<string> {
  const targetIds = new Set<string>([activeTask.id]);

  if (activeTask.linked !== true || !activeTask.linkedGroupId) {
    return targetIds;
  }

  const groupId = activeTask.linkedGroupId;
  tasks.forEach((candidate) => {
    if (candidate.id === activeTask.id) return;
    if (candidate.completed) return;
    if (candidate.linked !== true) return;
    if (candidate.linkedGroupId !== groupId) return;
    targetIds.add(candidate.id);
  });

  return targetIds;
}

function getTaskSeriesId(task: Task): string {
  return task.seriesId || task.recurrenceParentId || task.id;
}

function isTaskInSameSeries(candidate: Task, seriesId: string): boolean {
  return (
    candidate.id === seriesId ||
    candidate.seriesId === seriesId ||
    candidate.recurrenceParentId === seriesId
  );
}

function sortTasksBySeriesOrder(tasks: Task[]): Task[] {
  return [...tasks].sort((a, b) => {
    if (a.date !== b.date) return a.date.localeCompare(b.date);
    return a.createdAt.localeCompare(b.createdAt);
  });
}

function computeEffectivePriority(task: Task, today: string): Priority {
  const mobilityMode = useTimezoneStore.getState().mobilityMode;
  if (mobilityMode === 'disabled') return task.priority;
  if (!task.dueDate) return task.priority;

  let minPriority = task.priority;

  if (task.dueDate <= today) {
    minPriority = Math.max(minPriority, 2) as Priority;
  } else {
    const weekBounds = getWeekBounds(today);
    if (task.dueDate <= weekBounds.end) {
      minPriority = Math.max(minPriority, 1) as Priority;
    }
  }

  return minPriority as Priority;
}

function resolveGeneratedLinkState(seriesTasks: Task[], occurrenceDate: string): { linked: boolean; linkedGroupId?: string } {
  let activeLinkedGroupId: string | undefined;

  for (const task of sortTasksBySeriesOrder(seriesTasks)) {
    if (task.date > occurrenceDate) break;
    if (task.linked === true && task.linkedGroupId) {
      activeLinkedGroupId = task.linkedGroupId;
    }
  }

  return {
    linked: !!activeLinkedGroupId,
    linkedGroupId: activeLinkedGroupId,
  };
}

function addDays(dateStr: string, n: number): string {
  const d = new Date(dateStr + 'T12:00:00');
  d.setDate(d.getDate() + n);
  return d.toISOString().split('T')[0];
}

function addMonths(dateStr: string, n: number, dayOfMonth: number): string {
  const d = new Date(dateStr + 'T12:00:00');
  d.setMonth(d.getMonth() + n);
  const lastDay = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
  d.setDate(Math.min(dayOfMonth, lastDay));
  return d.toISOString().split('T')[0];
}

function addYears(dateStr: string, n: number, month: number, dayOfMonth: number): string {
  const d = new Date(dateStr + 'T12:00:00');
  d.setFullYear(d.getFullYear() + n);
  d.setMonth(month);
  const lastDay = new Date(d.getFullYear(), month + 1, 0).getDate();
  d.setDate(Math.min(dayOfMonth, lastDay));
  return d.toISOString().split('T')[0];
}

function getDayOfWeek(dateStr: string): number {
  return new Date(dateStr + 'T12:00:00').getDay();
}

function getAllOccurrences(
  pattern: RecurrencePattern,
  startDate: string,
  rangeStart: string,
  rangeEnd: string
): string[] {
  const dates: string[] = [];
  const limit = 200;

  switch (pattern.type) {
    case 'daily': {
      let cur = startDate;
      for (let i = 0; i < limit; i++) {
        if (cur > rangeEnd) break;
        if (cur >= rangeStart) dates.push(cur);
        cur = addDays(cur, 1);
      }
      break;
    }
    case 'weekdays': {
      let cur = startDate;
      for (let i = 0; i < limit; i++) {
        if (cur > rangeEnd) break;
        const dow = getDayOfWeek(cur);
        if (dow >= 1 && dow <= 5 && cur >= rangeStart) dates.push(cur);
        cur = addDays(cur, 1);
      }
      break;
    }
    case 'weekly': {
      let cur = startDate;
      for (let i = 0; i < limit; i++) {
        if (cur > rangeEnd) break;
        if (pattern.days.includes(getDayOfWeek(cur)) && cur >= rangeStart) {
          dates.push(cur);
        }
        cur = addDays(cur, 1);
      }
      break;
    }
    case 'monthly': {
      let cur = startDate;
      for (let i = 0; i < limit; i++) {
        if (cur > rangeEnd) break;
        if (cur >= rangeStart) dates.push(cur);
        cur = addMonths(cur, 1, pattern.dayOfMonth);
      }
      break;
    }
    case 'yearly': {
      let cur = startDate;
      for (let i = 0; i < limit; i++) {
        if (cur > rangeEnd) break;
        if (cur >= rangeStart) dates.push(cur);
        cur = addYears(cur, 1, pattern.month, pattern.dayOfMonth);
      }
      break;
    }
    case 'custom': {
      const { interval, unit, days: customDays } = pattern;
      if (unit === 'days') {
        let cur = startDate;
        for (let i = 0; i < limit; i++) {
          if (cur > rangeEnd) break;
          if (cur >= rangeStart) dates.push(cur);
          cur = addDays(cur, interval);
        }
      } else if (unit === 'weeks') {
        const targetDays = customDays && customDays.length > 0 ? customDays : [getDayOfWeek(startDate)];
        const startDow = getDayOfWeek(startDate);
        let cur = addDays(startDate, -startDow);
        for (let w = 0; w < limit; w++) {
          for (const dow of targetDays) {
            const day = addDays(cur, dow);
            if (day >= startDate && day <= rangeEnd && day >= rangeStart) {
              dates.push(day);
            }
          }
          cur = addDays(cur, 7 * interval);
          if (cur > rangeEnd) break;
        }
        const unique = [...new Set(dates)].sort();
        dates.length = 0;
        dates.push(...unique);
      } else if (unit === 'months') {
        const dayOfMonth = new Date(startDate + 'T12:00:00').getDate();
        let cur = startDate;
        for (let i = 0; i < limit; i++) {
          if (cur > rangeEnd) break;
          if (cur >= rangeStart) dates.push(cur);
          cur = addMonths(cur, interval, dayOfMonth);
        }
      } else if (unit === 'years') {
        const sd = new Date(startDate + 'T12:00:00');
        let cur = startDate;
        for (let i = 0; i < limit; i++) {
          if (cur > rangeEnd) break;
          if (cur >= rangeStart) dates.push(cur);
          cur = addYears(cur, interval, sd.getMonth(), sd.getDate());
        }
      }
      break;
    }
  }

  return dates;
}

export const useTaskStore = create<TaskState>()(
  persist(
    (set, get) => ({
      tasks: [],
      viewMode: 'day',
      daySubMode: 'timeline',
      routinesEnabled: true,
      focusTaskId: null,
      editingTaskId: null,
      showCompletionStats: false,
      dailyStats: null,
      navigateToDate: null,
      currentDate: null,
      listReturnZoom: null,
      showListReturn: false,

      setViewMode: (mode) => {
        const prev = get().viewMode;
        if (mode === 'focus' && prev !== 'focus') playUISound('swell');
        set({ viewMode: mode });
      },
      setDaySubMode: (mode) => set({ daySubMode: mode }),
      setNavigateToDate: (date) => set({ navigateToDate: date }),
      setCurrentDate: (date) => set({ currentDate: date }),
      setListReturnZoom: (zoom) => set({ listReturnZoom: zoom }),
      setShowListReturn: (show) => set({ showListReturn: show }),
      toggleRoutines: () => set((s) => ({ routinesEnabled: !s.routinesEnabled })),

      addTask: (taskData) => {
        const task: Task = {
          ...taskData,
          id: generateId(),
          originalPriority: taskData.priority,
          completed: false,
          createdAt: new Date().toISOString(),
          moveCount: 0,
        };
        // Resolve overlap if task has a scheduled time
        if (task.time) {
          const slots = getOccupiedSlots(get().tasks, task.date, task.id, get().routinesEnabled);
          const { startMin: resolved } = findValidPosition(timeToMinutes(task.time), task.duration || 30, slots);
          task.time = minutesToTime(resolved);
        }
        set((s) => ({ tasks: [...s.tasks, task] }));
      },


      updateTask: (id, updates) => {
        // Resolve overlap when time, date, or duration changes
        if ('time' in updates || 'date' in updates || 'duration' in updates) {
          const task = get().tasks.find((t) => t.id === id);
          if (task) {
            const nd = (updates as any).date ?? task.date;
            const nt = (updates as any).time ?? task.time;
            const ndur = (updates as any).duration ?? task.duration ?? 30;
            if (nt) {
              const slots = getOccupiedSlots(get().tasks, nd, id, get().routinesEnabled);
              const { startMin: resolved } = findValidPosition(timeToMinutes(nt), ndur, slots);
              (updates as any).time = minutesToTime(resolved);
            }
          }
        }
        if ('time' in updates || 'date' in updates || 'completed' in updates) {
          void cancelNotificationsForTask(id);
        cancelWebNotificationsForTask(id);
        }
        set((s) => {
          const sourceTask = s.tasks.find((t) => t.id === id);
          // Determine linked-group propagation fields
          const linkedFields: Partial<Task> = {};
          if (sourceTask?.linked && sourceTask.linkedGroupId) {
            if ('description' in updates) linkedFields.description = updates.description;
            if ('subtasks' in updates && updates.subtasks) {
              // Sync subtask titles/order but preserve each task's own completion state
              linkedFields.subtasks = updates.subtasks;
            }
          }
          const hasLinkedUpdates = Object.keys(linkedFields).length > 0;

          return {
            tasks: s.tasks.map((t) => {
              // Propagate description/subtasks to linked group members
              if (hasLinkedUpdates && t.id !== id && t.linked && t.linkedGroupId === sourceTask!.linkedGroupId && !t.completed) {
                const merged: Partial<Task> = { ...linkedFields };
                // Preserve the target task's own subtask completion states
                if (merged.subtasks && t.subtasks) {
                  const existingCompletionMap = new Map(
                    (t.subtasks as Subtask[]).map((st) => [st.id, st.completed])
                  );
                  merged.subtasks = (merged.subtasks as Subtask[]).map((st) => ({
                    ...st,
                    completed: existingCompletionMap.get(st.id) ?? st.completed,
                  }));
                }
                return { ...t, ...merged };
              }
              if (t.id !== id) return t;
              const mobilityMode = useTimezoneStore.getState().mobilityMode;
              let merged = { ...t, ...updates };
              if ('recurrence' in updates) {
                merged.type = deriveType(merged.recurrence);
              }
              if (mobilityMode === 'elite' && 'priority' in updates && updates.priority !== undefined) {
                const today = new Date().toISOString().split('T')[0];
                const effectiveMin = computeEffectivePriority(t, today);
                if ((updates.priority as number) < effectiveMin) {
                  merged.priority = effectiveMin;
                }
              }
              return merged;
            }),
          };
        });
      },

      updateFutureInstances: (taskId, fromDate, updates) => {
        const sourceTask = get().tasks.find((t) => t.id === taskId);
        if (!sourceTask) return;
        const seriesId = getTaskSeriesId(sourceTask);
        const resolvedUpdates = { ...updates };
        if ('recurrence' in updates) {
          resolvedUpdates.type = deriveType(updates.recurrence);
        }

        set((s) => ({
          tasks: s.tasks.map((t) => {
            if (!isTaskInSameSeries(t, seriesId)) return t;
            if (t.date < fromDate && t.id !== taskId) return t;

            if (t.id === taskId || t.date >= fromDate) {
              return { ...t, ...resolvedUpdates };
            }

            return t;
          }),
        }));
      },

      completeTask: (id) => {
        const now = new Date().toISOString();
        playUISound('tapeClick');
        set((s) => ({
          tasks: s.tasks.map((t) =>
            t.id === id ? { ...t, completed: true, inWaitingRoom: false, archivedAt: now, archiveReason: 'completed' as const } : t
          ),
          editingTaskId: s.editingTaskId === id ? null : s.editingTaskId,
        }));
        void cancelNotificationsForTask(id);
        cancelWebNotificationsForTask(id);
        const state = get();
        const today = new Date().toISOString().split('T')[0];
        const todayTasks = state.tasks.filter((t) => t.date === today && !t.archivedAt);
        const allDone = todayTasks.length > 0 && todayTasks.every((t) => t.completed);
        if (allDone) {
          set({ showCompletionStats: true, dailyStats: get().getDailyStats() });
        }
      },
      uncompleteTask: (id) => {
        set((s) => ({
          tasks: s.tasks.map((t) =>
            t.id === id ? { ...t, completed: false, archivedAt: null, archiveReason: null } : t
          ),
        }));
      },

      deleteTask: (id) => {
        const now = new Date().toISOString();
        set((s) => ({
          tasks: s.tasks.map((t) =>
            t.id === id ? { ...t, archivedAt: now, archiveReason: 'deleted' as const } : t
          ),
          editingTaskId: s.editingTaskId === id ? null : s.editingTaskId,
        }));
        void cancelNotificationsForTask(id);
        cancelWebNotificationsForTask(id);
      },

      archiveTask: (id, reason) => {
        const now = new Date().toISOString();
        set((s) => ({
          tasks: s.tasks.map((t) =>
            t.id === id ? { ...t, archivedAt: now, archiveReason: reason, completed: reason === 'completed' ? true : t.completed } : t
          ),
          editingTaskId: s.editingTaskId === id ? null : s.editingTaskId,
        }));
      },

      restoreTask: (id) =>
        set((s) => ({
          tasks: s.tasks.map((t) =>
            t.id === id ? { ...t, archivedAt: undefined, archiveReason: undefined, completed: false, inWaitingRoom: false } : t
          ),
        })),

      getArchivedTasks: () => get().tasks.filter((t) => !!t.archivedAt),

      deleteFutureInstances: (parentId, fromDate) =>
        set((s) => ({
          tasks: s.tasks.filter((t) => {
            if (t.id === parentId) return false;
            if (t.recurrenceParentId === parentId && t.date >= fromDate) return false;
            return true;
          }),
          editingTaskId: null,
        })),

      removeInstances: (parentId) =>
        set((s) => ({
          tasks: s.tasks.filter((t) => t.recurrenceParentId !== parentId),
        })),

      deleteRecurrenceSeries: (parentId) =>
        set((s) => ({
          tasks: s.tasks.filter((t) => t.id !== parentId && t.recurrenceParentId !== parentId),
          editingTaskId: null,
        })),

      canMoveTask: (id, newDate) => {
        const task = get().tasks.find((t) => t.id === id);
        if (!task) return { allowed: false, reason: 'Task not found' };
        const mobilityMode = useTimezoneStore.getState().mobilityMode;
        if (mobilityMode === 'disabled') {
          if (task.priority >= 3 && task.date !== newDate) {
            return { allowed: false, reason: 'Cannot move locked task' };
          }
          if (task.priority >= 3 && task.date === newDate) {
            return { allowed: false, reason: 'Task is locked' };
          }
          return { allowed: true };
        }
        const today = new Date().toISOString().split('T')[0];
        const pri = computeEffectivePriority(task, today);
        if (task.date === newDate) {
          if (pri >= 3) {
            return { allowed: false, reason: 'Task is locked' };
          }
          return { allowed: true };
        }

        if (pri >= 3) {
          return { allowed: false, reason: 'Cannot move locked task' };
        }
        if (pri >= 2) {
          return { allowed: false, reason: 'Cannot move outside current day' };
        }
        if (pri >= 1) {
          const srcWeek = getWeekBounds(task.date);
          if (newDate < srcWeek.start || newDate > srcWeek.end) {
            return { allowed: false, reason: 'Cannot move outside current week' };
          }
        }
        return { allowed: true };
      },

      moveTask: (id, newDate, newTime) => {
        const task = get().tasks.find((t) => t.id === id);
        if (!task) return { blocked: false };

        if (task.priority >= 3) {
          return { blocked: true };
        }

        const validation = get().canMoveTask(id, newDate);
        if (!validation.allowed) {
          return { blocked: true };
        }

        // Resolve overlap at destination
        let finalTime = newTime ?? task.time;
        if (finalTime) {
          const slots = getOccupiedSlots(get().tasks, newDate, id, get().routinesEnabled);
          const { startMin: resolved, blocked } = findValidPosition(timeToMinutes(finalTime), task.duration || 30, slots);
          if (blocked) return { blocked: true };
          finalTime = minutesToTime(resolved);
        }

        const crossDay = task.date !== newDate;
        const mobilityMode = useTimezoneStore.getState().mobilityMode;
        const newPriority = (crossDay && mobilityMode !== 'disabled')
          ? Math.min(3, task.priority + 1) as Priority
          : task.priority;
        const targetIds = getLinkedScheduleTargetIds(get().tasks, task);

        set((s) => ({
          tasks: s.tasks.map((t) => {
            if (t.id === id) {
              return {
                ...t,
                date: newDate,
                time: finalTime ?? t.time,
                priority: newPriority,
                moveCount: crossDay ? t.moveCount + 1 : t.moveCount,
                inWaitingRoom: false,
              };
            }

            if (targetIds.has(t.id)) {
              return {
                ...t,
                time: finalTime ?? t.time,
              };
            }

            return t;
          }),
        }));
        Array.from(targetIds).forEach((taskId) => {
          void cancelNotificationsForTask(taskId);
        cancelWebNotificationsForTask(taskId);
        });
        return { blocked: false };
      },

      resizeTask: (id, newTime, newDuration) => {
        const task = get().tasks.find((t) => t.id === id);
        if (!task) return;

        const targetIds = getLinkedScheduleTargetIds(get().tasks, task);

        set((s) => ({
          tasks: s.tasks.map((t) =>
            targetIds.has(t.id)
              ? { ...t, time: newTime, duration: Math.max(15, newDuration) }
              : t
          ),
        }));

        Array.from(targetIds).forEach((taskId) => {
          void cancelNotificationsForTask(taskId);
        cancelWebNotificationsForTask(taskId);
        });
      },

      reorderTask: (id, newTime) => {
        const task = get().tasks.find((t) => t.id === id);
        if (!task) return;
        if (task.priority >= 3) return;
        // Resolve overlap
        const slots = getOccupiedSlots(get().tasks, task.date, id, get().routinesEnabled);
        const resolvedMin = findValidPosition(timeToMinutes(newTime), task.duration || 30, slots).startMin;
        newTime = minutesToTime(resolvedMin);
        const targetIds = getLinkedScheduleTargetIds(get().tasks, task);

        set((s) => ({
          tasks: s.tasks.map((t) =>
            targetIds.has(t.id) ? { ...t, time: newTime } : t
          ),
        }));

        Array.from(targetIds).forEach((taskId) => {
          void cancelNotificationsForTask(taskId);
        cancelWebNotificationsForTask(taskId);
        });
      },

      skipFocusTask: () => {
        const state = get();
        const todayTasks = state.tasks
          .filter((t) => !t.completed && !t.inWaitingRoom && t.date === new Date().toISOString().split('T')[0] &&
            !(!state.routinesEnabled && t.isRoutine !== false && t.type === 'recurring'))
          .sort((a, b) => (a.time || '').localeCompare(b.time || ''));
        const currentIdx = todayTasks.findIndex((t) => t.id === state.focusTaskId);
        const nextTask = todayTasks[currentIdx + 1] || todayTasks[0];
        set({ focusTaskId: nextTask?.id || null });
      },

      setFocusTask: (id) => set({ focusTaskId: id }),
      setEditingTask: (id) => set({ editingTaskId: id }),

      getTasksForDate: (date) => {
        const state = get();
        const today = new Date().toISOString().split('T')[0];
        return state.tasks
          .filter((t) => t.date === date && !t.completed && !t.inWaitingRoom && !t.archivedAt &&
            !(!state.routinesEnabled && t.isRoutine !== false && t.type === 'recurring'))
          .map((t) => {
            const ePri = computeEffectivePriority(t, today);
            return ePri !== t.priority ? { ...t, priority: ePri } : t;
          });
      },

      getCurrentFocusTask: () => {
        const state = get();
        const isRoutineAllowed = (t: Task) => !(!state.routinesEnabled && t.isRoutine !== false && t.type === 'recurring');

        if (state.focusTaskId) {
          const task = state.tasks.find((t) => t.id === state.focusTaskId && !t.completed && !t.inWaitingRoom && isRoutineAllowed(t));
          if (task) return task;
        }
        const today = new Date().toISOString().split('T')[0];
        return state.tasks
          .filter((t) => !t.completed && !t.inWaitingRoom && t.date === today && isRoutineAllowed(t))
          .sort((a, b) => (a.time || '').localeCompare(b.time || ''))[0];
      },

      getNextTask: (currentId) => {
        const state = get();
        const today = new Date().toISOString().split('T')[0];
        const todayTasks = state.tasks
          .filter((t) => !t.completed && !t.inWaitingRoom && t.date === today &&
            !(!state.routinesEnabled && t.isRoutine !== false && t.type === 'recurring'))
          .sort((a, b) => (a.time || '').localeCompare(b.time || ''));
        const idx = todayTasks.findIndex((t) => t.id === currentId);
        return todayTasks[idx + 1];
      },

      getDailyStats: () => {
        const today = new Date().toISOString().split('T')[0];
        const todayTasks = get().tasks.filter((t) => t.date === today);
        return {
          completed: todayTasks.filter((t) => t.completed).length,
          total: todayTasks.length,
          pushed: todayTasks.filter((t) => t.moveCount > 0).length,
        };
      },

      dismissCompletionStats: () => set({ showCompletionStats: false }),

      moveOverdueToWaitingRoom: () => {
        const now = new Date();
        const nowMs = now.getTime();

        set((s) => ({
          tasks: s.tasks.map((t) => {
            if (t.completed || t.inWaitingRoom || t.archivedAt) return t;
            if (!t.time) return t;
            // Check today and past days (not future days)
            const todayStr = now.toISOString().split('T')[0];
            if (t.date > todayStr) return t;

            const [h, m] = t.time.split(':').map(Number);
            const start = new Date(`${t.date}T00:00:00`);
            start.setHours(h, m, 0, 0);
            const end = start.getTime() + (t.duration || 30) * 60_000;
            const gracePeriodMs = 12 * 60 * 60 * 1000; // 12 hours after end time

            if (nowMs > end + gracePeriodMs) {
              return {
                ...t,
                inWaitingRoom: true,
                waitingRoomCount: (t.waitingRoomCount || 0) + 1,
              };
            }

            return t;
          }),
        }));
      },

      generateRecurringInstances: (startDate, endDate) =>
        set((s) => {
          const nextTasks = [...s.tasks];
          const recurringParents = nextTasks.filter((task) => !!task.recurrence && !task.isRecurrenceInstance);

          for (const parent of recurringParents) {
            const seriesId = getTaskSeriesId(parent);
            const existingSeriesTasks = nextTasks.filter((task) => isTaskInSameSeries(task, seriesId));
            const existingDates = new Set(existingSeriesTasks.map((task) => task.date));
            const occurrences = getAllOccurrences(parent.recurrence!, parent.date, startDate, endDate);

            for (const occurrenceDate of occurrences) {
              if (existingDates.has(occurrenceDate)) continue;

              const linkState = resolveGeneratedLinkState(
                nextTasks.filter((task) => isTaskInSameSeries(task, seriesId)),
                occurrenceDate,
              );

              nextTasks.push({
                ...parent,
                id: generateId(),
                date: occurrenceDate,
                completed: false,
                createdAt: new Date().toISOString(),
                archivedAt: undefined,
                archiveReason: undefined,
                inWaitingRoom: false,
                waitingRoomCount: 0,
                isRecurrenceInstance: true,
                recurrenceParentId: parent.id,
                detachedFromSeries: false,
                type: deriveType(parent.recurrence),
                linked: linkState.linked,
                linkedGroupId: linkState.linkedGroupId,
              });

              existingDates.add(occurrenceDate);
            }
          }

          return { tasks: nextTasks };
        }),

      linkSeriesFromDate: (taskId, fromDate, linked) =>
        set((s) => {
          const sourceTask = s.tasks.find((task) => task.id === taskId);
          if (!sourceTask) return s;

          const seriesId = getTaskSeriesId(sourceTask);
          const nextGroupId = linked ? (sourceTask.linkedGroupId || sourceTask.id) : undefined;

          return {
            tasks: s.tasks.map((task) => {
              if (!isTaskInSameSeries(task, seriesId)) return task;

              if (!linked) {
                if (task.id !== taskId) return task;
                return {
                  ...task,
                  linked: false,
                  linkedGroupId: undefined,
                };
              }

              if (task.date < fromDate && task.id !== taskId) return task;

              return {
                ...task,
                linked: true,
                linkedGroupId: nextGroupId,
              };
            }),
          };
        }),
    }),
    {
      name: 'task-storage',
    }
  )
);
