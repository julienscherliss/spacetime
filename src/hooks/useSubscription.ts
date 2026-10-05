import { useEffect, useState } from 'react';
import { subscriptionHasAccess } from '@/lib/subscriptionAccess';
import { isIOSNative } from '@/utils/nativePlatform';
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
  payment_source?: 'stripe' | 'apple_iap' | 'promo' | 'admin' | null;
  apple_original_transaction_id?: string | null;
  apple_product_id?: string | null;
  apple_environment?: string | null;
  apple_expires_at?: string | null;
  apple_auto_renew?: boolean | null;
  billing_environment?: string | null;
  grace_period_end?: string | null;
}

export function useSubscription(userId?: string | null, authReady = true) {
  const [subscription, setSubscription] = useState<Subscription | null>(null);
  const [loading, setLoading] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);
  const [now, setNow] = useState(Date.now());

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
        setIsAdmin(roles?.some((r) => r.role === 'admin') ?? false);
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

  // Re-evaluate at the entitlement boundary even if no webhook arrives while
  // this screen is open. Refresh the row on focus and once a minute for renewals.
  useEffect(() => {
    const ends = [subscription?.current_period_end, subscription?.grace_period_end, subscription?.trial_end]
      .map(value => Date.parse(value ?? '')).filter(value => Number.isFinite(value) && value > Date.now());
    const delay = Math.min(60000, ...ends.map(value => value - Date.now() + 1));
    const timer = window.setTimeout(() => setNow(Date.now()), delay);
    return () => window.clearTimeout(timer);
  }, [now, subscription]);

  const hasAccess = subscriptionHasAccess(subscription, isAdmin, Date.now(),
    import.meta.env.VITE_ALLOW_SANDBOX_BILLING === 'true', isIOSNative());

  const trialDaysLeft = (() => {
    if (!subscription || subscription.status !== 'trialing') return 0;
    const end = new Date(subscription.trial_end);
    const current = new Date(now);
    return Math.max(0, Math.ceil((end.getTime() - current.getTime()) / (1000 * 60 * 60 * 24)));
  })();

  const cancellingDaysLeft = (() => {
    if (!subscription || subscription.status !== 'cancelling') return 0;
    if (!subscription.current_period_end) return 0;
    const end = new Date(subscription.current_period_end);
    const current = new Date(now);
    return Math.max(0, Math.ceil((end.getTime() - current.getTime()) / (1000 * 60 * 60 * 24)));
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
    setIsAdmin(roles?.some((r) => r.role === 'admin') ?? false);
  };

  useEffect(() => {
    if (!authReady) return;
    let cancelled = false;
    const reconcile = async () => {
      const target = userId ?? (await supabase.auth.getUser()).data.user?.id;
      if (!target) return;
      const { data, error } = await supabase.from('subscriptions').select('*').eq('user_id', target).maybeSingle();
      if (!cancelled && !error) setSubscription(data as Subscription | null);
      if (!cancelled) setNow(Date.now());
    };
    const interval = window.setInterval(() => void reconcile(), 60000);
    window.addEventListener('focus', reconcile);
    document.addEventListener('visibilitychange', reconcile);
    return () => { cancelled = true; window.clearInterval(interval); window.removeEventListener('focus', reconcile); document.removeEventListener('visibilitychange', reconcile); };
  }, [userId, authReady]);

  return { subscription, loading, hasAccess, trialDaysLeft, cancellingDaysLeft, isAdmin, refresh };
}
