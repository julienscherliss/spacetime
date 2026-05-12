// Apple App Store Server Notifications V2 webhook
// Configure URL in App Store Connect: App Information → App Store Server Notifications → Production / Sandbox URL
import { createClient } from "npm:@supabase/supabase-js@2";
import { decodeJwt } from "npm:jose@5";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "content-type",
};

const log = (s: string, d?: unknown) => console.log(`[apple-iap-notifications] ${s}`, d ? JSON.stringify(d) : "");

interface NotificationPayload {
  notificationType?: string;
  subtype?: string;
  notificationUUID?: string;
  data?: {
    bundleId?: string;
    environment?: "Sandbox" | "Production";
    signedTransactionInfo?: string;
    signedRenewalInfo?: string;
  };
}

interface DecodedTx {
  transactionId?: string;
  originalTransactionId?: string;
  productId?: string;
  expiresDate?: number;
  purchaseDate?: number;
  environment?: "Sandbox" | "Production";
  revocationDate?: number;
}

interface DecodedRenewal {
  autoRenewStatus?: 0 | 1;
  expirationIntent?: number;
  originalTransactionId?: string;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return new Response("Method not allowed", { status: 405 });

  try {
    const body = await req.json().catch(() => ({}));
    const signedPayload: string | undefined = body?.signedPayload;
    if (!signedPayload) {
      log("missing signedPayload");
      return new Response(JSON.stringify({ error: "signedPayload required" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const payload = decodeJwt(signedPayload) as unknown as NotificationPayload;
    const notificationType = payload.notificationType ?? "";
    const subtype = payload.subtype ?? "";
    log("incoming", { notificationType, subtype, uuid: payload.notificationUUID });

    const expectedBundle = Deno.env.get("APPLE_BUNDLE_ID");
    if (expectedBundle && payload.data?.bundleId && payload.data.bundleId !== expectedBundle) {
      log("bundle mismatch", { got: payload.data.bundleId, expected: expectedBundle });
      return new Response(JSON.stringify({ error: "Bundle ID mismatch" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const tx = payload.data?.signedTransactionInfo
      ? (decodeJwt(payload.data.signedTransactionInfo) as unknown as DecodedTx)
      : null;
    const renewal = payload.data?.signedRenewalInfo
      ? (decodeJwt(payload.data.signedRenewalInfo) as unknown as DecodedRenewal)
      : null;

    const originalTx = tx?.originalTransactionId ?? renewal?.originalTransactionId;
    if (!originalTx) {
      log("no originalTransactionId");
      // Acknowledge so Apple stops retrying — we have nothing to do
      return new Response(JSON.stringify({ ok: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      { auth: { persistSession: false } },
    );

    const { data: existing, error: lookupErr } = await admin
      .from("subscriptions")
      .select("id, user_id, status, current_period_end")
      .eq("apple_original_transaction_id", originalTx)
      .maybeSingle();
    if (lookupErr) throw lookupErr;
    if (!existing) {
      log("no matching subscription row", { originalTx });
      return new Response(JSON.stringify({ ok: true, ignored: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const expiresAt = tx?.expiresDate ? new Date(tx.expiresDate).toISOString() : null;
    const autoRenew = renewal?.autoRenewStatus === undefined ? null : renewal.autoRenewStatus === 1;

    // Map Apple notification → our status
    let nextStatus = existing.status;
    switch (notificationType) {
      case "SUBSCRIBED":
      case "DID_RENEW":
      case "OFFER_REDEEMED":
        nextStatus = "active";
        break;
      case "DID_CHANGE_RENEWAL_STATUS":
        if (autoRenew === false) nextStatus = "cancelling";
        else if (autoRenew === true) nextStatus = "active";
        break;
      case "EXPIRED":
      case "GRACE_PERIOD_EXPIRED":
      case "REFUND":
      case "REVOKE":
        nextStatus = "expired";
        break;
      case "DID_FAIL_TO_RENEW":
        // Stay active until current_period_end passes
        break;
      default:
        log("unhandled notificationType", { notificationType, subtype });
    }

    const update: Record<string, unknown> = {
      status: nextStatus,
      payment_source: "apple_iap",
      apple_latest_transaction_id: tx?.transactionId ?? undefined,
      apple_product_id: tx?.productId ?? undefined,
      apple_environment: tx?.environment ?? undefined,
      updated_at: new Date().toISOString(),
    };
    if (expiresAt) {
      update.apple_expires_at = expiresAt;
      update.current_period_end = expiresAt;
    }
    if (autoRenew !== null) update.apple_auto_renew = autoRenew;

    // Strip undefined keys
    Object.keys(update).forEach((k) => update[k] === undefined && delete update[k]);

    const { error: updErr } = await admin
      .from("subscriptions")
      .update(update)
      .eq("id", existing.id);
    if (updErr) throw updErr;

    log("updated", { id: existing.id, nextStatus, expiresAt });
    return new Response(JSON.stringify({ ok: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (err) {
    const msg = (err as Error).message ?? String(err);
    log("ERROR", { msg });
    // Return 500 so Apple retries
    return new Response(JSON.stringify({ error: msg }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});