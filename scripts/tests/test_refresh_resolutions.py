"""No-network regressions for exact-version, whole-row rehearsal choices."""
import copy
import sys
import unittest
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from refresh_common import SOURCE, OWNED, TABLES, RefreshError, digest, manifest
from refresh_resolutions import choice_template, resolve_rehearsal


def fixture(table='tasks', absent_source=False):
    b = {'id': 'row', 'user_id': 'owner', 'duration': 1}
    o = None if absent_source else dict(b, duration=2)
    n = dict(b, duration=3, target_only='preserved')
    cat = {'keys': [{'schema': 'public', 'table_name': t, 'kind': 'p', 'columns': ['id']} for t in TABLES],
           'columns': [{'schema': 'public', 'table_name': table, 'column_name': k} for k in b]}
    packets = []
    for project, row in ((SOURCE, o), (OWNED, n)):
        packet = {'format': 1, 'project': project, 'public': {t: [] for t in TABLES},
                  'catalog': cat, 'auth': [], 'identities': [], 'storage_metadata': []}
        packet['public'][table] = [] if row is None else [row]
        packet['manifest'] = manifest(packet)
        packets.append(packet)
    s, n_packet = packets
    c = {'table': table, 'key': ['row'], 'changed_columns': ['duration'], 'base': b, 'source': o, 'owned': n}
    c.update({side + '_hash': digest(c[side]) for side in ('base', 'source', 'owned')})
    p = {'format': 1, 'mode': 'plan-only', 'executable': False, 'source_project': SOURCE,
         'owned_project': OWNED, 'snapshot_preconditions': {'source': digest(s), 'owned': digest(n_packet)},
         'conflicts': [c], 'operations': [], 'provisional_expected': copy.deepcopy(n_packet['public']), 'gates': ['freeze unverified']}
    return p, s, n_packet


