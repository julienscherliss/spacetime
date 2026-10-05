"""Offline integrity and ownership regressions for conflict/reference review preparation."""
import copy
import sys
import unittest
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from refresh_common import *
from refresh_review import attachment_reference, reference_audit, review_bundle


def packet(project):
    result = {'format': 1, 'project': project, 'public': {t: [] for t in TABLES}, 'catalog': {},
              'auth': [], 'identities': [], 'storage_metadata': []}
    result['manifest'] = manifest(result)
    return result


def fixture():
    source, owned = packet(SOURCE), packet(OWNED)
    rows = {'base': {'id': 'task', 'user_id': 'u', 'title': 'Private title', 'duration': 1},
            'source': {'id': 'task', 'user_id': 'u', 'title': 'Private title', 'duration': 2},
            'owned': {'id': 'task', 'user_id': 'u', 'title': 'Private title', 'duration': 3}}
    conflict = dict(rows, table='tasks', key=['task'], changed_columns=['duration'])
    conflict.update({side + '_hash': digest(row) for side, row in rows.items()})
    plan = {'format': 1, 'mode': 'plan-only', 'executable': False, 'source_project': SOURCE, 'owned_project': OWNED,
            'snapshot_preconditions': {'source': digest(source), 'owned': digest(owned)}, 'conflicts': [conflict],
            'provisional_expected': {t: [] for t in TABLES}}
    return plan, source, owned


class ReviewTests(unittest.TestCase):
    def test_exact_bound_conflict_worksheet_has_no_choice_and_does_not_mutate(self):
        p,s,n = fixture(); before = digest([p,s,n]); a = review_bundle(p,s,n)
        self.assertIsNone(a['conflicts'][0]['choice'])
        self.assertEqual(a['summary']['task_accounts'],1)
        self.assertEqual(a,review_bundle(p,s,n)); self.assertEqual(before,digest([p,s,n]))

    def test_tampered_snapshot_or_before_image_rejected(self):
        for target in ('snapshot','row','project','executable'):
            p,s,n = fixture()
            if target == 'snapshot': s['public']['tasks'].append({'id':'new'})
            if target == 'row': p['conflicts'][0]['owned']['duration'] = 10
            if target == 'project': p['owned_project'] = SOURCE
            if target == 'executable': p['executable'] = True
            with self.subTest(target=target), self.assertRaises(RefreshError): review_bundle(p,s,n)

    def test_duplicate_conflicts_rejected(self):
        p,s,n = fixture(); p['conflicts'].append(copy.deepcopy(p['conflicts'][0]))
        with self.assertRaises(RefreshError): review_bundle(p,s,n)

    def test_google_tokens_never_copied_into_worksheet(self):
        p,s,n = fixture(); c=p['conflicts'][0]; c['table']='google_connections'; c['changed_columns']=['access_token']
        for side in ('base','source','owned'):
            c[side]={'id':'grant','user_id':'u','refresh_token':'SECRET_REFRESH','scope':'calendar','access_token':'SECRET_'+side}
            c[side+'_hash']=digest(c[side])
        r=review_bundle(p,s,n)
        self.assertNotIn('SECRET',canonical(r)); self.assertTrue(r['conflicts'][0]['same_saved_grant'])

    def test_signed_url_token_removed_and_path_decoded(self):
        key, origin=attachment_reference({'url':f'https://{SOURCE}.supabase.co/storage/v1/object/sign/task-attachments/u/task/a%20b?token=SECRET'})
        self.assertEqual(key,'task-attachments/u/task/a b'); self.assertEqual(origin,'source-url')
        self.assertEqual(attachment_reference({'path':'u/task/plain'})[0],'task-attachments/u/task/plain')

    def test_traversal_unknown_origin_and_ambiguous_path_rejected(self):
        for raw in ('../file','u/../file','u//file','u/file?token=x','u'+chr(92)+'file','u/'+chr(0)+'file','https://evil.example/task-attachments/u/file',
                    f'https://{SOURCE}.supabase.co/storage/v1/object/sign/task-attachments/u/%2e%2e/file'):
            with self.subTest(raw=raw), self.assertRaises(RefreshError): attachment_reference({'url':raw})

    def test_missing_cross_user_and_feedback_old_url_reported(self):
        expected={t:[] for t in TABLES}
        expected['tasks']=[{'id':'t','user_id':'a','attachments':[{'path':'b/t/file'}]}]
        expected['feedback']=[{'id':'f','screenshot_url':f'https://{SOURCE}.supabase.co/storage/v1/object/public/feedback-screenshots/a/screen'}]
        audit=reference_audit(expected,[],[])
        self.assertEqual({x['reason'] for x in audit['issues']},{'object_missing','cross_user_attachment','feedback_source_url_requires_path_conversion'})

    def test_runtime_missing_or_cross_user_links_reported(self):
        expected={t:[] for t in TABLES}; expected['tasks']=[{'id':'t','user_id':'b'}]
        expected['live_activity_devices']=[{'device_id':'d','user_id':'b'}]
        expected['live_activity_device_plans']=[{'id':'p','user_id':'a','device_id':'d','task_id':'t'}]
        self.assertEqual(len(reference_audit(expected,[],[])['issues']),2)


if __name__ == '__main__': unittest.main()
