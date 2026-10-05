import { billingAdmin, reconcileBilling, BillingConflict } from "../_shared/billing.ts";
import { verifyAppleJws, assertBundleId, assertProductId, assertEnvironment, AppleJwsError } from "../_shared/appleJws.ts";
import { currentAppleSnapshot, type AppleTransaction } from "../_shared/appleBilling.ts";
const headers = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization,x-client-info,apikey,content-type" };
const reply = (body: unknown,status=200) => Response.json(body,{status,headers});
Deno.serve(async req => {
  if (req.method === "OPTIONS") return new Response("ok",{headers});
  if (req.method !== "POST") return reply({error:"Method not allowed"},405);
  try {
    const token = req.headers.get("Authorization")?.match(/^Bearer (.+)$/)?.[1];
    if (!token) return reply({error:"Unauthorized"},401);
    const admin = billingAdmin();
    const { data: { user }, error } = await admin.auth.getUser(token);
    if (error || !user) return reply({error:"Unauthorized"},401);
    const body = await req.json().catch(() => ({}));
    if (typeof body.signedTransaction !== "string") return reply({error:"signedTransaction required"},400);
    const tx = await verifyAppleJws<AppleTransaction>(body.signedTransaction,"transaction");
    assertBundleId(tx.bundleId); assertProductId(tx.productId);
    const environment = assertEnvironment(tx.environment);
    if (!tx.originalTransactionId || !tx.transactionId) return reply({error:"Incomplete transaction"},400);
    if (tx.appAccountToken && tx.appAccountToken.toLowerCase() !== user.id.toLowerCase())
      throw new BillingConflict("Purchase belongs to another Spacetime account");
    // Every restore rechecks Apple's server. There is no receipt-result cache.
    // Legacy purchases without a token use verified current state + immutable
    // first-claim ownership; existing ownership cannot be transferred here.
    const result = await reconcileBilling({ p_user_id:user.id,p_provider:"apple_iap",p_environment:environment,
      p_identity:tx.originalTransactionId,p_event_id:`verify:${crypto.randomUUID()}` },
      () => currentAppleSnapshot(tx.originalTransactionId!,environment,user.id),true);
    if (result.outcome === "inactive_claim") return reply({ok:true,status:"expired",expiresAt:result.expiresAt});
    if (!["applied","stale"].includes(result.outcome)) throw new BillingConflict("Another entitlement is already assigned to this account");
    const {data:sub,error:readError}=await admin.from("subscriptions")
      .select("payment_source,apple_original_transaction_id,apple_environment,status,current_period_end,grace_period_end")
      .eq("user_id",user.id).single();
    if(readError) throw readError;
    if(sub.payment_source !== "apple_iap" || sub.apple_original_transaction_id !== tx.originalTransactionId
      || sub.apple_environment !== environment) throw new BillingConflict("This account has a different entitlement");
    const end=Math.max(Date.parse(sub.current_period_end??"")||0,Date.parse(sub.grace_period_end??"")||0);
    const status=["active","cancelling"].includes(sub.status) && end>Date.now() ? sub.status : "expired";
    return reply({ok:true,status,expiresAt:sub.current_period_end});
  } catch (error) {
    if (error instanceof BillingConflict) return reply({error:error.message},409);
    if (error instanceof AppleJwsError) return reply({error:error.message,code:error.code},400);
    console.error("Apple verification reconciliation failed; retry required");
    return reply({error:"Unable to verify purchase. Please try again."},500);
  }
});
