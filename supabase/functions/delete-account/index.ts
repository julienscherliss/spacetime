// Delete Account edge function — App Store compliant.
// Permanently removes the authenticated user's data and their auth account.
// Requires a valid user JWT; uses service role to perform the deletion.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

// Tables that store user-owned rows keyed by `user_id`.
// Order does not matter (no FKs between them), but we delete children-ish
// tables first for clarity.
const USER_OWNED_TABLES = [
  "invoice_items",
  "invoices",
  "tag_billing_settings",
  "tag_notes",
  "clients",
  "library_items",
  "library_categories",
  "tasks",
  "user_color_schemes",
  "promo_redemptions",
  "user_roles",
  "subscriptions",
  "profiles", // profiles.id == auth user id
];

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "method_not_allowed" }), {
      status: 405,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
  const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

  // Verify the caller's JWT.
  const authHeader = req.headers.get("Authorization") ?? "";
  if (!authHeader.startsWith("Bearer ")) {
    return new Response(JSON.stringify({ error: "unauthorized" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
  const userClient = createClient(SUPABASE_URL, ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: userData, error: userErr } = await userClient.auth.getUser();
  if (userErr || !userData?.user) {
    return new Response(JSON.stringify({ error: "unauthorized" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
  const userId = userData.user.id;

  // Optional confirmation token from the body — defense-in-depth so a stray
  // POST cannot wipe an account.
  let confirmText: string | undefined;
  try {
    const body = await req.json().catch(() => ({}));
    confirmText = body?.confirm;
  } catch (_) {
    // ignore
  }
  if (confirmText !== "DELETE") {
    return new Response(
      JSON.stringify({ error: "confirmation_required" }),
      {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  }

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const errors: Record<string, string> = {};

  // Best-effort delete from each owner table. We don't abort on a single
  // failure — the caller is removed from auth at the end either way, and
  // RLS makes orphaned rows inaccessible.
  for (const table of USER_OWNED_TABLES) {
    try {
      const column = table === "profiles" ? "id" : "user_id";
      const { error } = await admin.from(table).delete().eq(column, userId);
      if (error) errors[table] = error.message;
    } catch (e) {
      errors[table] = (e as Error).message;
    }
  }

  // Finally remove the auth user. This invalidates all sessions.
  const { error: delAuthErr } = await admin.auth.admin.deleteUser(userId);
  if (delAuthErr) {
    return new Response(
      JSON.stringify({
        error: "auth_delete_failed",
        message: delAuthErr.message,
        partial_errors: errors,
      }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  }

  return new Response(
    JSON.stringify({ ok: true, partial_errors: errors }),
    {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    },
  );
});