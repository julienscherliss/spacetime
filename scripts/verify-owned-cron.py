#!/usr/bin/env python3
"""Prepare private Vault values and rehearse paused owned-project jobs safely.

Use the migration Python environment. --prepare adds only the approved dispatch
secret; --rehearse temporarily runs the Live Activity job with dryRun=true.
Neither option activates production delivery or sends APNs pushes/email.
"""
import argparse
import json
import time
from pathlib import Path
from urllib.parse import urlsplit

import psycopg

parser = argparse.ArgumentParser()
parser.add_argument('--prepare', action='store_true')
parser.add_argument('--rehearse', action='store_true')
args = parser.parse_args()
names = {'SUPABASE_PROJECT_REF', 'SUPABASE_DB_PASSWORD',
         'SUPABASE_SERVICE_ROLE_KEY', 'LIVE_ACTIVITY_DISPATCH_SECRET'}
env = {}
for line in Path('.env.local').read_text().splitlines():
    key, sep, value = line.partition('=')
    if sep and key in names:
        env[key] = value.strip().strip('"\'')
assert env['SUPABASE_PROJECT_REF'] == 'zzoeywmurqiqticikyaf'
url = Path('supabase/.temp/pooler-url').read_text().strip()
assert env['SUPABASE_PROJECT_REF'] in urlsplit(url).username
connection = psycopg.connect(url, password=env['SUPABASE_DB_PASSWORD'], connect_timeout=15,
                             autocommit=True)
checks = []

def one(query, params=None):
    return connection.execute(query, params).fetchone()

def fingerprint():
    # Compare private device/plan contents without printing their rows or hashes.
    return one("""select
      (select md5(coalesce(jsonb_agg(to_jsonb(d) order by id)::text,'')) from public.live_activity_devices d),
      (select md5(coalesce(jsonb_agg(to_jsonb(p) order by id)::text,'')) from public.live_activity_device_plans p),
      (select count(*) from auth.users), (select count(*) from pgmq.q_auth_emails),
      (select count(*) from pgmq.q_transactional_emails)""")

