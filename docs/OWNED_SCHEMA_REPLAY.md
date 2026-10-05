# Owned Supabase schema replay

Target: `zzoeywmurqiqticikyaf` (Spacetime, US West Oregon). Never run this bootstrap against the old backend or a populated project.

All 61 historical migration files remain byte-identical to GitHub main at `fb96b6d`. A plain clean `supabase db push` cannot replay that history on a new hosted project. The one-time `python3 scripts/replay-owned-schema.py` uses Supabase CLI `db push` against an ignored temporary copy, with these explicit compatibility adjustments:

| Historical version | Problem | Replay adjustment |
| --- | --- | --- |
| Before `20260509173114` | `public.audit_log` was created outside Git; a historical policy migration assumes it exists. | Run the idempotent new foundation SQL first; its timestamp is recorded normally when reached by db push. Shape comes from generated types, CSV header, and the client writer, not a source schema dump. |
| `20260528143250` | New Supabase rejects `ALTER TABLE realtime.messages ENABLE ROW LEVEL SECURITY` because the table is service-owned. | Replace this redundant statement in the temporary copy with an assertion that RLS is already enabled. RLS policy statements still execute. |
| `20260706161818` | Eight policies repeat definitions from `20260706010000`. | Drop these eight policies immediately before recreating them in the same migration transaction. |
| `20260916162412` | Unique index repeats `20260916000000`. | Use `CREATE UNIQUE INDEX IF NOT EXISTS` in the temporary copy; both definitions are identical. |

The adapter checks the exact project and that no auth users exist. It does not mark unapplied migrations as applied, delete migration history, or modify the original migration files. The Supabase history contains the statements actually executed. Source/replay hashes and adjustments are saved in `.migration-private/schema-replay-*/manifest.json`. Later normal `supabase db push` calls skip these already applied versions. Future clean projects need the adapter adjusted deliberately for their target, rather than silently rewriting history.

Forward migrations supply the missing audit table, explicit API grants, repaired bulk-delete helper permission, restricted subscription inserts, ownership checks, and an email dispatcher. The dispatcher is disabled by default. No old project URL or secret is embedded in it. `private.email_dispatch_config.project_url` and Vault `email_queue_service_role_key` are populated separately; production delivery is enabled only after the email worker is deployed and tested. Enqueueing re-arms a five-second cron job; dispatch pauses for provider cooldown/leased messages and unschedules when idle. The enqueue/wake and idle paths share an advisory lock.

Historical migrations also create `purge-deleted-records-recovery-daily` (`17 3 * * *`), in addition to `purge-internal-logs-daily` (`43 4 * * *`). Both are paused by the forward migration during the import. Re-enable and test in the cron phase. Live Activity dispatch is not scheduled during schema setup.

Schema verification is separate from sign-in/device/payment/email smoke tests. No auth users or production data are imported in this phase. The old backend remains untouched.

References: [Realtime schema protection](https://supabase.com/changelog/realtime-schema-locked-down-against-modification), [explicit Data API grants](https://supabase.com/changelog/45329-breaking-change-tables-not-exposed-to-data-and-graphql-api-automatically), [pg_net](https://supabase.com/docs/guides/database/extensions/pg_net).
