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
     -- service_role hard deletes are exclusively the Delete Account flow
     -- (see supabase/functions/delete-account). Admin SQL maintenance is
     -- the only other approved path. Anything else is unexpected.
     CASE
       WHEN auth.role() = 'service_role' THEN 'account_deletion'
       WHEN actor IS NOT NULL AND public.has_role(actor, 'admin'::app_role) THEN 'admin'
       ELSE 'unknown'
     END);

  RETURN OLD;
END;
$$;

REVOKE ALL ON FUNCTION public.capture_hard_delete() FROM PUBLIC, anon, authenticated;
