"""Bounded public-data transaction for the reviewed insert/update migration.

No Auth, storage, deletion, billing or provider mutation paths are supported.
The caller owns the maintenance window and explicit cutover authorization.
"""
from copy import deepcopy
from datetime import datetime, timezone
import hashlib
import os
from pathlib import Path
from psycopg import sql
from refresh_common import (
    RefreshError, SOURCE, OWNED, TABLES, PRIVATE_TABLES, canonical, digest,
    verify_packet, keys_for, index_rows, safe_path, read_json, object_key,
    table_rows, rows_json, AUTH_QUERY, IDENTITIES_QUERY, STORAGE_QUERY, catalog, connect,
)
from refresh_resolutions import resolve_rehearsal
from refresh_assurance import capture_assurance, checked_assurance

SUPPORTED = {
    'audit_log': {'insert'}, 'invoice_items': {'insert'}, 'invoices': {'insert'},
    'library_categories': {'insert'}, 'library_items': {'insert', 'update'},
    'tag_billing_settings': {'insert'}, 'tasks': {'insert', 'update'},
    'user_color_schemes': {'update'},
}
# These two trigger functions were inspected: both operate only on NEW fields.
TASK_TRIGGERS = ('normalize_task_repeat_fields_trigger', 'trg_validate_no_nested_groups')


def table_map(rows, cat, table):
    return index_rows(rows, keys_for(cat, 'public', table))


def public_digest(rows, cat):
    return digest({t: table_map(rows[t], cat, t) for t in TABLES})


def build_package(plan, source, owned, choices, baseline, source_objects, approved_plan_hash, assurance=None):
    if approved_plan_hash != digest(plan):
        raise RefreshError('Original plan differs from the reviewed plan hash')
    verify_packet(source, SOURCE); verify_packet(owned, OWNED)
    if set(owned.get('private', {})) != set(PRIVATE_TABLES):
        raise RefreshError('Complete private billing/runtime before-state is required')
    if plan.get('validation') or plan['auth']['conflicts'] or plan['auth']['source_additions']:
        raise RefreshError('Validation or Auth changes require a separate implementation')
    hashes = plan['snapshot_preconditions']['baseline_files']
    if set(hashes) != set(TABLES):
        raise RefreshError('Original baseline file inventory is incomplete')
    for table, expected_hash in hashes.items():
        path = safe_path(Path(baseline) / 'data' / (table + '.csv'), existing=True)
        if hashlib.sha256(path.read_bytes()).hexdigest() != expected_hash:
            raise RefreshError('Original baseline changed since the reviewed plan')
    resolved = resolve_rehearsal(plan, source, owned, choices)
    expected = deepcopy(owned['public'])
    indexed = {t: table_map(expected[t], owned['catalog'], t) for t in TABLES}
    seen, journal = set(), []
    for op in resolved['operations']:
        table, action = op['table'], op['action']
        if action not in SUPPORTED.get(table, set()):
            raise RefreshError('Final delta contains an unimplemented table/action')
        pk = keys_for(owned['catalog'], 'public', table)
        key = canonical(op['key'])
        if (table, key) in seen:
            raise RefreshError('Duplicate row operation')
        seen.add((table, key))
        before = indexed[table].get(key)
        after = op['after']
        columns = {x['column_name'] for x in owned['catalog']['columns']
                   if x['schema'] == 'public' and x['table_name'] == table}
        if (not isinstance(after, dict) or set(after) != columns
                or canonical([after.get(k) for k in pk]) != key
                or digest(before) != op['before_hash']
                or (action == 'insert') != (before is None)):
            raise RefreshError('Row operation does not match the complete owned before-image')
        if before is not None and after.get('user_id') != before.get('user_id'):
            raise RefreshError('A refresh cannot reassign row ownership')
        indexed[table][key] = deepcopy(after)
        journal.append({'table': table, 'action': action, 'key': deepcopy(op['key']),
                        'before': deepcopy(before), 'after': deepcopy(after)})
    expected = {t: [indexed[t][k] for k in sorted(indexed[t])] for t in TABLES}
    if public_digest(expected, owned['catalog']) != public_digest(resolved['provisional_expected'], owned['catalog']):
        raise RefreshError('Independent operation replay differs from resolved expected data')
    if any(x.get('expression') for x in owned['catalog']['indexes']):
        raise RefreshError('Expression indexes need separate rehearsal review')
    if any(x.get('generated') or x.get('identity') for x in owned['catalog']['columns'] if x['schema'] == 'public'):
        raise RefreshError('Generated or identity columns require explicit handling')
    # Compare exact inventory against the externally verified source-file receipt.
    objects = source_objects['objects']
    files = index_rows(objects, ['key'])
    metadata = {canonical([object_key(row)]): row for row in source['storage_metadata']}
    target_files = index_rows(owned['storage_content'], ['key'])
    if len(files) != len(objects) or set(files) != set(metadata):
        raise RefreshError('Source file receipt differs from source inventory')
    for key, file in files.items():
        row, target = metadata[key], target_files.get(key)
        if (file['object_id'] != row['id'] or file['created_at'] != row['created_at']
                or file['updated_at'] != row['updated_at']
                or any(row['metadata'].get(k) != value for k, value in file['metadata'].items())
                or file['size'] != row['metadata']['size']
                or file['content_type'] != row['metadata']['mimetype']
                or not target or file['sha256'] != target['sha256'] or file['size'] != target['size']):
            raise RefreshError('Storage changes require an explicit file migration')
    if owned['manifest'].get('storage_content') != digest(owned['storage_content']):
        raise RefreshError('Owned file receipt checksum mismatch')
    # Fingerprints authenticate artifact equality, not a supported freeze or
    # human approval. Those must be established before issuing an authorization.
    return {'format': 1, 'mode': 'public-refresh-package', 'source_project': SOURCE, 'owned_project': OWNED,
            'inputs': {'plan': digest(plan), 'source': digest(source), 'owned': digest(owned),
                       'choices': digest(choices), 'source_objects': digest(source_objects)},
            'baseline_files': hashes, 'operations': journal, 'expected': expected,
            'before_public_sha256': public_digest(owned['public'], owned['catalog']),
            'after_public_sha256': public_digest(expected, owned['catalog']),
            'unresolved_conflict_ids': resolved['unresolved_conflict_ids'],
            'frozen_inputs': source.get('freeze_verified') is True and owned.get('freeze_verified') is True,
            'storage_receipt_mode': source_objects['mode'],
            'capture_assurance': capture_assurance(assurance, source, owned, source_objects),
            'limitations': ['supported source/target maintenance procedure required',
                            'separate explicit cutover authorization required',
                            'no Auth/storage/delete/provider mutation support']}


