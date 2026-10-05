"""Offline final-refresh review preparation. No choices, database or provider writes."""
from collections import Counter
from urllib.parse import unquote, urlsplit
from refresh_common import RefreshError, SOURCE, OWNED, TABLES, canonical, digest, verify_packet


def attachment_reference(value, bucket='task-attachments'):
    """Return an exact bucket/path and provenance; never retain signed query strings."""
    if not isinstance(value, dict):
        raise RefreshError('Malformed attachment reference')
    raw = value.get('path') or value.get('url')
    if not isinstance(raw, str) or not raw:
        raise RefreshError('Missing attachment reference')
    parsed = urlsplit(raw)
    provenance = 'path'
    if parsed.scheme or parsed.netloc:
        if parsed.scheme != 'https' or parsed.netloc not in (SOURCE + '.supabase.co', OWNED + '.supabase.co'):
            raise RefreshError('Attachment uses an unknown origin')
        prefixes = ('/storage/v1/object/sign/', '/storage/v1/object/public/', '/storage/v1/object/authenticated/')
        prefix = next((p for p in prefixes if parsed.path.startswith(p + bucket + '/')), None)
        if prefix is None:
            raise RefreshError('Unsupported storage URL')
        path = unquote(parsed.path[len(prefix + bucket + '/'):])
        provenance = 'source-url' if parsed.netloc == SOURCE + '.supabase.co' else 'owned-url'
    else:
        if parsed.query or parsed.fragment:
            raise RefreshError('Ambiguous path reference')
        path = raw
    if not path or any(part in ('', '.', '..') for part in path.split('/')) or chr(92) in path or any(ord(c) < 32 for c in path):
        raise RefreshError('Unsafe attachment path')
    return bucket + '/' + path, provenance


def reference_audit(expected, source_objects, owned_objects):
    known = {(r['bucket_id'] + '/' + r['name']) for r in source_objects + owned_objects}
    issues, counts = [], Counter()
    for table in ('tasks', 'library_items', 'feedback'):
        for row in expected[table]:
            values = [{'url': row['screenshot_url']}] if table == 'feedback' and row.get('screenshot_url') else row.get('attachments') or []
            if not isinstance(values, list):
                issues.append({'table': table, 'row_id': row['id'], 'reason': 'malformed_attachment_array'})
                continue
            for position, att in enumerate(values):
                bucket = 'feedback-screenshots' if table == 'feedback' else 'task-attachments'
                counts['references'] += 1
                try:
                    key, provenance = attachment_reference(att, bucket)
                except RefreshError as error:
                    issues.append({'table': table, 'row_id': row['id'], 'position': position, 'reason': str(error)})
                    continue
                counts[provenance] += 1
                if key not in known:
                    issues.append({'table': table, 'row_id': row['id'], 'position': position, 'reason': 'object_missing', 'key': key})
                if bucket == 'task-attachments' and key.split('/')[1] != row.get('user_id'):
                    issues.append({'table': table, 'row_id': row['id'], 'position': position, 'reason': 'cross_user_attachment', 'key': key})
                # Feedback renderer uses absolute URLs directly; task renderer resolves paths through owned signing.
                if table == 'feedback' and provenance == 'source-url':
                    issues.append({'table': table, 'row_id': row['id'], 'position': position, 'reason': 'feedback_source_url_requires_path_conversion', 'key': key})
                if provenance != 'path' and '%' in urlsplit(att.get('url', '')).path:
                    issues.append({'table': table, 'row_id': row['id'], 'position': position, 'reason': 'encoded_url_runtime_path_review', 'key': key})
    tasks = {r['id']: r for r in expected['tasks']}
    device_ids = {r['device_id']: r for r in expected['live_activity_devices']}
    for row in expected['live_activity_device_plans']:
        task = tasks.get(row.get('task_id'))
        device = device_ids.get(row['device_id'])
        if row.get('task_id') and (not task or task.get('user_id') != row['user_id']):
            issues.append({'table': 'live_activity_device_plans', 'row_id': row['id'], 'reason': 'missing_or_cross_user_task'})
        if not device or device.get('user_id') != row['user_id']:
            issues.append({'table': 'live_activity_device_plans', 'row_id': row['id'], 'reason': 'missing_or_cross_user_device'})
    return {'counts': dict(counts), 'issues': issues,
            'coverage': 'provisional expected rows only; unresolved selections need another audit',
            'storage_bytes_verified': False, 'runtime_schedule_policy': 'rebuild plans from final tasks and current registrations before enabling dispatch'}


