import { create } from 'zustand';

/**
 * Transient handoff used to seamlessly continue a drag when the user starts
 * dragging a task in DayListView and we portal them into the timeline view.
 * The TimelineTaskBlock that matches `taskId` consumes the handoff on mount
 * and synthetically begins its drag at the recorded pointer coordinates.
 */
export interface DragHandoff {
  taskId: string;
  pointerId: number;
  clientX: number;
  clientY: number;
  /** Date.now() so consumers can reject stale handoffs. */
  startedAt: number;
}

interface DragHandoffState {
  handoff: DragHandoff | null;
  setHandoff: (h: DragHandoff | null) => void;
  consume: (taskId: string) => DragHandoff | null;
}

export const useDragHandoffStore = create<DragHandoffState>((set, get) => ({
  handoff: null,
  setHandoff: (h) => set({ handoff: h }),
  consume: (taskId) => {
    const h = get().handoff;
    if (!h || h.taskId !== taskId) return null;
    // Stale handoffs (>1.5s) are ignored — pointer is almost certainly released.
    if (Date.now() - h.startedAt > 1500) {
      set({ handoff: null });
      return null;
    }
    set({ handoff: null });
    return h;
  },
}));
