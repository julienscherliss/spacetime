-- Real database role/trigger checks, all synthetic records rolled back.
BEGIN;
INSERT INTO auth.users (id, email, raw_user_meta_data, created_at, updated_at)
VALUES ('00000000-0000-4000-8000-000000000001', 'migration-test-one@example.invalid', '{}', now(), now()),
       ('00000000-0000-4000-8000-000000000002', 'migration-test-two@example.invalid', '{}', now(), now());
DO $$ BEGIN
  IF (SELECT count(*) FROM public.profiles WHERE id IN
    ('00000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000002')) <> 2
    OR (SELECT count(*) FROM public.subscriptions WHERE user_id IN
    ('00000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000002')) <> 2 THEN
    RAISE EXCEPTION 'Signup trigger verification failed';
  END IF;
END $$;

SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claims = '{"sub":"00000000-0000-4000-8000-000000000001","role":"authenticated"}';
INSERT INTO public.tasks (id,user_id,title,date,recurrence)
VALUES ('10000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000001',
  'Schema verification','2026-09-24','{"frequency":"daily"}');
INSERT INTO public.library_items (id,user_id,title)
VALUES ('20000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000001','Schema verification');
INSERT INTO public.audit_log (user_id, action)
VALUES ('00000000-0000-4000-8000-000000000001','task.created');

DO $$ DECLARE blocked boolean := false; BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.tasks WHERE id='10000000-0000-4000-8000-000000000001'
    AND series_id=id) THEN RAISE EXCEPTION 'Task normalization/read failed'; END IF;
  BEGIN
    DELETE FROM public.tasks WHERE id='10000000-0000-4000-8000-000000000001';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM NOT LIKE 'Hard delete blocked%' THEN RAISE; END IF;
    blocked := true;
  END;
  IF NOT blocked THEN RAISE EXCEPTION 'Hard delete guard failed'; END IF;
  blocked := false;
  BEGIN
    UPDATE public.tasks SET user_id='00000000-0000-4000-8000-000000000002'
      WHERE id='10000000-0000-4000-8000-000000000001';
  EXCEPTION WHEN insufficient_privilege THEN blocked := true;
  END;
  IF NOT blocked THEN RAISE EXCEPTION 'Task ownership reassignment allowed'; END IF;
  IF has_table_privilege(current_user,'public.subscriptions','INSERT') THEN
    RAISE EXCEPTION 'Client can insert subscription entitlements'; END IF;
  IF has_table_privilege(current_user,'public.google_connections','SELECT') THEN
    RAISE EXCEPTION 'Client can read backend OAuth token table'; END IF;
  IF has_function_privilege(current_user,'public.email_queue_dispatch()','EXECUTE')
    OR has_function_privilege(current_user,'public.enqueue_email(text,jsonb)','EXECUTE') THEN
    RAISE EXCEPTION 'Client can dispatch/enqueue privileged emails'; END IF;
END $$;

SET LOCAL request.jwt.claims = '{"sub":"00000000-0000-4000-8000-000000000002","role":"authenticated"}';
DO $$ DECLARE blocked boolean := false; affected integer; BEGIN
  IF EXISTS (SELECT 1 FROM public.tasks WHERE id='10000000-0000-4000-8000-000000000001')
    OR EXISTS (SELECT 1 FROM public.library_items WHERE id='20000000-0000-4000-8000-000000000001') THEN
    RAISE EXCEPTION 'Cross-user reads allowed'; END IF;
  UPDATE public.tasks SET title='not allowed' WHERE id='10000000-0000-4000-8000-000000000001';
  GET DIAGNOSTICS affected = ROW_COUNT;
  IF affected <> 0 THEN RAISE EXCEPTION 'Cross-user update allowed'; END IF;
  BEGIN
    INSERT INTO public.tasks (user_id,title,date) VALUES
      ('00000000-0000-4000-8000-000000000001','not allowed','2026-09-24');
  EXCEPTION WHEN insufficient_privilege THEN blocked := true;
  END;
  IF NOT blocked THEN RAISE EXCEPTION 'Cross-user insert allowed'; END IF;
END $$;

RESET ROLE;
SET LOCAL ROLE service_role;
SET LOCAL request.jwt.claims = '{"role":"service_role"}';
DELETE FROM public.tasks WHERE id='10000000-0000-4000-8000-000000000001';
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.deleted_records_recovery
    WHERE original_row_id='10000000-0000-4000-8000-000000000001') THEN
    RAISE EXCEPTION 'Hard-delete capture failed'; END IF;
  PERFORM public.restore_deleted_record(id) FROM public.deleted_records_recovery
    WHERE original_row_id='10000000-0000-4000-8000-000000000001';
  IF NOT EXISTS (SELECT 1 FROM public.tasks WHERE id='10000000-0000-4000-8000-000000000001') THEN
    RAISE EXCEPTION 'Recovery restore failed'; END IF;
  PERFORM public.enqueue_email('auth_emails','{"schema_test":true}');
END $$;

RESET ROLE;
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname='process-email-queue') THEN
    RAISE EXCEPTION 'Disabled email dispatcher armed a job'; END IF;
  IF NOT EXISTS (SELECT 1 FROM pgmq.q_auth_emails WHERE message @> '{"schema_test":true}') THEN
    RAISE EXCEPTION 'Email enqueue failed'; END IF;
END $$;

-- Test wakeup and idle shutdown in an uncommitted transaction. No HTTP call.
UPDATE private.email_dispatch_config SET enabled=true WHERE id;
SELECT public.email_queue_wake();
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM cron.job WHERE jobname='process-email-queue' AND active
     AND schedule='5 seconds') THEN RAISE EXCEPTION 'Email wake failed'; END IF;
END $$;
-- Verify cooldown and actual request construction without committing network IO.
-- pgmq uses wall-clock timestamps; make the fixture due before transaction now().
UPDATE pgmq.q_auth_emails SET vt=now()-interval '1 second' WHERE message @> '{"schema_test":true}';
UPDATE public.email_send_state SET retry_after_until=now()+interval '1 minute' WHERE id=1;
SELECT public.email_queue_dispatch();
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM net.http_request_queue) THEN
    RAISE EXCEPTION 'Dispatcher ignored provider cooldown'; END IF;
END $$;
UPDATE public.email_send_state SET retry_after_until=NULL WHERE id=1;
SELECT public.email_queue_dispatch();
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM net.http_request_queue q
    WHERE q.url='https://zzoeywmurqiqticikyaf.supabase.co/functions/v1/process-email-queue'
      AND q.method='POST' AND convert_from(q.body,'UTF8')::jsonb='{}'::jsonb
      AND q.headers->>'Authorization' = 'Bearer ' ||
        (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name='email_queue_service_role_key')
  ) THEN RAISE EXCEPTION 'Dispatcher URL/body/Vault credential mismatch'; END IF;
END $$;
SELECT pgmq.delete('auth_emails',msg_id) FROM pgmq.q_auth_emails WHERE message @> '{"schema_test":true}';
SELECT public.email_queue_dispatch();
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname='process-email-queue') THEN
    RAISE EXCEPTION 'Idle dispatcher did not unschedule'; END IF;
END $$;
ROLLBACK;
SELECT 'PASS: signup, normalization, RLS isolation, subscription protection, delete guard/recovery, queue gating/wake/idle' AS result;
