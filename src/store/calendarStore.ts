import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { supabase } from '@/integrations/supabase/client';
import { useTimezoneStore } from '@/store/timezoneStore';
import { isNativePlatform, isElectron } from '@/utils/nativePlatform';

// ---------------------------------------------------------------------------
// Platform-tagged logger. NEVER logs token values — only metadata about flow.
// ---------------------------------------------------------------------------
function platformTag(): 'web' | 'capacitor' | 'electron' {
  if (isElectron()) return 'electron';
  if (isNativePlatform()) return 'capacitor';
  return 'web';
}
function calLog(stage: string, info: Record<string, unknown> = {}) {
  // eslint-disable-next-line no-console
  console.info(`[gcal/${platformTag()}] ${stage}`, info);
}

/**
 * Awaits a hydrated Supabase session. Returns the user id when authenticated,
 * or null when no session is available yet. All edge-function calls must
 * resolve through here so we never fire calendar requests before the JWT is
 * attached — that's the main reason native/electron previously reported
 * "disconnected".
 */
async function getAuthedUserId(): Promise<string | null> {
  try {
    const { data: { session } } = await supabase.auth.getSession();
    return session?.user?.id ?? null;
  } catch {
    return null;
  }
}

export interface GoogleCalendar {
  id: string;
  google_calendar_id: string;
  name: string;
  color: string | null;
  visible: boolean;
}

export interface CalendarEvent {
  id: string;
  calendarId: string;
  title: string;
  date: string;
  /** Inclusive end date for multi-day events, null for single-day */
  endDate: string | null;
  time: string | null;
  duration: number;
  isAllDay: boolean;
  location: string | null;
  description: string | null;
  color: string | null;
}

interface CalendarState {
  connected: boolean;
  email: string | null;
  calendars: GoogleCalendar[];
  eventsById: Record<string, CalendarEvent>;
  events: CalendarEvent[];
  loading: boolean;
  panelOpen: boolean;
  deviceId: string;
  lastFetchedRange: { startDate: string; endDate: string } | null;
  lastFetchSignature: string | null;
  lastFetchedAt: number | null;
  completedEventIds: string[];
  deletedEventIds: string[];
  eventCategories: Record<string, string>;
  editingEventId: string | null;

  setPanelOpen: (open: boolean) => void;
  checkStatus: () => Promise<void>;
  startAuth: () => Promise<void>;
  handleAuthCallback: (code: string) => Promise<void>;
  fetchCalendars: () => Promise<void>;
  fetchEvents: (startDate: string, endDate: string) => Promise<void>;
  refreshCalendarData: () => Promise<void>;
  toggleCalendar: (calendarId: string, visible: boolean) => void;
  disconnect: () => Promise<void>;
  completeEvent: (eventId: string) => void;
  uncompleteEvent: (eventId: string) => void;
  deleteEvent: (eventId: string) => void;
  reviveEvent: (eventId: string) => void;
  setEventCategory: (eventId: string, category: string) => void;
  setEditingEvent: (eventId: string | null) => void;
  isEventCompleted: (eventId: string) => boolean;
  isEventDeleted: (eventId: string) => boolean;
}

function getDeviceId(): string {
  let id = localStorage.getItem('do-device-id');
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem('do-device-id', id);
  }
  return id;
}

