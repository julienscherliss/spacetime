-- =====================================================================
-- Minimal hard-delete recovery layer
-- =====================================================================
-- Goal: if a row is ever truly hard-deleted from tasks / library_items /
-- library_categories (only possible via service_role or admin), keep a
-- 60-day snapshot so it can be restored. Normal archive / soft-delete
-- flows are plain UPDATEs and do NOT touch this table.
-- =====================================================================

CREATE TABLE IF NOT EXISTS public.deleted_records_recovery (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  original_table  text NOT NULL,
  original_row_id text NOT NULL,
  user_id         uuid,
  row_data        jsonb NOT NULL,
  deleted_at      timestamptz NOT NULL DEFAULT now(),
  deleted_by      uuid,
  delete_reason   text
);

CREATE INDEX IF NOT EXISTS deleted_records_recovery_table_idx
  ON public.deleted_records_recovery (original_table, deleted_at DESC);
CREATE INDEX IF NOT EXISTS deleted_records_recovery_user_idx
  ON public.deleted_records_recovery (user_id, deleted_at DESC);
CREATE INDEX IF NOT EXISTS deleted_records_recovery_deleted_at_idx
  ON public.deleted_records_recovery (deleted_at);

-- Recovery table is admin/service-role only — no direct user access.
GRANT SELECT, INSERT, UPDATE, DELETE ON public.deleted_records_recovery TO authenticated;
GRANT ALL ON public.deleted_records_recovery TO service_role;

ALTER TABLE public.deleted_records_recovery ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins manage recovery records" ON public.deleted_records_recovery;
CREATE POLICY "Admins manage recovery records"
  ON public.deleted_records_recovery
  FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

-- =====================================================================
-- Capture trigger
-- =====================================================================
-- AFTER DELETE row-level: only fires if the DELETE actually succeeds.
-- The pre-existing public.guard_bulk_delete() BEFORE DELETE statement
-- trigger blocks authenticated client users entirely, so in practice
-- this only ever captures deletes from service_role / admin paths
-- (account deletion, admin scripts).
-- =====================================================================
CREATE OR REPLACE FUNCTION public.capture_hard_delete()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  row_user_id uuid;
  actor       uuid;
BEGIN
  -- All three target tables have a user_id column.
  BEGIN
    row_user_id := (to_jsonb(OLD) ->> 'user_id')::uuid;
  EXCEPTION WHEN OTHERS THEN
    row_user_id := NULL;
  END;

  BEGIN
    actor := auth.uid();
  EXCEPTION WHEN OTHERS THEN
    actor := NULL;
  END;

  INSERT INTO public.deleted_records_recovery
    (original_table, original_row_id, user_id, row_data, deleted_by, delete_reason)
  VALUES
    (TG_TABLE_NAME,
     (to_jsonb(OLD) ->> 'id'),
     row_user_id,
     to_jsonb(OLD),
     actor,
     CASE WHEN auth.role() = 'service_role' THEN 'service_role'
          WHEN actor IS NOT NULL AND public.has_role(actor, 'admin'::app_role) THEN 'admin'
          ELSE 'unknown' END);

  RETURN OLD;
END;
$$;

-- Attach to the three protected tables. Use AFTER so it only records
-- successful deletes (guard_bulk_delete aborts the statement otherwise).
DROP TRIGGER IF EXISTS capture_hard_delete_tasks ON public.tasks;
CREATE TRIGGER capture_hard_delete_tasks
  AFTER DELETE ON public.tasks
  FOR EACH ROW EXECUTE FUNCTION public.capture_hard_delete();

DROP TRIGGER IF EXISTS capture_hard_delete_library_items ON public.library_items;
CREATE TRIGGER capture_hard_delete_library_items
  AFTER DELETE ON public.library_items
  FOR EACH ROW EXECUTE FUNCTION public.capture_hard_delete();

DROP TRIGGER IF EXISTS capture_hard_delete_library_categories ON public.library_categories;
CREATE TRIGGER capture_hard_delete_library_categories
  AFTER DELETE ON public.library_categories
  FOR EACH ROW EXECUTE FUNCTION public.capture_hard_delete();

-- =====================================================================
-- Restore helper
-- =====================================================================
-- Admin-only RPC: re-inserts a recovered row back into its original
-- table and removes the recovery entry. Returns the restored row id.
--
-- Usage (psql / SQL editor as service_role or admin):
--   SELECT public.restore_deleted_record('<recovery_id>');
--
-- Or restore many at once:
--   SELECT public.restore_deleted_record(id)
--   FROM public.deleted_records_recovery
--   WHERE user_id = '<uid>' AND original_table = 'library_items';
-- =====================================================================
CREATE OR REPLACE FUNCTION public.restore_deleted_record(_recovery_id uuid)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  rec        public.deleted_records_recovery%ROWTYPE;
  caller_uid uuid;
  sql_text   text;
BEGIN
  -- Authorization: service_role OR admin.
  IF auth.role() <> 'service_role' THEN
    BEGIN
      caller_uid := auth.uid();
    EXCEPTION WHEN OTHERS THEN
      caller_uid := NULL;
    END;
    IF caller_uid IS NULL OR NOT public.has_role(caller_uid, 'admin'::app_role) THEN
      RAISE EXCEPTION 'restore_deleted_record: not authorized';
    END IF;
  END IF;

  SELECT * INTO rec FROM public.deleted_records_recovery WHERE id = _recovery_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'restore_deleted_record: recovery id % not found', _recovery_id;
  END IF;

  IF rec.original_table NOT IN ('tasks', 'library_items', 'library_categories') THEN
    RAISE EXCEPTION 'restore_deleted_record: unsupported table %', rec.original_table;
  END IF;

  -- Build an INSERT from the captured jsonb. ON CONFLICT DO NOTHING so a
  -- duplicate restore is a no-op rather than a failure.
  sql_text := format(
    'INSERT INTO public.%I SELECT * FROM jsonb_populate_record(NULL::public.%I, $1) ON CONFLICT (id) DO NOTHING',
    rec.original_table, rec.original_table
  );
  EXECUTE sql_text USING rec.row_data;

  DELETE FROM public.deleted_records_recovery WHERE id = _recovery_id;

  RETURN rec.original_row_id;
END;
$$;

REVOKE ALL ON FUNCTION public.restore_deleted_record(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.restore_deleted_record(uuid) TO authenticated, service_role;

-- =====================================================================
-- 60-day retention cleanup
-- =====================================================================
CREATE OR REPLACE FUNCTION public.purge_old_recovery_records()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  purged int;
BEGIN
  WITH del AS (
    DELETE FROM public.deleted_records_recovery
    WHERE deleted_at < now() - interval '60 days'
    RETURNING 1
  )
  SELECT count(*) INTO purged FROM del;
  RETURN purged;
END;
$$;

-- Schedule daily cleanup via pg_cron (requires the pg_cron extension,
-- which Supabase enables by default). Unschedule any prior copy first
-- so this migration is idempotent.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    PERFORM cron.unschedule(jobid)
    FROM cron.job
    WHERE jobname = 'purge-deleted-records-recovery-daily';

    PERFORM cron.schedule(
      'purge-deleted-records-recovery-daily',
      '17 3 * * *',
      $cron$ SELECT public.purge_old_recovery_records(); $cron$
    );
  END IF;
END
$$;
