import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export interface PriorityColors {
  /** HSL string for the priority indicator color (text, badges, borders) */
  stroke: string;
  /** HSL string for fills/backgrounds when priority is shown */
  fill: string;
}

export interface ColorScheme {
  id: string;
  name: string;
  /** Whether this is a built-in preset */
  preset: boolean;
  priorities: Record<0 | 1 | 2 | 3, PriorityColors>;
  /** Primary accent HSL */
  accent: string;
  /** Locked task fill HSL */
  lockedFill: string;
  /** Locked task text HSL */
  lockedText: string;
}

// ── Built-in presets ──────────────────────────────────────────────

const PRESETS: ColorScheme[] = [
  {
    id: 'industrial',
    name: 'INDUSTRIAL',
    preset: true,
    priorities: {
      0: { stroke: '0 0% 55%',   fill: '0 0% 55%' },
      1: { stroke: '40 55% 48%', fill: '40 55% 48%' },
      2: { stroke: '22 80% 50%', fill: '22 80% 50%' },
      3: { stroke: '0 70% 50%',  fill: '0 70% 50%' },
    },
    accent: '12 76% 50%',
    lockedFill: '0 0% 12%',
    lockedText: '0 0% 96%',
  },
  {
    id: 'monochrome',
    name: 'MONOCHROME',
    preset: true,
    priorities: {
      0: { stroke: '0 0% 60%',   fill: '0 0% 60%' },
      1: { stroke: '0 0% 45%',   fill: '0 0% 45%' },
      2: { stroke: '0 0% 30%',   fill: '0 0% 30%' },
      3: { stroke: '0 0% 12%',   fill: '0 0% 12%' },
    },
    accent: '0 0% 25%',
    lockedFill: '0 0% 12%',
    lockedText: '0 0% 96%',
  },
  {
    id: 'thermal',
    name: 'THERMAL',
    preset: true,
    priorities: {
      0: { stroke: '210 40% 55%', fill: '210 40% 55%' },
      1: { stroke: '50 70% 50%',  fill: '50 70% 50%' },
      2: { stroke: '25 85% 50%',  fill: '25 85% 50%' },
      3: { stroke: '0 80% 48%',   fill: '0 80% 48%' },
    },
    accent: '25 85% 50%',
    lockedFill: '0 80% 48%',
    lockedText: '0 0% 100%',
  },
  {
    id: 'phosphor',
    name: 'PHOSPHOR',
    preset: true,
    priorities: {
      0: { stroke: '120 20% 50%', fill: '120 20% 50%' },
      1: { stroke: '90 40% 45%',  fill: '90 40% 45%' },
      2: { stroke: '60 60% 42%',  fill: '60 60% 42%' },
      3: { stroke: '30 80% 45%',  fill: '30 80% 45%' },
    },
    accent: '120 30% 45%',
    lockedFill: '0 0% 10%',
    lockedText: '120 30% 60%',
  },
  {
    id: 'blueprint',
    name: 'BLUEPRINT',
    preset: true,
    priorities: {
      0: { stroke: '220 30% 60%', fill: '220 30% 60%' },
      1: { stroke: '200 50% 50%', fill: '200 50% 50%' },
      2: { stroke: '180 60% 42%', fill: '180 60% 42%' },
      3: { stroke: '0 70% 50%',   fill: '0 70% 50%' },
    },
    accent: '200 50% 50%',
    lockedFill: '220 20% 15%',
    lockedText: '200 50% 80%',
  },
];

// ── Store ─────────────────────────────────────────────────────────

interface ColorSchemeState {
  activeSchemeId: string;
  customSchemes: ColorScheme[];
  getActiveScheme: () => ColorScheme;
  setActiveScheme: (id: string) => void;
  addCustomScheme: (scheme: Omit<ColorScheme, 'id' | 'preset'>) => string;
  updateCustomScheme: (id: string, updates: Partial<Omit<ColorScheme, 'id' | 'preset'>>) => void;
  deleteCustomScheme: (id: string) => void;
  duplicateScheme: (id: string) => string;
  allSchemes: () => ColorScheme[];
}

export const useColorSchemeStore = create<ColorSchemeState>()(
  persist(
    (set, get) => ({
      activeSchemeId: 'industrial',
      customSchemes: [],

      allSchemes: () => [...PRESETS, ...get().customSchemes],

      getActiveScheme: () => {
        const all = [...PRESETS, ...get().customSchemes];
        return all.find(s => s.id === get().activeSchemeId) || PRESETS[0];
      },

      setActiveScheme: (id) => {
        set({ activeSchemeId: id });
        applyScheme([...PRESETS, ...get().customSchemes].find(s => s.id === id) || PRESETS[0]);
      },

      addCustomScheme: (scheme) => {
        const id = `custom-${Date.now()}`;
        const newScheme: ColorScheme = { ...scheme, id, preset: false };
        set(s => ({ customSchemes: [...s.customSchemes, newScheme], activeSchemeId: id }));
        applyScheme(newScheme);
        return id;
      },

      updateCustomScheme: (id, updates) => {
        set(s => ({
          customSchemes: s.customSchemes.map(c =>
            c.id === id ? { ...c, ...updates } : c
          ),
        }));
        const updated = get().customSchemes.find(c => c.id === id);
        if (updated && get().activeSchemeId === id) applyScheme(updated);
      },

      deleteCustomScheme: (id) => {
        set(s => ({
          customSchemes: s.customSchemes.filter(c => c.id !== id),
          activeSchemeId: s.activeSchemeId === id ? 'industrial' : s.activeSchemeId,
        }));
        if (get().activeSchemeId === 'industrial') applyScheme(PRESETS[0]);
      },

      duplicateScheme: (id) => {
        const source = [...PRESETS, ...get().customSchemes].find(s => s.id === id);
        if (!source) return 'industrial';
        return get().addCustomScheme({
          name: `${source.name} COPY`,
          priorities: { ...source.priorities },
          accent: source.accent,
          lockedFill: source.lockedFill,
          lockedText: source.lockedText,
        });
      },
    }),
    {
      name: 'do-color-scheme',
      partialize: (s) => ({
        activeSchemeId: s.activeSchemeId,
        customSchemes: s.customSchemes,
      }),
    }
  )
);

// ── Apply CSS variables ───────────────────────────────────────────

export function applyScheme(scheme: ColorScheme) {
  const root = document.documentElement;
  for (const p of [0, 1, 2, 3] as const) {
    root.style.setProperty(`--priority-${p}`, scheme.priorities[p].stroke);
    root.style.setProperty(`--priority-${p}-fill`, scheme.priorities[p].fill);
  }
  // We don't override --primary/--accent here to keep the base theme intact,
  // but we expose scheme accent for optional use
  root.style.setProperty('--scheme-accent', scheme.accent);
  root.style.setProperty('--locked-fill', scheme.lockedFill);
  root.style.setProperty('--locked-text', scheme.lockedText);
}

/** Call on app boot to restore the persisted scheme */
export function initColorScheme() {
  const scheme = useColorSchemeStore.getState().getActiveScheme();
  applyScheme(scheme);
}
