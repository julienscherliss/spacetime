-- Lock down the SECURITY DEFINER helpers added by the recovery layer.
-- The capture trigger function is only invoked by the trigger itself, the
-- purge function is invoked by pg_cron, and restore is run from the SQL
-- editor / service-role contexts. None of these need to be callable by
-- anon or authenticated users.

REVOKE ALL ON FUNCTION public.capture_hard_delete()          FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.purge_old_recovery_records()   FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.restore_deleted_record(uuid)   FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.purge_old_recovery_records() TO service_role;
GRANT EXECUTE ON FUNCTION public.restore_deleted_record(uuid) TO service_role;
-- capture_hard_delete is fired by triggers; no role needs direct EXECUTE.
