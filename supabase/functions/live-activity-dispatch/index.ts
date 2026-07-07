import { createClient } from "https://esm.sh/@supabase/supabase-js@2.101.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-dispatch-secret",
};

const APNS_PRODUCTION_URL = "https://api.push.apple.com";
const APNS_SANDBOX_URL = "https://api.sandbox.push.apple.com";

type LiveActivityPlan = {
  id: string;
  user_id: string;
  device_id: string;
  plan_signature: string;
  active: boolean;
  task_id: string | null;
  title: string | null;
  category: string | null;
  symbol_name: string | null;
  is_free_time: boolean;
  start_at: string | null;
  end_at: string | null;
  next_title: string | null;
  next_start_at: string | null;
  payload: Record<string, unknown>;
  last_dispatched_signature: string | null;
};

type LiveActivityDevice = {
  user_id: string;
  device_id: string;
  push_to_start_token: string | null;
  current_activity_token: string | null;
  current_activity_task_id: string | null;
};

function log(stage: string, info: Record<string, unknown> = {}) {
  console.log(JSON.stringify({ fn: "live-activity-dispatch", stage, ...info }));
}

function base64Url(bytes: Uint8Array) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function base64UrlJson(value: unknown) {
  return base64Url(new TextEncoder().encode(JSON.stringify(value)));
}

function pemToArrayBuffer(pem: string) {
  const normalized = pem.replace(/\\n/g, "\n");
  const base64 = normalized
    .replace(/-----BEGIN PRIVATE KEY-----/g, "")
    .replace(/-----END PRIVATE KEY-----/g, "")
    .replace(/\s/g, "");
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes.buffer;
}

let cachedToken: { token: string; expiresAt: number } | null = null;

async function getApnsJwt() {
  const nowSeconds = Math.floor(Date.now() / 1000);
  if (cachedToken && cachedToken.expiresAt > nowSeconds + 60) return cachedToken.token;

  const keyId = Deno.env.get("APNS_KEY_ID");
  const teamId = Deno.env.get("APNS_TEAM_ID");
  const privateKey = Deno.env.get("APNS_PRIVATE_KEY");
  if (!keyId || !teamId || !privateKey) {
    throw new Error("Missing APNS_KEY_ID, APNS_TEAM_ID, or APNS_PRIVATE_KEY");
  }

  const cryptoKey = await crypto.subtle.importKey(
    "pkcs8",
    pemToArrayBuffer(privateKey),
    { name: "ECDSA", namedCurve: "P-256" },
    false,
    ["sign"],
  );

  const header = base64UrlJson({ alg: "ES256", kid: keyId });
  const claims = base64UrlJson({ iss: teamId, iat: nowSeconds });
  const signingInput = `${header}.${claims}`;
  const signature = await crypto.subtle.sign(
    { name: "ECDSA", hash: "SHA-256" },
    cryptoKey,
    new TextEncoder().encode(signingInput),
  );

  const token = `${signingInput}.${base64Url(new Uint8Array(signature))}`;
  cachedToken = { token, expiresAt: nowSeconds + 50 * 60 };
  return token;
}

function iso(value: string | null) {
  return value ? new Date(value).toISOString() : null;
}

function staleDateSeconds(plan: LiveActivityPlan) {
  const end = plan.end_at ? new Date(plan.end_at) : new Date();
  const staleMs = end.getTime() + (plan.is_free_time ? 5 * 60 * 1000 : 4 * 60 * 60 * 1000);
  return Math.floor(staleMs / 1000);
}

function contentState(plan: LiveActivityPlan) {
  return {
    title: plan.title ?? "Spacetime",
    category: plan.category,
    symbolName: plan.symbol_name ?? "timer",
    isFreeTime: plan.is_free_time,
    startDate: iso(plan.start_at),
    endDate: iso(plan.end_at),
    nextTitle: plan.next_title,
    nextStartDate: iso(plan.next_start_at),
  };
}

