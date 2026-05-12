// Apple App Store Server Notifications V2 webhook
// Configure URL in App Store Connect: App Information → App Store Server Notifications → Production / Sandbox URL
import { createClient } from "npm:@supabase/supabase-js@2";
import {
  verifyAppleJws,
  planForProductId,
  assertBundleId,
  assertEnvironment,
  AppleJwsError,
  ALLOWED_PRODUCT_IDS,
} from "../_shared/appleJws.ts";

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

    let payload: NotificationPayload;
    try {
      payload = await verifyAppleJws<NotificationPayload>(signedPayload);
    } catch (e) {
      const code = e instanceof AppleJwsError ? e.code : "verify_failed";
      log("notification JWS verification failed", { code, msg: (e as Error).message });
      // 400 — Apple will not retry on 4xx, which is what we want for an untrusted payload.
      return new Response(JSON.stringify({ error: "Invalid signedPayload", code }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    const notificationType = payload.notificationType ?? "";
    const subtype = payload.subtype ?? "";
    log("incoming", { notificationType, subtype, uuid: payload.notificationUUID });

    try {
      assertBundleId(payload.data?.bundleId);
    } catch (e) {
      const code = e instanceof AppleJwsError ? e.code : "bundle_invalid";
      log("bundle rejected", { code, msg: (e as Error).message });
      return new Response(JSON.stringify({ error: (e as Error).message, code }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Both inner JWS objects must be verified the same way as the outer one.
    let tx: DecodedTx | null = null;
    if (payload.data?.signedTransactionInfo) {
      try {
        tx = await verifyAppleJws<DecodedTx>(payload.data.signedTransactionInfo);
      } catch (e) {
        const code = e instanceof AppleJwsError ? e.code : "tx_verify_failed";
        log("inner tx verification failed", { code, msg: (e as Error).message });
        return new Response(JSON.stringify({ error: "Invalid signedTransactionInfo", code }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
    }
    let renewal: DecodedRenewal | null = null;
    if (payload.data?.signedRenewalInfo) {
      try {
        renewal = await verifyAppleJws<DecodedRenewal>(payload.data.signedRenewalInfo);
      } catch (e) {
        const code = e instanceof AppleJwsError ? e.code : "renewal_verify_failed";
        log("inner renewal verification failed", { code, msg: (e as Error).message });
        return new Response(JSON.stringify({ error: "Invalid signedRenewalInfo", code }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
    }

    // Validate environment + product if we have a transaction.
    if (tx) {
      try {
        assertEnvironment(tx.environment);
      } catch (e) {
        const code = e instanceof AppleJwsError ? e.code : "env_invalid";
        log("environment rejected", { code, msg: (e as Error).message });
        return new Response(JSON.stringify({ error: (e as Error).message, code }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
      if (tx.productId && !ALLOWED_PRODUCT_IDS.includes(tx.productId)) {
        log("ignoring unknown productId", { productId: tx.productId });
        // ACK so Apple doesn't keep retrying — but do not touch any subscription row.
        return new Response(JSON.stringify({ ok: true, ignored: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
    }

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
    const planFromTx = planForProductId(tx?.productId);
    if (planFromTx) update.plan = planFromTx;
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