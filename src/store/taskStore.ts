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

interface TaskState {
  tasks: Task[];
  viewMode: ViewMode;
  vacationMode: boolean;
  focusTaskId: string | null;
  
  setViewMode: (mode: ViewMode) => void;
  toggleVacationMode: () => void;
  addTask: (task: Omit<Task, 'id' | 'createdAt' | 'completed' | 'moveCount' | 'originalPriority'>) => void;
  completeTask: (id: string) => void;
  deleteTask: (id: string) => void;
  moveTask: (id: string, newDate: string) => { blocked: boolean };
  skipFocusTask: () => void;
  setFocusTask: (id: string | null) => void;
  getTasksForDate: (date: string) => Task[];
  getCurrentFocusTask: () => Task | undefined;
}

const generateId = () => Math.random().toString(36).substring(2, 10);

export const useTaskStore = create<TaskState>()(
  persist(
    (set, get) => ({
      tasks: [
        {
          id: 'demo-1',
          title: 'Review quarterly goals',
          type: 'one-time',
          priority: 1,
          originalPriority: 0,
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
          type: 'one-time',
          priority: 2,
          originalPriority: 1,
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
          type: 'one-time',
          priority: 0,
          originalPriority: 0,
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
          type: 'recurring',
          priority: 3,
          originalPriority: 3,
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
          type: 'one-time',
          priority: 1,
          originalPriority: 0,
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
          type: 'one-time',
          priority: 0,
          originalPriority: 0,
          date: new Date(Date.now() + 86400000 * 2).toISOString().split('T')[0],
          time: '10:00',
          duration: 30,
          completed: false,
          createdAt: new Date().toISOString(),
          moveCount: 0,
        },
      ],
      viewMode: 'focus',
      vacationMode: false,
      focusTaskId: null,

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

      completeTask: (id) =>
        set((s) => ({
          tasks: s.tasks.map((t) =>
            t.id === id ? { ...t, completed: true } : t
          ),
        })),

      deleteTask: (id) =>
        set((s) => ({ tasks: s.tasks.filter((t) => t.id !== id) })),

      moveTask: (id, newDate) => {
        const task = get().tasks.find((t) => t.id === id);
        if (!task) return { blocked: false };

        if (task.priority >= 3) {
          return { blocked: true };
        }

        const newPriority = Math.min(3, task.priority + 1) as Priority;
        set((s) => ({
          tasks: s.tasks.map((t) =>
            t.id === id
              ? { ...t, date: newDate, priority: newPriority, moveCount: t.moveCount + 1 }
              : t
          ),
        }));
        return { blocked: false };
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
    }),
    { name: 'do-task-store' }
  )
);
