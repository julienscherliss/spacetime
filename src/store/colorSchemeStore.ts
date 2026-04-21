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
    id: 'clay',
    name: 'CLAY',
    preset: true,
    priorities: {
      0: { stroke: '30 10% 85%',   fill: '0 0% 100%' },
      1: { stroke: '14 70% 53%',   fill: '0 0% 100%' },
      2: { stroke: '14 70% 53%',   fill: '14 70% 53%' },
      3: { stroke: '8 65% 28%',    fill: '8 65% 28%' },
    },
    accent: '14 70% 53%',
    lockedFill: '8 65% 28%',
    lockedText: '30 20% 96%',
  },
  {
    id: 'cobalt',
    name: 'COBALT',
    preset: true,
    priorities: {
      0: { stroke: '214 14% 90%', fill: '0 0% 98%' },
      1: { stroke: '228 69% 38%', fill: '0 0% 100%' },
      2: { stroke: '228 69% 38%', fill: '228 69% 38%' },
      3: { stroke: '227 53% 12%', fill: '226 52% 12%' },
    },
    accent: '230 80% 48%',
    lockedFill: '226 52% 12%',
    lockedText: '0 0% 96%',
  },
  {
    id: 'amethyst',
    name: 'AMETHYST',
    preset: true,
    priorities: {
      0: { stroke: '270 15% 88%', fill: '0 0% 100%' },
      1: { stroke: '262 60% 50%', fill: '0 0% 100%' },
      2: { stroke: '262 60% 50%', fill: '262 60% 50%' },
      3: { stroke: '260 44% 22%', fill: '260 44% 22%' },
    },
    accent: '262 60% 50%',
    lockedFill: '260 44% 22%',
    lockedText: '0 0% 96%',
  },
  {
    id: 'monochrome',
    name: 'MONOCHROME',
    preset: true,
    priorities: {
      0: { stroke: '220 8% 88%',  fill: '0 0% 100%' },
      1: { stroke: '210 12% 38%', fill: '0 0% 100%' },
      2: { stroke: '210 12% 38%', fill: '210 12% 38%' },
      3: { stroke: '0 0% 12%',    fill: '0 0% 12%' },
    },
    accent: '210 12% 38%',
    lockedFill: '0 0% 12%',
    lockedText: '0 0% 96%',
  },
  {
    id: 'citrus',
    name: 'CITRUS',
    preset: true,
    priorities: {
      0: { stroke: '74 20% 88%',  fill: '0 0% 100%' },
      1: { stroke: '68 67% 55%',  fill: '0 0% 100%' },
      2: { stroke: '68 67% 55%',  fill: '68 67% 55%' },
      3: { stroke: '67 45% 28%',  fill: '67 45% 28%' },
    },
    accent: '72 75% 48%',
    lockedFill: '67 45% 28%',
    lockedText: '0 0% 100%',
  },
];

// ── Built-in dark presets ────────────────────────────────────────

const DARK_PRESETS: ColorScheme[] = [
  {
    id: 'dark-obsidian',
    name: 'OBSIDIAN',
    preset: true,
    darkMode: true,
    priorities: {
      0: { stroke: '220 10% 22%', fill: '0 0% 8%' },
      1: { stroke: '210 25% 65%', fill: '0 0% 8%' },
      2: { stroke: '210 25% 65%', fill: '210 25% 65%' },
      3: { stroke: '0 0% 92%',    fill: '0 0% 92%' },
    },
    accent: '210 25% 65%',
    lockedFill: '0 0% 92%',
    lockedText: '0 0% 8%',
  },
  {
    id: 'dark-cobalt',
    name: 'COBALT',
    preset: true,
    darkMode: true,
    priorities: {
      0: { stroke: '220 14% 22%', fill: '0 0% 8%' },
      1: { stroke: '230 72% 62%', fill: '0 0% 8%' },
      2: { stroke: '230 72% 62%', fill: '230 72% 62%' },
      3: { stroke: '228 55% 88%', fill: '228 55% 88%' },
    },
    accent: '230 72% 65%',
    lockedFill: '228 55% 88%',
    lockedText: '228 20% 8%',
  },
  {
    id: 'dark-amethyst',
    name: 'AMETHYST',
    preset: true,
    darkMode: true,
    priorities: {
      0: { stroke: '270 10% 22%', fill: '0 0% 8%' },
      1: { stroke: '262 52% 62%', fill: '0 0% 8%' },
      2: { stroke: '262 52% 62%', fill: '262 52% 62%' },
      3: { stroke: '265 42% 88%', fill: '265 42% 88%' },
    },
    accent: '262 52% 62%',
    lockedFill: '265 42% 88%',
    lockedText: '265 15% 8%',
  },
  {
    id: 'dark-citrus',
    name: 'CITRUS',
    preset: true,
    darkMode: true,
    priorities: {
      0: { stroke: '60 8% 22%',   fill: '0 0% 8%' },
      1: { stroke: '72 70% 58%',  fill: '0 0% 8%' },
      2: { stroke: '72 70% 58%',  fill: '72 70% 58%' },
      3: { stroke: '75 65% 88%',  fill: '75 65% 88%' },
    },
    accent: '72 70% 58%',
    lockedFill: '75 65% 88%',
    lockedText: '0 0% 6%',
  },
  {
    id: 'dark-clay',
    name: 'CLAY',
    preset: true,
    darkMode: true,
    priorities: {
      0: { stroke: '30 8% 22%',    fill: '0 0% 8%' },
      1: { stroke: '14 65% 58%',   fill: '0 0% 8%' },
      2: { stroke: '14 65% 58%',   fill: '14 65% 58%' },
      3: { stroke: '8 60% 88%',    fill: '8 60% 88%' },
    },
    accent: '14 65% 58%',
    lockedFill: '8 60% 88%',
    lockedText: '30 12% 8%',
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
  return dark ? 'dark-citrus' : 'cobalt';
}

export const useColorSchemeStore = create<ColorSchemeState>()(
  persist(
    (set, get) => ({
      activeLightSchemeId: 'cobalt',
      activeDarkSchemeId: 'dark-citrus',
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
            activeDarkSchemeId: 'dark-citrus',
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
  // FIXED (P2) and LOCKED (P3) render directly from their priority fill/stroke,
  // so editing those colors in the scheme panel has a direct, visible effect.
  root.style.setProperty('--fixed-fill', scheme.priorities[2].fill);
  root.style.setProperty('--fixed-stroke', scheme.priorities[2].stroke);
  root.style.setProperty('--fixed-text', '0 0% 100%');
  root.style.setProperty('--locked-fill', scheme.priorities[3].fill);
  root.style.setProperty('--locked-stroke', scheme.priorities[3].stroke);
  root.style.setProperty('--locked-text', scheme.lockedText);
  // Override site highlight color (now line, date, routines, overdue, etc.)
  root.style.setProperty('--primary', scheme.accent);
  root.style.setProperty('--accent', scheme.accent);
  root.style.setProperty('--ring', scheme.accent);
  root.style.setProperty('--sidebar-primary', scheme.accent);
  root.style.setProperty('--sidebar-ring', scheme.accent);
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