async function callEdge(action: string, params: Record<string, any> = {}) {
  // Force-attach the latest JWT. supabase.functions.invoke normally injects it
  // automatically, but on native cold-start the session can finish hydrating
  // a tick after import; explicit lookup avoids the race.
  const { data: { session } } = await supabase.auth.getSession();
  const accessToken = session?.access_token;
  if (!accessToken) {
    calLog('callEdge.skipped_no_session', { action });
    throw new Error('Not authenticated');
  }
  const { data, error } = await supabase.functions.invoke('google-calendar', {
    body: { action, ...params },
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (error) {
    calLog('callEdge.error', { action, message: error.message });
    throw new Error(error.message);
  }
  return data;
}

const CALENDAR_CACHE_TTL_MS = 5 * 60 * 1000;

function addDays(dateStr: string, days: number): string {
  const date = new Date(`${dateStr}T12:00:00`);
  date.setDate(date.getDate() + days);
  return date.toISOString().split('T')[0];
}

function getInclusiveDaySpan(startDate: string, endDate: string): number {
  const start = new Date(`${startDate}T12:00:00`).getTime();
  const end = new Date(`${endDate}T12:00:00`).getTime();
  return Math.max(1, Math.round((end - start) / 86400000) + 1);
}

function buildFetchSignature(calendarIds: string[], timeZone: string): string {
  return `${timeZone}::${[...calendarIds].sort().join('|')}`;
}

function rangeCovers(
  range: { startDate: string; endDate: string } | null,
  startDate: string,
  endDate: string
): boolean {
  return !!range && range.startDate <= startDate && range.endDate >= endDate;
}

/**
 * Check if a multi-day event spans into the given date.
 */
export function eventSpansDate(event: CalendarEvent, date: string): boolean {
  if (event.date === date) return true;
  if (!event.endDate) return false;
  return date >= event.date && date <= event.endDate;
}

export const useCalendarStore = create<CalendarState>()(
  persist(
    (set, get) => ({
      connected: false,
      email: null,
      calendars: [],
      eventsById: {} as Record<string, CalendarEvent>,
      events: [],
      loading: false,
      panelOpen: false,
      deviceId: getDeviceId(),
      lastFetchedRange: null,
      lastFetchSignature: null,
      lastFetchedAt: null,
      completedEventIds: [] as string[],
      deletedEventIds: [] as string[],
      eventCategories: {} as Record<string, string>,
      editingEventId: null,

      setPanelOpen: (open) => set({ panelOpen: open }),

      checkStatus: async () => {
        const userId = await getAuthedUserId();
        if (!userId) {
          calLog('checkStatus.skipped_no_session');
          // Don't flip to disconnected on a missing session — that's a race,
          // not a real disconnect. Leave whatever state we had.
          return;
        }
        try {
          calLog('checkStatus.start', { userId });
          const result = await callEdge('status');
          calLog('checkStatus.result', { connected: !!result?.connected });
          set({ connected: !!result?.connected, email: result?.email || null });
          if (result?.connected) {
            get().fetchCalendars();
          } else {
            set({ calendars: [], eventsById: {}, events: [] });
          }
        } catch (e) {
          calLog('checkStatus.failed', { message: (e as Error)?.message });
          set({ connected: false, email: null });
        }
      },

      startAuth: async () => {
        if (isNativePlatform()) {
          console.debug('[calendarStore] startAuth blocked on native — Google Calendar must be connected on web');
          return;
        }
        const redirectUri = window.location.origin;
        const result = await callEdge('get_auth_url', { redirectUri });
        window.location.href = result.url;
      },

      handleAuthCallback: async (code) => {
        set({ loading: true });
        try {
          const redirectUri = window.location.origin;
          await callEdge('exchange_code', { code, redirectUri });
          set({ connected: true, loading: false });
          await get().fetchCalendars();
        } catch (e) {
          console.error('Auth callback error:', e);
          set({ loading: false });
        }
      },

      fetchCalendars: async () => {
        const userId = await getAuthedUserId();
        if (!userId) { calLog('fetchCalendars.skipped_no_session'); return; }
        try {
          calLog('fetchCalendars.start');
          const result = await callEdge('calendars');
          calLog('fetchCalendars.result', { count: Array.isArray(result) ? result.length : 0 });
          if (Array.isArray(result)) {
            set({
              calendars: result.map((c: any) => ({
                id: c.id,
                google_calendar_id: c.google_calendar_id,
                name: c.name,
                color: c.color,
                visible: c.visible,
              })),
            });
          }
        } catch (e) {
          calLog('fetchCalendars.failed', { message: (e as Error)?.message });
        }
      },

      fetchEvents: async (startDate, endDate) => {
        const userId = await getAuthedUserId();
        if (!userId) { calLog('fetchEvents.skipped_no_session'); return; }
        const {
          calendars,
          lastFetchedRange,
          lastFetchSignature,
          lastFetchedAt,
          eventsById,
        } = get();
        const timeZone = useTimezoneStore.getState().timezone;
        const visibleCalIds = calendars
          .filter(c => c.visible)
          .map(c => c.google_calendar_id)
          .sort();

        if (visibleCalIds.length === 0) {
          set({
            eventsById: {},
            events: [],
            loading: false,
            lastFetchedRange: null,
            lastFetchSignature: null,
            lastFetchedAt: null,
          });
          return;
        }

        const fetchSignature = buildFetchSignature(visibleCalIds, timeZone);
        const cacheCoversRequestedRange =
          fetchSignature === lastFetchSignature && rangeCovers(lastFetchedRange, startDate, endDate);
        const cacheIsFresh = !!lastFetchedAt && Date.now() - lastFetchedAt < CALENDAR_CACHE_TTL_MS;

        if (cacheCoversRequestedRange && cacheIsFresh) {
          return;
        }

        const cachedEvents = Object.values(eventsById);
        const requestedRangeHasVisibleEvents = cachedEvents.some(
          (event) =>
            visibleCalIds.includes(event.calendarId) &&
            event.date >= startDate &&
            event.date <= endDate
        );

        const requestedSpan = getInclusiveDaySpan(startDate, endDate);
        const bufferDays = Math.max(requestedSpan * 3, 21);
        const bufferedStartDate = addDays(startDate, -bufferDays);
        const bufferedEndDate = addDays(endDate, bufferDays);

        set({ loading: !requestedRangeHasVisibleEvents });

        try {
          calLog('fetchEvents.start', { calCount: visibleCalIds.length, startDate, endDate });
          const result = await callEdge('events', {
            timeMin: bufferedStartDate,
            timeMax: bufferedEndDate,
            calendarIds: visibleCalIds,
            timeZone,
          });
          calLog('fetchEvents.result', { count: Array.isArray(result) ? result.length : 0 });
          if (Array.isArray(result)) {
            const merged = { ...eventsById };
            for (const event of result) {
              merged[event.id] = {
                ...event,
                endDate: event.endDate || null,
              };
            }
            set({
              eventsById: merged,
              events: Object.values(merged),
              loading: false,
              lastFetchedRange: { startDate: bufferedStartDate, endDate: bufferedEndDate },
              lastFetchSignature: fetchSignature,
              lastFetchedAt: Date.now(),
            });
          } else {
            set({ loading: false });
          }
        } catch (e) {
          calLog('fetchEvents.failed', { message: (e as Error)?.message });
          set({ loading: false });
        }
      },

      refreshCalendarData: async () => {
        await get().fetchCalendars();
        const range = get().lastFetchedRange;
        if (range) {
          await get().fetchEvents(range.startDate, range.endDate);
        }
      },

      toggleCalendar: (calendarId, visible) => {
        set((s) => ({
          calendars: s.calendars.map(c =>
            c.id === calendarId ? { ...c, visible } : c
          ),
          lastFetchedAt: null,
        }));
        callEdge('toggle_calendar', { calendarId, visible }).catch(console.error);
      },

      disconnect: async () => {
        try {
          await callEdge('disconnect');
          set({ connected: false, email: null, calendars: [], eventsById: {}, events: [] });
        } catch (e) {
          console.error('Disconnect error:', e);
        }
      },

      completeEvent: (eventId) => {
        set((s) => ({
          completedEventIds: s.completedEventIds.includes(eventId)
            ? s.completedEventIds
            : [...s.completedEventIds, eventId],
        }));
      },

      uncompleteEvent: (eventId) => {
        set((s) => ({
          completedEventIds: s.completedEventIds.filter(id => id !== eventId),
        }));
      },

      deleteEvent: (eventId) => {
        set((s) => ({
          deletedEventIds: s.deletedEventIds.includes(eventId)
            ? s.deletedEventIds
            : [...s.deletedEventIds, eventId],
        }));
      },

      reviveEvent: (eventId) => {
        set((s) => ({
          deletedEventIds: s.deletedEventIds.filter(id => id !== eventId),
        }));
      },

      setEventCategory: (eventId, category) => {
        set((s) => ({
          eventCategories: { ...s.eventCategories, [eventId]: category },
        }));
      },

      setEditingEvent: (eventId) => set({ editingEventId: eventId }),

      isEventCompleted: (eventId) => get().completedEventIds.includes(eventId),
      isEventDeleted: (eventId) => get().deletedEventIds.includes(eventId),

    }),
    {
      name: 'do-calendar-store',
      // Persist only per-user UX mutations. Connection state, calendar list,
      // and fetched events are intentionally NOT persisted so the next session
      // (or a different user / platform / install) always rehydrates from the
      // server and never shows a stale "connected" or stale calendar list.
      partialize: (state) => ({
        completedEventIds: state.completedEventIds,
        deletedEventIds: state.deletedEventIds,
        eventCategories: state.eventCategories,
      }),
    }
  )
);

// ---------------------------------------------------------------------------
// Auth-driven lifecycle: re-check connection when the session arrives or
// changes, and clear in-memory connection state on sign-out. This is what
// makes "link on web, use everywhere" work — native shells subscribe here on
// startup and refresh as soon as Supabase finishes hydrating the session.
// ---------------------------------------------------------------------------
let lastSeenUserId: string | null = null;

function bindAuthLifecycle() {
  // Initial hydration check (fires once the SDK has read the persisted JWT).
  supabase.auth.getSession().then(({ data: { session } }) => {
    if (session?.user?.id) {
      lastSeenUserId = session.user.id;
      calLog('auth.initial_session', { userId: session.user.id });
      useCalendarStore.getState().checkStatus();
    } else {
      calLog('auth.initial_no_session');
    }
  });

  supabase.auth.onAuthStateChange((event, session) => {
    const uid = session?.user?.id ?? null;
    calLog('auth.event', { event, userIdChanged: uid !== lastSeenUserId });

    if (event === 'SIGNED_OUT' || !uid) {
      lastSeenUserId = null;
      useCalendarStore.setState({
        connected: false,
        email: null,
        calendars: [],
        eventsById: {},
        events: [],
        lastFetchedRange: null,
        lastFetchSignature: null,
        lastFetchedAt: null,
      });
      return;
    }

    if (uid !== lastSeenUserId) {
      // Different user signed in on this device — wipe stale connection state
      // before checking again. Prevents a flash of the previous user's data.
      useCalendarStore.setState({
        connected: false,
        email: null,
        calendars: [],
        eventsById: {},
        events: [],
        lastFetchedRange: null,
        lastFetchSignature: null,
        lastFetchedAt: null,
      });
    }
    lastSeenUserId = uid;

    if (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED' || event === 'INITIAL_SESSION') {
      useCalendarStore.getState().checkStatus();
    }
  });
}

// Run once at module load (singleton import).
bindAuthLifecycle();
