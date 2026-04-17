import { create } from 'zustand';
import { playUISound } from '@/utils/soundEngine';
export interface CarryPayload {
  taskId: string;
  title: string;
  duration: number;
  fromDate: string;
  fromTime?: string;
  fromWaitingRoom?: boolean;
  fromLibrary?: boolean;
  libraryItemId?: string;
  pickedUpAt: number; // Date.now()
}

interface CarryState {
  carried: CarryPayload | null;
  /** Timestamp of last scroll end — used for cooldown */
  lastScrollEnd: number;
  pickup: (payload: CarryPayload) => void;
  drop: () => CarryPayload | null;
  cancel: () => void;
  markScrollEnd: () => void;
}

const CARRY_TIMEOUT_MS = 60_000;

export const useCarryStore = create<CarryState>((set, get) => ({
  carried: null,
  lastScrollEnd: 0,

  pickup: (payload) => {
    // If already carrying, return current task first (handled by caller)
    set({ carried: payload });
    playUISound('blip');

    // Auto-expire after 60s
    setTimeout(() => {
      const current = get().carried;
      if (current && current.taskId === payload.taskId && current.pickedUpAt === payload.pickedUpAt) {
        set({ carried: null });
      }
    }, CARRY_TIMEOUT_MS);
  },

  drop: () => {
    const carried = get().carried;
    set({ carried: null });
    return carried;
  },

  cancel: () => set({ carried: null }),

  markScrollEnd: () => set({ lastScrollEnd: Date.now() }),
}));

/** Returns true if a tap should be blocked due to scroll cooldown */
export function isInScrollCooldown(): boolean {
  const COOLDOWN_MS = 200;
  return Date.now() - useCarryStore.getState().lastScrollEnd < COOLDOWN_MS;
}

/**
 * Round a duration (in minutes) to the nearest 15-min increment, with a hard
 * floor of 15 minutes. Used whenever a carried/inventory task is placed onto
 * the day or week schedule so we never end up with odd, non-grid durations.
 */
export function roundCarriedDuration(mins: number): number {
  const rounded = Math.round(mins / 15) * 15;
  return Math.max(15, rounded);
}