def review_bundle(plan, source, owned):
    verify_packet(source, SOURCE); verify_packet(owned, OWNED)
    if (plan.get('format') != 1 or plan.get('mode') != 'plan-only' or plan.get('executable') is not False
        or plan.get('source_project') != SOURCE or plan.get('owned_project') != OWNED):
        raise RefreshError('Expected an unexecutable approved-project plan')
    if plan['snapshot_preconditions']['source'] != digest(source) or plan['snapshot_preconditions']['owned'] != digest(owned):
        raise RefreshError('Plan snapshot mismatch')
    entries, ids, field_counts = [], set(), Counter()
    for item in plan['conflicts']:
        if item['table'] not in TABLES or any(side not in item for side in ('base','source','owned')):
            raise RefreshError('Unsupported conflict type requires separate review')
        if any(item[side + '_hash'] != digest(item[side]) for side in ('base','source','owned')):
            raise RefreshError('Conflict before-image mismatch')
        identity = digest({k: item[k] for k in ('table','key','base_hash','source_hash','owned_hash')})
        if identity in ids:
            raise RefreshError('Duplicate conflict')
        ids.add(identity)
        fields = item['changed_columns']
        row = item['owned'] or item['source'] or item['base']
        entry = {'conflict_id': identity, 'table': item['table'], 'key': item['key'], 'owner': row.get('user_id'),
                 'hashes': {side: item[side + '_hash'] for side in ('base','source','owned')},
                 'changed_columns': fields, 'choice': None}
        if item['table'] == 'tasks':
            entry['title'] = row.get('title')
            entry['fields'] = {field: {side: None if item[side] is None else item[side].get(field) for side in ('base','source','owned')} for field in fields}
            field_counts.update(fields)
        elif item['table'] == 'google_connections':
            old, new = item['source'], item['owned']
            grant_fields = ('user_id','refresh_token','scope')
            same_grant = bool(old and new and isinstance(old.get('refresh_token'), str) and old['refresh_token']
                              and all(old.get(k) == new.get(k) for k in grant_fields))
            entry.update({'credential_values_omitted': True, 'same_saved_grant': same_grant,
                          'review_hint': 'keep the complete working owned grant; do not splice tokens' if same_grant else 'verify grant ownership before selection'})
        else:
            entry['review_hint'] = 'separate policy review; values omitted from this content worksheet'
        entries.append(entry)
    audit = reference_audit(plan['provisional_expected'], source['storage_metadata'], owned['storage_metadata'])
    return {'format': 1, 'mode': 'review-only', 'executable': False, 'plan_sha256': digest(plan),
            'snapshot_preconditions': plan['snapshot_preconditions'], 'conflicts': entries,
            'summary': {'conflicts': len(entries), 'by_table': dict(Counter(x['table'] for x in entries)),
                        'task_accounts': len({x['owner'] for x in entries if x['table'] == 'tasks'}),
                        'task_changed_columns': dict(field_counts), 'choices_made': 0,
                        'reference_issues': len(audit['issues'])},
            'reference_audit': audit, 'mutations': 0,
            'limitations': ['not a final frozen snapshot or approved resolution', 'no apply command implemented',
                            'source file bytes and historical billing still unresolved']}
