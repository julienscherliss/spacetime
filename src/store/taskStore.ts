import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { getWeekBounds } from '@/hooks/useCurrentTime';
import type { Subtask } from '@/components/SubtaskList';
import { useTimezoneStore } from '@/store/timezoneStore';

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
  seriesId?: string;          // recurrence origin — shared by all instances from one template
  linkedGroupId?: string;     // synchronization group — only truly linked tasks share this
  detachedFromSeries?: boolean; // explicitly detached from series behaviour
  inWaitingRoom?: boolean;
  waitingRoomCount?: number;
  dueDate?: string;
  archivedAt?: string;
  archiveReason?: 'completed' | 'deleted';
  attachments?: { name: string; url: string; type: string }[];
}

export interface DailyStats {
  completed: number;
  total: number;
  pushed: number;
}

export type MoveValidation =
  | { allowed: true }
  | { allowed: false; reason: string };

/** Info for zooming timeline to a specific time window when coming from list view */
export interface ListReturnZoom {
  taskTime: string; // HH:MM
  taskDuration: number; // minutes
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
  /** When set, DayView should open to this date and then clear it */
  navigateToDate: string | null;
  /** Persisted current date for day/list views — survives view switches */
  currentDate: string | null;
  /** When set, DayView should zoom to this time window and show return button */
  listReturnZoom: ListReturnZoom | null;
  /** Whether to show the return-to-list button in DayView */
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
  /** Link or unlink all tasks in a series from a given date forward */
  linkSeriesFromDate: (taskId: string, fromDate: string, linked: boolean) => void;
}

const generateId = () => crypto.randomUUID();

function deriveType(recurrence?: RecurrencePattern): TaskType {
  return recurrence ? 'recurring' : 'one-time';
}

/**
 * Compute set of task IDs that should be affected by a schedule change.
 * Uses explicit linkedGroupId — never inferred from series membership alone.
 */
