CREATE OR REPLACE FUNCTION public.purge_internal_logs()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  deleted int;
BEGIN
  LOOP
    DELETE FROM cron.job_run_details
    WHERE runid IN (
      SELECT runid FROM cron.job_run_details
      WHERE start_time < now() - interval '7 days'
      LIMIT 20000
    );
    GET DIAGNOSTICS deleted = ROW_COUNT;
    EXIT WHEN deleted = 0;
  END LOOP;

  BEGIN
    LOOP
      DELETE FROM net._http_response
      WHERE id IN (
        SELECT id FROM net._http_response
        WHERE created < now() - interval '2 days'
        LIMIT 20000
      );
      GET DIAGNOSTICS deleted = ROW_COUNT;
      EXIT WHEN deleted = 0;
    END LOOP;
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'purge_internal_logs: http response purge skipped: %', SQLERRM;
  END;
END;
$function$;

SELECT cron.schedule(
  'purge-internal-logs-daily',
  '43 4 * * *',
  $cron$ SELECT public.purge_internal_logs(); $cron$
);