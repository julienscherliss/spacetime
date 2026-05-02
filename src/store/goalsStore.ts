import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export type GoalMetric = 'completed-tasks' | 'scheduled-minutes' | 'completed-minutes';
export type GoalPeriod = 'daily' | 'weekly' | 'monthly';

export interface Goal {
  id: string;
  /** Tag value, e.g. "work" or "work/email". Empty string = all-untagged. */
  tag: string;
  metric: GoalMetric;
  period: GoalPeriod;
  /** Target threshold. For minute-based metrics this is in minutes. */
  target: number;
  createdAt: number;
}

interface GoalsState {
  goals: Goal[];
  /** Map<goalId, periodKey> recording last period a celebration was shown. */
  lastCelebrated: Record<string, string>;
  addGoal: (g: Omit<Goal, 'id' | 'createdAt'>) => string;
  updateGoal: (id: string, patch: Partial<Omit<Goal, 'id' | 'createdAt'>>) => void;
  removeGoal: (id: string) => void;
  markCelebrated: (id: string, periodKey: string) => void;
}

export const useGoalsStore = create<GoalsState>()(
  persist(
    (set) => ({
      goals: [],
      lastCelebrated: {},
      addGoal: (g) => {
        const id = `goal-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
        set((s) => ({ goals: [...s.goals, { ...g, id, createdAt: Date.now() }] }));
        return id;
      },
      updateGoal: (id, patch) =>
        set((s) => ({ goals: s.goals.map((g) => (g.id === id ? { ...g, ...patch } : g)) })),
      removeGoal: (id) =>
        set((s) => {
          const { [id]: _, ...rest } = s.lastCelebrated;
          return { goals: s.goals.filter((g) => g.id !== id), lastCelebrated: rest };
        }),
      markCelebrated: (id, periodKey) =>
        set((s) => ({ lastCelebrated: { ...s.lastCelebrated, [id]: periodKey } })),
    }),
    { name: 'spaacetime.goals.v1' }
  )
);