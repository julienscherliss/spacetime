#!/usr/bin/env python3
"""Remove only recorded disposable web-test rows absent from the export.

Run after removing fixture storage and closing all fixture editors. Existing
triggers stay enabled; service-role claims apply only to this transaction.
"""
import argparse
import csv
import json
from pathlib import Path
from urllib.parse import urlsplit

import psycopg

parser = argparse.ArgumentParser()
parser.add_argument('--apply', action='store_true')
args = parser.parse_args()
env = {}
for line in Path('.env.local').read_text().splitlines():
    key, sep, value = line.partition('=')
    if sep and key in {'SUPABASE_PROJECT_REF', 'SUPABASE_DB_PASSWORD'}:
        env[key] = value.strip().strip('"\'')
url = Path('supabase/.temp/pooler-url').read_text().strip()
assert env['SUPABASE_PROJECT_REF'] == 'zzoeywmurqiqticikyaf'
assert env['SUPABASE_PROJECT_REF'] in urlsplit(url).username
receipt_path = Path('.migration-private/web-smoke-fixtures.json')
receipt = json.loads(receipt_path.read_text())
export_dir = Path('../spacetime-backend-export/data')

with psycopg.connect(url, password=env['SUPABASE_DB_PASSWORD']) as connection:
    uid = connection.execute('select id from auth.users where email=%s',
                             ('julienscherliss@gmail.com',)).fetchone()[0]
    assert str(uid) == receipt['userId']
    tasks = connection.execute('select id from public.tasks where user_id=%s and title=%s',
                               (uid, 'Migration smoke — daily sync')).fetchall()
    library = connection.execute('select id from public.library_items where user_id=%s and title=%s',
                                 (uid, 'Migration smoke test — temporary')).fetchall()
    ids = [row[0] for row in tasks]
    library_ids = [row[0] for row in library]
    for table, selected in [('tasks', ids), ('library_items', library_ids)]:
        originals = {row['id'] for row in csv.DictReader((export_dir / f'{table}.csv').open())}
        assert not originals.intersection(map(str, selected)), 'An imported row would be removed'
    if not receipt.get('cleaned'):
        assert set(receipt['taskIds']).issubset(map(str, ids))
    assert len(library_ids) <= 1
    if ids:
        children = connection.execute('select id from public.tasks where recurrence_parent_id=any(%s)',
                                      (list(map(str, ids)),)).fetchall()
        assert {row[0] for row in children}.issubset(ids), 'Unrecorded recurrence child'
    triggers_before = connection.execute("""select tgrelid::regclass::text,tgname,tgenabled
        from pg_trigger where not tgisinternal and tgrelid in
        ('public.tasks'::regclass,'public.library_items'::regclass) order by 1,2""").fetchall()
    assert all(row[2] == 'O' for row in triggers_before)
    print(f'Disposable rows verified absent from export: tasks={len(ids)}, library={len(library_ids)}')
    if args.apply:
        # Guard permits the established administrative maintenance path.
        connection.execute("select set_config('request.jwt.claims', %s, true)",
                           (json.dumps({'role': 'service_role'}),))
        for table, selected in [('tasks', ids), ('library_items', library_ids)]:
            if selected:
                connection.execute(f'delete from public.{table} where id=any(%s) and user_id=%s',
                                   (selected, uid))
        fixture_strings = list(map(str, ids + library_ids))
        if fixture_strings:
            connection.execute('delete from public.deleted_records_recovery where user_id=%s and original_row_id=any(%s)',
                               (uid, fixture_strings))
            connection.execute('delete from public.audit_log where user_id=%s and object_id=any(%s)',
                               (uid, fixture_strings))
        assert connection.execute('select count(*) from public.tasks').fetchone()[0] == 1788
        assert connection.execute('select count(*) from public.library_items').fetchone()[0] == 234
        triggers_after = connection.execute("""select tgrelid::regclass::text,tgname,tgenabled
            from pg_trigger where not tgisinternal and tgrelid in
            ('public.tasks'::regclass,'public.library_items'::regclass) order by 1,2""").fetchall()
        assert triggers_before == triggers_after
        connection.commit()
        receipt.update(cleaned=True, removedTaskCount=len(ids), removedLibraryCount=len(library_ids))
        receipt_path.write_text(json.dumps(receipt, indent=2))
        receipt_path.chmod(0o600)
        print('Fixture rows removed; tasks=1788, library=234; triggers unchanged')
