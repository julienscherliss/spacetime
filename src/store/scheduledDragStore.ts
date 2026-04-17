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
  /** Whether the task is a linked recurring task */
  isLinkedTask: boolean;
  /** When true, dropping will detach this single occurrence from its linked group */
  unlinkMode: boolean;
  /** Whether the current drag position is blocked by collision */
  blocked: boolean;
  /** Whether the drop should copy instead of move */
  copyMode: boolean;
  /** When set, dropping will relink this task to the target's series */
  relinkMode: boolean;
  /** The task ID to relink to */
  relinkTargetId: string | null;
  /** When the pointer is hovering over a Group block, dropping adds the task to that Group */
  dropTargetGroupId: string | null;
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
  setUnlinkMode: (unlink: boolean) => void;
  setBlocked: (blocked: boolean) => void;
  setCopyMode: (copy: boolean) => void;
  setRelinkMode: (relink: boolean, targetId?: string | null) => void;
  setDropTargetGroup: (groupId: string | null) => void;
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
  isLinkedTask: false,
  unlinkMode: false,
  blocked: false,
  copyMode: false,
  relinkMode: false,
  relinkTargetId: null,
  dropTargetGroupId: null,
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
      isLinkedTask: false,
      unlinkMode: false,
    }),
  activate: () => set({ active: true }),
  updatePosition: (minutes) => set({ currentMinutes: minutes }),
  setTargetDate: (date) => set({ targetDate: date }),
  setUnlinkMode: (unlink) => set({ unlinkMode: unlink }),
  setBlocked: (blocked) => set({ blocked }),
  setCopyMode: (copyMode) => set({ copyMode }),
  setRelinkMode: (relinkMode, targetId = null) => set({ relinkMode, relinkTargetId: targetId }),
  setDropTargetGroup: (groupId) => set({ dropTargetGroupId: groupId }),
  endDrag: () => {
    const state = { ...get() };
    set(initial);
    return state;
  },
  cancel: () => set(initial),
}));
