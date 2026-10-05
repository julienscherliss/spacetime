import { billingAdmin, reconcileBilling } from "../_shared/billing.ts";
import { verifyAppleJws, assertBundleId, assertEnvironment, assertProductId, AppleJwsError } from "../_shared/appleJws.ts";
import { currentAppleSnapshot, refundReversalSnapshot, assertAppleRelationship, type AppleTransaction, type AppleRenewal } from "../_shared/appleBilling.ts";
interface Notification {
  notificationType?: string; notificationUUID?: string; signedDate?: number;
  data?: { bundleId?: string; environment?: string; signedTransactionInfo?: string; signedRenewalInfo?: string };
}
Deno.serve(async req => {
  if (req.method !== "POST") return new Response("Method not allowed",{status:405});
  try {
    const body = await req.json().catch(() => ({}));
    if (typeof body.signedPayload !== "string") return Response.json({error:"signedPayload required"},{status:400});
    const payload = await verifyAppleJws<Notification>(body.signedPayload,"notification");
    assertBundleId(payload.data?.bundleId);
    const environment = assertEnvironment(payload.data?.environment);
    if (!payload.notificationUUID || !payload.signedDate) throw new AppleJwsError("incomplete_notification","Missing notification identity");
    if (payload.notificationType === "TEST") return Response.json({ok:true});
    const tx = payload.data?.signedTransactionInfo
      ? await verifyAppleJws<AppleTransaction>(payload.data.signedTransactionInfo,"transaction",environment) : null;
    const renewal = payload.data?.signedRenewalInfo
      ? await verifyAppleJws<AppleRenewal>(payload.data.signedRenewalInfo,"renewal",environment) : null;
    const identity = tx?.originalTransactionId ?? renewal?.originalTransactionId;
    if (!identity) throw new AppleJwsError("missing_identity","Missing subscription identity");
    if (tx) assertAppleRelationship(tx,renewal,identity,environment);
    if (renewal && (renewal.originalTransactionId !== identity || renewal.environment !== environment))
      throw new AppleJwsError("relationship_mismatch","Renewal identity mismatch");
    if (tx) assertProductId(tx.productId);
    const {data:row,error} = await billingAdmin().from("subscriptions").select("user_id")
      .eq("apple_original_transaction_id",identity).maybeSingle();
    if (error) throw error;
    const {data:boundOwner,error:ownerError}=await billingAdmin().rpc("billing_owner",{
      p_provider:"apple_iap",p_environment:environment,p_identity:identity});
    if(ownerError) throw ownerError;
    const owner=row?.user_id ?? boundOwner ?? null;
    // Even notifications arriving before first restore retain transaction
    // revocations, so an unclaimed pre-refund receipt cannot regain access.
    const revoked = ["REFUND","REVOKE"].includes(payload.notificationType ?? "") ? tx?.transactionId : undefined;
    const reversal = payload.notificationType === "REFUND_REVERSED";
    if (reversal && !tx) throw new AppleJwsError("missing_transaction","Reversal requires a signed transaction");
    // A versioned identity permits deliberate replay of an authentic reversal
    // previously acknowledged by the old handler, while retaining deduplication.
    const eventId = payload.notificationUUID + (reversal ? ":refund-reversal-v2" : "");
    const result = await reconcileBilling({p_user_id:owner,p_provider:"apple_iap",
      p_environment:environment,p_identity:identity,p_event_id:eventId},
      () => reversal ? refundReversalSnapshot(identity,environment,owner,tx!.transactionId!,eventId,payload.signedDate!)
        : currentAppleSnapshot(identity,environment,owner,revoked,
          revoked ? {event_id:eventId,signed_date:payload.signedDate!} : undefined));
    return Response.json({ok:true,...result});
  } catch(error) {
    if (error instanceof AppleJwsError) return Response.json({error:error.message,code:error.code},{status:400});
    console.error("Apple notification reconciliation failed; provider retry required");
    return Response.json({error:"Reconciliation unavailable"},{status:500});
  }
});
