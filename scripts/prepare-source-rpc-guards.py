#!/usr/bin/env python3
"""Prepare source RPC/queue guards from verified current bodies; never execute them."""
import argparse
import re
from refresh_common import *

ROUTINES = ('email_queue_dispatch', 'email_queue_wake', 'enqueue_email', 'read_email_batch',
            'delete_email', 'move_to_dlq', 'purge_internal_logs', 'purge_old_recovery_records')


def wrap_definition(definition, guard='migration_guard.assert_not_frozen'):
    match = re.search(r'\bAS\s+(\$[A-Za-z_0-9]*\$)(.*?)\1', definition, re.S | re.I)
    if not match or not re.search(r'\bLANGUAGE\s+plpgsql\b', definition, re.I):
        raise RefreshError('RPC guard draft requires a verified PL/pgSQL body')
    body = match[2].strip()
    if not re.match(r'(?:DECLARE\b|BEGIN\b)', body, re.I) or not re.search(r'END\s*;?\s*$', body, re.I):
        raise RefreshError('RPC body is not a single supported block')
    # Put the check OUTSIDE the original block's EXCEPTION handler. Inserting
    # into its BEGIN would let email_queue_wake swallow maintenance errors.
    wrapped = '\nBEGIN\n  PERFORM ' + guard + '();\n' + body.rstrip(';') + ';\nEND;\n'
    return definition[:match.start(2)] + wrapped + definition[match.end(2):]


def check_function(schema='migration_guard', table='control'):
    return f"""CREATE FUNCTION {schema}.assert_not_frozen() RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $check$
BEGIN
  IF (SELECT active FROM {schema}.{table} WHERE id=1) IS DISTINCT FROM false THEN
    RAISE EXCEPTION 'Spacetime maintenance: RPC and queues paused' USING ERRCODE='55000';
  END IF;
END;
$check$;
REVOKE ALL ON FUNCTION {schema}.assert_not_frozen() FROM PUBLIC,anon,authenticated,service_role;
"""


def drafts(audit):
    rows = {r['name']: r for r in audit['routines'] if r['name'] in ROUTINES}
    if set(rows) != set(ROUTINES) or any(sum(r['name']==name for r in audit['routines']) != 1 for name in ROUTINES):
        raise RefreshError('Source routine inventory changed or has ambiguous overloads')
    if any(r['schema'] != 'public' or not r['definition'].startswith('CREATE OR REPLACE FUNCTION public.' + name + '(')
           or hashlib.md5(r['definition'].encode()).hexdigest() != r['definition_md5'] for name,r in rows.items()):
        raise RefreshError('Source routine before-image is changed or mismatched')
    install = ['-- BLOCKED REVIEW DRAFT. No source execution authorized. Requires inactive gate from reviewed install.sql.',
        'BEGIN;', "SET LOCAL lock_timeout='5s';", "DO $blocked$ BEGIN RAISE EXCEPTION 'Source RPC guard installation requires source-control review and separate approval'; END; $blocked$;",
        check_function()]
    inverse = ['-- Restore EXACT saved bodies only after matching installed hashes/ACLs and draining work.', 'BEGIN;',
               "DO $blocked$ BEGIN RAISE EXCEPTION 'Source RPC inverse requires reviewed before-images and separate approval'; END; $blocked$;"]
    for name in ROUTINES:
        row = rows[name]
        install.append(wrap_definition(row['definition']))
        inverse.append(row['definition'])
    install.append('COMMIT;')
    inverse.extend(['DROP FUNCTION migration_guard.assert_not_frozen();','COMMIT;'])
    return {'install-rpc-blocked.sql': '\n'.join(install)+'\n', 'inverse-rpc-blocked.sql': '\n'.join(inverse)+'\n'}


def main():
    p=argparse.ArgumentParser(description=__doc__)
    p.add_argument('--audit', type=Path, required=True)
    p.add_argument('--output', type=Path, required=True)
    args=p.parse_args()
    audit=read_json(args.audit)
    if audit['operator'][0]['current_user'] != 'postgres':
        raise RefreshError('Unexpected source operator role')
    output=private_dir(args.output)
    content=drafts(audit)
    for name,value in content.items():write_private(output/name,value,raw=True)
    write_private(output/'manifest.json', {'source_ref':SOURCE, 'mode':'blocked-drafts', 'installed':False,
        'source_audit_sha256':digest(audit), 'routine_names':list(ROUTINES),
        'before_md5':{r['name']:r['definition_md5'] for r in audit['routines'] if r['name'] in ROUTINES},
        'grants_before':{r['name']:r['grants'] for r in audit['routines'] if r['name'] in ROUTINES},
        'files':{name:hashlib.sha256(value.encode()).hexdigest() for name,value in content.items()},
        'blockers':['SQL operator source binding/current owners and complete schemas need verification',
            'source Edge deployment and managed Auth/Storage ownership route unavailable',
            'direct queue/schema/pg_net routes and in-flight work still require actual endpoint proof',
            'exact routine/body/ACL preconditions and separate install approval required']})
    print(canonical({'mode':'blocked-drafts','routines':len(ROUTINES),'mutations':0}))


if __name__=='__main__':cli_main(main)
