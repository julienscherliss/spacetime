import { create } from 'zustand';

export interface ScheduledDragState {
  taskId: string | null;
  sourceDate: string | null;
  originalTime: string | null;
  duration: number;
  grabOffsetY: number;
  /** Current snapped minutes from midnight */
  currentMinutes: number | null;
  /** Whether drag has been activated (past threshold) */
  active: boolean;
  /** The date column the drag overlay should render in */
  targetDate: string | null;
}

interface ScheduledDragActions {
  startDrag: (params: {
    taskId: string;
    sourceDate: string;
    originalTime: string;
    duration: number;
    grabOffsetY: number;
  }) => void;
  activate: () => void;
  updatePosition: (minutes: number) => void;
  setTargetDate: (date: string) => void;
  endDrag: () => ScheduledDragState;
  cancel: () => void;
}

const initial: ScheduledDragState = {
  taskId: null,
  sourceDate: null,
  originalTime: null,
  duration: 30,
  grabOffsetY: 0,
  currentMinutes: null,
  active: false,
  targetDate: null,
};

export const useScheduledDragStore = create<ScheduledDragState & ScheduledDragActions>((set, get) => ({
  ...initial,
  startDrag: (params) =>
    set({
      taskId: params.taskId,
      sourceDate: params.sourceDate,
      originalTime: params.originalTime,
      duration: params.duration,
      grabOffsetY: params.grabOffsetY,
      currentMinutes: null,
      active: false,
      targetDate: params.sourceDate,
    }),
  activate: () => set({ active: true }),
  updatePosition: (minutes) => set({ currentMinutes: minutes }),
  setTargetDate: (date) => set({ targetDate: date }),
  endDrag: () => {
    const state = { ...get() };
    set(initial);
    return state;
  },
  cancel: () => set(initial),
}));
