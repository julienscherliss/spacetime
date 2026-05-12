import { useState } from 'react';
import { motion } from 'framer-motion';
import { Zap, Check, Tag, LogOut } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { isIOSNative } from '@/utils/nativePlatform';
import { PaywallIOS } from './PaywallIOS';

interface Props {
  trialDaysLeft: number;
  trialExpired: boolean;
  onAccessGranted: () => void;
  subscriptionStatus?: string;
  cancellingDaysLeft?: number;
}

export function Paywall({ trialDaysLeft, trialExpired, onAccessGranted, subscriptionStatus, cancellingDaysLeft }: Props) {
  // App Store-compliant variant for iOS — no Stripe, uses Apple In-App Purchase
  if (isIOSNative()) {
    return (
      <PaywallIOS
        trialDaysLeft={trialDaysLeft}
        trialExpired={trialExpired}
        onAccessGranted={onAccessGranted}
        subscriptionStatus={subscriptionStatus}
      />
    );
  }

  const [promoCode, setPromoCode] = useState('');
  const [promoLoading, setPromoLoading] = useState(false);
  const [checkoutLoading, setCheckoutLoading] = useState<string | null>(null);

  const handleCheckout = async (plan: 'monthly' | 'yearly') => {
    setCheckoutLoading(plan);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { toast.error('Please sign in first'); return; }

      const projectId = import.meta.env.VITE_SUPABASE_PROJECT_ID;
      const res = await fetch(
        `https://${projectId}.supabase.co/functions/v1/stripe-checkout`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${session.access_token}`,
          },
          body: JSON.stringify({ plan }),
        }
      );
      const data = await res.json();
      if (data.url) {
        window.location.href = data.url;
      } else {
        toast.error(data.error || 'Failed to create checkout');
      }
    } catch (err) {
      toast.error('Failed to start checkout');
    } finally {
      setCheckoutLoading(null);
    }
  };

  const handlePromo = async () => {
    if (!promoCode.trim()) return;
    setPromoLoading(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { toast.error('Please sign in first'); return; }

      const projectId = import.meta.env.VITE_SUPABASE_PROJECT_ID;
      const res = await fetch(
        `https://${projectId}.supabase.co/functions/v1/redeem-promo`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${session.access_token}`,
          },
          body: JSON.stringify({ code: promoCode.trim().toUpperCase() }),
        }
      );
      const data = await res.json();
      if (data.success) {
        toast.success(data.message || 'Promo code applied!');
        onAccessGranted();
      } else {
        toast.error(data.error || 'Invalid promo code');
      }
    } catch (err) {
      toast.error('Failed to redeem promo code');
    } finally {
      setPromoLoading(false);
    }
  };

  const handleSignOut = async () => {
    try {
      await supabase.auth.signOut();
      window.location.href = '/auth';
    } catch {
      toast.error('Failed to sign out');
    }
  };

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4 relative">
      {/* Sign out — pinned top-right, respects iOS safe area */}
      <button
        onClick={handleSignOut}
        className="absolute right-4 flex items-center gap-1.5 px-3 py-2 rounded-sm border border-border/60 bg-card/70 backdrop-blur-sm text-[10px] font-mono tracking-widest text-foreground/80 hover:text-foreground hover:border-foreground/40 hover:bg-card transition-colors z-10"
        style={{ top: 'max(1rem, calc(env(safe-area-inset-top, 0px) + 0.75rem))' }}
        aria-label="Sign out"
      >
        <LogOut size={12} />
        SIGN OUT
      </button>
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-md"
      >
        {/* Header */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center gap-2 mb-3">
            <Zap size={20} className="text-primary" />
            <h1 className="font-display text-2xl font-bold text-foreground tracking-tight">spacetime</h1>
          </div>
          {trialExpired ? (
            <p className="text-[11px] font-mono text-destructive/70 tracking-wide">
              YOUR FREE TRIAL HAS ENDED
            </p>
          ) : subscriptionStatus === 'cancelling' && cancellingDaysLeft !== undefined ? (
            <p className="text-[11px] font-mono text-destructive/70 tracking-wide">
              {cancellingDaysLeft} DAY{cancellingDaysLeft !== 1 ? 'S' : ''} LEFT OF YOUR SUBSCRIPTION
            </p>
          ) : subscriptionStatus === 'active' ? (
            <p className="text-[11px] font-mono text-primary/70 tracking-wide">
              MANAGE YOUR SUBSCRIPTION
            </p>
          ) : (
            <p className="text-[11px] font-mono text-muted-foreground/60 tracking-wide">
              {trialDaysLeft} DAY{trialDaysLeft !== 1 ? 'S' : ''} LEFT IN YOUR FREE TRIAL
            </p>
          )}
          <p className="text-[10px] font-mono text-muted-foreground/40 mt-1">
            {subscriptionStatus === 'active' || subscriptionStatus === 'cancelling'
              ? 'RENEW OR CHANGE YOUR PLAN'
              : 'SUBSCRIBE TO CONTINUE USING SPACETIME'}
          </p>
        </div>

        {/* Plans */}
        <div className="grid grid-cols-2 gap-3 mb-6">
          {/* Monthly */}
          <button
            onClick={() => handleCheckout('monthly')}
            disabled={!!checkoutLoading}
            className="border border-border/50 rounded-md p-4 text-left hover:border-foreground/30 transition-all group disabled:opacity-50"
          >
            <div className="text-[9px] font-mono text-muted-foreground/50 tracking-widest mb-2">MONTHLY</div>
            <div className="text-xl font-display font-bold text-foreground">$3</div>
            <div className="text-[10px] font-mono text-muted-foreground/50 mt-0.5">/ month</div>
            <div className="mt-3 space-y-1">
              {['Full access', 'All features', 'Cancel anytime'].map(f => (
                <div key={f} className="flex items-center gap-1.5">
                  <Check size={10} className="text-primary/60" />
                  <span className="text-[9px] font-mono text-muted-foreground/60">{f}</span>
                </div>
              ))}
            </div>
            <div className="mt-3 text-center text-[9px] font-mono text-primary/70 tracking-wider group-hover:text-primary transition-colors">
              {checkoutLoading === 'monthly' ? 'LOADING...' : 'SELECT'}
            </div>
          </button>

          {/* Yearly */}
          <button
            onClick={() => handleCheckout('yearly')}
            disabled={!!checkoutLoading}
            className="border border-primary/30 rounded-md p-4 text-left hover:border-primary/60 transition-all group relative disabled:opacity-50"
          >
            <div className="absolute -top-2 right-3 px-2 py-0.5 bg-primary text-primary-foreground text-[8px] font-mono tracking-wider rounded-full">
              SAVE 33%
            </div>
            <div className="text-[9px] font-mono text-muted-foreground/50 tracking-widest mb-2">YEARLY</div>
            <div className="text-xl font-display font-bold text-foreground">$2</div>
            <div className="text-[10px] font-mono text-muted-foreground/50 mt-0.5">/ month · $24/yr</div>
            <div className="mt-3 space-y-1">
              {['Full access', 'All features', 'Best value'].map(f => (
                <div key={f} className="flex items-center gap-1.5">
                  <Check size={10} className="text-primary/60" />
                  <span className="text-[9px] font-mono text-muted-foreground/60">{f}</span>
                </div>
              ))}
            </div>
            <div className="mt-3 text-center text-[9px] font-mono text-primary/70 tracking-wider group-hover:text-primary transition-colors">
              {checkoutLoading === 'yearly' ? 'LOADING...' : 'SELECT'}
            </div>
          </button>
        </div>

        {/* Promo code */}
        <div className="border border-border/30 rounded-md p-3 bg-card/50">
          <div className="flex items-center gap-1.5 mb-2">
            <Tag size={11} className="text-muted-foreground/40" />
            <span className="text-[9px] font-mono text-muted-foreground/50 tracking-widest">PROMO CODE</span>
          </div>
          <div className="flex gap-2">
            <input
              type="text"
              value={promoCode}
              onChange={e => setPromoCode(e.target.value.toUpperCase())}
              placeholder="ENTER CODE"
              className="flex-1 bg-muted/30 border border-border/50 rounded-sm px-3 py-2 text-[11px] font-mono text-foreground tracking-wider placeholder:text-muted-foreground/30 focus:outline-none focus:border-primary/50"
              onKeyDown={e => e.key === 'Enter' && handlePromo()}
            />
            <button
              onClick={handlePromo}
              disabled={promoLoading || !promoCode.trim()}
              className="px-4 py-2 bg-foreground text-background text-[10px] font-mono tracking-wider rounded-sm hover:bg-foreground/90 disabled:opacity-50 transition-colors"
            >
              {promoLoading ? '...' : 'APPLY'}
            </button>
          </div>
        </div>
      </motion.div>
    </div>
  );
}
