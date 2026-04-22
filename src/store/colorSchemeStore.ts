import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { supabase } from '@/integrations/supabase/client';

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
  /** Timestamp of the last local user edit affecting persisted theme state */
  lastLocalChangeAt: string;

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

function nowIso() {
  return new Date().toISOString();
}

export type PersistedThemeState = Pick<ColorSchemeState, 'activeLightSchemeId' | 'activeDarkSchemeId' | 'customSchemes' | 'lastLocalChangeAt'>;

function isCustomSchemeForMode(scheme: ColorScheme, dark: boolean) {
  return !!scheme.darkMode === dark;
}

function resolveStoredSchemeId(dark: boolean, id: string | null | undefined, customSchemes: ColorScheme[]) {
  const fallback = defaultIdForMode(dark);
  if (!id) return fallback;
  if (presetsForMode(dark).some((scheme) => scheme.id === id)) return id;
  if (customSchemes.some((scheme) => isCustomSchemeForMode(scheme, dark) && scheme.id === id)) return id;
  return fallback;
}

function hasMeaningfulThemeState(state: Pick<ColorSchemeState, 'activeLightSchemeId' | 'activeDarkSchemeId' | 'customSchemes'>) {
  return (
    state.customSchemes.length > 0 ||
    state.activeLightSchemeId !== defaultIdForMode(false) ||
    state.activeDarkSchemeId !== defaultIdForMode(true)
  );
}

function getTimestampValue(timestamp: string | null | undefined) {
  if (!timestamp) return 0;
  const parsed = Date.parse(timestamp);
  return Number.isNaN(parsed) ? 0 : parsed;
}

function buildPersistedThemeState(state: Pick<ColorSchemeState, 'activeLightSchemeId' | 'activeDarkSchemeId' | 'customSchemes' | 'lastLocalChangeAt'>): PersistedThemeState {
  return {
    activeLightSchemeId: resolveStoredSchemeId(false, state.activeLightSchemeId, state.customSchemes),
    activeDarkSchemeId: resolveStoredSchemeId(true, state.activeDarkSchemeId, state.customSchemes),
    customSchemes: state.customSchemes,
    lastLocalChangeAt: state.lastLocalChangeAt,
  };
}

export function shouldPreferLocalThemeState(localChangedAt: string | null | undefined, remoteUpdatedAt: string | null | undefined) {
  return getTimestampValue(localChangedAt) > getTimestampValue(remoteUpdatedAt);
}

export function normalizePersistedThemeState(state: Pick<ColorSchemeState, 'activeLightSchemeId' | 'activeDarkSchemeId' | 'customSchemes' | 'lastLocalChangeAt'>) {
  return buildPersistedThemeState(state);
}

export function chooseAuthoritativeThemeState(local: PersistedThemeState, remote: PersistedThemeState | null) {
  const normalizedLocal = normalizePersistedThemeState(local);
  if (!remote) {
    return { source: 'local' as const, state: normalizedLocal };
  }

  const normalizedRemote = normalizePersistedThemeState(remote);
  const localTs = getTimestampValue(normalizedLocal.lastLocalChangeAt);
  const remoteTs = getTimestampValue(normalizedRemote.lastLocalChangeAt);

  if (localTs !== remoteTs) {
    return localTs > remoteTs
      ? { source: 'local' as const, state: normalizedLocal }
      : { source: 'remote' as const, state: normalizedRemote };
  }

  const localMeaningful = hasMeaningfulThemeState(normalizedLocal);
  const remoteMeaningful = hasMeaningfulThemeState(normalizedRemote);

  if (localMeaningful !== remoteMeaningful) {
    return localMeaningful
      ? { source: 'local' as const, state: normalizedLocal }
      : { source: 'remote' as const, state: normalizedRemote };
  }

  return { source: 'remote' as const, state: normalizedRemote };
}

