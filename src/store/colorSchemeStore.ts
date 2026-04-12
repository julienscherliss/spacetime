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
  /** Whether this scheme is for dark mode */
  darkMode?: boolean;
  priorities: Record<0 | 1 | 2 | 3, PriorityColors>;
  /** Primary accent HSL */
  accent: string;
  /** Locked task fill HSL */
  lockedFill: string;
  /** Locked task text HSL */
  lockedText: string;
}

// ── Built-in light presets ───────────────────────────────────────

const LIGHT_PRESETS: ColorScheme[] = [
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

// ── Built-in dark presets ────────────────────────────────────────

const DARK_PRESETS: ColorScheme[] = [
  {
    id: 'dark-industrial',
    name: 'INDUSTRIAL',
    preset: true,
    darkMode: true,
    priorities: {
      0: { stroke: '0 0% 45%',   fill: '0 0% 20%' },
      1: { stroke: '40 50% 55%', fill: '40 30% 22%' },
      2: { stroke: '22 75% 55%', fill: '22 50% 24%' },
      3: { stroke: '0 65% 55%',  fill: '0 45% 22%' },
    },
    accent: '12 76% 50%',
    lockedFill: '0 0% 95%',
    lockedText: '0 0% 8%',
  },
  {
    id: 'dark-ember',
    name: 'EMBER',
    preset: true,
    darkMode: true,
    priorities: {
      0: { stroke: '0 0% 40%',    fill: '0 0% 16%' },
      1: { stroke: '30 60% 50%',  fill: '30 40% 18%' },
      2: { stroke: '15 80% 55%',  fill: '15 55% 20%' },
      3: { stroke: '0 75% 60%',   fill: '0 55% 22%' },
    },
    accent: '15 80% 55%',
    lockedFill: '0 60% 65%',
    lockedText: '0 0% 5%',
  },
  {
    id: 'dark-phosphor',
    name: 'PHOSPHOR',
    preset: true,
    darkMode: true,
    priorities: {
      0: { stroke: '120 25% 40%', fill: '120 15% 14%' },
      1: { stroke: '90 45% 50%',  fill: '90 25% 16%' },
      2: { stroke: '60 65% 50%',  fill: '60 40% 18%' },
      3: { stroke: '30 80% 55%',  fill: '30 55% 20%' },
    },
    accent: '120 35% 50%',
    lockedFill: '120 30% 55%',
    lockedText: '0 0% 5%',
  },
  {
    id: 'dark-void',
    name: 'VOID',
    preset: true,
    darkMode: true,
    priorities: {
      0: { stroke: '0 0% 35%',   fill: '0 0% 12%' },
      1: { stroke: '0 0% 50%',   fill: '0 0% 18%' },
      2: { stroke: '0 0% 65%',   fill: '0 0% 24%' },
      3: { stroke: '0 0% 85%',   fill: '0 0% 32%' },
    },
    accent: '0 0% 70%',
    lockedFill: '0 0% 90%',
    lockedText: '0 0% 5%',
  },
  {
    id: 'dark-arctic',
    name: 'ARCTIC',
    preset: true,
    darkMode: true,
    priorities: {
      0: { stroke: '210 25% 45%', fill: '210 15% 16%' },
      1: { stroke: '200 50% 55%', fill: '200 30% 20%' },
      2: { stroke: '190 65% 55%', fill: '190 40% 22%' },
      3: { stroke: '0 65% 60%',   fill: '0 40% 22%' },
    },
    accent: '200 50% 55%',
    lockedFill: '200 40% 60%',
    lockedText: '0 0% 5%',
  },
];

export const ALL_PRESETS = [...LIGHT_PRESETS, ...DARK_PRESETS];

// ── Store ─────────────────────────────────────────────────────────

interface ColorSchemeState {
  /** Active scheme id for light mode */
  activeLightSchemeId: string;
  /** Active scheme id for dark mode */
  activeDarkSchemeId: string;
  /** Which mode is currently active (to know which id to use) */
  isDark: boolean;
  customSchemes: ColorScheme[];

  // Legacy compat — always returns the id for current mode
  activeSchemeId: string;

  getActiveScheme: () => ColorScheme;
  setActiveScheme: (id: string) => void;
  setDarkMode: (dark: boolean) => void;
  addCustomScheme: (scheme: Omit<ColorScheme, 'id' | 'preset'>) => string;
  updateCustomScheme: (id: string, updates: Partial<Omit<ColorScheme, 'id' | 'preset'>>) => void;
  deleteCustomScheme: (id: string) => void;
  duplicateScheme: (id: string) => string;
  allSchemes: () => ColorScheme[];
}

function presetsForMode(dark: boolean) {
  return dark ? DARK_PRESETS : LIGHT_PRESETS;
}

function defaultIdForMode(dark: boolean) {
  return dark ? 'dark-industrial' : 'industrial';
}

export const useColorSchemeStore = create<ColorSchemeState>()(
  persist(
    (set, get) => ({
      activeLightSchemeId: 'industrial',
      activeDarkSchemeId: 'dark-industrial',
      isDark: false,
      customSchemes: [],

      get activeSchemeId() {
        const s = get();
        return s.isDark ? s.activeDarkSchemeId : s.activeLightSchemeId;
      },

      allSchemes: () => {
        const { isDark, customSchemes } = get();
        const presets = presetsForMode(isDark);
        const custom = customSchemes.filter(c => !!c.darkMode === isDark);
        return [...presets, ...custom];
      },

      getActiveScheme: () => {
        const s = get();
        const id = s.isDark ? s.activeDarkSchemeId : s.activeLightSchemeId;
        const presets = presetsForMode(s.isDark);
        const custom = s.customSchemes.filter(c => !!c.darkMode === s.isDark);
        const all = [...presets, ...custom];
        return all.find(sc => sc.id === id) || presets[0];
      },

      setActiveScheme: (id) => {
        const { isDark } = get();
        if (isDark) {
          set({ activeDarkSchemeId: id });
        } else {
          set({ activeLightSchemeId: id });
        }
        const presets = presetsForMode(isDark);
        const custom = get().customSchemes.filter(c => !!c.darkMode === isDark);
        const all = [...presets, ...custom];
        applyScheme(all.find(s => s.id === id) || presets[0]);
      },

      setDarkMode: (dark) => {
        set({ isDark: dark });
        const s = get();
        const id = dark ? s.activeDarkSchemeId : s.activeLightSchemeId;
        const presets = presetsForMode(dark);
        const custom = s.customSchemes.filter(c => !!c.darkMode === dark);
        const all = [...presets, ...custom];
        applyScheme(all.find(sc => sc.id === id) || presets[0]);
      },

      addCustomScheme: (scheme) => {
        const { isDark } = get();
        const id = `custom-${Date.now()}`;
        const newScheme: ColorScheme = { ...scheme, id, preset: false, darkMode: isDark };
        set(s => ({
          customSchemes: [...s.customSchemes, newScheme],
          ...(isDark ? { activeDarkSchemeId: id } : { activeLightSchemeId: id }),
        }));
        applyScheme(newScheme);
        return id;
      },

      updateCustomScheme: (id, updates) => {
        set(s => ({
          customSchemes: s.customSchemes.map(c =>
            c.id === id ? { ...c, ...updates } : c
          ),
        }));
        const s = get();
        const activeId = s.isDark ? s.activeDarkSchemeId : s.activeLightSchemeId;
        const updated = s.customSchemes.find(c => c.id === id);
        if (updated && activeId === id) applyScheme(updated);
      },

      deleteCustomScheme: (id) => {
        const { isDark } = get();
        const fallback = defaultIdForMode(isDark);
        set(s => ({
          customSchemes: s.customSchemes.filter(c => c.id !== id),
          ...(isDark
            ? { activeDarkSchemeId: s.activeDarkSchemeId === id ? fallback : s.activeDarkSchemeId }
            : { activeLightSchemeId: s.activeLightSchemeId === id ? fallback : s.activeLightSchemeId }),
        }));
        const s = get();
        const activeId = isDark ? s.activeDarkSchemeId : s.activeLightSchemeId;
        if (activeId === fallback) {
          const presets = presetsForMode(isDark);
          applyScheme(presets[0]);
        }
      },

      duplicateScheme: (id) => {
        const s = get();
        const presets = presetsForMode(s.isDark);
        const custom = s.customSchemes.filter(c => !!c.darkMode === s.isDark);
        const all = [...presets, ...custom];
        const source = all.find(sc => sc.id === id);
        if (!source) return defaultIdForMode(s.isDark);
        return get().addCustomScheme({
          name: `${source.name} COPY`,
          darkMode: s.isDark,
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
        activeLightSchemeId: s.activeLightSchemeId,
        activeDarkSchemeId: s.activeDarkSchemeId,
        customSchemes: s.customSchemes,
      }),
      // Migrate old single activeSchemeId
      migrate: (persisted: any) => {
        if (persisted && persisted.activeSchemeId && !persisted.activeLightSchemeId) {
          return {
            ...persisted,
            activeLightSchemeId: persisted.activeSchemeId,
            activeDarkSchemeId: 'dark-industrial',
          };
        }
        return persisted;
      },
      version: 1,
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
  root.style.setProperty('--scheme-accent', scheme.accent);
  root.style.setProperty('--locked-fill', scheme.lockedFill);
  root.style.setProperty('--locked-text', scheme.lockedText);
}

/** Call on app boot to restore the persisted scheme */
export function initColorScheme() {
  const store = useColorSchemeStore.getState();
  // Sync isDark with current DOM state
  const isDark = document.documentElement.classList.contains('dark');
  if (store.isDark !== isDark) {
    useColorSchemeStore.setState({ isDark });
  }
  const scheme = useColorSchemeStore.getState().getActiveScheme();
  applyScheme(scheme);
}
