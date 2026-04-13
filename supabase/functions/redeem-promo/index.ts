import { createClient } from "https://esm.sh/@supabase/supabase-js@2.101.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Missing auth" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const userSupabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );

    const { data: { user }, error: authError } = await userSupabase.auth.getUser();
    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { code } = await req.json();
    if (!code || typeof code !== "string") {
      return new Response(JSON.stringify({ error: "Invalid code" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const adminSupabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // Find promo code
    const { data: promo, error: promoError } = await adminSupabase
      .from("promo_codes")
      .select("*")
      .eq("code", code.toUpperCase())
      .eq("active", true)
      .maybeSingle();

    console.log("Promo lookup:", { code: code.toUpperCase(), promo, promoError });

    if (!promo) {
      return new Response(JSON.stringify({ error: "Invalid or expired promo code" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Check expiration
    if (promo.expires_at && new Date(promo.expires_at) < new Date()) {
      return new Response(JSON.stringify({ error: "This promo code has expired" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Check max uses
    if (promo.max_uses && promo.current_uses >= promo.max_uses) {
      return new Response(JSON.stringify({ error: "This promo code has reached its usage limit" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Check if already redeemed
    const { data: existing } = await adminSupabase
      .from("promo_redemptions")
      .select("id")
      .eq("user_id", user.id)
      .eq("promo_code_id", promo.id)
      .maybeSingle();

    if (existing) {
      return new Response(JSON.stringify({ error: "You've already redeemed this code" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Redeem
    await adminSupabase.from("promo_redemptions").insert({
      user_id: user.id,
      promo_code_id: promo.id,
    });

    // Increment usage
    await adminSupabase.from("promo_codes").update({
      current_uses: promo.current_uses + 1,
    }).eq("id", promo.id);

    // Apply effect
    if (promo.type === "lifetime") {
      // Upsert subscription — handles both existing and missing subscription rows
      const { error: upsertError } = await adminSupabase.from("subscriptions").upsert(
        {
          user_id: user.id,
          status: "active",
          lifetime_access: true,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "user_id" }
      );

      console.log("Subscription upsert result:", { userId: user.id, upsertError });

      if (upsertError) {
        console.error("Failed to grant lifetime access:", upsertError);
        return new Response(JSON.stringify({ error: "Failed to apply promo code" }), {
          status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      return new Response(JSON.stringify({ success: true, message: "Lifetime access granted!" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // For discount codes, just mark it — Stripe coupon would be applied at checkout
    return new Response(JSON.stringify({ success: true, message: "Promo code applied!" }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("Redeem error:", err);
    return new Response(JSON.stringify({ error: "Internal error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
