// Apple In-App Purchase: verify a signed StoreKit 2 transaction (JWS) and upsert subscription
import { createClient } from "npm:@supabase/supabase-js@2";
import {
  verifyAppleJws,
  assertBundleId,
  assertProductId,
  assertEnvironment,
  AppleJwsError,
} from "../_shared/appleJws.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const log = (s: string, d?: unknown) => console.log(`[apple-iap-verify] ${s}`, d ? JSON.stringify(d) : "");

interface DecodedTx {
  transactionId?: string;
  originalTransactionId?: string;
  productId?: string;
  expiresDate?: number; // ms epoch
  purchaseDate?: number;
  environment?: "Sandbox" | "Production";
  type?: string;
  bundleId?: string;
  revocationDate?: number;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const auth = req.headers.get("Authorization");
    if (!auth?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    const userClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: auth } } },
    );
    const { data: claims, error: claimsErr } = await userClient.auth.getClaims(auth.replace("Bearer ", ""));
    if (claimsErr || !claims?.claims?.sub) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    const userId = claims.claims.sub as string;

    const body = await req.json().catch(() => ({}));
    const signedTransaction: string | undefined = body?.signedTransaction;
    if (!signedTransaction || typeof signedTransaction !== "string") {
      return new Response(JSON.stringify({ error: "signedTransaction required" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Full Apple JWS signature + chain verification — entitlement is NEVER granted from
    // an unverified payload. verifyAppleJws() pins the chain to Apple Root CA - G3.
    let decoded: DecodedTx;
    try {
      decoded = await verifyAppleJws<DecodedTx>(signedTransaction);
    } catch (e) {
      const code = e instanceof AppleJwsError ? e.code : "verify_failed";
      log("JWS verification failed", { code, msg: (e as Error).message, userId });
      return new Response(JSON.stringify({ error: "Invalid or untrusted signedTransaction", code }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    let plan: ReturnType<typeof assertProductId>;
    let environment: ReturnType<typeof assertEnvironment>;
    try {
      assertBundleId(decoded.bundleId);
      plan = assertProductId(decoded.productId);
      environment = assertEnvironment(decoded.environment);
    } catch (e) {
      const code = e instanceof AppleJwsError ? e.code : "claims_invalid";
      log("payload claims rejected", { code, msg: (e as Error).message, userId });
      return new Response(JSON.stringify({ error: (e as Error).message, code }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const originalTx = decoded.originalTransactionId;
    if (!originalTx) {
      log("missing originalTransactionId", { userId });
      return new Response(JSON.stringify({ error: "Missing originalTransactionId" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const expiresAtMs = decoded.expiresDate ?? null;
    const expiresAt = expiresAtMs ? new Date(expiresAtMs).toISOString() : null;
    const isActive = expiresAtMs ? expiresAtMs > Date.now() : false;
    const revoked = !!decoded.revocationDate;
    const status = revoked ? "expired" : isActive ? "active" : "expired";

    log("decoded", { userId, originalTx, productId: decoded.productId, status, expiresAt });

    // Upsert via service role (bypass RLS for system-managed fields)
    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      { auth: { persistSession: false } },
    );

    // First, see if a sub row already exists for this user
    const { data: existing } = await admin
      .from("subscriptions")
      .select("id")
      .eq("user_id", userId)
      .maybeSingle();

    const update = {
      user_id: userId,
      status,
      plan,
      payment_source: "apple_iap" as const,
      apple_original_transaction_id: originalTx,
      apple_latest_transaction_id: decoded.transactionId ?? null,
      apple_product_id: decoded.productId ?? null,
      apple_environment: environment,
      apple_expires_at: expiresAt,
      apple_auto_renew: true,
      current_period_start: decoded.purchaseDate ? new Date(decoded.purchaseDate).toISOString() : null,
      current_period_end: expiresAt,
      updated_at: new Date().toISOString(),
    };

    if (existing) {
      const { error } = await admin.from("subscriptions").update(update).eq("user_id", userId);
      if (error) throw error;
    } else {
      const { error } = await admin.from("subscriptions").insert(update);
      if (error) throw error;
    }

    return new Response(JSON.stringify({ ok: true, status, expiresAt }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    const msg = (err as Error).message ?? String(err);
    log("ERROR", { msg });
    return new Response(JSON.stringify({ error: msg }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});