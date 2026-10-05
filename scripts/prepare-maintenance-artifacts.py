#!/usr/bin/env python3
"""Generate private source-only maintenance drafts. No SQL/API/deploy/apply execution."""
import argparse
import re
import subprocess
from refresh_common import *

BASELINE_REF = 'fb96b6d59a3457629591596f0e129c401d5c7853'
GUARD_SCHEMA = 'migration_guard'
TRIGGER = 'spacetime_migration_write_guard'
MANAGED_TABLES = ('auth.users','auth.identities','storage.objects','storage.buckets')


def guard_function(schema=GUARD_SCHEMA, table='control'):
    # Only the private owner-controlled row is authoritative. ALWAYS triggers
    # cover replica mode too; no service-role or client-set GUC exemptions.
    return f"""CREATE FUNCTION {schema}.reject_mutation() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $guard$
DECLARE frozen boolean;
BEGIN
  SELECT active INTO frozen FROM {schema}.{table} WHERE id = 1;
  IF frozen IS DISTINCT FROM false THEN
    RAISE EXCEPTION 'Spacetime maintenance: writes paused' USING ERRCODE = '55000';
  END IF;
  RETURN NULL;
END;
$guard$;
REVOKE ALL ON FUNCTION {schema}.reject_mutation() FROM PUBLIC, anon, authenticated, service_role;
"""


def prepare_sql(packet):
    tables = ['public.'+name for name in TABLES] + list(MANAGED_TABLES)
    install = ["-- DRAFT ONLY. Separate approval, current catalog and route tests required.\nBEGIN;\nSET LOCAL lock_timeout='5s';\nSET LOCAL statement_timeout='60s';",
        "CREATE SCHEMA migration_guard;\nREVOKE ALL ON SCHEMA migration_guard FROM PUBLIC, anon, authenticated, service_role;",
        "CREATE TABLE migration_guard.control (id integer PRIMARY KEY CHECK(id=1), active boolean NOT NULL, project_ref text NOT NULL);\nALTER TABLE migration_guard.control ENABLE ROW LEVEL SECURITY;\nREVOKE ALL ON migration_guard.control FROM PUBLIC, anon, authenticated, service_role;",
        f"INSERT INTO migration_guard.control VALUES (1,false,'{SOURCE}');",guard_function(),
        """CREATE FUNCTION public.migration_maintenance_status() RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $status$
  SELECT jsonb_build_object('frozen',coalesce((SELECT active FROM migration_guard.control WHERE id=1),true),
    'project_ref',(SELECT project_ref FROM migration_guard.control WHERE id=1));
$status$;
REVOKE ALL ON FUNCTION public.migration_maintenance_status() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.migration_maintenance_status() TO service_role;"""]
    for table in tables:
        install.extend([f'CREATE TRIGGER {TRIGGER} BEFORE INSERT OR UPDATE OR DELETE OR TRUNCATE ON {table} FOR EACH STATEMENT EXECUTE FUNCTION migration_guard.reject_mutation();',
                        f'ALTER TABLE {table} ENABLE ALWAYS TRIGGER {TRIGGER};'])
    install.append('COMMIT;')
    # Installation intentionally fails on existing names, never replaces an
    # unrelated function/schema/trigger. The inverse removes only this draft.
    inverse = ['-- Only after verifying exact installed draft fingerprints; not an automatic rollback.\nBEGIN;\nSET LOCAL lock_timeout=\'5s\';']
    inverse.extend(f'DROP TRIGGER {TRIGGER} ON {table};' for table in reversed(tables))
    inverse.extend(['DROP FUNCTION public.migration_maintenance_status();','DROP FUNCTION migration_guard.reject_mutation();',
                    'DROP TABLE migration_guard.control;','DROP SCHEMA migration_guard;','COMMIT;'])
    jobs = packet['cron']
    def literal(value):
        return "'" + value.replace("'","''") + "'"
    pause = ['-- DRAFT ONLY: record in-flight work and email queue/self-rearm handling first.\nBEGIN;']
    restore = ['-- Exact recorded active flags; schedule/commands are not rewritten.\nBEGIN;']
    for row in jobs:
        pause.append(f"UPDATE cron.job SET active=false WHERE jobname={literal(row['jobname'])};")
        restore.append(f"UPDATE cron.job SET active={'true' if row['active'] else 'false'} WHERE jobname={literal(row['jobname'])};")
    pause.append('COMMIT;'); restore.append('COMMIT;')
    activate = """-- BLOCKED DRAFT: requires all manifest gates, route tests and drain proof.
-- Separate explicit source activation approval is mandatory.
BEGIN;
DO $blocked$ BEGIN
  RAISE EXCEPTION 'Maintenance activation draft is blocked pending reviewed source binding, route coverage and separate approval';
END; $blocked$;
UPDATE migration_guard.control SET active=true WHERE id=1 AND project_ref='"""+SOURCE+"""';
COMMIT;
"""
    return {'install.sql':'\n'.join(install)+'\n','inverse.sql':'\n'.join(inverse)+'\n',
            'pause-jobs.sql':'\n'.join(pause)+'\n','restore-jobs.sql':'\n'.join(restore)+'\n','activate-blocked.sql':activate}


