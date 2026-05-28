-- Tighten the bulk-delete guard into an absolute block on hard deletes from
-- regular authenticated clients. Normal app actions never DELETE rows from
-- these tables — they update status fields (archivedAt, archiveReason,
-- deletedAt, completed, archived). The only legitimate hard-delete path is
-- account deletion via the service role.
--
-- Exemptions:
--   - service_role  (backend edge functions, e.g. delete-account)
--   - admin role    (via public.has_role) for support / cleanup tools

CREATE OR REPLACE FUNCTION public.guard_bulk_delete()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  deleted_count int;
  caller_role text;
  caller_uid uuid;
BEGIN
  caller_role := auth.role();

  -- Service role (backend / account deletion edge function) is unrestricted.
  IF caller_role = 'service_role' THEN
    RETURN NULL;
  END IF;

  -- Admin users may perform cleanup deletes.
  BEGIN
    caller_uid := auth.uid();
  EXCEPTION WHEN OTHERS THEN
    caller_uid := NULL;
  END;
  IF caller_uid IS NOT NULL AND public.has_role(caller_uid, 'admin'::app_role) THEN
    RETURN NULL;
  END IF;

  SELECT count(*) INTO deleted_count FROM deleted_rows;
  IF deleted_count > 0 THEN
    RAISE EXCEPTION
      'Hard delete blocked on %: % row(s). This app archives instead of deleting.',
      TG_TABLE_NAME, deleted_count
      USING HINT = 'Use the archive/status update path instead. Hard deletes are reserved for service_role and admin.';
  END IF;

  RETURN NULL;
END;
$$;

-- Triggers themselves were created in the previous migration; the function
-- replacement above is sufficient to tighten enforcement.