export const useColorSchemeStore = create<ColorSchemeState>()(
  persist(
    (set, get) => ({
      activeLightSchemeId: 'cobalt',
      activeDarkSchemeId: 'dark-citrus',
      isDark: false,
      customSchemes: [],
      lastLocalChangeAt: '',

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
          set({ activeDarkSchemeId: id, lastLocalChangeAt: nowIso() });
        } else {
          set({ activeLightSchemeId: id, lastLocalChangeAt: nowIso() });
        }
        const presets = presetsForMode(isDark);
        const custom = get().customSchemes.filter(c => !!c.darkMode === isDark);
        const all = [...presets, ...custom];
        applyScheme(all.find(s => s.id === id) || presets[0]);
        scheduleRemoteSync();
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
          lastLocalChangeAt: nowIso(),
          ...(isDark ? { activeDarkSchemeId: id } : { activeLightSchemeId: id }),
        }));
        applyScheme(newScheme);
        scheduleRemoteSync();
        return id;
      },

      updateCustomScheme: (id, updates) => {
        set(s => ({
          lastLocalChangeAt: nowIso(),
          customSchemes: s.customSchemes.map(c =>
            c.id === id ? { ...c, ...updates } : c
          ),
        }));
        const s = get();
        const activeId = s.isDark ? s.activeDarkSchemeId : s.activeLightSchemeId;
        const updated = s.customSchemes.find(c => c.id === id);
        if (updated && activeId === id) applyScheme(updated);
        scheduleRemoteSync();
      },

      deleteCustomScheme: (id) => {
        const { isDark } = get();
        const fallback = defaultIdForMode(isDark);
        set(s => ({
          lastLocalChangeAt: nowIso(),
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
        scheduleRemoteSync();
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
        lastLocalChangeAt: s.lastLocalChangeAt,
      }),
      // Migrate old single activeSchemeId
      migrate: (persisted: any) => {
        const next = { ...(persisted || {}) };
        if (persisted && persisted.activeSchemeId && !persisted.activeLightSchemeId) {
          next.activeLightSchemeId = persisted.activeSchemeId;
          next.activeDarkSchemeId = 'dark-citrus';
        }
        if (!next.lastLocalChangeAt && hasMeaningfulThemeState({
          activeLightSchemeId: next.activeLightSchemeId || defaultIdForMode(false),
          activeDarkSchemeId: next.activeDarkSchemeId || defaultIdForMode(true),
          customSchemes: Array.isArray(next.customSchemes) ? next.customSchemes : [],
        })) {
          next.lastLocalChangeAt = nowIso();
        }
        return next;
      },
      version: 2,
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

// ── Remote sync (Supabase) ────────────────────────────────────────

let currentUserId: string | null = null;
let saveTimer: ReturnType<typeof setTimeout> | null = null;
let suppressSync = false;

export function setColorSchemeUser(userId: string | null) {
  currentUserId = userId;
}

export function scheduleRemoteSync() {
  if (suppressSync || !currentUserId) return;
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(saveRemote, 400);
}

async function saveRemote() {
  if (!currentUserId) return;
  const s = normalizePersistedThemeState(useColorSchemeStore.getState());
  try {
    const { error } = await supabase.from('user_color_schemes' as any).upsert({
      user_id: currentUserId,
      active_light_scheme_id: s.activeLightSchemeId,
      active_dark_scheme_id: s.activeDarkSchemeId,
      custom_schemes: s.customSchemes as any,
      updated_at: s.lastLocalChangeAt || new Date().toISOString(),
    }, {
      onConflict: 'user_id',
    });
    if (error) {
      console.error('[ColorScheme] Save failed:', error);
    }
  } catch (e) {
    console.error('[ColorScheme] Save failed:', e);
  }
}

export async function loadColorSchemeFromRemote(userId: string) {
  currentUserId = userId;
  try {
    const { data, error } = await supabase
      .from('user_color_schemes' as any)
      .select('*')
      .eq('user_id', userId)
      .maybeSingle();
    if (error) {
      console.error('[ColorScheme] Load failed:', error);
      return;
    }
    const local = normalizePersistedThemeState(useColorSchemeStore.getState());

    if (!data) {
      if (hasMeaningfulThemeState(local)) {
        await saveRemote();
      }
      return;
    }

    const row = data as any;
    const remote = normalizePersistedThemeState({
      activeLightSchemeId: row.active_light_scheme_id,
      activeDarkSchemeId: row.active_dark_scheme_id,
      customSchemes: Array.isArray(row.custom_schemes) ? row.custom_schemes : [],
      lastLocalChangeAt: row.updated_at || '',
    });
    const authoritative = chooseAuthoritativeThemeState(local, remote);

    if (authoritative.source === 'local') {
      if (
        local.activeLightSchemeId !== remote.activeLightSchemeId ||
        local.activeDarkSchemeId !== remote.activeDarkSchemeId ||
        JSON.stringify(local.customSchemes) !== JSON.stringify(remote.customSchemes) ||
        local.lastLocalChangeAt !== remote.lastLocalChangeAt
      ) {
        await saveRemote();
      }
      const scheme = useColorSchemeStore.getState().getActiveScheme();
      applyScheme(scheme);
      return;
    }

    suppressSync = true;
    useColorSchemeStore.setState({
      activeLightSchemeId: authoritative.state.activeLightSchemeId,
      activeDarkSchemeId: authoritative.state.activeDarkSchemeId,
      customSchemes: authoritative.state.customSchemes,
      lastLocalChangeAt: authoritative.state.lastLocalChangeAt,
    });
    suppressSync = false;

    const scheme = useColorSchemeStore.getState().getActiveScheme();
    applyScheme(scheme);
  } catch (e) {
    console.error('[ColorScheme] Load error:', e);
  }
}

export function subscribeColorSchemeRealtime(userId: string) {
  const channel = supabase
    .channel(`color-scheme-${userId}`)
    .on(
      'postgres_changes' as any,
      { event: '*', schema: 'public', table: 'user_color_schemes', filter: `user_id=eq.${userId}` },
      () => {
        loadColorSchemeFromRemote(userId);
      }
    )
    .subscribe();
  return () => {
    supabase.removeChannel(channel);
  };
}
