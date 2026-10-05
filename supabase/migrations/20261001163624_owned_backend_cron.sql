-- Recreate the owned-project schedule without starting a second dispatcher.
-- Vault values are supplied privately after replay, never in migration SQL.
DO $migration$
DECLARE dispatch_job bigint;
BEGIN
  SELECT cron.schedule(
    'live-activity-dispatch',
    '* * * * *',
    $command$
      SELECT net.http_post(
        url := 'https://zzoeywmurqiqticikyaf.supabase.co/functions/v1/live-activity-dispatch',
        body := '{}'::jsonb,
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'x-dispatch-secret', (
            SELECT decrypted_secret FROM vault.decrypted_secrets
            WHERE name = 'live_activity_dispatch_secret'
          )
        ),
        timeout_milliseconds := 10000
      );
    $command$
  ) INTO dispatch_job;
  PERFORM cron.alter_job(dispatch_job, active := false);

  SELECT cron.schedule(
    'purge-internal-logs-daily', '43 4 * * *',
    'SELECT public.purge_internal_logs();'
  ) INTO dispatch_job;
  PERFORM cron.alter_job(dispatch_job, active := false);

  -- Retain the inherited recovery-retention schedule, also paused for rehearsal.
  PERFORM cron.alter_job(jobid, active := false) FROM cron.job
  WHERE jobname = 'purge-deleted-records-recovery-daily';
END;
$migration$;