def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--source',type=Path,required=True)
    parser.add_argument('--output',type=Path,required=True)
    args=parser.parse_args()
    packet=read_json(args.source); verify_packet(packet,SOURCE)
    output=private_dir(args.output)
    for name,value in prepare_sql(packet).items(): write_private(output/name,value,raw=True)
    # Isolate source candidate from all newer owned billing/security changes.
    paths=subprocess.run(['git','ls-tree','-r','--name-only',BASELINE_REF,'supabase/functions','supabase/config.toml'],check=True,capture_output=True,text=True).stdout.splitlines()
    handlers=[]
    for name in paths:
        data=subprocess.run(['git','show',BASELINE_REF+':'+name],check=True,capture_output=True,text=True).stdout
        if name.endswith('/index.ts'):
            pattern=r'\b(?:Deno\.)?serve\(async\s*\(req\)\s*=>\s*\{'
            if len(re.findall(pattern,data)) != 1: raise RefreshError('Source handler has an unsupported entry shape')
            data="import { rejectIfMaintenance } from '../_shared/sourceMaintenance.ts';\n"+re.sub(pattern,lambda m:m[0]+"\n  const maintenance = await rejectIfMaintenance(req);\n  if (maintenance) return maintenance;",data,count=1)
            handlers.append(name.split('/')[2])
        path=output/'source-candidate'/name; path.parent.mkdir(parents=True,exist_ok=True,mode=0o700)
        write_private(path,data,raw=True)
    if len(handlers)!=13: raise RefreshError('Source function inventory changed')
    shared=output/'source-candidate/supabase/functions/_shared'
    shared.mkdir(parents=True,exist_ok=True,mode=0o700)
    write_private(shared/'migrationMaintenance.ts',safe_path(Path('supabase/functions/_shared/migrationMaintenance.ts'),existing=True).read_text(),raw=True)
    write_private(shared/'sourceMaintenance.ts',f"""import {{ createMaintenanceGuard }} from './migrationMaintenance.ts';
export const rejectIfMaintenance = createMaintenanceGuard({{
  url: Deno.env.get('SUPABASE_URL') ?? '', serviceKey: Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
  expectedProject: '{SOURCE}',
}});
""",raw=True)
    for directory in output.rglob('*'):
        if directory.is_dir(): os.chmod(directory,0o700)
    manifest={'mode':'draft-only','installed':False,'activated':False,'deployable':False,'source_project':SOURCE,
        'baseline_code':BASELINE_REF,'source_catalog_sha256':digest(packet['catalog']),'source_snapshot_sha256':digest(packet),
        'public_tables':26,'managed_tables':list(MANAGED_TABLES),'guarded_candidate_functions':sorted(handlers),
        'blockers':['actual deployed source function/config identity and deployment route unverified',
          'SQL operator execution must bind to a verified source session; a stored project_ref literal is not project authentication',
          'managed Auth/Storage trigger installation unverified','real Storage byte integrity and existing signed upload routes unproved',
          'SQL RPC external effects/queue self-rearm need full source body audit and inverse artifacts',
          'in-flight Edge/provider work needs a verified drain; pre-handler check alone is not atomic with later effects',
          'job inventory/preconditions must be refreshed; pending mail must not be replayed',
          'separate explicit source installation/activation approval required'],
        'files':{p.relative_to(output).as_posix():hashlib.sha256(p.read_bytes()).hexdigest() for p in output.rglob('*') if p.is_file()}}
    write_private(output/'manifest.json',manifest)
    print(canonical({'mode':'draft-only','functions':len(handlers),'public_guards':26,'managed_guards':4,'blockers':len(manifest['blockers']),'mutations':0}))


if __name__=='__main__': cli_main(main)
