# Spacetime backend migration: Lovable Cloud → self-owned Supabase

Goal: move the backend (database, auth, storage, edge functions, secrets, cron) to a Supabase project you own, then keep developing with Codex. The frontend stays the same React/Vite + Capacitor app. The only thing that changes is which backend it points at.

Phase 1 is done here in Lovable. Phases 2 through 6 are for you and Codex.

---

## Phase 1: Lovable side (package everything)

Nothing gets deleted or changed in production during this phase.

1. **Schema.** All 61 migrations are in `supabase/migrations/` on GitHub main. Codex replays them in order.
2. **Data export.** CSV/JSON dumps of every `public` table: tasks, library_items, library_categories, invoices, invoice_items, invoice_style_settings, clients, tag_billing_settings, tag_notes, profiles, subscriptions, user_roles, promo_codes, promo_redemptions, feedback, audit_log, user_color_schemes, google_connections, google_calendars, live_activity_devices, live_activity_device_plans, email_* tables, deleted_records_recovery.
3. **Auth users export.** `auth.users` rows (id, email, created_at, provider, raw_user_meta_data). IDs must be preserved because every table keys on `user_id`. Password hashes can't be exported from Cloud, so email/password users reset via magic link or OTP after cutover. Google and Apple users sign in again with no data loss.
4. **Storage export.** Files from the `feedback-screenshots` and `task-attachments` buckets (~57 MB, 43 files), keeping the same paths.
5. **Secret inventory.** Names only, no values. You re-enter the values from your own records:
   APNS_BUNDLE_ID, APNS_ENV, APNS_KEY_ID, APNS_PRIVATE_KEY, APNS_TEAM_ID, APPLE_BUNDLE_ID, APPLE_IAP_SHARED_SECRET, APPLE_ISSUER_ID, APPLE_KEY_ID, APPLE_PRIVATE_KEY, GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, LIVE_ACTIVITY_DISPATCH_SECRET, STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET.
   `LOVABLE_API_KEY` only works inside Lovable. Any function that uses it needs a replacement AI provider key.
6. **Cron jobs** that need to be recreated:
   - `live-activity-dispatch`: `* * * * *`, POST `{}` with header `x-dispatch-secret`
   - `purge-internal-logs-daily`: `43 4 * * *`, `select public.purge_internal_logs();`
   - `process-email-queue`: self-arming through `email_queue_wake()` / `email_queue_dispatch()`. These use a hardcoded project URL and a Vault secret `email_queue_service_role_key`, so both must be updated.
7. **Email.** Auth emails currently go through Lovable's email infrastructure (`auth-email-hook`, `process-email-queue`). The new project needs its own sender (Resend, Postmark, or SES) and domain DNS.

---

## Phase 2: New Supabase project (you)

- Create the project on the Free plan. Pick a region close to the current one.
- Install the Supabase CLI and run `supabase link --project-ref <NEW_REF>`.
- Give Codex the repo, the new project ref, the DB password and the service role key. Store them locally in `.env.local` and never commit them.

## Phase 3: Schema + data (Codex)

1. Update `supabase/config.toml` so `project_id = "<NEW_REF>"`, and keep the `verify_jwt` settings for each function.
2. Run `supabase db push` to replay the migrations. Fix any migration that refers to Lovable-only objects (for example the Vault secret or the hardcoded `rhguyvbysqmcwzeuqipr` URLs in the email queue functions).
3. Import the auth users with the Admin API (`auth.admin.createUser` with `id` and `email_confirm: true`), keeping the same UUIDs.
4. Import the table data in foreign-key order: profiles, subscriptions, user_roles, clients, then everything else. Temporarily turn off the `guard_bulk_delete` / `capture_hard_delete` triggers if any cleanup is needed.
5. Upload the storage files to buckets with the same names (both private) and recreate the storage RLS policies.
6. Check row counts against the Phase 1 export (for example, tasks ≈ 1,757).

## Phase 4: Functions, secrets, cron (Codex)

- `supabase secrets set KEY=value` for every secret in the Phase 1 list.
- `supabase functions deploy` for all 13 functions: admin-metrics, apple-iap-notifications, apple-iap-verify, attachment-access, auth-email-hook, customer-portal, delete-account, google-calendar, live-activity-dispatch, process-email-queue, redeem-promo, stripe-checkout, stripe-webhook.
- Replace any `LOVABLE_API_KEY` / Lovable AI gateway calls.
- Recreate the cron jobs with `pg_cron` + `pg_net` using the new function URL, and store the dispatch secret in Vault.
- Auth settings: Site URL `https://launchspacetime.com`, redirect URLs (web, preview, and the Capacitor scheme), the Google provider (update the authorized redirect URI in Google Cloud Console), Apple sign-in if used, and the SMTP / auth email hook.

## Phase 5: External webhooks (you + Codex)

- **Stripe:** point the webhook endpoint at `https://<NEW_REF>.supabase.co/functions/v1/stripe-webhook` and set the new `STRIPE_WEBHOOK_SECRET`.
- **Apple App Store Server Notifications:** point them at the new `apple-iap-notifications` URL.
- **Google OAuth:** add the new callback URL.

## Phase 6: Cutover

1. Announce a short freeze and do a final data re-export and import of anything that changed since Phase 3.
2. Update the frontend env: `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`, `VITE_SUPABASE_PROJECT_ID`. Hardcoded references are in `src/utils/iapClient.ts`, `src/utils/emailOtp.ts`, `src/hooks/useDataSync.ts`, `DeleteAccountModal.tsx`, `Paywall.tsx`, `PaywallIOS.tsx` and `SettingsPanel.tsx`. Replace `src/integrations/supabase/client.ts` with a normal client that reads the env vars.
3. Rebuild the web app and move hosting (Vercel, Netlify or Cloudflare Pages) with the `launchspacetime.com` DNS. Then run `npx cap sync ios` and ship a new iOS build.
4. Smoke test: sign-in (Google, email), task sync, a recurring task, library, an invoice PDF, attachments, Stripe checkout, iOS in-app purchase, a Live Activity push, Google Calendar and the email OTP.
5. Keep Lovable Cloud running read-only for about 2 weeks as a fallback, then turn it off.

## Risks

- Password users must reset (hashes can't be exported).
- Old iOS builds keep pointing at the old backend until users update. Keep the old backend alive, or force an update.
- The Live Activity and APNs tokens move with the data. Only the dispatch URL changes.