def write_durable(path, value):
    path = safe_path(Path(path))
    fd = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
    with os.fdopen(fd, 'wb') as stream:
        stream.write((canonical(value) + '\n').encode()); stream.flush(); os.fsync(stream.fileno())
    # Persist the directory entry as well as its file contents.
    parent = os.open(path.parent, os.O_RDONLY)
    try: os.fsync(parent)
    finally: os.close(parent)


def authorize(package, authorization, owned, code_hash, action='apply-public-refresh'):
    if action not in ('apply-public-refresh', 'clear-test-customer-bindings', 'clear-test-billing-bindings'):
        raise RefreshError('Unsupported authorization action')
    if any(op.get('kind')=='confirmed-historical-test' for op in package.get('operations',[])) and action!='clear-test-billing-bindings':
        raise RefreshError('Historical test clearance requires its explicit billing action')
    if package['unresolved_conflict_ids']:
        raise RefreshError('Resolve all final conflicts before application')
    coordinated = package.get('capture_assurance')
    if coordinated:
        if package['frozen_inputs'] or package['storage_receipt_mode'] != 'final-coordinated':
            raise RefreshError('Coordinated capture must retain its weaker assurance label')
        checked_assurance(coordinated, {k: package['inputs'][k] for k in ('source','owned','source_objects')})
        if authorization.get('capture_assurance_sha256') != digest(coordinated):
            raise RefreshError('Cutover approval must bind the accepted coordinated capture')
    elif not package['frozen_inputs'] or package['storage_receipt_mode'] != 'final-frozen':
        raise RefreshError('Final frozen or explicitly accepted coordinated capture required')
    if (authorization.get('format') != 1 or authorization.get('action') != action
            or authorization.get('package_sha256') != digest(package)
            or authorization.get('code_sha256') != code_hash
            or authorization.get('source_project') != SOURCE or authorization.get('owned_project') != OWNED
            or not authorization.get('human_cutover_approval_reference')
            or authorization.get('maintenance_active') is not True
            or authorization.get('cron_configuration_held_by_procedure') is not True
            or authorization.get('owned_before_sha256') != digest(owned)):
        raise RefreshError('Exact cutover authorization/maintenance binding is missing')
    if any(job['active'] for job in owned['cron']):
        raise RefreshError('Pause and drain owned jobs before capturing the final owned snapshot')
    try:
        issued = datetime.fromisoformat(authorization['issued_at'])
        expires = datetime.fromisoformat(authorization['expires_at'])
        current = datetime.now(timezone.utc)
        if not issued.tzinfo or not expires.tzinfo or not issued <= current < expires or (expires-issued).total_seconds() > 3600:
            raise ValueError()
    except (KeyError, TypeError, ValueError):
        raise RefreshError('Cutover authorization has expired or invalid times') from None
    evidence = authorization.get('maintenance_evidence', [])
    if not evidence:
        raise RefreshError('Maintenance procedure evidence is missing')
    for entry in evidence:
        path = safe_path(Path(entry['path']), existing=True)
        if hashlib.sha256(path.read_bytes()).hexdigest() != entry['sha256']:
            raise RefreshError('Maintenance evidence changed since authorization')


