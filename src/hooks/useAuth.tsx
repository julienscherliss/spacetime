import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import type { User, Session } from '@supabase/supabase-js';
import { logAudit } from '@/utils/auditLog';

export function useAuth() {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Set up listener first — handles all future auth changes.
    // We log every event with enough detail to distinguish OTP / OAuth / recovery.
    let lastUserId: string | null = null;
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      console.log('[AUTH/EVENT]', event, {
        userId: session?.user?.id ?? null,
        email: session?.user?.email ?? null,
        provider: session?.user?.app_metadata?.provider ?? null,
      });
      if (event === 'PASSWORD_RECOVERY') {
        console.warn('[AUTH/EVENT] PASSWORD_RECOVERY received — only /reset-password should handle this');
      }
      // Defensive: if the signed-in user changes identity (e.g. logged in as
      // a different account without an explicit signOut), wipe the calendar
      // store so the new user does not inherit the previous user's
      // calendars/events. Connection itself is server-side & user-scoped.
      const nextUserId = session?.user?.id ?? null;
      if (lastUserId && nextUserId && lastUserId !== nextUserId) {
        import('@/store/calendarStore').then(({ useCalendarStore }) => {
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
          try { localStorage.removeItem('do-calendar-store'); } catch (_) {}
        });
      }
      lastUserId = nextUserId;
      // On a fresh sign-in, always land on Day view at "today".
      if (event === 'SIGNED_IN') {
        import('@/store/taskStore').then(({ useTaskStore }) => {
          useTaskStore.setState({
            viewMode: 'day',
            daySubMode: 'timeline',
            navigateToDate: null,
            currentDate: null,
            focusTaskId: null,
            editingTaskId: null,
          });
        });
        logAudit({ action: 'auth.signed_in', metadata: { provider: session?.user?.app_metadata?.provider ?? 'email' } });
      }
      if (event === 'TOKEN_REFRESHED' && !session) {
        logAudit({ action: 'auth.session_expired' });
      }
      setSession(session);
      setUser(session?.user ?? null);
      setLoading(false);
    });

    // Then check current session
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setUser(session?.user ?? null);
      setLoading(false);
    }).catch(() => {
      setLoading(false);
    });

    // Safety timeout — never stay on loading screen forever
    const timeout = setTimeout(() => setLoading(false), 5000);

    return () => {
      subscription.unsubscribe();
      clearTimeout(timeout);
    };
  }, []);

  const signOut = async () => {
    logAudit({ action: 'auth.signed_out' });
    // Clear user-scoped stores before sign-out to prevent stale data flash
    const { useTaskStore } = await import('@/store/taskStore');
    const { useLibraryStore } = await import('@/store/libraryStore');
    const { useCarryStore } = await import('@/store/carryStore');
    const { useCalendarStore } = await import('@/store/calendarStore');
    useTaskStore.setState({ tasks: [], editingTaskId: null, focusTaskId: null });
    useLibraryStore.setState({ items: [] });
    useCarryStore.setState({ carried: null });
    // Wipe Google Calendar UI state so the next signed-in user does not see
    // the previous user's connection/calendars/events. The connection itself
    // lives in the database keyed by user_id, not here.
    useCalendarStore.setState({
      connected: false,
      email: null,
      calendars: [],
      eventsById: {},
      events: [],
      lastFetchedRange: null,
      lastFetchSignature: null,
      lastFetchedAt: null,
      completedEventIds: [],
      deletedEventIds: [],
      eventCategories: {},
    });
    try {
      localStorage.removeItem('do-task-store');
      localStorage.removeItem('do-library-store');
      localStorage.removeItem('do-calendar-store');
    } catch (_) {}
    await supabase.auth.signOut();
  };

  return { user, session, loading, signOut };
}
