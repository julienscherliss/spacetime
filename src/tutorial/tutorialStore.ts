import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export type TutorialPart = 'part1';

interface TutorialState {
  active: boolean;
  part: TutorialPart;
  stepIndex: number;
  completedParts: Record<TutorialPart, boolean>;
  dismissed: boolean; // user paused — can resume from Help
  start: (part?: TutorialPart) => void;
  advance: () => void;
  jumpTo: (index: number) => void;
  dismiss: () => void;
  resume: () => void;
  finishPart: (part: TutorialPart) => void;
  reset: () => void;
}

export const useTutorialStore = create<TutorialState>()(
  persist(
    (set, get) => ({
      active: false,
      part: 'part1',
      stepIndex: 0,
      completedParts: { part1: false },
      dismissed: false,
      start: (part = 'part1') =>
        set({ active: true, part, stepIndex: 0, dismissed: false }),
      advance: () => set((s) => ({ stepIndex: s.stepIndex + 1 })),
      jumpTo: (index) => set({ stepIndex: Math.max(0, index) }),
      dismiss: () => set({ active: false, dismissed: true }),
      resume: () => set({ active: true, dismissed: false }),
      finishPart: (part) =>
        set((s) => ({
          active: false,
          dismissed: false,
          completedParts: { ...s.completedParts, [part]: true },
        })),
      reset: () =>
        set({
          active: true,
          part: 'part1',
          stepIndex: 0,
          dismissed: false,
          completedParts: { part1: false },
        }),
    }),
    { name: 'tutorial-state-v1' }
  )
);