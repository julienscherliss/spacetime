-- Server-side guard: cap how many rows a single DELETE statement can remove
-- from user-data tables when issued from a regular authenticated client.
-- This is a defense-in-depth backstop against stale client builds (older
-- iOS/Electron app versions) that contained the "diff DB minus local state"
-- sync bug. RLS already restricts deletes to the row owner; this trigger
-- additionally caps the blast radius of any single statement.
--
-- service_role is exempt so legitimate backend operations (account deletion
-- via the delete-account edge function, admin cleanup) continue to work.

CREATE OR REPLACE FUNCTION public.guard_bulk_delete()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  deleted_count int;
  max_rows constant int := 50;
BEGIN
  -- Allow unrestricted deletes from the backend service role.
  IF auth.role() = 'service_role' THEN
    RETURN NULL;
  END IF;

  SELECT count(*) INTO deleted_count FROM deleted_rows;

  IF deleted_count > max_rows THEN
    RAISE EXCEPTION
      'Bulk delete blocked: % rows in a single statement exceeds the per-statement limit of %.',
      deleted_count, max_rows
      USING HINT = 'Delete in smaller batches. If this is intentional admin work, use a server-side path.';
  END IF;

  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS guard_bulk_delete_tasks ON public.tasks;
CREATE TRIGGER guard_bulk_delete_tasks
AFTER DELETE ON public.tasks
REFERENCING OLD TABLE AS deleted_rows
FOR EACH STATEMENT EXECUTE FUNCTION public.guard_bulk_delete();

DROP TRIGGER IF EXISTS guard_bulk_delete_library_items ON public.library_items;
CREATE TRIGGER guard_bulk_delete_library_items
AFTER DELETE ON public.library_items
REFERENCING OLD TABLE AS deleted_rows
FOR EACH STATEMENT EXECUTE FUNCTION public.guard_bulk_delete();

DROP TRIGGER IF EXISTS guard_bulk_delete_library_categories ON public.library_categories;
CREATE TRIGGER guard_bulk_delete_library_categories
AFTER DELETE ON public.library_categories
REFERENCING OLD TABLE AS deleted_rows
FOR EACH STATEMENT EXECUTE FUNCTION public.guard_bulk_delete();