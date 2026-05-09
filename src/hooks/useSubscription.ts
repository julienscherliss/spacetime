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

export function useSubscription(userId?: string | null, authReady = true) {
  const [subscription, setSubscription] = useState<Subscription | null>(null);
  const [loading, setLoading] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function load(targetUserId: string) {
      if (cancelled) return;
      setLoading(true);

      const [{ data: sub, error: subError }, { data: roles, error: rolesError }] = await Promise.all([
        supabase
          .from('subscriptions')
          .select('*')
          .eq('user_id', targetUserId)
          .maybeSingle(),
        supabase
          .from('user_roles')
          .select('role')
          .eq('user_id', targetUserId),
      ]);

      if (!cancelled) {
        if (subError) {
          console.error('[SUBSCRIPTION] failed to load subscription', subError.message);
        }
        if (rolesError) {
          console.error('[SUBSCRIPTION] failed to load roles', rolesError.message);
        }
        setSubscription(sub as Subscription | null);
        setIsAdmin(roles?.some((r: any) => r.role === 'admin') ?? false);
        setLoading(false);
      }
    }

    function resetSignedOutState() {
      if (cancelled) return;
      setSubscription(null);
      setIsAdmin(false);
      setLoading(false);
    }

    async function resolveSessionWithRetry(attempt = 0) {
      const { data: { session } } = await supabase.auth.getSession();
      if (cancelled) return;

      if (session?.user?.id) {
        await load(session.user.id);
        return;
      }

      if (attempt < 4) {
        window.setTimeout(() => {
          void resolveSessionWithRetry(attempt + 1);
        }, 250 * (attempt + 1));
        return;
      }

      resetSignedOutState();
    }

    if (!authReady) {
      setLoading(true);
      return () => {
        cancelled = true;
      };
    }

    if (userId !== undefined) {
      if (userId) {
        void load(userId);
      } else {
        resetSignedOutState();
      }

      return () => {
        cancelled = true;
      };
    }

    void resolveSessionWithRetry();

    const { data: { subscription: authSub } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (cancelled) return;
      if (session?.user) {
        void load(session.user.id);
      } else {
        void resolveSessionWithRetry();
      }
    });

    return () => {
      cancelled = true;
      authSub.unsubscribe();
    };
  }, [userId, authReady]);

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
    const resolvedUserId = userId ?? (await supabase.auth.getUser()).data.user?.id ?? null;
    if (!resolvedUserId) {
      setSubscription(null);
      setIsAdmin(false);
      return;
    }

    const [{ data: sub }, { data: roles }] = await Promise.all([
      supabase
        .from('subscriptions')
        .select('*')
        .eq('user_id', resolvedUserId)
        .maybeSingle(),
      supabase
        .from('user_roles')
        .select('role')
        .eq('user_id', resolvedUserId),
    ]);

    setSubscription(sub as Subscription | null);
    setIsAdmin(roles?.some((r: any) => r.role === 'admin') ?? false);
  };

  return { subscription, loading, hasAccess, trialDaysLeft, cancellingDaysLeft, isAdmin, refresh };
}
