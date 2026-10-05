-- Auth Admin deletes cascade through the protected application tables as the
-- managed supabase_auth_admin database role.  The historical invoker trigger
-- cannot call private.has_role in that context, and the resulting exception
-- prevents account deletion.  Keep the client bulk-delete guard while allowing
-- Supabase Auth's narrowly scoped internal deletion path.
CREATE OR REPLACE FUNCTION public.guard_bulk_delete()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  deleted_count integer;
BEGIN
  IF session_user = 'supabase_auth_admin' THEN
    RETURN NULL;
  END IF;

  IF auth.role() = 'service_role' THEN
    RETURN NULL;
  END IF;

  IF auth.uid() IS NOT NULL
     AND private.has_role(auth.uid(), 'admin'::public.app_role) THEN
    RETURN NULL;
  END IF;

  SELECT count(*) INTO deleted_count FROM deleted_rows;
  IF deleted_count > 0 THEN
    RAISE EXCEPTION 'Hard delete blocked: archive items instead.'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  RETURN NULL;
END;
$$;

-- The function is invoked only by its table triggers.
REVOKE ALL ON FUNCTION public.guard_bulk_delete() FROM PUBLIC, anon, authenticated;
