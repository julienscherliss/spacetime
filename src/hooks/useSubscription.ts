import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';

export interface Subscription {
  id: string;
  user_id: string;
  status: string;
  plan: string | null;
  stripe_customer_id: string | null;
  stripe_subscription_id: string | null;
  trial_start: string;
  trial_end: string;
  current_period_start: string | null;
  current_period_end: string | null;
  lifetime_access: boolean;
  created_at: string;
  updated_at: string;
}

export function useSubscription() {
  const [subscription, setSubscription] = useState<Subscription | null>(null);
  const [loading, setLoading] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function load(userId: string) {
      if (cancelled) return;
      setLoading(true);

      // Check subscription
      const { data: sub } = await supabase
        .from('subscriptions')
        .select('*')
        .eq('user_id', userId)
        .maybeSingle();

      // Check admin role
      const { data: roles } = await supabase
        .from('user_roles')
        .select('role')
        .eq('user_id', userId);

      if (!cancelled) {
        setSubscription(sub as Subscription | null);
        setIsAdmin(roles?.some((r: any) => r.role === 'admin') ?? false);
        setLoading(false);
      }
    }

    // Initial load — wait for session so we don't settle with null user
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (cancelled) return;
      if (session?.user) {
        load(session.user.id);
      } else {
        setSubscription(null);
        setIsAdmin(false);
        setLoading(false);
      }
    });

    // Re-run on any auth change (sign-in after mount, token refresh, sign-out)
    const { data: { subscription: authSub } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (cancelled) return;
      if (session?.user) {
        load(session.user.id);
      } else {
        setSubscription(null);
        setIsAdmin(false);
        setLoading(false);
      }
    });

    return () => {
      cancelled = true;
      authSub.unsubscribe();
    };
  }, []);

  const hasAccess = (() => {
    if (isAdmin) return true;
    if (!subscription) return false;
    if (subscription.lifetime_access) return true;
    if (subscription.status === 'active') return true;
    if (subscription.status === 'cancelling') {
      // Still has access until current_period_end
      if (subscription.current_period_end) {
        return new Date(subscription.current_period_end) > new Date();
      }
      return true;
    }
    if (subscription.status === 'trialing') {
      return new Date(subscription.trial_end) > new Date();
    }
    return false;
  })();

  const trialDaysLeft = (() => {
    if (!subscription || subscription.status !== 'trialing') return 0;
    const end = new Date(subscription.trial_end);
    const now = new Date();
    return Math.max(0, Math.ceil((end.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)));
  })();

  const cancellingDaysLeft = (() => {
    if (!subscription || subscription.status !== 'cancelling') return 0;
    if (!subscription.current_period_end) return 0;
    const end = new Date(subscription.current_period_end);
    const now = new Date();
    return Math.max(0, Math.ceil((end.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)));
  })();

  const refresh = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const { data: sub } = await supabase
      .from('subscriptions')
      .select('*')
      .eq('user_id', user.id)
      .maybeSingle();
    setSubscription(sub as Subscription | null);
  };

  return { subscription, loading, hasAccess, trialDaysLeft, cancellingDaysLeft, isAdmin, refresh };
}
