CREATE OR REPLACE FUNCTION public.purge_internal_logs()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  cutoff   bigint;
  deleted  int;
  started  timestamptz := clock_timestamp();
BEGIN
  SELECT max(runid) - 20000 INTO cutoff FROM cron.job_run_details;

  IF cutoff IS NOT NULL THEN
    LOOP
      EXIT WHEN clock_timestamp() - started > interval '90 seconds';
      DELETE FROM cron.job_run_details
      WHERE runid IN (
        SELECT runid FROM cron.job_run_details
        WHERE runid < cutoff
        ORDER BY runid
        LIMIT 20000
      );
      GET DIAGNOSTICS deleted = ROW_COUNT;
      EXIT WHEN deleted = 0;
    END LOOP;
  END IF;

  BEGIN
    DELETE FROM net._http_response
    WHERE id IN (
      SELECT id FROM net._http_response
      WHERE created < now() - interval '2 days'
      ORDER BY id
      LIMIT 20000
    );
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'purge_internal_logs: http response purge skipped: %', SQLERRM;
  END;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.purge_internal_logs() FROM PUBLIC, anon, authenticated;