function getLinkedScheduleTargetIds(tasks: Task[], activeTask: Task): Set<string> {
  const targetIds = new Set<string>([activeTask.id]);

  // Only propagate if the task is explicitly linked AND has a linkedGroupId
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

/** Compute effective priority based on due date and mobility mode */
function computeEffectivePriority(task: Task, today: string): Priority {
  const mobilityMode = useTimezoneStore.getState().mobilityMode;
  if (mobilityMode === 'disabled') return task.priority;
  if (!task.dueDate) return task.priority;

  let minPriority = task.priority;

  // Due today or overdue → at least FIXED (2)
  if (task.dueDate <= today) {
    minPriority = Math.max(minPriority, 2) as Priority;
  } else {
    // Check if due this week
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

// ─── Recurrence engine ────────────────────────────────────────

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

// ─── Store ────────────────────────────────────────

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

      setViewMode: (mode) => set({ viewMode: mode }),
      setDaySubMode: (mode) => set({ daySubMode: mode }),
      setNavigateToDate: (date) => set({ navigateToDate: date }),
      setCurrentDate: (date) => set({ currentDate: date }),
      setListReturnZoom: (zoom) => set({ listReturnZoom: zoom }),
      setShowListReturn: (show) => set({ showListReturn: show }),
      toggleRoutines: () => set((s) => ({ routinesEnabled: !s.routinesEnabled })),

      addTask: (taskData) => {
        const type = deriveType(taskData.recurrence);
        const id = generateId();
        const seriesId = taskData.recurrenceParentId || id;
        const linkedGroupId = taskData.linked ? seriesId : undefined;
        const task: Task = {
          ...taskData,
          type,
          isRoutine: taskData.isRoutine ?? (type === 'recurring'),
          id,
          seriesId,
          linkedGroupId,
          detachedFromSeries: false,
          originalPriority: taskData.priority,
          completed: false,
          createdAt: new Date().toISOString(),
          moveCount: 0,
        };
        set((s) => ({ tasks: [...s.tasks, task] }));
      },

      updateTask: (id, updates) =>
        set((s) => ({
          tasks: s.tasks.map((t) => {
            if (t.id !== id) return t;
            const mobilityMode = useTimezoneStore.getState().mobilityMode;
            let merged = { ...t, ...updates };
            if ('recurrence' in updates) {
              merged.type = deriveType(merged.recurrence);
            }
            // Elite mode: prevent priority de-escalation
            if (mobilityMode === 'elite' && 'priority' in updates && updates.priority !== undefined) {
              const today = new Date().toISOString().split('T')[0];
              const effectiveMin = computeEffectivePriority(t, today);
              if ((updates.priority as number) < effectiveMin) {
                merged.priority = effectiveMin;
              }
            }
            return merged;
          }),
        })),

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
        set((s) => ({
          tasks: s.tasks.map((t) =>
            t.id === id ? { ...t, completed: true, inWaitingRoom: false, archivedAt: now, archiveReason: 'completed' as const } : t
          ),
          editingTaskId: s.editingTaskId === id ? null : s.editingTaskId,
        }));
        const state = get();
        const today = new Date().toISOString().split('T')[0];
        const todayTasks = state.tasks.filter((t) => t.date === today && !t.archivedAt);
        const allDone = todayTasks.length > 0 && todayTasks.every((t) => t.completed);
        if (allDone) {
          set({ showCompletionStats: true, dailyStats: get().getDailyStats() });
        }
      },

      deleteTask: (id) => {
        const now = new Date().toISOString();
        set((s) => ({
          tasks: s.tasks.map((t) =>
            t.id === id ? { ...t, archivedAt: now, archiveReason: 'deleted' as const } : t
          ),
          editingTaskId: s.editingTaskId === id ? null : s.editingTaskId,
        }));
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
        if (task.date === newDate) {
          if (task.priority >= 3) {
            return { allowed: false, reason: 'Task is locked' };
          }
          return { allowed: true };
        }

        if (task.priority >= 3) {
          return { allowed: false, reason: 'Cannot move locked task' };
        }
        if (task.priority >= 2) {
          return { allowed: false, reason: 'Cannot move outside current day' };
        }
        if (task.priority >= 1) {
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

        const crossDay = task.date !== newDate;
        const newPriority = crossDay
          ? Math.min(3, task.priority + 1) as Priority
          : task.priority;
        const targetIds = getLinkedScheduleTargetIds(get().tasks, task);

        set((s) => ({
          tasks: s.tasks.map((t) => {
            if (t.id === id) {
              return {
                ...t,
                date: newDate,
                time: newTime ?? t.time,
                priority: newPriority,
                moveCount: crossDay ? t.moveCount + 1 : t.moveCount,
                inWaitingRoom: false,
              };
            }

            if (targetIds.has(t.id)) {
              return {
                ...t,
                time: newTime ?? t.time,
              };
            }

            return t;
          }),
        }));
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
      },

      reorderTask: (id, newTime) => {
        const task = get().tasks.find((t) => t.id === id);
        if (!task) return;
        if (task.priority >= 3) return;
        const targetIds = getLinkedScheduleTargetIds(get().tasks, task);

        set((s) => ({
          tasks: s.tasks.map((t) =>
            targetIds.has(t.id) ? { ...t, time: newTime } : t
          ),
        }));
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

            // Calculate when the task should have ended
            const [h, m] = t.time.split(':').map(Number);
            const taskEnd = new Date(`${t.date}T00:00:00`);
            taskEnd.setHours(h, m + (t.duration || 30), 0, 0);

            // Only move to waiting room 12 hours after scheduled end
            const graceMs = 12 * 60 * 60 * 1000;
            if (nowMs - taskEnd.getTime() < graceMs) return t;

            return {
              ...t,
              inWaitingRoom: true,
              waitingRoomCount: (t.waitingRoomCount || 0) + 1,
            };
          }),
        }));
      },

      linkSeriesFromDate: (taskId, fromDate, linked) => {
        const task = get().tasks.find((t) => t.id === taskId);
        if (!task) return;
        const seriesId = getTaskSeriesId(task);
        const linkedGroupId = task.linkedGroupId || task.id;

        set((s) => ({
          tasks: s.tasks.map((t) => {
            if (!isTaskInSameSeries(t, seriesId)) return t;

            if (!linked) {
              if (t.id !== taskId) return t;
              return {
                ...t,
                linked: false,
                linkedGroupId: undefined,
                detachedFromSeries: !!t.recurrenceParentId,
              };
            }

            if (t.date < fromDate && t.id !== taskId) return t;

            return {
              ...t,
              linked: true,
              linkedGroupId,
              detachedFromSeries: false,
            };
          }),
        }));
      },

      generateRecurringInstances: (startDate, endDate) => {
        const state = get();
        const recurringParents = state.tasks.filter(
          (t) => t.recurrence && !t.isRecurrenceInstance
        );
        const existingInstanceDates = new Map<string, Set<string>>();
        state.tasks
          .filter((t) => t.isRecurrenceInstance && t.recurrenceParentId)
          .forEach((t) => {
            const s = existingInstanceDates.get(t.recurrenceParentId!) || new Set();
            s.add(t.date);
            existingInstanceDates.set(t.recurrenceParentId!, s);
          });

        const seriesTasksMap = new Map<string, Task[]>();
        state.tasks.forEach((task) => {
          const sid = getTaskSeriesId(task);
          const existing = seriesTasksMap.get(sid) || [];
          existing.push(task);
          seriesTasksMap.set(sid, existing);
        });

        const newTasks: Task[] = [];
        for (const parent of recurringParents) {
          if (!parent.recurrence) continue;
          const occurrences = getAllOccurrences(parent.recurrence, parent.date, startDate, endDate);
          const existing = existingInstanceDates.get(parent.id) || new Set();
          const sid = getTaskSeriesId(parent);
          const seriesTasks = sortTasksBySeriesOrder(seriesTasksMap.get(sid) || [parent]);

          for (const occ of occurrences) {
            if (occ === parent.date) continue;
            if (existing.has(occ)) continue;

            const linkState = resolveGeneratedLinkState(seriesTasks, occ);

            const generatedTask: Task = {
              id: generateId(),
              title: parent.title,
              category: parent.category,
              description: parent.description,
              subtasks: linkState.linked ? parent.subtasks : undefined,
              type: 'recurring',
              priority: parent.originalPriority,
              originalPriority: parent.originalPriority,
              date: occ,
              time: parent.time,
              duration: parent.duration,
              completed: false,
              createdAt: new Date().toISOString(),
              moveCount: 0,
              recurrenceParentId: parent.id,
              isRecurrenceInstance: true,
              recurrence: parent.recurrence,
              isRoutine: parent.isRoutine,
              linked: linkState.linked,
              seriesId: sid,
              linkedGroupId: linkState.linkedGroupId,
              detachedFromSeries: !linkState.linked && !!parent.id,
            };

            newTasks.push(generatedTask);
            seriesTasks.push(generatedTask);
          }
        }
        if (newTasks.length > 0) {
          set((s) => ({ tasks: [...s.tasks, ...newTasks] }));
        }
      },
    }),
    {
      name: 'do-task-store',
      onRehydrateStorage: () => (state) => {
        // Migrate any non-UUID task IDs (e.g. old "demo-1" format)
        if (state?.tasks) {
          const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
          const needsMigration = state.tasks.some(t => !uuidRegex.test(t.id));
          if (needsMigration) {
            const idMap = new Map<string, string>();
            state.tasks = state.tasks.map(t => {
              if (!uuidRegex.test(t.id)) {
                const newId = crypto.randomUUID();
                idMap.set(t.id, newId);
                return { ...t, id: newId };
              }
              return t;
            });
            // Fix recurrence parent references
            state.tasks = state.tasks.map(t => {
              if (t.recurrenceParentId && idMap.has(t.recurrenceParentId)) {
                return { ...t, recurrenceParentId: idMap.get(t.recurrenceParentId) };
              }
              return t;
            });
          }
        }
      },
    }
  )
);