function apnsPayload(plan: LiveActivityPlan, event: "start" | "update" | "end") {
  const aps: Record<string, unknown> = {
    timestamp: Math.floor(Date.now() / 1000),
    event,
  };

  if (event === "start") {
    aps["attributes-type"] = "SpacetimeLiveActivityAttributes";
    aps.attributes = {
      taskId: plan.task_id ?? `plan-${plan.id}`,
    };
  }

  if (event !== "end") {
    aps["content-state"] = contentState(plan);
    aps["stale-date"] = staleDateSeconds(plan);
    aps.alert = {
      title: plan.title ?? "Spacetime",
      body: plan.is_free_time ? "Free time before your next activity." : "Your scheduled activity is active.",
      sound: "default",
    };
  } else {
    aps["dismissal-date"] = Math.floor(Date.now() / 1000);
  }

  return { aps };
}

function shouldDispatchPlan(plan: LiveActivityPlan) {
  if (plan.last_dispatched_signature === plan.plan_signature) return false;
  return true;
}

async function sendLiveActivityPush(params: {
  token: string;
  event: "start" | "update" | "end";
  plan: LiveActivityPlan;
  dryRun: boolean;
}) {
  const bundleId = Deno.env.get("APNS_BUNDLE_ID") ?? "com.spacetimelabs.spacetime";
  const environment = Deno.env.get("APNS_ENV") ?? "production";
  const baseUrl = environment === "sandbox" ? APNS_SANDBOX_URL : APNS_PRODUCTION_URL;
  const url = `${baseUrl}/3/device/${params.token}`;
  const body = apnsPayload(params.plan, params.event);

  if (params.dryRun) {
    return {
      ok: true,
      status: 0,
      apnsId: null,
      dryRun: true,
      event: params.event,
      payload: body,
    };
  }

  const jwt = await getApnsJwt();
  const response = await fetch(url, {
    method: "POST",
    headers: {
      authorization: `bearer ${jwt}`,
      "apns-topic": `${bundleId}.push-type.liveactivity`,
      "apns-push-type": "liveactivity",
      "apns-priority": "10",
      "content-type": "application/json",
    },
    body: JSON.stringify(body),
  });

  const text = await response.text();
  let responseBody: unknown = null;
  if (text) {
    try {
      responseBody = JSON.parse(text);
    } catch {
      responseBody = text;
    }
  }

  return {
    ok: response.ok,
    status: response.status,
    apnsId: response.headers.get("apns-id"),
    body: responseBody,
    event: params.event,
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return new Response("Method not allowed", { status: 405 });

  try {
    const dispatchSecret = Deno.env.get("LIVE_ACTIVITY_DISPATCH_SECRET");
    if (!dispatchSecret || req.headers.get("x-dispatch-secret") !== dispatchSecret) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json().catch(() => ({}));
    const dryRun = body?.dryRun === true;
    const limit = Math.min(Math.max(Number(body?.limit ?? 50), 1), 100);
    const now = new Date();
    const windowEnd = new Date(now.getTime() + 60 * 1000).toISOString();

    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      { auth: { persistSession: false } },
    );

    const { data: plans, error: planError } = await admin
      .from("live_activity_device_plans")
      .select("*")
      .order("updated_at", { ascending: false })
      .limit(limit);

    if (planError) throw planError;

    const results: Array<Record<string, unknown>> = [];
    for (const plan of ((plans ?? []) as LiveActivityPlan[]).filter(shouldDispatchPlan)) {
      const { data: device, error: deviceError } = await admin
        .from("live_activity_devices")
        .select("user_id, device_id, push_to_start_token, current_activity_token, current_activity_task_id")
        .eq("user_id", plan.user_id)
        .eq("device_id", plan.device_id)
        .maybeSingle();

      if (deviceError) throw deviceError;

      const liveDevice = device as LiveActivityDevice | null;
      const shouldEndCurrentActivity =
        !!liveDevice?.current_activity_token &&
        (!plan.active || (!!plan.task_id && liveDevice.current_activity_task_id !== plan.task_id));
      const isDueForStartOrUpdate = !!plan.start_at && plan.start_at <= windowEnd;

      if (plan.active && !isDueForStartOrUpdate && !shouldEndCurrentActivity) {
        continue;
      }

      if (shouldEndCurrentActivity) {
        const sentEnd = await sendLiveActivityPush({
          token: liveDevice.current_activity_token!,
          event: "end",
          plan,
          dryRun,
        });

        if (!dryRun && sentEnd.ok) {
          await admin
            .from("live_activity_devices")
            .update({
              current_activity_token: null,
              current_activity_task_id: null,
              updated_at: new Date().toISOString(),
            })
            .eq("user_id", plan.user_id)
            .eq("device_id", plan.device_id);
        }

        if (!plan.active || !isDueForStartOrUpdate || !sentEnd.ok) {
          const patch = sentEnd.ok
            ? {
                last_dispatched_signature: plan.active ? plan.last_dispatched_signature : plan.plan_signature,
                last_dispatched_at: new Date().toISOString(),
                last_dispatch_event: "end",
                last_dispatch_error: null,
                updated_at: new Date().toISOString(),
              }
            : {
                last_dispatch_event: "end",
                last_dispatch_error: JSON.stringify(sentEnd),
                updated_at: new Date().toISOString(),
              };

          if (!dryRun) {
            await admin
              .from("live_activity_device_plans")
              .update(patch)
              .eq("id", plan.id);
          }

          results.push({ id: plan.id, taskId: plan.task_id, event: "end", ...sentEnd });
          continue;
        }
      }

      if (!plan.active) {
        if (!dryRun) {
          await admin
            .from("live_activity_device_plans")
            .update({
              last_dispatched_signature: plan.plan_signature,
              last_dispatched_at: new Date().toISOString(),
              last_dispatch_event: "none",
              last_dispatch_error: null,
              updated_at: new Date().toISOString(),
            })
            .eq("id", plan.id);
        }

        results.push({ id: plan.id, taskId: plan.task_id, event: "none", ok: true });
        continue;
      }

      const canUpdateCurrentActivity =
        !!liveDevice?.current_activity_token &&
        !!plan.task_id &&
        liveDevice.current_activity_task_id === plan.task_id;
      const event: "start" | "update" = canUpdateCurrentActivity ? "update" : "start";
      const token = event === "update" ? liveDevice?.current_activity_token : liveDevice?.push_to_start_token;

      if (!token || !plan.task_id || !plan.title || !plan.start_at || !plan.end_at) {
        const message = event === "start" ? "missing_push_to_start_token" : "missing_activity_token";
        await admin
          .from("live_activity_device_plans")
          .update({
            last_dispatch_error: message,
            updated_at: new Date().toISOString(),
          })
          .eq("id", plan.id);
        results.push({ id: plan.id, ok: false, error: message });
        continue;
      }

      const sent = await sendLiveActivityPush({ token, event, plan, dryRun });
      const patch = sent.ok
        ? {
            last_dispatched_signature: plan.plan_signature,
            last_dispatched_at: new Date().toISOString(),
            last_dispatch_event: event,
            last_dispatch_error: null,
            updated_at: new Date().toISOString(),
          }
        : {
            last_dispatch_event: event,
            last_dispatch_error: JSON.stringify(sent),
            updated_at: new Date().toISOString(),
          };

      if (!dryRun) {
        await admin
          .from("live_activity_device_plans")
          .update(patch)
          .eq("id", plan.id);
      }

      results.push({ id: plan.id, taskId: plan.task_id, event, ...sent });
    }

    log("complete", { count: results.length, dryRun });
    return new Response(JSON.stringify({ ok: true, count: results.length, results }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    const message = (error as Error).message ?? String(error);
    log("error", { message });
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
