import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { useTimezoneStore, getTodayInTz } from '@/store/timezoneStore';
import { useTaskStore } from '@/store/taskStore';
import { pickTip, type ReflectionReason } from '@/utils/reflectionTips';

export type AdjustmentKind = 'move' | 'retime' | 'resize';

interface AdjustmentLog {
  kind: AdjustmentKind;
  at: number;
  reason?: ReflectionReason | string; // string when custom
}

interface PromptState {
  taskId: string;
  count: number;
  openedAt: number;
}

interface ReflectionState {
  /** Per-day per-task counts. Key: `${date}::${taskId}` */
  daily: Record<string, { count: number; lastAt: number; logs: AdjustmentLog[] }>;
  /** Lifetime reason frequencies. */
  reasonFreq: Record<string, number>;
  /** Custom "other" reasons the user has entered, most-recent first. */
  customReasons: string[];
  /** Recently shown tip strings (rolling, max 12). */
  recentTips: string[];
  /** Currently open prompt, if any. */
  activePrompt: PromptState | null;

  recordAdjustment: (taskId: string, kind: AdjustmentKind) => void;
  dismissPrompt: () => void;
  selectReason: (reasonKey: ReflectionReason, customText?: string) => string | null;
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

      recordAdjustment: (taskId, kind) => {
        // Gate: Elite mode only.
        if (useTimezoneStore.getState().mobilityMode !== 'elite') return;
        // Gate: don't stack prompts.
        if (get().activePrompt) return;

        const tz = useTimezoneStore.getState().timezone;
        const today = getTodayInTz(tz);
        const k = keyFor(today, taskId);
        const now = Date.now();
        const prev = get().daily[k];

        // Debounce rapid adjustments.
        if (prev && now - prev.lastAt < DEBOUNCE_MS) return;

        // Garbage-collect prior days for this task to keep store small.
        const dailyNext: ReflectionState['daily'] = {};
        for (const [key, val] of Object.entries(get().daily)) {
          const [d] = key.split('::');
          if (d === today) dailyNext[key] = val;
        }

        const nextCount = (prev?.count ?? 0) + 1;
        dailyNext[k] = {
          count: nextCount,
          lastAt: now,
          logs: [...(prev?.logs ?? []), { kind, at: now }],
        };

        const shouldPrompt = nextCount > 0 && nextCount % 3 === 0;
        set({
          daily: dailyNext,
          activePrompt: shouldPrompt ? { taskId, count: nextCount, openedAt: now } : get().activePrompt,
        });
      },

      dismissPrompt: () => set({ activePrompt: null }),

      selectReason: (reasonKey, customText) => {
        const prompt = get().activePrompt;
        if (!prompt) return null;

        const reasonId = reasonKey === 'other' && customText ? `custom:${customText.trim()}` : reasonKey;
        const totalUses = (get().reasonFreq[reasonId] ?? 0) + 1;
        const tip = pickTip(reasonKey, totalUses, get().recentTips);

        // Persist custom reason.
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

        return tip;
      },
    }),
    {
      name: 'spacetime-reflection',
      // Don't persist the transient prompt.
      partialize: (s) => ({
        daily: s.daily,
        reasonFreq: s.reasonFreq,
        customReasons: s.customReasons,
        recentTips: s.recentTips,
      }) as any,
    }
  )
);

// Convenience hook used by stores/components that just need to fire-and-forget.
export function recordAdjustment(taskId: string, kind: AdjustmentKind) {
  useReflectionStore.getState().recordAdjustment(taskId, kind);
}

// Re-export for components.
export { useTaskStore };
