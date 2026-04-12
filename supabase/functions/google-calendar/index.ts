import { createClient } from "https://esm.sh/@supabase/supabase-js@2.101.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const GOOGLE_CLIENT_ID = Deno.env.get("GOOGLE_CLIENT_ID")!;
const GOOGLE_CLIENT_SECRET = Deno.env.get("GOOGLE_CLIENT_SECRET")!;
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

const SCOPES = "https://www.googleapis.com/auth/calendar.readonly";

function getFormatterParts(date: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
    hourCycle: "h23",
  }).formatToParts(date);

  const read = (type: string) => parts.find((part) => part.type === type)?.value ?? "00";

  return {
    year: Number(read("year")),
    month: Number(read("month")),
    day: Number(read("day")),
    hour: Number(read("hour")),
    minute: Number(read("minute")),
    second: Number(read("second")),
  };
}

function getTimeZoneOffsetMs(date: Date, timeZone: string) {
  const parts = getFormatterParts(date, timeZone);
  const asUtc = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second);
  return asUtc - date.getTime();
}

function toUtcBoundaryIso(dateStr: string, timeStr: string, timeZone: string) {
  const [year, month, day] = dateStr.split("-").map(Number);
  const [hour, minute, second = 0] = timeStr.split(":").map(Number);
  const utcGuess = new Date(Date.UTC(year, month - 1, day, hour, minute, second));
  const initialOffset = getTimeZoneOffsetMs(utcGuess, timeZone);
  const resolved = new Date(utcGuess.getTime() - initialOffset);
  const resolvedOffset = getTimeZoneOffsetMs(resolved, timeZone);

  return new Date(utcGuess.getTime() - resolvedOffset).toISOString();
}

function formatEventDateTime(dateTime: string, timeZone: string) {
  const date = new Date(dateTime);
  const parts = getFormatterParts(date, timeZone);

  return {
    date: `${parts.year}-${String(parts.month).padStart(2, "0")}-${String(parts.day).padStart(2, "0")}`,
    time: `${String(parts.hour).padStart(2, "0")}:${String(parts.minute).padStart(2, "0")}`,
  };
}

async function exchangeCode(code: string, redirectUri: string, deviceId: string) {
  // Exchange authorization code for tokens
  const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: GOOGLE_CLIENT_ID,
      client_secret: GOOGLE_CLIENT_SECRET,
      redirect_uri: redirectUri,
      grant_type: "authorization_code",
    }),
  });

  if (!tokenRes.ok) {
    const err = await tokenRes.text();
    throw new Error(`Token exchange failed: ${err}`);
  }

  const tokens = await tokenRes.json();

  // Get user email
  const userRes = await fetch("https://www.googleapis.com/oauth2/v2/userinfo", {
    headers: { Authorization: `Bearer ${tokens.access_token}` },
  });
  const user = userRes.ok ? await userRes.json() : {};

  const expiresAt = new Date(Date.now() + (tokens.expires_in || 3600) * 1000).toISOString();

  // Upsert connection
  const { data, error } = await supabase
    .from("google_connections")
    .upsert(
      {
        device_id: deviceId,
        access_token: tokens.access_token,
        refresh_token: tokens.refresh_token || null,
        token_expires_at: expiresAt,
        email: user.email || null,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "device_id" }
    )
    .select()
    .single();

  if (error) throw new Error(`DB error: ${error.message}`);
  return data;
}

async function refreshAccessToken(connection: any) {
  if (!connection.refresh_token) throw new Error("No refresh token");

  const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      refresh_token: connection.refresh_token,
      client_id: GOOGLE_CLIENT_ID,
      client_secret: GOOGLE_CLIENT_SECRET,
      grant_type: "refresh_token",
    }),
  });

  if (!tokenRes.ok) throw new Error("Token refresh failed");
  const tokens = await tokenRes.json();

  const expiresAt = new Date(Date.now() + (tokens.expires_in || 3600) * 1000).toISOString();

  await supabase
    .from("google_connections")
    .update({
      access_token: tokens.access_token,
      token_expires_at: expiresAt,
      updated_at: new Date().toISOString(),
    })
    .eq("id", connection.id);

  return tokens.access_token;
}

async function getValidToken(deviceId: string) {
  const { data: conn, error } = await supabase
    .from("google_connections")
    .select("*")
    .eq("device_id", deviceId)
    .single();

  if (error || !conn) throw new Error("Not connected");

  // Check if token is expired (with 5 min buffer)
  const expiresAt = new Date(conn.token_expires_at).getTime();
  if (Date.now() > expiresAt - 5 * 60 * 1000) {
    const newToken = await refreshAccessToken(conn);
    return { token: newToken, connectionId: conn.id };
  }

  return { token: conn.access_token, connectionId: conn.id };
}

