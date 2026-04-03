import { create } from 'zustand';

export interface TouchDragPayload {
  type: 'library' | 'waitingRoom' | 'task';
  id: string;
  title: string;
  duration: number;
  sourceDate?: string;
}

export interface TouchDragPreview {
  width: number;
  height: number;
  offsetX: number;
  offsetY: number;
}

interface TouchDragState {
  dragging: TouchDragPayload | null;
  ghostPos: { x: number; y: number } | null;
  preview: TouchDragPreview | null;
  startDrag: (payload: TouchDragPayload, pos: { x: number; y: number }, preview: TouchDragPreview) => void;
  moveGhost: (pos: { x: number; y: number }) => void;
  endDrag: () => void;
}

export const useTouchDragStore = create<TouchDragState>((set) => ({
  dragging: null,
  ghostPos: null,
  preview: null,
  startDrag: (payload, pos, preview) => set({ dragging: payload, ghostPos: pos, preview }),
  moveGhost: (pos) => set({ ghostPos: pos }),
  endDrag: () => set({ dragging: null, ghostPos: null, preview: null }),
}));
