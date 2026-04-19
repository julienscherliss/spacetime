import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { useTimezoneStore, getTodayInTz } from '@/store/timezoneStore';
import { pickTip, type ReflectionReason } from '@/utils/reflectionTips';

export type AdjustmentKind = 'move' | 'retime' | 'resize';

interface AdjustmentLog {
  kind: AdjustmentKind;
  at: number;
  reason?: ReflectionReason | string;
  // The constraint that was violated (e.g. "Cannot move outside current week").
  violation?: string;
}

/**
 * A move that the user attempted but which violated a priority constraint.
 * The move is held here until the user picks a reflection reason (commits)
 * or dismisses (revert / no-op since nothing was applied).
 */
export interface PendingMove {
  taskId: string;
  newDate: string;
  newTime?: string;
  /** Human-readable constraint message. Drives subtitle copy. */
  violation: string;
  openedAt: number;
  /** How many constraint-violating drops this task has had today (informational). */
  count: number;
}

interface ReflectionState {
  /** Per-day per-task counts of constraint-violating drops. Key: `${date}::${taskId}` */
  daily: Record<string, { count: number; lastAt: number; logs: AdjustmentLog[] }>;
  /** Lifetime reason frequencies. */
  reasonFreq: Record<string, number>;
  /** Custom "other" reasons the user has entered, most-recent first. */
  customReasons: string[];
  /** Recently shown tip strings (rolling, max 12). */
  recentTips: string[];
  /** Currently pending move awaiting reflection, if any. */
  activePrompt: PendingMove | null;

  /**
   * Open the reflection prompt for a move that violated a priority constraint.
   * Returns true if a prompt was opened (caller should NOT apply the move).
   * Returns false if the call was debounced or another prompt is already open
   * (caller should also NOT apply the move — we silently swallow it).
   */
  requestPendingMove: (args: {
    taskId: string;
    newDate: string;
    newTime?: string;
    violation: string;
  }) => boolean;

  /** Dismiss the prompt without committing the pending move. */
  dismissPrompt: () => void;

  /**
   * Pick a reason. Commits the pending move (caller-supplied applier) and
   * returns a tip string.
   */
  selectReason: (
    reasonKey: ReflectionReason,
    customText: string | undefined,
    apply: (move: PendingMove) => void,
  ) => string | null;
}

const DEBOUNCE_MS = 500;
const RECENT_TIPS_MAX = 12;

const keyFor = (date: string, taskId: string) => `${date}::${taskId}`;

export const useReflectionStore = create<ReflectionState>()(
  persist(
    (set, get) => ({
      daily: {},
      reasonFreq: {},
      customReasons: [],
      recentTips: [],
      activePrompt: null,

      requestPendingMove: ({ taskId, newDate, newTime, violation }) => {
        // Don't stack prompts.
        if (get().activePrompt) return false;

        const tz = useTimezoneStore.getState().timezone;
        const today = getTodayInTz(tz);
        const k = keyFor(today, taskId);
        const now = Date.now();
        const prev = get().daily[k];

        // Debounce rapid attempts on the same task.
        if (prev && now - prev.lastAt < DEBOUNCE_MS) return false;

        // Garbage-collect prior days for this task.
        const dailyNext: ReflectionState['daily'] = {};
        for (const [key, val] of Object.entries(get().daily)) {
          const [d] = key.split('::');
          if (d === today) dailyNext[key] = val;
        }

        const nextCount = (prev?.count ?? 0) + 1;
        dailyNext[k] = {
          count: nextCount,
          lastAt: now,
          logs: [...(prev?.logs ?? []), { kind: 'move', at: now, violation }],
        };

        set({
          daily: dailyNext,
          activePrompt: {
            taskId,
            newDate,
            newTime,
            violation,
            openedAt: now,
            count: nextCount,
          },
        });
        return true;
      },

      dismissPrompt: () => set({ activePrompt: null }),

      selectReason: (reasonKey, customText, apply) => {
        const prompt = get().activePrompt;
        if (!prompt) return null;

        const reasonId = reasonKey === 'other' && customText ? `custom:${customText.trim()}` : reasonKey;
        const totalUses = (get().reasonFreq[reasonId] ?? 0) + 1;
        const tip = pickTip(reasonKey, totalUses, get().recentTips);

        let customReasons = get().customReasons;
        if (reasonKey === 'other' && customText && customText.trim()) {
          const trimmed = customText.trim();
          customReasons = [trimmed, ...customReasons.filter((r) => r !== trimmed)].slice(0, 20);
        }

        // Tag the latest log entry for this task today with the reason.
        const tz = useTimezoneStore.getState().timezone;
        const today = getTodayInTz(tz);
        const k = keyFor(today, prompt.taskId);
        const dayEntry = get().daily[k];
        const dailyNext = { ...get().daily };
        if (dayEntry) {
          const logs = [...dayEntry.logs];
          if (logs.length > 0) logs[logs.length - 1] = { ...logs[logs.length - 1], reason: reasonId };
          dailyNext[k] = { ...dayEntry, logs };
        }

        set({
          daily: dailyNext,
          reasonFreq: { ...get().reasonFreq, [reasonId]: totalUses },
          customReasons,
          recentTips: [tip, ...get().recentTips.filter((t) => t !== tip)].slice(0, RECENT_TIPS_MAX),
          activePrompt: null,
        });

        // Commit the held move.
        try {
          apply(prompt);
        } catch (e) {
          console.error('[Reflection] failed to apply pending move', e);
        }

        return tip;
      },
    }),
    {
      name: 'spacetime-reflection',
      partialize: (s) => ({
        daily: s.daily,
        reasonFreq: s.reasonFreq,
        customReasons: s.customReasons,
        recentTips: s.recentTips,
      }) as any,
    }
  )
);

/**
 * Convenience: try to open a reflection prompt for a constraint-violating move.
 * Returns true if the prompt was opened (the caller must NOT apply the move).
 * Returns false if another prompt is already active or the call was debounced.
 */
export function requestPendingMove(args: {
  taskId: string;
  newDate: string;
  newTime?: string;
  violation: string;
}): boolean {
  return useReflectionStore.getState().requestPendingMove(args);
}
