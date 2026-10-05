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
  console.log('[IAP] purchasePlan requesting productIdentifier:', productIdentifier);

  // Best-effort: log the products StoreKit can actually see, to diagnose
  // App Store Connect propagation / capability / agreement issues.
  try {
    const anyNP = NativePurchases as any;
    if (typeof anyNP.getProducts === 'function') {
      const probe = await anyNP.getProducts({
        productIdentifiers: [IAP_PRODUCT_IDS.monthly, IAP_PRODUCT_IDS.yearly],
      });
      console.log('[IAP] StoreKit returned products:', probe);
    }
  } catch (probeErr) {
    console.warn('[IAP] getProducts probe failed (non-fatal):', probeErr);
  }

  const { data: { user }, error: userError } = await supabase.auth.getUser();
  if (userError || !user) throw new Error('Not signed in');
  let tx: any;
  try {
    tx = await NativePurchases.purchaseProduct({
      productIdentifier,
      productType: PURCHASE_TYPE.SUBS,
      quantity: 1,
      appAccountToken: user.id,
    });
  } catch (err: any) {
    const raw = err?.message || err?.errorMessage || String(err);
    console.error('[IAP] purchaseProduct failed for', productIdentifier, raw);
    if (/cannot find product/i.test(raw)) {
      throw new Error(
        'This subscription is temporarily unavailable. Apple may still be ' +
        'processing the product — please try again in a few minutes, or ' +
        'make sure the app was installed from TestFlight or the App Store.',
      );
    }
    throw err;
  }
  console.log('[IAP] purchaseProduct succeeded:', { productIdentifier, hasJws: !!tx?.jwsRepresentation });
  const signed = extractSignedPayload(tx);
  if (!signed) throw new Error('Purchase did not return a signed transaction');
  return verifyAppleTransaction(signed);
}

/** Restore only current Apple entitlements, verified again by our backend. */
export async function restorePurchases() {
  ensureAvailable();
  let syncError: unknown;
  try {
    await NativePurchases.restorePurchases();
  } catch (error) {
    // Respect cancellation; other sync failures may still leave verified local entitlements.
    if (/cancel/i.test(error instanceof Error ? error.message : String((error as { message?: string })?.message ?? error))) throw error;
    syncError = error;
  }
  const result = await NativePurchases.getPurchases({ onlyCurrentEntitlements: true });
  const purchases = result?.purchases ?? [];
  if (!Array.isArray(purchases) || purchases.length === 0) {
    if (syncError) throw syncError;
    return { restored: 0 as const };
  }
  let restored = 0;
  let verificationError: unknown;
  for (const p of purchases) {
    // Restore requires a StoreKit 2 signature, never a legacy receipt.
    const signed = p?.jwsRepresentation;
    if (!signed) continue;
    try {
      const verified = await verifyAppleTransaction(signed);
      if (['active', 'cancelling'].includes(verified.status)) restored++;
    } catch (err) {
      verificationError = err;
    }
  }
  if (!restored && verificationError) throw verificationError;
  if (!restored && syncError) throw syncError;
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
