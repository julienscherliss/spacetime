import { useState } from 'react';
import { motion } from 'framer-motion';
import { Zap, Check, Tag, LogOut, RotateCcw } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { purchasePlan, restorePurchases, isIAPAvailable, type IapPlan } from '@/utils/iapClient';

interface Props {
  trialDaysLeft: number;
  trialExpired: boolean;
  onAccessGranted: () => void;
  subscriptionStatus?: string;
}

const APPLE_TERMS =
  '30-day free trial, then $3/month or $24/year depending on the selected plan. ' +
  'Payment will be charged to your Apple ID. ' +
  'Subscription renews automatically unless canceled at least 24 hours before the end of the current period. ' +
  'Manage or cancel anytime in Apple Subscriptions.';

export function PaywallIOS({ trialDaysLeft, trialExpired, onAccessGranted, subscriptionStatus }: Props) {
  const [selectedPlan, setSelectedPlan] = useState<IapPlan>('yearly');
  const iapAvailable = isIAPAvailable();
  const [promoCode, setPromoCode] = useState('');
  const [promoLoading, setPromoLoading] = useState(false);
  const [purchaseLoading, setPurchaseLoading] = useState(false);
  const [restoreLoading, setRestoreLoading] = useState(false);

  const handlePurchase = async () => {
    setPurchaseLoading(true);
    try {
      await purchasePlan(selectedPlan);
      toast.success('Subscription active');
      onAccessGranted();
    } catch (err: any) {
      const msg = err?.message || 'Purchase failed';
      // Don't surface user cancellation as an error
      if (!/cancel/i.test(msg)) toast.error(msg);
    } finally {
      setPurchaseLoading(false);
    }
  };

  const handleRestore = async () => {
    setRestoreLoading(true);
    try {
      const { restored } = await restorePurchases();
      if (restored > 0) {
        toast.success('Purchases restored');
        onAccessGranted();
      } else {
        toast.message('No active purchases found on this Apple ID');
      }
    } catch (err: any) {
      toast.error(err?.message || 'Could not restore purchases');
    } finally {
      setRestoreLoading(false);
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
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${session.access_token}` },
          body: JSON.stringify({ code: promoCode.trim().toUpperCase() }),
        },
      );
      const data = await res.json();
      if (data.success) {
        toast.success(data.message || 'Promo code applied');
        onAccessGranted();
      } else {
        toast.error(data.error || 'Invalid promo code');
      }
    } catch {
      toast.error('Failed to redeem promo code');
    } finally {
      setPromoLoading(false);
    }
  };

  const handleSignOut = async () => {
    try { await supabase.auth.signOut(); window.location.href = '/auth'; } catch { toast.error('Failed to sign out'); }
  };

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4 relative">
      <button
        onClick={handleSignOut}
        className="absolute right-4 flex items-center gap-1.5 px-3 py-2 rounded-sm border border-border/60 bg-card/70 backdrop-blur-sm text-[10px] font-mono tracking-widest text-foreground/80 hover:text-foreground hover:border-foreground/40 hover:bg-card transition-colors z-10"
        style={{ top: 'max(1rem, calc(env(safe-area-inset-top, 0px) + 0.75rem))' }}
        aria-label="Sign out"
      >
        <LogOut size={12} />
        SIGN OUT
      </button>

      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="inline-flex items-center gap-2 mb-3">
            <Zap size={20} className="text-primary" />
            <h1 className="font-display text-2xl font-bold text-foreground tracking-tight">spacetime</h1>
          </div>
          {trialExpired ? (
            <p className="text-[11px] font-mono text-destructive/70 tracking-wide">YOUR FREE TRIAL HAS ENDED</p>
          ) : subscriptionStatus === 'active' ? (
            <p className="text-[11px] font-mono text-primary/70 tracking-wide">MANAGE YOUR SUBSCRIPTION</p>
          ) : (
            <p className="text-[11px] font-mono text-muted-foreground/60 tracking-wide">
              {trialDaysLeft} DAY{trialDaysLeft !== 1 ? 'S' : ''} LEFT IN YOUR FREE TRIAL
            </p>
          )}
          <p className="text-[10px] font-mono text-muted-foreground/40 mt-1">SUBSCRIBE TO CONTINUE USING SPACETIME</p>
        </div>

        {/* Two plan cards — yearly default */}
        <div className="grid grid-cols-2 gap-3 mb-4">
          {/* Monthly */}
          <button
            type="button"
            onClick={() => setSelectedPlan('monthly')}
            disabled={purchaseLoading || restoreLoading}
            className={`border rounded-md p-4 text-left transition-all ${
              selectedPlan === 'monthly'
                ? 'border-primary/60 bg-card/70'
                : 'border-border/50 hover:border-foreground/30'
            }`}
          >
            <div className="text-[9px] font-mono text-muted-foreground/50 tracking-widest mb-2">MONTHLY</div>
            <div className="text-xl font-display font-bold text-foreground">$3</div>
            <div className="text-[10px] font-mono text-muted-foreground/50 mt-0.5">/ month</div>
            <div className="mt-3 space-y-1">
              {['Full access', 'All features', 'Cancel anytime'].map((f) => (
                <div key={f} className="flex items-center gap-1.5">
                  <Check size={10} className="text-primary/60" />
                  <span className="text-[9px] font-mono text-muted-foreground/60">{f}</span>
                </div>
              ))}
            </div>
          </button>

          {/* Yearly */}
          <button
            type="button"
            onClick={() => setSelectedPlan('yearly')}
            disabled={purchaseLoading || restoreLoading}
            className={`border rounded-md p-4 text-left transition-all relative ${
              selectedPlan === 'yearly'
                ? 'border-primary/60 bg-card/70'
                : 'border-primary/30 hover:border-primary/60'
            }`}
          >
            <div className="absolute -top-2 right-3 px-2 py-0.5 bg-primary text-primary-foreground text-[8px] font-mono tracking-wider rounded-full">
              SAVE 33%
            </div>
            <div className="text-[9px] font-mono text-muted-foreground/50 tracking-widest mb-2">YEARLY</div>
            <div className="text-xl font-display font-bold text-foreground">$2</div>
            <div className="text-[10px] font-mono text-muted-foreground/50 mt-0.5">/ month · $24/yr</div>
            <div className="mt-3 space-y-1">
              {['Full access', 'All features', 'Best value'].map((f) => (
                <div key={f} className="flex items-center gap-1.5">
                  <Check size={10} className="text-primary/60" />
                  <span className="text-[9px] font-mono text-muted-foreground/60">{f}</span>
                </div>
              ))}
            </div>
          </button>
        </div>

        {iapAvailable ? (
          <>
            <button
              onClick={handlePurchase}
              disabled={purchaseLoading || restoreLoading}
              className="w-full py-3 bg-primary text-primary-foreground text-[11px] font-mono tracking-wider rounded-sm hover:bg-primary/90 disabled:opacity-50 transition-colors"
            >
              {purchaseLoading ? 'PROCESSING...' : 'SUBSCRIBE'}
            </button>

            <button
              onClick={handleRestore}
              disabled={purchaseLoading || restoreLoading}
              className="w-full mt-2 py-2.5 flex items-center justify-center gap-1.5 border border-border/50 text-[10px] font-mono tracking-wider text-foreground/80 hover:text-foreground hover:border-foreground/40 rounded-sm disabled:opacity-50 transition-colors"
            >
              <RotateCcw size={11} />
              {restoreLoading ? 'RESTORING...' : 'RESTORE PURCHASES'}
            </button>
          </>
        ) : (
          <div className="w-full py-3 px-4 border border-border/50 rounded-sm text-center">
            <p className="text-[10px] font-mono text-muted-foreground/70 tracking-wide leading-relaxed">
              IN-APP PURCHASES UNAVAILABLE IN THIS BUILD.
              <br />PLEASE UPDATE THE APP FROM THE APP STORE,
              <br />OR USE A PROMO CODE BELOW.
            </p>
          </div>
        )}

        {/* Required Apple disclosure */}
        <p className="text-[10px] font-mono text-muted-foreground/60 leading-relaxed mt-4 mb-6 px-1">
          {APPLE_TERMS}
        </p>

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

        <div className="flex justify-center gap-4 mt-6">
          <a href="/privacy" className="text-[9px] font-mono text-muted-foreground/50 tracking-widest hover:text-foreground">PRIVACY</a>
          <a href="/terms" className="text-[9px] font-mono text-muted-foreground/50 tracking-widest hover:text-foreground">TERMS</a>
        </div>
      </motion.div>
    </div>
  );
}