try:
    assert one('select count(*) from cron.job where active')[0] == 0
    assert one('select enabled from private.email_dispatch_config where id')[0] is False
    baseline = fingerprint()
    assert baseline[3:] == (0, 0)
    if args.prepare:
        with connection.transaction():
            existing = one("select decrypted_secret = %s from vault.decrypted_secrets where name=%s",
                           (env['LIVE_ACTIVITY_DISPATCH_SECRET'], 'live_activity_dispatch_secret'))
            if existing is None:
                one('select vault.create_secret(%s,%s,%s)',
                    (env['LIVE_ACTIVITY_DISPATCH_SECRET'], 'live_activity_dispatch_secret',
                     'Owned Live Activity dispatcher authentication'))
            else:
                assert existing[0], 'Existing Vault value differs; refusing silent rotation'
    for secret_name, local_name in [('live_activity_dispatch_secret','LIVE_ACTIVITY_DISPATCH_SECRET'),
                                    ('email_queue_service_role_key','SUPABASE_SERVICE_ROLE_KEY')]:
        assert one('select decrypted_secret=%s from vault.decrypted_secrets where name=%s',
                   (env[local_name], secret_name)) == (True,)
    checks.append('Both Vault credentials exactly match local approved values')
    for role in ('anon', 'authenticated'):
        assert not one('select has_table_privilege(%s,%s,\'SELECT\')',
                       (role, 'vault.decrypted_secrets'))[0]
        for function in ('public.email_queue_dispatch()', 'public.email_queue_wake()',
                         'public.purge_internal_logs()'):
            assert not one("select has_function_privilege(%s,%s,'EXECUTE')", (role, function))[0]
    checks.append('Client roles cannot read Vault or execute backend scheduling/retention functions')
    jobs = connection.execute('select jobid,jobname,schedule,command,active from cron.job order by jobname').fetchall()
    by_name = {j[1]: j for j in jobs}
    live = by_name['live-activity-dispatch']
    assert live[2] == '* * * * *' and not live[4]
    assert "body := '{}'::jsonb" in live[3]
    assert 'zzoeywmurqiqticikyaf.supabase.co/functions/v1/live-activity-dispatch' in live[3]
    assert 'live_activity_dispatch_secret' in live[3] and 'x-dispatch-secret' in live[3]
    assert all('rhguyvbysqmcwzeuqipr' not in j[3] for j in jobs)
    assert by_name['purge-internal-logs-daily'][2] == '43 4 * * *'
    assert by_name['purge-internal-logs-daily'][3].strip().lower() == 'select public.purge_internal_logs();'
    assert by_name['purge-deleted-records-recovery-daily'][2] == '17 3 * * *'
    checks.append('Minute dispatch and daily retention definitions match, all paused, no old URL')

    # A rolled-back transaction is invisible to cron and pg_net background workers.
    connection.execute('begin')
    try:
        original_requests = one('select count(*) from net.http_request_queue')[0]
        one('select public.email_queue_wake()')
        assert one("select count(*) from cron.job where jobname='process-email-queue'")[0] == 0
        connection.execute('update private.email_dispatch_config set enabled=true where id')
        one("select public.enqueue_email('auth_emails', '{\"migration_cron_probe\":true}'::jsonb)")
        assert one("select schedule,active from cron.job where jobname='process-email-queue'") == ('5 seconds', True)
        connection.execute("update pgmq.q_auth_emails set vt=now()-interval '1 second'")
        connection.execute("update public.email_send_state set retry_after_until=now()+interval '1 minute'")
        one('select public.email_queue_dispatch()')
        assert one('select count(*) from net.http_request_queue')[0] == original_requests
        connection.execute('update public.email_send_state set retry_after_until=null')
        one('select public.email_queue_dispatch()')
        assert one("""select count(*) from net.http_request_queue where
          url='https://zzoeywmurqiqticikyaf.supabase.co/functions/v1/process-email-queue'
          and headers->>'Authorization'='Bearer ' || (select decrypted_secret from vault.decrypted_secrets
          where name='email_queue_service_role_key') and convert_from(body,'UTF8')='{}'""")[0] == 1
        connection.execute('delete from pgmq.q_auth_emails')
        one('select public.email_queue_dispatch()')
        assert one("select count(*) from cron.job where jobname='process-email-queue'")[0] == 0
        one('select public.purge_internal_logs()')
    finally:
        connection.execute('rollback')
    checks.append('Email wake, cooldown, exact request, idle shutdown and retention execution passed in rollback')

    if args.rehearse:
        before_response = one('select coalesce(max(id),0) from net._http_response')[0]
        before_run = one('select coalesce(max(runid),0) from cron.job_run_details')[0]
        dry_command = live[3].replace("body := '{}'::jsonb", "body := '{\"dryRun\":true}'::jsonb")
        assert dry_command != live[3]
        try:
            one('select cron.alter_job(%s,schedule := %s,command := %s,active := true)',
                (live[0], '5 seconds', dry_command))
            deadline = time.monotonic() + 35
            completed = False
            while time.monotonic() < deadline:
                row = one("""select status_code,content from net._http_response
                    where id>%s and content::jsonb->>'ok'='true' order by id desc limit 1""",
                          (before_response,))
                run = one("""select status from cron.job_run_details where jobid=%s
                    and runid>%s order by runid desc limit 1""", (live[0],before_run))
                if row and run and run[0] == 'succeeded':
                    body = json.loads(row[1])
                    assert row[0] == 200 and body['repairedCount'] == 0
                    assert all(r.get('dryRun') is True or r.get('event') == 'none'
                               or r.get('ok') is False for r in body['results'])
                    completed = True
                    break
                time.sleep(1)
            assert completed, 'Scheduled dry-run dispatch did not complete successfully'
        finally:
            one('select cron.alter_job(%s,schedule := %s,command := %s,active := false)',
                (live[0], live[2], live[3]))
        checks.append('Real pg_cron to pg_net to Live Activity function returned HTTP 200 in dry-run mode')
    assert fingerprint() == baseline, 'Device/plan or queue contents changed'
    assert one('select count(*) from cron.job where active')[0] == 0
    assert one('select enabled from private.email_dispatch_config where id')[0] is False
    checks.append('Device and plan contents unchanged; mail queues empty; all jobs and email gate paused')
    print(json.dumps({'checks':checks,'count':len(checks),'authUsers':baseline[2],
                      'jobs':[{'name':j[1],'schedule':j[2],'active':False} for j in jobs]},indent=2))
finally:
    connection.close()
