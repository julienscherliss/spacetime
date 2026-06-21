import { create } from 'zustand';

/**
 * Lightweight global state for the "click-and-drag from Library" interaction.
 *
 * Unlike the normal carry flow (carryStore), this drag never enters carry mode
 * — the library panel stays visible and the task is only materialized at the
 * very end. Surfaces (TimelineColumn, Sequencer) subscribe to this store to
 * render a snapped-to-slot task-block-style preview while the user drags.
 */
export interface LibraryDragItem {
  id: string;
  title: string;
  duration: number;
  icon?: string;
  category?: string;
}

interface LibraryDragState {
  active: boolean;
  item: LibraryDragItem | null;
  /** Pointer client coordinates, updated on every move. */
  x: number;
  y: number;
  /** True when the pointer is currently inside a drop-eligible surface. */
  overSurface: boolean;
  start: (item: LibraryDragItem, x: number, y: number) => void;
  move: (x: number, y: number, overSurface: boolean) => void;
  end: () => void;
}

export const useLibraryDragStore = create<LibraryDragState>((set) => ({
  active: false,
  item: null,
  x: 0,
  y: 0,
  overSurface: false,
  start: (item, x, y) => set({ active: true, item, x, y, overSurface: false }),
  move: (x, y, overSurface) => set({ x, y, overSurface }),
  end: () => set({ active: false, item: null, overSurface: false }),
}));