def lock_destination(connection):
    # Before the first SELECT: repeatable-read must see the state after waiting
    # for writers, not a snapshot established before the locks were acquired.
    # cron.job is SELECT-only for this role: do not broaden managed privileges.
    # Its configuration is held by the external maintenance procedure and
    # checked in a fresh connection immediately before commit.
    tables = [('auth', 'identities'), ('auth', 'users')]
    tables += [('private', t) for t in PRIVATE_TABLES] + [('public', t) for t in TABLES]
    tables += [('storage', 'buckets'), ('storage', 'objects'), ('supabase_migrations', 'schema_migrations')]
    for schema, table in sorted(tables):
        connection.execute(sql.SQL('lock table {}.{} in share row exclusive mode').format(
            sql.Identifier(schema), sql.Identifier(table)))


def check_cron_hold(owned):
    if any(job['active'] for job in owned['cron']):
        raise RefreshError('Owned job hold is not active')
    with connect() as current:
        jobs = rows_json(current, 'select jobname,schedule,active from cron.job order by jobname')
        current.rollback()
    if digest(jobs) != digest(owned['cron']):
        raise RefreshError('Owned cron configuration changed during maintenance')


def destination_state(connection):
    cat = catalog(connection)
    return {'catalog': cat,
            'public': {t: table_rows(connection, 'public', t, keys_for(cat, 'public', t)) for t in TABLES},
            'private': {t: table_rows(connection, 'private', t, keys_for(cat, 'private', t)) for t in PRIVATE_TABLES},
            'auth': rows_json(connection, AUTH_QUERY), 'identities': rows_json(connection, IDENTITIES_QUERY),
            'storage_metadata': rows_json(connection, STORAGE_QUERY),
            'migrations': rows_json(connection, 'select version from supabase_migrations.schema_migrations order by version'),
            'cron': rows_json(connection, 'select jobname,schedule,active from cron.job order by jobname')}


def check_destination(current, owned, expected=None):
    for section in ('catalog', 'private', 'auth', 'identities', 'storage_metadata', 'migrations', 'cron'):
        if digest(current[section]) != digest(owned[section]):
            raise RefreshError('Owned protected state changed; rebuild the final package')
    if public_digest(current['public'], owned['catalog']) != public_digest(expected or owned['public'], owned['catalog']):
        raise RefreshError('Complete owned public state differs from the expected inventory')


