CREATE OR REPLACE FUNCTION public.purge_internal_logs()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  cutoff   bigint;
  deleted  int;
  rounds   int := 0;
BEGIN
  -- Keep roughly the last 20k scheduled-job runs (~2 weeks at current rates).
  -- Trimming by runid uses the primary key; filtering by start_time would
  -- sequentially scan the entire table and time out.
  SELECT max(runid) - 20000 INTO cutoff FROM cron.job_run_details;

  IF cutoff IS NOT NULL THEN
    LOOP
      EXIT WHEN rounds >= 5;
      DELETE FROM cron.job_run_details
      WHERE runid IN (
        SELECT runid FROM cron.job_run_details
        WHERE runid < cutoff
        ORDER BY runid
        LIMIT 20000
      );
      GET DIAGNOSTICS deleted = ROW_COUNT;
      rounds := rounds + 1;
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