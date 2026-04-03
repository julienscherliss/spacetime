import { create } from 'zustand';

export interface TouchDragPayload {
  type: 'library' | 'waitingRoom' | 'task';
  id: string;
  title: string;
  duration: number;
  sourceDate?: string;
}

interface TouchDragState {
  dragging: TouchDragPayload | null;
  ghostPos: { x: number; y: number } | null;
  startDrag: (payload: TouchDragPayload, pos: { x: number; y: number }) => void;
  moveGhost: (pos: { x: number; y: number }) => void;
  endDrag: () => void;
}

export const useTouchDragStore = create<TouchDragState>((set) => ({
  dragging: null,
  ghostPos: null,
  startDrag: (payload, pos) => set({ dragging: payload, ghostPos: pos }),
  moveGhost: (pos) => set({ ghostPos: pos }),
  endDrag: () => set({ dragging: null, ghostPos: null }),
}));
