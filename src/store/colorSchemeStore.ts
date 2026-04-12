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
    id: 'terracotta',
    name: 'TERRACOTTA',
    preset: true,
    priorities: {
      0: { stroke: '30 15% 58%',  fill: '30 12% 58%' },
      1: { stroke: '25 50% 52%',  fill: '25 45% 52%' },
      2: { stroke: '14 72% 48%',  fill: '14 65% 48%' },
      3: { stroke: '4 68% 44%',   fill: '4 60% 44%' },
    },
    accent: '14 72% 48%',
    lockedFill: '10 55% 38%',
    lockedText: '40 30% 95%',
  },
  {
    id: 'cobalt',
    name: 'COBALT',
    preset: true,
    priorities: {
      0: { stroke: '220 20% 62%', fill: '220 18% 62%' },
      1: { stroke: '225 60% 55%', fill: '225 55% 55%' },
      2: { stroke: '230 80% 48%', fill: '230 75% 48%' },
      3: { stroke: '0 65% 50%',   fill: '0 55% 50%' },
    },
    accent: '230 80% 48%',
    lockedFill: '228 70% 38%',
    lockedText: '220 40% 96%',
  },
  {
    id: 'amethyst',
    name: 'AMETHYST',
    preset: true,
    priorities: {
      0: { stroke: '270 15% 60%', fill: '270 12% 60%' },
      1: { stroke: '265 45% 55%', fill: '265 40% 55%' },
      2: { stroke: '262 60% 50%', fill: '262 55% 50%' },
      3: { stroke: '0 65% 50%',   fill: '0 55% 50%' },
    },
    accent: '262 60% 50%',
    lockedFill: '265 50% 35%',
    lockedText: '270 30% 96%',
  },
  {
    id: 'monochrome',
    name: 'MONOCHROME',
    preset: true,
    priorities: {
      0: { stroke: '220 8% 65%',  fill: '220 6% 65%' },
      1: { stroke: '215 10% 50%', fill: '215 8% 50%' },
      2: { stroke: '210 12% 38%', fill: '210 10% 38%' },
      3: { stroke: '0 0% 15%',    fill: '0 0% 15%' },
    },
    accent: '210 12% 38%',
    lockedFill: '0 0% 12%',
    lockedText: '0 0% 96%',
  },
  {
    id: 'phosphor',
    name: 'PHOSPHOR',
    preset: true,
    priorities: {
      0: { stroke: '120 20% 50%', fill: '120 18% 50%' },
      1: { stroke: '90 40% 45%',  fill: '90 35% 45%' },
      2: { stroke: '60 60% 42%',  fill: '60 55% 42%' },
      3: { stroke: '30 80% 45%',  fill: '30 70% 45%' },
    },
    accent: '120 30% 45%',
    lockedFill: '0 0% 10%',
    lockedText: '120 30% 60%',
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
      0: { stroke: '0 0% 50%',    fill: '0 0% 18%' },
      1: { stroke: '40 50% 58%',  fill: '40 28% 20%' },
      2: { stroke: '22 72% 60%',  fill: '22 48% 22%' },
      3: { stroke: '0 65% 60%',   fill: '0 42% 20%' },
    },
    accent: '12 76% 55%',
    lockedFill: '0 0% 88%',
    lockedText: '0 0% 8%',
  },
  {
    id: 'dark-obsidian',
    name: 'OBSIDIAN',
    preset: true,
    darkMode: true,
    priorities: {
      0: { stroke: '220 12% 45%', fill: '220 8% 15%' },
      1: { stroke: '215 18% 55%', fill: '215 12% 19%' },
      2: { stroke: '210 25% 65%', fill: '210 18% 24%' },
      3: { stroke: '0 58% 62%',   fill: '0 38% 22%' },
    },
    accent: '210 25% 65%',
    lockedFill: '0 0% 82%',
    lockedText: '0 0% 8%',
  },
  {
    id: 'dark-cobalt',
    name: 'COBALT',
    preset: true,
    darkMode: true,
    priorities: {
      0: { stroke: '220 22% 48%', fill: '220 16% 17%' },
      1: { stroke: '225 55% 62%', fill: '225 32% 22%' },
      2: { stroke: '230 72% 68%', fill: '230 48% 26%' },
      3: { stroke: '0 62% 62%',   fill: '0 40% 22%' },
    },
    accent: '230 72% 65%',
    lockedFill: '228 55% 70%',
    lockedText: '228 20% 8%',
  },
  {
    id: 'dark-amethyst',
    name: 'AMETHYST',
    preset: true,
    darkMode: true,
    priorities: {
      0: { stroke: '270 15% 48%', fill: '270 10% 16%' },
      1: { stroke: '265 38% 58%', fill: '265 22% 21%' },
      2: { stroke: '262 52% 65%', fill: '262 38% 26%' },
      3: { stroke: '0 62% 62%',   fill: '0 40% 22%' },
    },
    accent: '262 52% 62%',
    lockedFill: '265 42% 65%',
    lockedText: '265 15% 8%',
  },
  {
    id: 'dark-phosphor',
    name: 'PHOSPHOR',
    preset: true,
    darkMode: true,
    priorities: {
      0: { stroke: '120 25% 42%', fill: '120 14% 13%' },
      1: { stroke: '90 42% 52%',  fill: '90 24% 17%' },
      2: { stroke: '60 60% 55%',  fill: '60 38% 20%' },
      3: { stroke: '30 78% 58%',  fill: '30 52% 22%' },
    },
    accent: '120 32% 50%',
    lockedFill: '120 30% 55%',
    lockedText: '120 10% 8%',
  },
  {
    id: 'dark-ember',
    name: 'EMBER',
    preset: true,
    darkMode: true,
    priorities: {
      0: { stroke: '30 15% 45%',  fill: '30 10% 15%' },
      1: { stroke: '25 48% 55%',  fill: '25 30% 19%' },
      2: { stroke: '14 68% 58%',  fill: '14 45% 23%' },
      3: { stroke: '4 62% 60%',   fill: '4 42% 22%' },
    },
    accent: '14 68% 58%',
    lockedFill: '10 52% 58%',
    lockedText: '10 15% 8%',
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
