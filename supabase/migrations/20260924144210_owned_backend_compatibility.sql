-- Explicit Data API grants are required by new Supabase projects.
-- Keep anonymous access closed; backend-only tables never reach client roles.
REVOKE ALL ON ALL TABLES IN SCHEMA public FROM anon;
GRANT USAGE ON SCHEMA public TO authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO service_role;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE
  public.tasks, public.library_items, public.library_categories,
  public.clients, public.invoices, public.invoice_items,
  public.invoice_style_settings, public.tag_billing_settings,
  public.tag_notes, public.user_color_schemes,
  public.live_activity_devices, public.live_activity_device_plans,
  public.user_roles, public.promo_codes, public.promo_redemptions,
  public.feedback, public.deleted_records_recovery
TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.profiles, public.subscriptions TO authenticated;
GRANT SELECT, INSERT ON public.audit_log TO authenticated;
REVOKE ALL ON TABLE public.google_connections, public.google_calendars,
  public.email_send_log, public.email_send_state, public.suppressed_emails,
  public.email_unsubscribe_tokens FROM authenticated;

-- The historical invoker trigger calls a helper that later migrations revoke.
-- Use the private helper; keep the trigger SECURITY INVOKER and all protections.
CREATE OR REPLACE FUNCTION public.guard_bulk_delete()
RETURNS trigger LANGUAGE plpgsql SET search_path = '' AS $$
DECLARE deleted_count integer;
BEGIN
  IF auth.role() = 'service_role' THEN RETURN NULL; END IF;
  IF auth.uid() IS NOT NULL
     AND private.has_role(auth.uid(), 'admin'::public.app_role) THEN
    RETURN NULL;
  END IF;
  SELECT count(*) INTO deleted_count FROM deleted_rows;
  IF deleted_count > 0 THEN
    RAISE EXCEPTION 'Hard delete blocked on %: % row(s). This app archives instead of deleting.',
      TG_TABLE_NAME, deleted_count
      USING HINT = 'Use the archive/status update path. Hard deletes require service_role or admin.';
  END IF;
  RETURN NULL;
END;
$$;

-- The exported policy permits clients to INSERT subscription entitlements.
-- Signup already creates subscriptions via the trusted auth trigger.
DROP POLICY IF EXISTS "Users can insert own subscription" ON public.subscriptions;
REVOKE INSERT ON public.subscriptions FROM authenticated;

ALTER POLICY "Users can update own task attachments" ON storage.objects
  WITH CHECK (bucket_id = 'task-attachments' AND (storage.foldername(name))[1] = auth.uid()::text);
ALTER POLICY "Users broadcast to own topics" ON realtime.messages
  WITH CHECK (realtime.topic() = 'user-data-' || auth.uid()::text
    OR realtime.topic() = 'color-scheme-' || auth.uid()::text);
UPDATE storage.buckets SET public = false
WHERE id IN ('feedback-screenshots', 'task-attachments');

-- Do not leave PUBLIC execute grants on the private role helper.
REVOKE EXECUTE ON FUNCTION private.has_role(uuid, public.app_role) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION private.has_role(uuid, public.app_role) TO authenticated, service_role;

-- Deployment settings are private, separate from the exported application data.
-- Configure the URL and Vault credential after deployment; enable only for tests
-- or cutover after confirming that the old backend cannot duplicate deliveries.
CREATE TABLE IF NOT EXISTS private.email_dispatch_config (
  id boolean PRIMARY KEY DEFAULT true CHECK (id),
  enabled boolean NOT NULL DEFAULT false,
  project_url text CHECK (project_url ~ '^https://[a-z0-9]+[.]supabase[.]co$')
);
ALTER TABLE private.email_dispatch_config ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON private.email_dispatch_config FROM PUBLIC, anon, authenticated, service_role;
INSERT INTO private.email_dispatch_config (id) VALUES (true) ON CONFLICT DO NOTHING;

CREATE OR REPLACE FUNCTION public.email_queue_dispatch()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE cfg private.email_dispatch_config%ROWTYPE; credential text;
BEGIN
  -- Serialize idle shutdown with enqueue/wake to avoid losing a wakeup.
  PERFORM pg_advisory_xact_lock(724092401);
  SELECT * INTO cfg FROM private.email_dispatch_config WHERE id;
  IF NOT COALESCE(cfg.enabled, false)
     OR NOT (EXISTS (SELECT 1 FROM pgmq.q_auth_emails)
          OR EXISTS (SELECT 1 FROM pgmq.q_transactional_emails)) THEN
    PERFORM cron.unschedule(jobid) FROM cron.job WHERE jobname = 'process-email-queue';
    RETURN;
  END IF;
  IF EXISTS (SELECT 1 FROM public.email_send_state WHERE retry_after_until > now()) THEN
    RETURN;
  END IF;
  -- Keep the schedule while messages are leased, but do not invoke idle workers.
  IF NOT (EXISTS (SELECT 1 FROM pgmq.q_auth_emails WHERE vt <= now())
       OR EXISTS (SELECT 1 FROM pgmq.q_transactional_emails WHERE vt <= now())) THEN
    RETURN;
  END IF;
  SELECT decrypted_secret INTO credential FROM vault.decrypted_secrets
    WHERE name = 'email_queue_service_role_key';
  IF cfg.project_url IS NULL OR NULLIF(credential, '') IS NULL THEN
    RAISE EXCEPTION 'Email dispatcher requires project URL and Vault service credential';
  END IF;
  PERFORM net.http_post(
    url := cfg.project_url || '/functions/v1/process-email-queue',
    body := '{}'::jsonb,
    headers := jsonb_build_object('Content-Type', 'application/json',
      'Authorization', 'Bearer ' || credential),
    timeout_milliseconds := 10000
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.email_queue_wake()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  PERFORM pg_advisory_xact_lock(724092401);
  IF NOT EXISTS (SELECT 1 FROM private.email_dispatch_config WHERE id AND enabled) THEN
    RETURN;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'process-email-queue' AND active) THEN
    PERFORM cron.schedule('process-email-queue', '5 seconds',
      'select public.email_queue_dispatch();');
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.enqueue_email(queue_name text, payload jsonb)
RETURNS bigint LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE message_id bigint;
BEGIN
  IF queue_name NOT IN ('auth_emails', 'transactional_emails') OR queue_name IS NULL THEN
    RAISE EXCEPTION 'Unsupported email queue';
  END IF;
  PERFORM pg_advisory_xact_lock(724092401);
  BEGIN
    message_id := pgmq.send(queue_name, payload);
  EXCEPTION WHEN undefined_table THEN
    PERFORM pgmq.create(queue_name);
    message_id := pgmq.send(queue_name, payload);
  END;
  PERFORM public.email_queue_wake();
  RETURN message_id;
END;
$$;

REVOKE ALL ON FUNCTION public.email_queue_dispatch(), public.email_queue_wake(),
  public.enqueue_email(text, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.email_queue_dispatch(), public.email_queue_wake(),
  public.enqueue_email(text, jsonb) TO service_role;

-- Historical migrations create retention jobs; pause them during the import.
SELECT cron.alter_job(jobid, active := false) FROM cron.job
WHERE jobname IN ('purge-internal-logs-daily', 'purge-deleted-records-recovery-daily');
NOTIFY pgrst, 'reload schema';
