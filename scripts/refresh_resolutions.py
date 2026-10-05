"""Bind explicit owner choices to a saved rehearsal. No database or API writes."""
from copy import deepcopy
from refresh_common import (
    RefreshError, SOURCE, OWNED, TABLES, canonical, digest, index_rows, keys_for,
)
from refresh_review import review_bundle


def conflict_id(item):
    return digest({k: item[k] for k in ('table', 'key', 'base_hash', 'source_hash', 'owned_hash')})


def checked_conflicts(plan, source, owned):
    # Validate packet inventories, plan identity and snapshot bindings first.
    review_bundle(plan, source, owned)
    indexed = {}
    for item in plan['conflicts']:
        table = item['table']
        pk = keys_for(owned['catalog'], 'public', table)
        if pk != keys_for(source['catalog'], 'public', table):
            raise RefreshError('Conflict primary keys differ between snapshots')
        for side, packet in (('source', source), ('owned', owned)):
            actual = index_rows(packet['public'][table], pk).get(canonical(item['key']))
            if canonical(actual) != canonical(item[side]):
                raise RefreshError('Conflict before-image differs from its snapshot')
        identity = conflict_id(item)
        if identity in indexed:
            raise RefreshError('Duplicate conflict identity')
        indexed[identity] = item
    return indexed


def choice_template(plan, source, owned):
    items = checked_conflicts(plan, source, owned)
    return {'format': 1, 'mode': 'owner-choices', 'executable': False,
            'plan_sha256': digest(plan), 'snapshot_preconditions': deepcopy(plan['snapshot_preconditions']),
            'choices': [{'conflict_id': identity, 'table': item['table'], 'key': item['key'],
                         'hashes': {side: item[side + '_hash'] for side in ('base', 'source', 'owned')},
                         'choice': None} for identity, item in items.items()]}


def resolve_rehearsal(plan, source, owned, choices):
    items = checked_conflicts(plan, source, owned)
    if (choices.get('format') != 1 or choices.get('mode') != 'owner-choices'
            or choices.get('executable') is not False or choices.get('plan_sha256') != digest(plan)
            or choices.get('snapshot_preconditions') != plan['snapshot_preconditions']):
        raise RefreshError('Owner choices are not bound to this exact rehearsal')
    expected = deepcopy(plan['provisional_expected'])
    if set(expected) != set(TABLES):
        raise RefreshError('Expected table inventory is incomplete')
    pk_by_table = {t: keys_for(owned['catalog'], 'public', t) for t in TABLES}
    rows = {t: index_rows(expected[t], pk_by_table[t]) for t in TABLES}
    operations = deepcopy(plan['operations'])
    existing_operations = {(x['table'], canonical(x['key'])) for x in operations}
    seen, resolved, unresolved = set(), [], []
    for decision in choices['choices']:
        identity = decision['conflict_id']
        if identity in seen or identity not in items:
            raise RefreshError('Duplicate or unknown owner choice')
        seen.add(identity)
        item = items[identity]
        hashes = {side: item[side + '_hash'] for side in ('base', 'source', 'owned')}
        if (decision['table'] != item['table'] or decision['key'] != item['key']
                or decision['hashes'] != hashes):
            raise RefreshError('Owner choice identity or version mismatch')
        choice = decision['choice']
        if choice is None:
            unresolved.append(identity)
            continue
        if choice not in ('source', 'owned'):
            raise RefreshError('Only whole source or owned versions are supported')
        if item['table'] not in ('tasks', 'google_connections'):
            raise RefreshError('This table requires a separate policy resolver')
        # Account reassignment, additions and deletion decisions need their own
        # dependency/identity workflow. This command handles existing stable rows.
        if item['source'] is None or item['owned'] is None:
            raise RefreshError('Absent-row choices require a separate dependency review')
        owner = item['owned'].get('user_id')
        if (not owner or item['source'].get('user_id') != owner
                or item['base'] is not None and item['base'].get('user_id') != owner):
            raise RefreshError('Conflict ownership changed or is unverified')
        table, key = item['table'], canonical(item['key'])
        columns = {r['column_name'] for r in source['catalog']['columns']
                   if r['schema'] == 'public' and r['table_name'] == table}
        if set(item['source']) != columns:
            raise RefreshError('Source row columns are incomplete or unknown')
        if any(item[choice][column] != item['owned'][column] for column in pk_by_table[table]):
            raise RefreshError('A selection cannot change the row primary key')
        if (table, key) in existing_operations:
            raise RefreshError('Conflict already has a proposed operation')
        if canonical(rows[table].get(key)) != canonical(item['owned']):
            raise RefreshError('Provisional conflict row differs from owned before-image')
        # Source rows replace all shared fields together; target-only fields survive.
        final = deepcopy(item['owned'])
        if choice == 'source':
            final.update(deepcopy(item['source']))
        rows[table][key] = final
        if canonical(final) != canonical(item['owned']):
            operations.append({'table': table, 'key': deepcopy(item['key']), 'action': 'update',
                               'before_hash': item['owned_hash'], 'after': final})
        resolved.append({'conflict_id': identity, 'choice': choice, 'hashes': hashes,
                         'after_hash': digest(final)})
    if seen != set(items):
        raise RefreshError('Owner choice inventory is incomplete')
    for table in TABLES:
        expected[table] = [rows[table][k] for k in sorted(rows[table])]
    return {'format': 1, 'mode': 'resolved-rehearsal-only', 'executable': False,
            'source_project': SOURCE, 'owned_project': OWNED,
            'plan_sha256': digest(plan), 'choices_sha256': digest(choices),
            'snapshot_preconditions': deepcopy(plan['snapshot_preconditions']),
            'operations': operations, 'provisional_expected': expected,
            'resolved': resolved, 'unresolved_conflict_ids': unresolved,
            'summary': {'resolved_conflicts': len(resolved), 'unresolved_conflicts': len(unresolved),
                        'proposed_operations': len(operations), 'mutations': 0},
            'gates': list(plan['gates']) + ['resolved rows need fresh typed/dependency/reference validation',
                'original baseline provenance and current frozen snapshots must be revalidated before apply']}
