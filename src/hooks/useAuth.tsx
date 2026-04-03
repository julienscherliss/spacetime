import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import type { User, Session } from '@supabase/supabase-js';

export function useAuth() {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let resolved = false;
    const resolve = (s: Session | null) => {
      if (resolved) return;
      resolved = true;
      setSession(s);
      setUser(s?.user ?? null);
      setLoading(false);
    };

    // Set up listener first
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      resolve(session);
    });

    // Then check current session
    supabase.auth.getSession().then(({ data: { session } }) => {
      resolve(session);
    }).catch(() => {
      resolve(null);
    });

    // Safety timeout — never stay loading forever
    const timeout = setTimeout(() => resolve(null), 5000);

    return () => {
      subscription.unsubscribe();
      clearTimeout(timeout);
    };
  }, []);

  const signOut = async () => {
    await supabase.auth.signOut();
  };

  return { user, session, loading, signOut };
}
