import { create } from 'zustand';

interface QuickAddState {
  open: boolean;
  initialText: string;
  openBar: (text?: string) => void;
  close: () => void;
}

/**
 * Controls the global quick-add bar that lets users start typing from any main
 * view (week/day/month/focus) to capture a new library item.
 */
export const useQuickAddStore = create<QuickAddState>((set) => ({
  open: false,
  initialText: '',
  openBar: (text = '') => set({ open: true, initialText: text }),
  close: () => set({ open: false, initialText: '' }),
}));