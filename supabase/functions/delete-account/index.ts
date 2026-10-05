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

// Delete children before parents. Keep recovery last so hard-delete capture
// triggers cannot leave copies of a removed account's task/library data.
const USER_OWNED_TABLES = [
  "invoice_items",
  "invoices",
  "invoice_style_settings",
  "tag_billing_settings",
  "tag_notes",
  "clients",
  "library_items",
  "library_categories",
  "tasks",
  "feedback",
  "google_connections", // cascades to google_calendars
  "live_activity_device_plans",
  "live_activity_devices",
  "user_color_schemes",
  "promo_redemptions",
  "user_roles",
  "subscriptions",
  "profiles", // profiles.id == auth user id
  "audit_log",
  "deleted_records_recovery",
];

async function listUserObjects(admin: ReturnType<typeof createClient>, bucket: string, prefix: string): Promise<string[]> {
  const paths: string[] = [];
  const limit = 100;
  for (let offset = 0; ; offset += limit) {
    const { data, error } = await admin.storage.from(bucket).list(prefix, { limit, offset });
    if (error) throw new Error(`${bucket} list failed: ${error.message}`);
    const batch = data ?? [];
    for (const item of batch) {
      const path = `${prefix}/${item.name}`;
      if (item.id) paths.push(path);
      else paths.push(...await listUserObjects(admin, bucket, path));
    }
    if (batch.length < limit) break;
  }
  return paths;
}

async function removeUserObjects(admin: ReturnType<typeof createClient>, userId: string): Promise<void> {
  for (const bucket of ["task-attachments", "feedback-screenshots"]) {
    const paths = await listUserObjects(admin, bucket, userId);
    for (let index = 0; index < paths.length; index += 100) {
      const { error } = await admin.storage.from(bucket).remove(paths.slice(index, index + 100));
      if (error) throw new Error(`${bucket} removal failed: ${error.message}`);
    }
    if ((await listUserObjects(admin, bucket, userId)).length > 0) {
      throw new Error(`${bucket} still contains user objects after removal`);
    }
  }
}

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

  try {
    await removeUserObjects(admin, userId);
  } catch (error) {
    console.error("Account storage removal failed", error);
    return new Response(JSON.stringify({ error: "storage_delete_failed" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const errors: Record<string, string> = {};

  // Preserve the Auth identity on partial failure so the owner can retry.
  for (const table of USER_OWNED_TABLES) {
    try {
      const column = table === "profiles" ? "id" : "user_id";
      const { error } = await admin.from(table).delete().eq(column, userId);
      if (error) errors[table] = error.message;
    } catch (e) {
      errors[table] = (e as Error).message;
    }
  }

  if (Object.keys(errors).length > 0) {
    return new Response(JSON.stringify({ error: "data_delete_failed", tables: Object.keys(errors) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // Finally remove the Auth user. Existing JWTs may remain valid until expiry.
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
