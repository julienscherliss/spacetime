import { SignJWT, importPKCS8 } from "npm:jose@5.10.0";
import { verifyAppleJws, assertBundleId, assertProductId, APPLE_BUNDLE_ID, AppleJwsError, type AppleEnv } from "./appleJws.ts";
import { isoMillis } from "./billing.ts";
export interface AppleTransaction {
  originalTransactionId?: string; transactionId?: string; productId?: string;
  bundleId?: string; environment?: AppleEnv; signedDate?: number;
  expiresDate?: number; purchaseDate?: number; revocationDate?: number; appAccountToken?: string;
}
export interface AppleRenewal {
  originalTransactionId?: string; environment?: AppleEnv; signedDate?: number;
  autoRenewStatus?: number; gracePeriodExpiresDate?: number; productId?: string;
}
export function assertAppleRelationship(tx: AppleTransaction, renewal: AppleRenewal | null, identity: string, env: AppleEnv) {
  assertBundleId(tx.bundleId); assertProductId(tx.productId);
  if (tx.originalTransactionId !== identity || tx.environment !== env || !tx.transactionId || !tx.signedDate
    || (renewal && (renewal.originalTransactionId !== identity || renewal.environment !== env)))
    throw new AppleJwsError("relationship_mismatch", "Apple payload identities do not match");
}
async function appleApi(path: string, environment: AppleEnv) {
  const key = Deno.env.get("APPLE_PRIVATE_KEY"), keyId = Deno.env.get("APPLE_KEY_ID"), issuer = Deno.env.get("APPLE_ISSUER_ID");
  if (!key || !keyId || !issuer) throw new Error("Apple server credentials unavailable");
  // The official Node API client also depends on unavailable Edge Runtime
  // crypto methods. Use Apple's documented server JWT and HTTPS endpoint with
  // WebCrypto; every returned transaction/renewal still uses the verifier.
  const bundle = Deno.env.get("APPLE_BUNDLE_ID") || APPLE_BUNDLE_ID;
  const jwt = await new SignJWT({ bid: bundle }).setProtectedHeader({alg:"ES256",kid:keyId,typ:"JWT"})
    .setIssuer(issuer).setAudience("appstoreconnect-v1").setIssuedAt().setExpirationTime("5m")
    .sign(await importPKCS8(key,"ES256"));
  const host = environment === "Sandbox" ? "https://api.storekit-sandbox.apple.com" : "https://api.storekit.apple.com";
  const request = await fetch(`${host}${path}`,
    {method:'GET',redirect:'error',headers:{Authorization:`Bearer ${jwt}`},signal:AbortSignal.timeout(15000)});
  if (!request.ok) throw new Error(`Apple status API HTTP ${request.status}`);
  return await request.json();
}
export async function currentAppleSnapshot(identity: string, environment: AppleEnv, userId: string | null,
  revokedTransaction?: string, revocationEvent?: {event_id: string; signed_date: number}) {
  const response = await appleApi(`/inApps/v1/subscriptions/${encodeURIComponent(identity)}`,environment) as {bundleId?:string;environment?:string;data?:Array<{
    lastTransactions?:Array<{originalTransactionId?:string;status?:number;signedTransactionInfo?:string;signedRenewalInfo?:string}>}>};
  assertBundleId(response.bundleId);
  if (response.environment !== environment) throw new Error("Apple API environment mismatch");
  const entries = response.data?.flatMap(group => group.lastTransactions ?? [])
    .filter(entry => entry.originalTransactionId === identity) ?? [];
  if (entries.length !== 1 || !entries[0].signedTransactionInfo) throw new Error("Apple current subscription unavailable");
  const entry = entries[0];
  const tx = await verifyAppleJws<AppleTransaction>(entry.signedTransactionInfo!, "transaction", environment);
  const renewal = entry.signedRenewalInfo ? await verifyAppleJws<AppleRenewal>(entry.signedRenewalInfo, "renewal", environment) : null;
  assertAppleRelationship(tx, renewal, identity, environment);
  if (userId && tx.appAccountToken && tx.appAccountToken.toLowerCase() !== userId.toLowerCase())
    throw new AppleJwsError("account_mismatch", "Purchase belongs to another Spacetime account");
  // Explicit notification revocations are ordered in the durable ledger. An
  // older REFUND must not override a newer verified REFUND_REVERSED event.
  const revoked = Boolean(tx.revocationDate || entry.status === 5);
  const grace = entry.status === 4 ? renewal?.gracePeriodExpiresDate : null;
  const end = Math.max(tx.expiresDate ?? 0, grace ?? 0);
  const active = !revoked && (entry.status === 1 || entry.status === 4) && end > Date.now();
  return { status: active ? (renewal?.autoRenewStatus === 0 ? "cancelling" : "active") : "expired",
    plan: assertProductId(tx.productId), period_start: isoMillis(tx.purchaseDate), period_end: isoMillis(tx.expiresDate),
    grace_end: isoMillis(grace), transaction_id: tx.transactionId, product_id: tx.productId,
    signed_date: Math.max(tx.signedDate ?? 0, renewal?.signedDate ?? 0), revoked,
    revoked_transaction: revokedTransaction ?? (revoked ? tx.transactionId : null),
    revocation_event: revocationEvent ?? null,
    auto_renew: renewal?.autoRenewStatus === 1 };
}

export async function refundReversalSnapshot(identity: string, environment: AppleEnv, userId: string | null,
  transactionId: string, eventId: string, signedDate: number) {
  if (!transactionId || !eventId || !Number.isSafeInteger(signedDate) || signedDate <= 0)
    throw new AppleJwsError('incomplete_reversal','Missing verified reversal identity');
  const response = await appleApi(`/inApps/v1/transactions/${encodeURIComponent(transactionId)}`,environment);
  if (typeof response.signedTransactionInfo !== 'string') throw new Error('Apple reversal transaction unavailable');
  const tx = await verifyAppleJws<AppleTransaction>(response.signedTransactionInfo,'transaction',environment);
  assertAppleRelationship(tx,null,identity,environment);
  if (tx.transactionId !== transactionId || tx.revocationDate || !tx.signedDate || tx.signedDate < signedDate)
    throw new Error('Apple has not confirmed the current reversal; retry required');
  if (userId && tx.appAccountToken && tx.appAccountToken.toLowerCase() !== userId.toLowerCase())
    throw new AppleJwsError('account_mismatch','Reversal belongs to another Spacetime account');
  const current = await currentAppleSnapshot(identity,environment,userId);
  if (current.transaction_id === transactionId && current.revoked)
    throw new Error('Apple current subscription still revoked; retry required');
  return {...current,refund_reversal:{transaction_id:transactionId,original_transaction_id:identity,
    environment,event_id:eventId,signed_date:signedDate,transaction_signed_date:tx.signedDate}};
}
