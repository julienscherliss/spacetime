import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { getWeekBounds } from '@/hooks/useCurrentTime';

export type Priority = 0 | 1 | 2 | 3;
export type TaskType = 'one-time' | 'recurring';
export type ViewMode = 'focus' | 'day' | 'week' | 'calendar';

export type RecurrencePattern =
  | { type: 'daily' }
  | { type: 'weekly'; days: number[] } // 0=Sun, 1=Mon...
  | { type: 'monthly'; dayOfMonth: number }
  | { type: 'yearly'; month: number; dayOfMonth: number }
  | { type: 'weekdays' }
  | { type: 'custom'; intervalDays: number };

export interface Task {
  id: string;
  title: string;
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
  recurrenceParentId?: string; // links instances to parent
  isRecurrenceInstance?: boolean;
}

export interface DailyStats {
  completed: number;
  total: number;
  pushed: number;
}

export type MoveValidation =
  | { allowed: true }
  | { allowed: false; reason: string };

interface TaskState {
  tasks: Task[];
  viewMode: ViewMode;
  vacationMode: boolean;
  focusTaskId: string | null;
  editingTaskId: string | null;
  showCompletionStats: boolean;
  dailyStats: DailyStats | null;

  setViewMode: (mode: ViewMode) => void;
  toggleVacationMode: () => void;
  addTask: (task: Omit<Task, 'id' | 'createdAt' | 'completed' | 'moveCount' | 'originalPriority'>) => void;
  updateTask: (id: string, updates: Partial<Pick<Task, 'title' | 'date' | 'time' | 'duration' | 'priority' | 'recurrence' | 'type'>>) => void;
  completeTask: (id: string) => void;
  deleteTask: (id: string) => void;
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
}

const generateId = () => Math.random().toString(36).substring(2, 10);

function getNextOccurrence(pattern: RecurrencePattern, fromDate: string): string | null {
  const d = new Date(fromDate + 'T00:00:00');
  switch (pattern.type) {
    case 'daily':
      d.setDate(d.getDate() + 1);
      return d.toISOString().split('T')[0];
    case 'weekly': {
      for (let i = 1; i <= 7; i++) {
        const next = new Date(d);
        next.setDate(next.getDate() + i);
        if (pattern.days.includes(next.getDay())) {
          return next.toISOString().split('T')[0];
        }
      }
      return null;
    }
    case 'weekdays': {
      for (let i = 1; i <= 7; i++) {
        const next = new Date(d);
        next.setDate(next.getDate() + i);
        const day = next.getDay();
        if (day >= 1 && day <= 5) {
          return next.toISOString().split('T')[0];
        }
      }
      return null;
    }
    case 'monthly':
      d.setMonth(d.getMonth() + 1);
      d.setDate(pattern.dayOfMonth);
      return d.toISOString().split('T')[0];
    case 'yearly':
      d.setFullYear(d.getFullYear() + 1);
      d.setMonth(pattern.month);
      d.setDate(pattern.dayOfMonth);
      return d.toISOString().split('T')[0];
    case 'custom':
      d.setDate(d.getDate() + pattern.intervalDays);
      return d.toISOString().split('T')[0];
  }
}

function getAllOccurrences(pattern: RecurrencePattern, startDate: string, rangeStart: string, rangeEnd: string): string[] {
  const dates: string[] = [];
  let current = startDate;
  // Include the start date if in range
  if (current >= rangeStart && current <= rangeEnd) {
    dates.push(current);
  }
  // Generate up to 60 occurrences max
  for (let i = 0; i < 60; i++) {
    const next = getNextOccurrence(pattern, current);
    if (!next || next > rangeEnd) break;
    if (next >= rangeStart) {
      dates.push(next);
    }
    current = next;
  }
  return dates;
}

