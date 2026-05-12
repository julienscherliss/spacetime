import { Capacitor, registerPlugin } from '@capacitor/core';
import { supabase } from '@/integrations/supabase/client';

/** Apple subscription products configured in App Store Connect. */
export const IAP_PRODUCT_IDS = {
  monthly: 'spacetime_monthly',
  yearly: 'spacetime_yearly',
} as const;
export type IapPlan = keyof typeof IAP_PRODUCT_IDS;

// The plugin only loads on native; on web we get a no-op shim.
interface SubscriptionsPlugin {
  getProductDetails(opts: { productIdentifier: string }): Promise<{ data?: any; responseCode: number; responseMessage?: string }>;
  purchaseProduct(opts: { productIdentifier: string }): Promise<{ data?: { transactionId?: string; transactionReceipt?: string }; responseCode: number; responseMessage?: string }>;
  getCurrentEntitlements(): Promise<{ data?: any[]; responseCode: number; responseMessage?: string }>;
  getLatestTransaction(opts: { productIdentifier: string }): Promise<{ data?: { transactionId?: string; transactionReceipt?: string }; responseCode: number; responseMessage?: string }>;
}

export const Subscriptions = registerPlugin<SubscriptionsPlugin>('Subscriptions');

export function isIAPAvailable() {
  return Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'ios';
}

/** POST a signed Apple JWS transaction to our verifier edge function. */
export async function verifyAppleTransaction(signedTransaction: string) {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new Error('Not signed in');
  const projectId = import.meta.env.VITE_SUPABASE_PROJECT_ID;
  const res = await fetch(
    `https://${projectId}.supabase.co/functions/v1/apple-iap-verify`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${session.access_token}`,
      },
      body: JSON.stringify({ signedTransaction }),
    },
  );
  const json = await res.json();
  if (!res.ok || !json.ok) throw new Error(json.error || 'Verification failed');
  return json as { ok: true; expiresAt: string | null; status: string };
}

/** Trigger StoreKit purchase + verify with our backend. */
export async function purchasePlan(plan: IapPlan) {
  const productIdentifier = IAP_PRODUCT_IDS[plan];
  const result = await Subscriptions.purchaseProduct({ productIdentifier });
  // responseCode 0 == success per plugin convention
  if (result.responseCode !== 0 || !result.data?.transactionReceipt) {
    throw new Error(result.responseMessage || 'Purchase did not complete');
  }
  return verifyAppleTransaction(result.data.transactionReceipt);
}

/** Restore: ask StoreKit for current entitlements, send each to verifier. */
export async function restorePurchases() {
  const result = await Subscriptions.getCurrentEntitlements();
  if (result.responseCode !== 0) {
    throw new Error(result.responseMessage || 'Could not load purchases');
  }
  const entitlements = (result.data ?? []) as any[];
  if (entitlements.length === 0) {
    return { restored: 0 as const };
  }
  let restored = 0;
  for (const ent of entitlements) {
    const signed = ent?.transactionReceipt || ent?.signedTransaction || ent?.jwsRepresentation;
    if (!signed) continue;
    try {
      await verifyAppleTransaction(signed);
      restored++;
    } catch (err) {
      console.error('[IAP restore] verify failed', err);
    }
  }
  return { restored };
}