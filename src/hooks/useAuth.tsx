import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import type { User, Session } from '@supabase/supabase-js';

export function useAuth() {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Set up listener first — handles all future auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
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
    // Clear user-scoped stores before sign-out to prevent stale data flash
    const { useTaskStore } = await import('@/store/taskStore');
    const { useLibraryStore } = await import('@/store/libraryStore');
    const { useCarryStore } = await import('@/store/carryStore');
    useTaskStore.setState({ tasks: [], editingTaskId: null, focusTaskId: null });
    useLibraryStore.setState({ items: [] });
    useCarryStore.setState({ carried: null });
    try {
      localStorage.removeItem('do-task-store');
      localStorage.removeItem('do-library-store');
    } catch (_) {}
    await supabase.auth.signOut();
  };

  return { user, session, loading, signOut };
}
