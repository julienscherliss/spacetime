import { create } from 'zustand';

interface PendingPrompt {
  tagValue: string;
  tagLabel: string;
  parentTagValue: string;
  parentRateType: 'hourly' | 'flat';
  parentHourlyRate: number;
  parentCurrency: string;
}

interface BillingPromptState {
  queue: PendingPrompt[];
  enqueue: (prompt: PendingPrompt) => void;
  dismissCurrent: () => void;
}

export const useBillingPromptStore = create<BillingPromptState>((set, get) => ({
  queue: [],
  enqueue: (prompt) => {
    // Avoid duplicates
    if (get().queue.some(p => p.tagValue === prompt.tagValue)) return;
    set(s => ({ queue: [...s.queue, prompt] }));
  },
  dismissCurrent: () => set(s => ({ queue: s.queue.slice(1) })),
}));