def table_order(cat):
    remaining, done, order = set(TABLES), set(), []
    parents = {t: {k['parent_table'] for k in cat['keys'] if k['schema'] == 'public'
                  and k['table_name'] == t and k['kind'] == 'f' and k['parent_schema'] == 'public'
                  and k['parent_table'] != t} for t in TABLES}
    while remaining:
        ready = sorted(t for t in remaining if parents[t] <= done)
        if not ready: raise RefreshError('Foreign-key cycle requires an explicit import order')
        order.extend(ready); done.update(ready); remaining.difference_update(ready)
    return order


def run_operations(connection, package, cat, schema='public', prefix=''):
    if (schema, prefix) not in (('public', ''), ('pg_temp', 'rf_apply_')):
        raise RefreshError('Unsupported destination mapping')
    totals = {'insert': 0, 'update': 0}
    for table in table_order(cat):
        target = sql.Identifier(schema, prefix + table)
        pk = keys_for(cat, 'public', table)
        columns = [r['column_name'] for r in cat['columns'] if r['schema'] == 'public' and r['table_name'] == table]
        for action in ('insert', 'update'):
            rows = [r['after'] for r in package['operations'] if r['table'] == table and r['action'] == action]
            if not rows: continue
            if action not in SUPPORTED.get(table, set()): raise RefreshError('Unsupported write operation')
            if action == 'insert':
                statement = sql.SQL('insert into {} select * from jsonb_populate_recordset(null::{},%s::jsonb)').format(target, target)
            else:
                assignments = sql.SQL(',').join(sql.SQL('{}=r.{}').format(sql.Identifier(c), sql.Identifier(c)) for c in columns if c not in pk)
                predicate = sql.SQL(' and ').join(sql.SQL('t.{}=r.{}').format(sql.Identifier(c), sql.Identifier(c)) for c in pk)
                statement = sql.SQL('update {} t set {} from jsonb_populate_recordset(null::{},%s::jsonb) r where {}').format(target, assignments, target, predicate)
            cursor = connection.execute(statement, (canonical(rows),))
            if cursor.rowcount != len(rows): raise RefreshError('Write count differs from the exact planned rows')
            totals[action] += cursor.rowcount
    return totals


def create_rehearsal(connection, owned):
    cat = owned['catalog']
    for table in TABLES:
        name = sql.Identifier('rf_apply_' + table)
        connection.execute(sql.SQL('create temp table {} (like public.{} including constraints including indexes) on commit drop').format(name, sql.Identifier(table)))
        connection.execute(sql.SQL('insert into {} select * from jsonb_populate_recordset(null::{},%s::jsonb)').format(name, name), (canonical(owned['public'][table]),))
    connection.execute('create temp table rf_apply_auth (id uuid primary key) on commit drop')
    connection.execute('insert into rf_apply_auth select (r->>\'id\')::uuid from jsonb_array_elements(%s::jsonb) r', (canonical(owned['auth']),))
    # All FK references stay inside the temporary mirror. No live parent is used.
    for key in cat['keys']:
        if key['schema'] != 'public' or key['kind'] != 'f': continue
        parent = 'rf_apply_auth' if (key['parent_schema'], key['parent_table']) == ('auth', 'users') else 'rf_apply_' + key['parent_table']
        if key['parent_schema'] != 'public' and parent != 'rf_apply_auth': raise RefreshError('Unknown FK parent')
        connection.execute(sql.SQL('alter table {} add constraint {} foreign key ({}) references {} ({})').format(
            sql.Identifier('rf_apply_' + key['table_name']), sql.Identifier('rf_' + key['name']),
            sql.SQL(',').join(map(sql.Identifier, key['columns'])), sql.Identifier(parent),
            sql.SQL(',').join(map(sql.Identifier, key['parent_columns']))))
    # Catalog hash is checked by the caller first. These pure NEW-only functions
    # exercise actual task normalization/validation without any persistent writes.
    for name, function in zip(TASK_TRIGGERS, ('normalize_task_repeat_fields', 'validate_no_nested_groups')):
        connection.execute(sql.SQL('create trigger {} before insert or update on rf_apply_tasks for each row execute function public.{}()').format(sql.Identifier(name), sql.Identifier(function)))


def rehearsal_rows(connection, cat):
    return {t: table_rows(connection, 'pg_temp', 'rf_apply_' + t, keys_for(cat, 'public', t)) for t in TABLES}
