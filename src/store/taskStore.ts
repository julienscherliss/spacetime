import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export type Priority = 0 | 1 | 2 | 3;
export type TaskType = 'one-time' | 'recurring';
export type ViewMode = 'focus' | 'day' | 'week' | 'calendar';

export interface Task {
  id: string;
  title: string;
  type: TaskType;
  priority: Priority;
  originalPriority: Priority;
  date: string; // YYYY-MM-DD
  time?: string; // HH:MM
  duration?: number; // minutes
  completed: boolean;
  createdAt: string;
  moveCount: number;
}

export interface DailyStats {
  completed: number;
  total: number;
  pushed: number;
}

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
  updateTask: (id: string, updates: Partial<Pick<Task, 'title' | 'date' | 'time' | 'duration'>>) => void;
  completeTask: (id: string) => void;
  deleteTask: (id: string) => void;
  moveTask: (id: string, newDate: string, newTime?: string) => { blocked: boolean };
  reorderTask: (id: string, newTime: string) => void;
  skipFocusTask: () => void;
  setFocusTask: (id: string | null) => void;
  setEditingTask: (id: string | null) => void;
  getTasksForDate: (date: string) => Task[];
  getCurrentFocusTask: () => Task | undefined;
  getNextTask: (currentId: string) => Task | undefined;
  getDailyStats: () => DailyStats;
  dismissCompletionStats: () => void;
}

const generateId = () => Math.random().toString(36).substring(2, 10);

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
        // Check if all today's tasks are done
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

      moveTask: (id, newDate, newTime) => {
        const task = get().tasks.find((t) => t.id === id);
        if (!task) return { blocked: false };

        if (task.priority >= 3) {
          return { blocked: true };
        }

        const newPriority = Math.min(3, task.priority + 1) as Priority;
        set((s) => ({
          tasks: s.tasks.map((t) =>
            t.id === id
              ? {
                  ...t,
                  date: newDate,
                  time: newTime ?? t.time,
                  priority: newPriority,
                  moveCount: t.moveCount + 1,
                }
              : t
          ),
        }));
        return { blocked: false };
      },

      reorderTask: (id, newTime) => {
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

      getTasksForDate: (date) =>
        get().tasks.filter((t) => t.date === date && !t.completed),

      getCurrentFocusTask: () => {
        const state = get();
        if (state.focusTaskId) {
          const task = state.tasks.find((t) => t.id === state.focusTaskId && !t.completed);
          if (task) return task;
        }
        const today = new Date().toISOString().split('T')[0];
        const todayTasks = state.tasks
          .filter((t) => !t.completed && t.date === today)
          .sort((a, b) => (a.time || '').localeCompare(b.time || ''));
        return todayTasks[0];
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
    }),
    { name: 'do-task-store' }
  )
);