export const useTaskStore = create<TaskState>()(
  persist(
    (set, get) => ({
      tasks: [
        {
          id: 'demo-1',
          title: 'Review quarterly goals',
          type: 'one-time' as TaskType,
          priority: 1 as Priority,
          originalPriority: 0 as Priority,
          date: new Date().toISOString().split('T')[0],
          time: '09:00',
          duration: 30,
          completed: false,
          createdAt: new Date().toISOString(),
          moveCount: 1,
        },
        {
          id: 'demo-2',
          title: 'Ship feature update',
          type: 'one-time' as TaskType,
          priority: 2 as Priority,
          originalPriority: 1 as Priority,
          date: new Date().toISOString().split('T')[0],
          time: '11:00',
          duration: 60,
          completed: false,
          createdAt: new Date().toISOString(),
          moveCount: 1,
        },
        {
          id: 'demo-3',
          title: 'Write documentation',
          type: 'one-time' as TaskType,
          priority: 0 as Priority,
          originalPriority: 0 as Priority,
          date: new Date().toISOString().split('T')[0],
          time: '14:00',
          duration: 45,
          completed: false,
          createdAt: new Date().toISOString(),
          moveCount: 0,
        },
        {
          id: 'demo-4',
          title: 'Morning standup',
          type: 'recurring' as TaskType,
          priority: 3 as Priority,
          originalPriority: 3 as Priority,
          date: new Date().toISOString().split('T')[0],
          time: '08:30',
          duration: 15,
          completed: false,
          createdAt: new Date().toISOString(),
          moveCount: 0,
          recurrence: { type: 'weekdays' },
        },
        {
          id: 'demo-5',
          title: 'Team retrospective',
          type: 'one-time' as TaskType,
          priority: 1 as Priority,
          originalPriority: 0 as Priority,
          date: new Date(Date.now() + 86400000).toISOString().split('T')[0],
          time: '15:00',
          duration: 60,
          completed: false,
          createdAt: new Date().toISOString(),
          moveCount: 1,
        },
        {
          id: 'demo-6',
          title: 'Code review',
          type: 'one-time' as TaskType,
          priority: 0 as Priority,
          originalPriority: 0 as Priority,
          date: new Date(Date.now() + 86400000 * 2).toISOString().split('T')[0],
          time: '10:00',
          duration: 30,
          completed: false,
          createdAt: new Date().toISOString(),
          moveCount: 0,
        },
      ],
      viewMode: 'day',
      vacationMode: false,
      focusTaskId: null,
      editingTaskId: null,
      showCompletionStats: false,
      dailyStats: null,

      setViewMode: (mode) => set({ viewMode: mode }),
      toggleVacationMode: () => set((s) => ({ vacationMode: !s.vacationMode })),

      addTask: (taskData) => {
        const task: Task = {
          ...taskData,
          id: generateId(),
          originalPriority: taskData.priority,
          completed: false,
          createdAt: new Date().toISOString(),
          moveCount: 0,
        };
        set((s) => ({ tasks: [...s.tasks, task] }));
      },

      updateTask: (id, updates) =>
        set((s) => ({
          tasks: s.tasks.map((t) => (t.id === id ? { ...t, ...updates } : t)),
        })),

      completeTask: (id) => {
        set((s) => ({
          tasks: s.tasks.map((t) =>
            t.id === id ? { ...t, completed: true } : t
          ),
          editingTaskId: s.editingTaskId === id ? null : s.editingTaskId,
        }));
        const state = get();
        const today = new Date().toISOString().split('T')[0];
        const todayTasks = state.tasks.filter((t) => t.date === today);
        const allDone = todayTasks.length > 0 && todayTasks.every((t) => t.completed);
        if (allDone) {
          set({ showCompletionStats: true, dailyStats: get().getDailyStats() });
        }
      },

      deleteTask: (id) =>
        set((s) => ({
          tasks: s.tasks.filter((t) => t.id !== id),
          editingTaskId: s.editingTaskId === id ? null : s.editingTaskId,
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
          // Same-day reorder: blocked for LOCK
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

        // Only escalate priority on cross-day moves
        const crossDay = task.date !== newDate;
        const newPriority = crossDay
          ? Math.min(3, task.priority + 1) as Priority
          : task.priority;

        set((s) => ({
          tasks: s.tasks.map((t) =>
            t.id === id
              ? {
                  ...t,
                  date: newDate,
                  time: newTime ?? t.time,
                  priority: newPriority,
                  moveCount: crossDay ? t.moveCount + 1 : t.moveCount,
                }
              : t
          ),
        }));
        return { blocked: false };
      },

      resizeTask: (id, newTime, newDuration) => {
        // Resize NEVER escalates priority
        set((s) => ({
          tasks: s.tasks.map((t) =>
            t.id === id ? { ...t, time: newTime, duration: Math.max(15, newDuration) } : t
          ),
        }));
      },

      reorderTask: (id, newTime) => {
        const task = get().tasks.find((t) => t.id === id);
        if (!task) return;
        // LOCK tasks cannot be reordered
        if (task.priority >= 3) return;
        set((s) => ({
          tasks: s.tasks.map((t) =>
            t.id === id ? { ...t, time: newTime } : t
          ),
        }));
      },

      skipFocusTask: () => {
        const state = get();
        const todayTasks = state.tasks
          .filter((t) => !t.completed && t.date === new Date().toISOString().split('T')[0])
          .sort((a, b) => (a.time || '').localeCompare(b.time || ''));
        const currentIdx = todayTasks.findIndex((t) => t.id === state.focusTaskId);
        const nextTask = todayTasks[currentIdx + 1] || todayTasks[0];
        set({ focusTaskId: nextTask?.id || null });
      },

      setFocusTask: (id) => set({ focusTaskId: id }),
      setEditingTask: (id) => set({ editingTaskId: id }),

      getTasksForDate: (date) => {
        const state = get();
        return state.tasks.filter((t) => t.date === date && !t.completed &&
          !(state.vacationMode && t.type === 'recurring'));
      },

      getCurrentFocusTask: () => {
        const state = get();
        if (state.focusTaskId) {
          const task = state.tasks.find((t) => t.id === state.focusTaskId && !t.completed);
          if (task) return task;
        }
        const today = new Date().toISOString().split('T')[0];
        return state.tasks
          .filter((t) => !t.completed && t.date === today)
          .sort((a, b) => (a.time || '').localeCompare(b.time || ''))[0];
      },

      getNextTask: (currentId) => {
        const today = new Date().toISOString().split('T')[0];
        const todayTasks = get()
          .tasks.filter((t) => !t.completed && t.date === today)
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

      generateRecurringInstances: (startDate, endDate) => {
        const state = get();
        const recurringParents = state.tasks.filter(
          (t) => t.recurrence && !t.isRecurrenceInstance
        );
        const existingInstanceDates = new Map<string, Set<string>>();
        state.tasks
          .filter((t) => t.isRecurrenceInstance && t.recurrenceParentId)
          .forEach((t) => {
            const set = existingInstanceDates.get(t.recurrenceParentId!) || new Set();
            set.add(t.date);
            existingInstanceDates.set(t.recurrenceParentId!, set);
          });

        const newTasks: Task[] = [];
        for (const parent of recurringParents) {
          if (!parent.recurrence) continue;
          const occurrences = getAllOccurrences(parent.recurrence, parent.date, startDate, endDate);
          const existing = existingInstanceDates.get(parent.id) || new Set();
          for (const occ of occurrences) {
            if (occ === parent.date) continue; // parent already covers its own date
            if (existing.has(occ)) continue;
            newTasks.push({
              id: generateId(),
              title: parent.title,
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
            });
          }
        }
        if (newTasks.length > 0) {
          set((s) => ({ tasks: [...s.tasks, ...newTasks] }));
        }
      },
    }),
    { name: 'do-task-store' }
  )
);
