import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { supabase } from '@/integrations/supabase/client';
import { useTimezoneStore } from '@/store/timezoneStore';

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
  const { data, error } = await supabase.functions.invoke('google-calendar', {
    body: { action, ...params },
  });
  if (error) throw new Error(error.message);
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
        try {
          const result = await callEdge('status', { deviceId: get().deviceId });
          set({ connected: result.connected, email: result.email || null });
          if (result.connected) {
            get().fetchCalendars();
          }
        } catch {
          set({ connected: false, email: null });
        }
      },

      startAuth: async () => {
        const redirectUri = window.location.origin;
        const result = await callEdge('get_auth_url', {
          deviceId: get().deviceId,
          redirectUri,
        });
        window.location.href = result.url;
      },

      handleAuthCallback: async (code) => {
        set({ loading: true });
        try {
          const redirectUri = window.location.origin;
          await callEdge('exchange_code', {
            code,
            redirectUri,
            deviceId: get().deviceId,
          });
          set({ connected: true, loading: false });
          await get().fetchCalendars();
        } catch (e) {
          console.error('Auth callback error:', e);
          set({ loading: false });
        }
      },

      fetchCalendars: async () => {
        try {
          const result = await callEdge('calendars', { deviceId: get().deviceId });
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
          console.error('Fetch calendars error:', e);
        }
      },

      fetchEvents: async (startDate, endDate) => {
        const {
          calendars,
          deviceId,
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
          const result = await callEdge('events', {
            deviceId,
            timeMin: bufferedStartDate,
            timeMax: bufferedEndDate,
            calendarIds: visibleCalIds,
            timeZone,
          });
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
          console.error('Fetch events error:', e);
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
          await callEdge('disconnect', { deviceId: get().deviceId });
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
      partialize: (state) => ({
        deviceId: state.deviceId,
        connected: state.connected,
        email: state.email,
        calendars: state.calendars,
        eventsById: state.eventsById,
        events: state.events,
        lastFetchedRange: state.lastFetchedRange,
        lastFetchSignature: state.lastFetchSignature,
        lastFetchedAt: state.lastFetchedAt,
        completedEventIds: state.completedEventIds,
        deletedEventIds: state.deletedEventIds,
        eventCategories: state.eventCategories,
      }),
    }
  )
);
