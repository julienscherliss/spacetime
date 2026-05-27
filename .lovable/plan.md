# Why it's broken today

Google Calendar is keyed by **`device_id`**, not by user.

- `google_connections.device_id` is a random UUID stored in each browser/app's `localStorage` (`do-device-id`).
- iOS Capacitor has its own `localStorage` (separate from desktop Safari/Chrome) → a different `device_id` → the edge function's `status` action returns `connected: false` even though the same user already linked Google on desktop.
- `fetchCalendars` / `fetchEvents` look up by `device_id` too, so even if we faked status, the iOS device would have no calendars or events.

The OAuth flow itself only works on web (correctly blocked on native in `calendarStore.startAuth`) — that part is fine. What's missing is making the *stored* connection visible to the same user on any device.

# The fix: scope the connection to `auth.uid()`

The edge function already validates the JWT and has `userId` available but never uses it. We switch the storage key from device to user.

## 1. Database migration

```text
alter table public.google_connections
  add column user_id uuid;

-- Backfill: best-effort — for each device_id, look up the most recent
-- authenticated user that called the function. Since we don't have that
-- history, leave nulls and let users re-link if needed (one-time cost).
-- Optional: try to match by email against auth.users.

create unique index google_connections_user_id_key
  on public.google_connections(user_id)
  where user_id is not null;

-- Keep device_id for now (nullable) for backwards-compat during rollout,
-- drop in a later migration.
```

`google_calendars` already FKs `connection_id`, so no change needed there.

## 2. Edge function (`supabase/functions/google-calendar/index.ts`)

- Replace every `.eq("device_id", deviceId)` with `.eq("user_id", userId)`.
- `exchangeCode` upserts on `user_id` (not `device_id`); still stores `device_id` for diagnostics.
- `getStatus`, `fetchCalendars`, `fetchEvents`, `disconnect`, `toggleCalendar` all take `userId` from the JWT instead of `deviceId` from the body. The `deviceId` param becomes ignored/optional.
- `get_auth_url`: keep `state` = `userId` (or a short signed token) instead of `deviceId`, so the redirect back binds the tokens to the right user.

## 3. Client (`src/store/calendarStore.ts`)

- Stop sending `deviceId` to the edge function (or send it but server ignores).
- Remove the OAuth-callback code path that overwrites `deviceId` from the `state` query param — it's no longer meaningful.
- On native (`isNativePlatform()`), `checkStatus` will now succeed for any signed-in user that connected Google on desktop. Calendars and events load normally.
- Keep the existing native guard in `startAuth` (still no OAuth on iOS — they must link on web), but show a clear "Connect Google Calendar on the web app first" empty state in the calendar panel when native + not connected.

## 4. iOS-specific polish

- In the Settings / Calendar panel on iOS, if `connected === false`, show a small explainer: "Open the web app at launchspacetime.com and connect Google Calendar there — events will sync to this device automatically."
- No Capacitor plugin changes needed. No redirect URL changes needed (OAuth still happens in web only).

# Rollout

1. Ship migration + edge function + client together.
2. Existing desktop users keep working only if we backfill `user_id`. Simplest path: on next `checkStatus` from a logged-in web session that still has the old `device_id` in localStorage, the edge function can **one-time migrate**: if no row matches `user_id` but a row matches the supplied `device_id`, stamp `user_id` on it.
3. Users who connected anonymously (no auth at the time) will need to reconnect once — acceptable since the app now requires auth anyway.

# Out of scope

- Realtime push from Google (still polled on demand).
- Multiple Google accounts per user (still one connection per user).