class ResolutionTests(unittest.TestCase):
    def test_template_is_unselected_and_nonexecutable(self):
        p, s, n = fixture(); c = choice_template(p, s, n)
        self.assertIsNone(c['choices'][0]['choice']); self.assertFalse(c['executable'])
        r = resolve_rehearsal(p, s, n, c)
        self.assertEqual(r['summary']['unresolved_conflicts'], 1); self.assertEqual(r['operations'], [])

    def test_source_choice_preserves_target_only_fields_and_inputs(self):
        p, s, n = fixture(); c = choice_template(p, s, n); c['choices'][0]['choice'] = 'source'
        before = digest([p, s, n, c]); r = resolve_rehearsal(p, s, n, c)
        row = r['provisional_expected']['tasks'][0]
        self.assertEqual(row['duration'], 2); self.assertEqual(row['target_only'], 'preserved')
        self.assertEqual(r['operations'][0]['before_hash'], digest(n['public']['tasks'][0]))
        self.assertEqual(before, digest([p, s, n, c])); self.assertFalse(r['executable'])
        self.assertEqual(r, resolve_rehearsal(p, s, n, c))

    def test_owned_choice_adds_no_operation(self):
        p, s, n = fixture(); c = choice_template(p, s, n); c['choices'][0]['choice'] = 'owned'
        r = resolve_rehearsal(p, s, n, c)
        self.assertEqual(r['operations'], []); self.assertEqual(r['summary']['resolved_conflicts'], 1)

    def test_choices_reject_stale_hash_plan_and_identity(self):
        for field in ('plan', 'hash', 'key', 'choice', 'executable'):
            p, s, n = fixture(); c = choice_template(p, s, n)
            if field == 'plan': c['plan_sha256'] = 'stale'
            if field == 'hash': c['choices'][0]['hashes']['owned'] = 'stale'
            if field == 'key': c['choices'][0]['key'] = ['another']
            if field == 'choice': c['choices'][0]['choice'] = 'latest_timestamp'
            if field == 'executable': c['executable'] = True
            with self.subTest(field=field), self.assertRaises(RefreshError): resolve_rehearsal(p, s, n, c)

    def test_recomputed_self_hash_does_not_hide_snapshot_mismatch(self):
        p, s, n = fixture(); p['conflicts'][0]['source']['duration'] = 99
        p['conflicts'][0]['source_hash'] = digest(p['conflicts'][0]['source'])
        with self.assertRaises(RefreshError): choice_template(p, s, n)

    def test_duplicate_unknown_and_missing_choices_rejected(self):
        for kind in ('duplicate', 'unknown', 'missing'):
            p, s, n = fixture(); c = choice_template(p, s, n)
            if kind == 'duplicate': c['choices'].append(copy.deepcopy(c['choices'][0]))
            if kind == 'unknown': c['choices'][0]['conflict_id'] = 'other'
            if kind == 'missing': c['choices'] = []
            with self.subTest(kind=kind), self.assertRaises(RefreshError): resolve_rehearsal(p, s, n, c)

    def test_absent_row_is_not_a_null_field_or_authorized_deletion(self):
        p, s, n = fixture(absent_source=True); c = choice_template(p, s, n); c['choices'][0]['choice'] = 'source'
        with self.assertRaises(RefreshError): resolve_rehearsal(p, s, n, c)
        p, s, n = fixture(); p['conflicts'][0]['source']['duration'] = None
        p['conflicts'][0]['source_hash'] = digest(p['conflicts'][0]['source'])
        s['manifest'] = manifest(s); p['snapshot_preconditions']['source'] = digest(s)
        c = choice_template(p, s, n); c['choices'][0]['choice'] = 'source'
        self.assertIsNone(resolve_rehearsal(p, s, n, c)['provisional_expected']['tasks'][0]['duration'])

    def test_account_reassignment_rejected(self):
        p, s, n = fixture(); p['conflicts'][0]['source']['user_id'] = 'other'
        p['conflicts'][0]['source_hash'] = digest(p['conflicts'][0]['source'])
        s['manifest'] = manifest(s); p['snapshot_preconditions']['source'] = digest(s)
        c = choice_template(p, s, n); c['choices'][0]['choice'] = 'source'
        with self.assertRaises(RefreshError): resolve_rehearsal(p, s, n, c)

    def test_google_choice_keeps_complete_selected_grant(self):
        p, s, n = fixture('google_connections')
        for side, token in (('base', 'base'), ('source', 'source'), ('owned', 'owned')):
            p['conflicts'][0][side].update(access_token=token, refresh_token=token, scope='calendar')
            p['conflicts'][0][side + '_hash'] = digest(p['conflicts'][0][side])
        for k in ('access_token', 'refresh_token', 'scope'):
            s['catalog']['columns'].append({'schema': 'public', 'table_name': 'google_connections', 'column_name': k})
        s['manifest'] = manifest(s); n['manifest'] = manifest(n)
        p['snapshot_preconditions'].update(source=digest(s), owned=digest(n))
        p['provisional_expected'] = copy.deepcopy(n['public'])
        c = choice_template(p, s, n); c['choices'][0]['choice'] = 'source'
        row = resolve_rehearsal(p, s, n, c)['provisional_expected']['google_connections'][0]
        self.assertEqual((row['access_token'], row['refresh_token']), ('source', 'source'))

    def test_provisional_row_drift_and_existing_operation_rejected(self):
        for change in ('expected', 'operation'):
            p, s, n = fixture()
            if change == 'expected': p['provisional_expected']['tasks'][0]['duration'] = 7
            else: p['operations'].append({'table': 'tasks', 'key': ['row'], 'action': 'update'})
            c = choice_template(p, s, n); c['choices'][0]['choice'] = 'source'
            with self.subTest(change=change), self.assertRaises(RefreshError): resolve_rehearsal(p, s, n, c)

    def test_unreviewed_policy_table_is_not_resolved(self):
        p, s, n = fixture('subscriptions'); c = choice_template(p, s, n); c['choices'][0]['choice'] = 'source'
        with self.assertRaises(RefreshError): resolve_rehearsal(p, s, n, c)


if __name__ == '__main__': unittest.main()
