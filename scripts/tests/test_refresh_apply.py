"""Offline package/precondition regressions. SQL execution is rehearsed separately."""
import copy
import hashlib
import sys
import tempfile
import unittest
from unittest.mock import patch
from datetime import datetime, timezone, timedelta
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from refresh_common import *
from refresh_resolutions import choice_template
from refresh_apply import *
from test_refresh_resolutions import fixture


class ApplyTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.base = Path(self.temp.name).resolve(); (self.base/'data').mkdir()
        self.p, self.s, self.n = fixture()
        self.n['catalog'] = deepcopy(self.n['catalog'])
        self.n['catalog']['indexes'] = []
        self.n['catalog']['columns'].append({'schema':'public','table_name':'tasks','column_name':'target_only'})
        self.n.update(private={t:[] for t in PRIVATE_TABLES}, storage_content=[], migrations=[], cron=[])
        self.n['manifest'] = manifest(self.n); self.n['manifest']['storage_content'] = digest([])
        self.p['auth'] = {'conflicts':[], 'source_additions':[]}; self.p['validation'] = []
        hashes = {}
        for t in TABLES:
            path = self.base/'data'/(t+'.csv'); path.write_text('synthetic-baseline\n')
            hashes[t] = hashlib.sha256(path.read_bytes()).hexdigest()
        self.p['snapshot_preconditions'] = {'source':digest(self.s),'owned':digest(self.n),
            'baseline_files':hashes,'schema':digest(self.n['catalog'])}
        self.c = choice_template(self.p,self.s,self.n); self.c['choices'][0]['choice'] = 'source'
        self.objects = {'mode':'rehearsal-only','objects':[]}

    def tearDown(self): self.temp.cleanup()

    def build(self):
        return build_package(self.p,self.s,self.n,self.c,self.base,self.objects,digest(self.p))

    def test_complete_before_after_preserves_target_columns(self):
        p = self.build(); op = p['operations'][0]
        self.assertEqual(op['before']['duration'],3); self.assertEqual(op['after']['duration'],2)
        self.assertEqual(op['after']['target_only'],'preserved'); self.assertFalse(p['frozen_inputs'])
        self.assertEqual(p['before_public_sha256'],public_digest(self.n['public'],self.n['catalog']))

    def test_reviewed_plan_and_baseline_hashes_required(self):
        with self.assertRaises(RefreshError): build_package(self.p,self.s,self.n,self.c,self.base,self.objects,'wrong')
        (self.base/'data/tasks.csv').write_text('changed')
        with self.assertRaises(RefreshError): self.build()

    def test_unimplemented_actions_and_auth_changes_refused(self):
        for name in ('auth','delete','billing'):
            with self.subTest(name=name):
                p=copy.deepcopy(self.p)
                if name=='auth': p['auth']['source_additions']=['new-user']
                elif name=='delete': p['operations'].append({'table':'library_items','action':'delete','key':['new'],'after':None,'before_hash':digest(None)})
                else: p['operations'].append({'table':'subscriptions','action':'insert','key':['new'],'after':{},'before_hash':digest(None)})
                c=choice_template(p,self.s,self.n); c['choices'][0]['choice']='source'
                with self.assertRaises(RefreshError): build_package(p,self.s,self.n,c,self.base,self.objects,digest(p))

    def test_independent_replay_rejects_changed_provisional_result(self):
        self.p['provisional_expected']['library_items']=[{'id':'unexpected'}]
        self.c=choice_template(self.p,self.s,self.n); self.c['choices'][0]['choice']='source'
        with self.assertRaises(RefreshError): self.build()

    def test_missing_private_state_and_extra_owned_schema_refused(self):
        self.n['private'].pop(PRIVATE_TABLES[0])
        with self.assertRaises(RefreshError): self.build()

    def test_unresolved_rehearsal_cannot_authorize_apply(self):
        self.c['choices'][0]['choice']=None; p=self.build()
        self.assertEqual(len(p['unresolved_conflict_ids']),1)
        with self.assertRaises(RefreshError): authorize(p,{},self.n,'code')

    def test_expression_indexes_require_explicit_review(self):
        self.n['catalog']['indexes']=[{'expression':True}]
        self.n['manifest']=manifest(self.n); self.n['manifest']['storage_content']=digest([])
        self.p['snapshot_preconditions']['owned']=digest(self.n)
        self.c=choice_template(self.p,self.s,self.n);self.c['choices'][0]['choice']='source'
        with self.assertRaises(RefreshError): self.build()

    def test_natural_result_comparison_ignores_only_row_order(self):
        p=self.build(); current={k:deepcopy(self.n[k]) for k in ('catalog','public','private','auth','identities','storage_metadata','migrations','cron')}
        check_destination(current,self.n)
        current['public']=deepcopy(p['expected']);check_destination(current,self.n,p['expected'])
        current['public']['library_items'].append({'id':'late','user_id':'owner'})
        with self.assertRaises(RefreshError): check_destination(current,self.n,p['expected'])

    def test_private_auth_catalog_and_cron_drift_refuse(self):
        for section in ('catalog','private','auth','identities','storage_metadata','migrations','cron'):
            current={k:deepcopy(self.n[k]) for k in ('catalog','public','private','auth','identities','storage_metadata','migrations','cron')}
            if isinstance(current[section],dict): current[section]['changed']=True
            else: current[section].append({'changed':True})
            with self.subTest(section=section), self.assertRaises(RefreshError): check_destination(current,self.n)

    def authorization(self,p):
        p['frozen_inputs']=True;p['storage_receipt_mode']='final-frozen'
        evidence=self.base/'maintenance.txt';evidence.write_text('Synthetic verified-procedure fixture; not real authorization')
        current=datetime.now(timezone.utc)
        return {'format':1,'action':'apply-public-refresh','package_sha256':digest(p),'code_sha256':'code',
            'source_project':SOURCE,'owned_project':OWNED,'human_cutover_approval_reference':'synthetic-only',
            'maintenance_active':True,'cron_configuration_held_by_procedure':True,
            'owned_before_sha256':digest(self.n),'issued_at':current.isoformat(),
            'expires_at':(current+timedelta(minutes=10)).isoformat(),
            'maintenance_evidence':[{'path':str(evidence),'sha256':hashlib.sha256(evidence.read_bytes()).hexdigest()}]}

    def test_exact_authorization_and_durable_evidence(self):
        p=self.build();a=self.authorization(p);authorize(p,a,self.n,'code')
        for field,value in (('package_sha256','wrong'),('code_sha256','wrong'),('source_project',OWNED),
            ('human_cutover_approval_reference',''),('maintenance_active',False),
            ('cron_configuration_held_by_procedure',False),('maintenance_evidence',[])):
            changed=dict(a);changed[field]=value
            with self.subTest(field=field),self.assertRaises(RefreshError): authorize(p,changed,self.n,'code')
        (self.base/'maintenance.txt').write_text('changed')
        with self.assertRaises(RefreshError): authorize(p,a,self.n,'code')

    def test_active_cron_and_wrong_operator_action_refuse(self):
        p=self.build();a=self.authorization(p)
        self.n['cron']=[{'jobname':'fixture','schedule':'* * * * *','active':True}]
        a['owned_before_sha256']=digest(self.n)
        with self.assertRaises(RefreshError):authorize(p,a,self.n,'code')
        self.n['cron']=[];a['owned_before_sha256']=digest(self.n)
        a['action']='clear-test-customer-bindings'
        with self.assertRaises(RefreshError):authorize(p,a,self.n,'code')
        authorize(p,a,self.n,'code','clear-test-customer-bindings')

    def test_final_cron_hold_uses_fresh_connection_and_refuses_drift(self):
        jobs=[{'jobname':'fixture','schedule':'* * * * *','active':False}]
        with patch('refresh_apply.connect') as connect_mock:
            current=connect_mock.return_value.__enter__.return_value
            current.execute.return_value.fetchone.return_value=(canonical(jobs),)
            check_cron_hold({'cron':jobs})
            connect_mock.assert_called_once_with();current.rollback.assert_called_once_with()
            for changed in ([], [dict(jobs[0],active=True)], [dict(jobs[0],schedule='0 * * * *')]):
                current.execute.return_value.fetchone.return_value=(canonical(changed),)
                with self.subTest(changed=changed),self.assertRaises(RefreshError):check_cron_hold({'cron':jobs})
            current.execute.side_effect=RuntimeError('connection interrupted')
            with self.assertRaises(RuntimeError):check_cron_hold({'cron':jobs})

    def test_nested_output_directories_are_synced_and_failure_stops(self):
        with patch('refresh_common.Path.cwd',return_value=self.base):
            output=private_dir(self.base/'.migration-private/final-refresh/first/run')
            self.assertTrue(output.is_dir())
            with patch('refresh_common.os.fsync',side_effect=OSError('disk failure')):
                with self.assertRaises(OSError):private_dir(output/'next')

    def test_expired_or_unbounded_authorization_refused(self):
        p=self.build();a=self.authorization(p)
        for expiry in ((datetime.now(timezone.utc)-timedelta(seconds=1)).isoformat(),
                       (datetime.now(timezone.utc)+timedelta(days=1)).isoformat(),'2026-10-04T10:00:00'):
            a['expires_at']=expiry
            with self.assertRaises(RefreshError): authorize(p,a,self.n,'code')

    def test_unsafe_or_overwritten_journal_refused(self):
        path=self.base/'intent.json';write_durable(path,{'intent':'synthetic'})
        self.assertEqual(path.stat().st_mode&0o777,0o600)
        with self.assertRaises(FileExistsError):write_durable(path,{'intent':'overwrite'})
        link=self.base/'link';link.symlink_to(path)
        with self.assertRaises(RefreshError):write_durable(link,{})


if __name__=='__main__':unittest.main()