async function fetchCalendars(deviceId: string) {
  const { token, connectionId } = await getValidToken(deviceId);

  const res = await fetch(
    "https://www.googleapis.com/calendar/v3/users/me/calendarList",
    { headers: { Authorization: `Bearer ${token}` } }
  );

  if (!res.ok) throw new Error("Failed to fetch calendars");
  const data = await res.json();

  const calendars = (data.items || []).map((cal: any) => ({
    connection_id: connectionId,
    google_calendar_id: cal.id,
    name: cal.summary || cal.id,
    color: cal.backgroundColor || null,
  }));

  // Upsert calendars
  for (const cal of calendars) {
    await supabase
      .from("google_calendars")
      .upsert(cal, { onConflict: "connection_id,google_calendar_id" });
  }

  // Return all calendars for this connection
  const { data: allCals } = await supabase
    .from("google_calendars")
    .select("*")
    .eq("connection_id", connectionId)
    .order("name");

  return allCals || [];
}

async function fetchEvents(deviceId: string, timeMin: string, timeMax: string, calendarIds: string[], timeZone: string = "UTC") {
  const { token } = await getValidToken(deviceId);

  const allEvents: any[] = [];
  const queryTimeMin = toUtcBoundaryIso(timeMin, "00:00:00", timeZone);
  const queryTimeMax = toUtcBoundaryIso(timeMax, "23:59:59", timeZone);

  for (const calId of calendarIds) {
    const params = new URLSearchParams({
      timeMin: queryTimeMin,
      timeMax: queryTimeMax,
      singleEvents: "true",
      orderBy: "startTime",
      maxResults: "250",
      timeZone,
    });

    const res = await fetch(
      `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calId)}/events?${params}`,
      { headers: { Authorization: `Bearer ${token}` } }
    );

    if (!res.ok) continue;
    const data = await res.json();

    for (const event of data.items || []) {
      if (event.status === "cancelled") continue;

      const start = event.start?.dateTime || event.start?.date;
      const end = event.end?.dateTime || event.end?.date;
      if (!start) continue;

      const isAllDay = !event.start?.dateTime;
      const normalizedStart = isAllDay
        ? { date: event.start?.date || start, time: null }
        : formatEventDateTime(event.start.dateTime, timeZone);
      const startDate = normalizedStart.date;
      const startTime = normalizedStart.time;

      let durationMin = 60;
      let endDate: string | null = null;

      if (isAllDay && end) {
        // Google all-day events use exclusive end date (e.g. start=Jan 1, end=Jan 3 means 2 days)
        // Subtract one day to get inclusive end date
        const endD = new Date(`${end}T12:00:00`);
        endD.setDate(endD.getDate() - 1);
        const endStr = `${endD.getFullYear()}-${String(endD.getMonth() + 1).padStart(2, '0')}-${String(endD.getDate()).padStart(2, '0')}`;
        endDate = endStr > startDate ? endStr : null;
      } else if (!isAllDay && end) {
        const startMs = new Date(start).getTime();
        const endMs = new Date(end).getTime();
        durationMin = Math.round((endMs - startMs) / 60000);
        // Check if timed event spans multiple days
        const normalizedEnd = formatEventDateTime(end, timeZone);
        if (normalizedEnd.date > startDate) {
          endDate = normalizedEnd.date;
        }
      }

      allEvents.push({
        id: event.id,
        calendarId: calId,
        title: event.summary || "(No title)",
        date: startDate,
        endDate,
        time: startTime,
        duration: durationMin,
        isAllDay,
        location: event.location || null,
        description: event.description || null,
        color: event.colorId || null,
      });
    }
  }

  return allEvents;
}

async function disconnect(deviceId: string) {
  await supabase
    .from("google_connections")
    .delete()
    .eq("device_id", deviceId);
  return { success: true };
}

async function getStatus(deviceId: string) {
  const { data } = await supabase
    .from("google_connections")
    .select("id, email, created_at")
    .eq("device_id", deviceId)
    .single();

  return data ? { connected: true, email: data.email } : { connected: false };
}

async function toggleCalendar(calendarId: string, visible: boolean) {
  await supabase
    .from("google_calendars")
    .update({ visible })
    .eq("id", calendarId);
  return { success: true };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const body = await req.json();
    const { action, deviceId, code, redirectUri, timeMin, timeMax, calendarIds, calendarId, visible, timeZone } = body;

    let result: any;

    switch (action) {
      case "get_auth_url": {
        const params = new URLSearchParams({
          client_id: GOOGLE_CLIENT_ID,
          redirect_uri: redirectUri,
          response_type: "code",
          scope: SCOPES,
          access_type: "offline",
          prompt: "consent",
          state: deviceId,
        });
        result = { url: `https://accounts.google.com/o/oauth2/v2/auth?${params}` };
        break;
      }
      case "exchange_code":
        result = await exchangeCode(code, redirectUri, deviceId);
        break;
      case "status":
        result = await getStatus(deviceId);
        break;
      case "calendars":
        result = await fetchCalendars(deviceId);
        break;
      case "events":
        result = await fetchEvents(deviceId, timeMin, timeMax, calendarIds, timeZone);
        break;
      case "toggle_calendar":
        result = await toggleCalendar(calendarId, visible);
        break;
      case "disconnect":
        result = await disconnect(deviceId);
        break;
      default:
        throw new Error(`Unknown action: ${action}`);
    }

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
