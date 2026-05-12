import { Capacitor } from '@capacitor/core';
import { NativePurchases, PURCHASE_TYPE } from '@capgo/native-purchases';
import { supabase } from '@/integrations/supabase/client';

// ⚠️ iOS IAP plugin policy: use ONLY @capgo/native-purchases.
// Do NOT add or import @squareetlabs/capacitor-subscriptions — it is
// incompatible with Capacitor 8 and breaks native StoreKit. See MOBILE.md.

/** Apple subscription products configured in App Store Connect. */
export const IAP_PRODUCT_IDS = {
  monthly: 'spacetime_monthly',
  yearly: 'spacetime_yearly',
} as const;
export type IapPlan = keyof typeof IAP_PRODUCT_IDS;

/** True only on iOS native builds where the StoreKit plugin is registered. */
export function isIAPAvailable(): boolean {
  if (!Capacitor.isNativePlatform() || Capacitor.getPlatform() !== 'ios') return false;
  try {
    return Capacitor.isPluginAvailable('NativePurchases');
  } catch {
    return false;
  }
}

function ensureAvailable() {
  if (!isIAPAvailable()) {
    throw new Error(
      'In-App Purchases are not available in this build. Please update the app from the App Store.',
    );
  }
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

/** Pick the signed JWS payload (StoreKit 2). Falls back to legacy receipt. */
function extractSignedPayload(tx: any): string | null {
  return (
    tx?.jwsRepresentation ||
    tx?.signedTransaction ||
    tx?.receipt ||
    tx?.transactionReceipt ||
    null
  );
}

/** Trigger StoreKit purchase + verify with our backend. */
export async function purchasePlan(plan: IapPlan) {
  ensureAvailable();
  const productIdentifier = IAP_PRODUCT_IDS[plan];
  const tx = await NativePurchases.purchaseProduct({
    productIdentifier,
    productType: PURCHASE_TYPE.SUBS,
    quantity: 1,
  });
  const signed = extractSignedPayload(tx);
  if (!signed) throw new Error('Purchase did not return a signed transaction');
  return verifyAppleTransaction(signed);
}

/** Restore: replay historical transactions and send each to verifier. */
export async function restorePurchases() {
  ensureAvailable();
  await NativePurchases.restorePurchases();
  const result: any = await NativePurchases.getPurchases();
  const purchases: any[] = result?.purchases ?? result?.transactions ?? [];
  if (!Array.isArray(purchases) || purchases.length === 0) {
    return { restored: 0 as const };
  }
  let restored = 0;
  for (const p of purchases) {
    const signed = extractSignedPayload(p);
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

/**
 * StoreKit 2 transaction listener — pushes any out-of-band updates
 * (renewals, refunds, ask-to-buy approvals) to the backend.
 * Safe no-op when the plugin isn't available.
 */
export function startTransactionListener() {
  if (!isIAPAvailable()) return () => {};
  let active = true;
  const subPromise = NativePurchases.addListener(
    'transactionUpdated',
    async (tx: any) => {
      if (!active) return;
      const signed = extractSignedPayload(tx);
      if (!signed) return;
      try {
        await verifyAppleTransaction(signed);
      } catch (err) {
        console.error('[IAP listener] verify failed', err);
      }
    },
  );
  return () => {
    active = false;
    subPromise.then((sub: any) => sub?.remove?.()).catch(() => {});
  };
}
