import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { supabase } from '@/integrations/supabase/client';

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
  events: CalendarEvent[];
  loading: boolean;
  panelOpen: boolean;
  deviceId: string;
  completedEventIds: string[];
  eventCategories: Record<string, string>;
  editingEventId: string | null;

  setPanelOpen: (open: boolean) => void;
  checkStatus: () => Promise<void>;
  startAuth: () => Promise<void>;
  handleAuthCallback: (code: string) => Promise<void>;
  fetchCalendars: () => Promise<void>;
  fetchEvents: (startDate: string, endDate: string) => Promise<void>;
  toggleCalendar: (calendarId: string, visible: boolean) => void;
  disconnect: () => Promise<void>;
  completeEvent: (eventId: string) => void;
  setEventCategory: (eventId: string, category: string) => void;
  setEditingEvent: (eventId: string | null) => void;
  isEventCompleted: (eventId: string) => boolean;
}

function getDeviceId(): string {
  let id = localStorage.getItem('do-device-id');
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem('do-device-id', id);
  }
  return id;
}

const projectId = import.meta.env.VITE_SUPABASE_PROJECT_ID;

async function callEdge(action: string, params: Record<string, any> = {}) {
  const { data, error } = await supabase.functions.invoke('google-calendar', {
    body: { action, ...params },
  });
  if (error) throw new Error(error.message);
  return data;
}

export const useCalendarStore = create<CalendarState>()(
  persist(
    (set, get) => ({
      connected: false,
      email: null,
      calendars: [],
      events: [],
      loading: false,
      panelOpen: false,
      deviceId: getDeviceId(),
      completedEventIds: [] as string[],
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
        const { calendars, deviceId } = get();
        const visibleCalIds = calendars.filter(c => c.visible).map(c => c.google_calendar_id);
        if (visibleCalIds.length === 0) {
          set({ events: [] });
          return;
        }
        try {
          const result = await callEdge('events', {
            deviceId,
            timeMin: startDate,
            timeMax: endDate,
            calendarIds: visibleCalIds,
          });
          if (Array.isArray(result)) {
            set({ events: result });
          }
        } catch (e) {
          console.error('Fetch events error:', e);
        }
      },

      toggleCalendar: (calendarId, visible) => {
        set((s) => ({
          calendars: s.calendars.map(c =>
            c.id === calendarId ? { ...c, visible } : c
          ),
        }));
        // Persist to DB
        callEdge('toggle_calendar', { calendarId, visible }).catch(console.error);
      },

      disconnect: async () => {
        try {
          await callEdge('disconnect', { deviceId: get().deviceId });
          set({ connected: false, email: null, calendars: [], events: [] });
        } catch (e) {
          console.error('Disconnect error:', e);
        }
      },

    }),
    {
      name: 'do-calendar-store',
      partialize: (state) => ({
        deviceId: state.deviceId,
        connected: state.connected,
        email: state.email,
        calendars: state.calendars,
      }),
    }
  )
);
