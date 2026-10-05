"""Safety regressions for plan-only reconciliation; optional real Postgres temp-table checks."""
import copy
import csv
import hashlib
import importlib.util
from io import StringIO
from pathlib import Path
import sys
import tempfile
import unittest

sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from refresh_common import *


def module(filename, name):
    spec=importlib.util.spec_from_file_location(name,Path(__file__).resolve().parents[1]/filename)
    result=importlib.util.module_from_spec(spec); spec.loader.exec_module(result); return result


planner=module('plan-final-refresh.py','planner')
source_tool=module('prepare-refresh-source.py','source_tool')


class PlannerTests(unittest.TestCase):
    def test_three_way_changes_additions_and_deletions(self):
        for b,o,n,result in ((1,1,2,'keep_owned'),(1,2,1,'apply_source'),(1,2,2,'shared'),
                             (1,2,3,'conflict'),(1,None,1,'apply_source'),(1,None,2,'conflict'),
                             (None,2,None,'apply_source'),(None,None,2,'keep_owned'),(None,2,3,'conflict')):
            with self.subTest(result=result): self.assertEqual(compare_row(b,o,n)[0],result)

    def test_json_number_equality_boolean_distinction_array_order(self):
        self.assertEqual(digest(loads('{"x":1.00}')),digest(loads('{"x":1}')))
        self.assertEqual(compare_row({'x':0},{'x':True},{'x':1})[0],'conflict')
        self.assertNotEqual(digest([1,2]),digest([2,1]))
        self.assertEqual(canonical(loads('12345678901234567890.12345678901234567890')),'12345678901234567890.1234567890123456789')

    def test_unknown_json_and_duplicates_rejected(self):
        for text in ('{"x":1,"x":2}','NaN','[Infinity]'):
            with self.assertRaises(RefreshError): loads(text)
        with self.assertRaises(RefreshError): index_rows([{'id':'same'},{'id':'same'}],['id'])

    def test_target_only_columns_retained(self):
        result=plan_table('profiles',[{'id':'1','name':'B'}],[{'id':'1','name':'O'}],
                          [{'id':'1','name':'B','owned_extra':'keep'}],['id','name'],['id'])
        self.assertEqual(result['expected'][0]['owned_extra'],'keep')
        self.assertEqual(result['operations'][0]['action'],'update')

    def test_json_boolean_number_change_emits_operation(self):
        result=plan_table('profiles',[{'id':'1','v':1}],[{'id':'1','v':True}],
                          [{'id':'1','v':1}],['id','v'],['id'])
        self.assertEqual(len(result['operations']),1)
        self.assertIs(result['operations'][0]['after']['v'],True)

    def test_catalog_drift_is_review_inventory(self):
        old={name:[] for name in CATALOG_QUERIES}
        new=copy.deepcopy(old)
        old['tables']=[{'schema':'public','table_name':'tasks','rls':True}]
        new['tables']=[{'schema':'public','table_name':'tasks','rls':False}]
        self.assertEqual(planner.catalog_drift(old,new)['tables']['different'],[['public','tasks']])

    def test_security_google_and_consent_require_review(self):
        for table in ('subscriptions','user_roles','promo_codes','google_connections','suppressed_emails'):
            result=plan_table(table,[{'id':'1','v':'B'}],[{'id':'1','v':'O'}],[{'id':'1','v':'B'}],['id','v'],['id'])
            self.assertEqual(len(result['conflicts']),1)
            self.assertEqual(len(result['operations']),0)

    def test_runtime_kept_and_history_retention_not_replayed(self):
        runtime=plan_table('live_activity_devices',[{'id':'1','token':'B'}],[{'id':'1','token':'O'}],
                           [{'id':'1','token':'N'}],['id','token'],['id'])
        self.assertEqual(runtime['expected'][0]['token'],'N')
        history=plan_table('audit_log',[{'id':'1'}],[],[{'id':'1'}],['id'],['id'])
        self.assertEqual(len(history['expected']),1); self.assertEqual(history['operations'],[])

    def test_auth_uses_uuid_not_email_for_assignment(self):
        result=planner.auth_plan([], [{'id':'old','email':'test@example.com','email_confirmed_at':'yes'}],
                                 [{'id':'owned','email':'test@example.com'}])
        self.assertEqual(result['conflicts'][0]['reason'],'auth_email_uuid_collision')

    def test_stable_series_identity_not_a_task_foreign_key(self):
        row={'id':'task','user_id':'owner','series_id':'deleted-root','linked_group_id':'deleted-root',
             'linked':True,'detached_from_series':False,'recurrence_parent_id':'deleted-root','type':'task','group_id':None}
        self.assertEqual(planner.task_normalization_problems([row]),[])
        wrong={**row,'id':'other','user_id':'different-owner'}
        self.assertTrue(any(x['reason']=='cross_user_series' for x in planner.task_normalization_problems([row,wrong])))

    def test_storage_delete_modify_conflict_and_owned_addition(self):
        b=[{'key':'bucket/one','sha256':'a','size':1}]
        n=[{'key':'bucket/one','sha256':'b','size':1},{'key':'bucket/phone','sha256':'c','size':2}]
        result=planner.storage_plan(b,[],n)
        self.assertEqual(len(result['conflicts']),1); self.assertEqual(result['operations'],[])
        self.assertFalse(planner.storage_plan(b,None,n)['verified'])

    def test_transport_integrity_empty_sets_and_semicolon_csv(self):
        datasets={**{'public.'+table:[] for table in TABLES},**{'catalog.'+name:[] for name in CATALOG_QUERIES},
                  'auth':[],'identities':[],'storage_metadata':[],'cron':[],
                  'meta':[{'project':SOURCE,'snapshot_time':'2026-10-04'}]}
        datasets['catalog.tables']=[{'schema':'public','table_name':name} for name in TABLES]
        datasets['catalog.keys']=[{'schema':'public','table_name':name,'kind':'p',
                                  'columns':['user_id' if name=='user_color_schemes' else 'id']} for name in TABLES]
        with tempfile.TemporaryDirectory(dir=Path.cwd()/'.migration-private') as directory:
            path=Path(directory)/'data.csv'
            def save(omit=False, corrupt=False):
                with path.open('w',newline='') as handle:
                    writer=csv.writer(handle,delimiter=';'); writer.writerow(['dataset','payload_json','row_count','transport_md5'])
                    for name,rows in datasets.items():
                        if omit and name=='public.tasks': continue
                        text=canonical(rows); checksum=hashlib.md5(text.encode()).hexdigest()
                        writer.writerow([name,text,len(rows),'wrong' if corrupt else checksum])
            save(); self.assertEqual(len(source_tool.import_csv(path)['public']),26)
            for omit,corrupt in ((True,False),(False,True)):
                save(omit,corrupt)
                with self.assertRaises(RefreshError): source_tool.import_csv(path)

    def test_safe_paths_and_snapshot_checksums(self):
        with tempfile.TemporaryDirectory(dir=Path.cwd()/'.migration-private') as directory:
            target=Path(directory)/'file'; target.write_text('private')
            link=Path(directory)/'link'; link.symlink_to(target)
            with self.assertRaises(RefreshError): safe_path(link)
        packet={'format':VERSION,'project':SOURCE,'public':{name:[] for name in TABLES},'catalog':{},
                'auth':[],'identities':[],'storage_metadata':[]}
        packet['manifest']=manifest(packet); verify_packet(packet,SOURCE)
        packet['public']['tasks'].append({'id':'changed'})
        with self.assertRaises(RefreshError): verify_packet(packet,SOURCE)


class DatabaseTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.packet=read_json(Path('.migration-private/final-refresh/20261004-rehearsal/owned.json'))

    def test_real_copy_null_empty_json_timestamp_numeric(self):
        with connect(readonly=False) as c:
            c.execute('create temp table rf_types(id integer,txt text,j jsonb,at timestamptz,amount numeric) on commit drop')
            with c.cursor().copy('copy pg_temp.rf_types from stdin with (format csv)') as stream:
                stream.write('1,,"{""x"":1.00}",2026-10-04T08:00:00-07:00,12345678901234567890.123456789\n2,"",null,2026-10-04T15:00:00Z,0\n')
            rows=normalized_rows(c,'rf_types',['id','txt','j','at','amount'],['id'])
            self.assertIsNone(rows[0]['txt']); self.assertEqual(rows[1]['txt'],'')
            self.assertEqual(rows[0]['at'],rows[1]['at'])
            self.assertEqual(canonical(rows[0]['amount']),'12345678901234567890.123456789')
            c.rollback()

    def test_real_unique_key_and_fk_closure(self):
        with connect(readonly=False) as c:
            expected=copy.deepcopy(self.packet['public'])
            category=copy.deepcopy(expected['library_categories'][0])
            category['id']='00000000-0000-4000-8000-000000000001'
            expected['library_categories'].append(category)
            expected['clients']=[]  # parent removal must not silently cascade away retained invoices
            expected['invoices'][0]['status']='unrecognized-status'
            issues=planner.validate_expected(c,expected,catalog(c),self.packet['auth'])
            self.assertTrue(any(i['table']=='library_categories' and i['reason']=='unique_key_collision' for i in issues))
            self.assertTrue(any(i['table']=='invoices' and i['reason']=='foreign_key_orphan' for i in issues))
            self.assertTrue(any(i['table']=='invoices' and i['reason']=='check_constraint_violation' for i in issues))
            c.rollback()


if __name__=='__main__':
    suite=unittest.defaultTestLoader.loadTestsFromTestCase(PlannerTests)
    if '--database' in sys.argv: suite.addTests(unittest.defaultTestLoader.loadTestsFromTestCase(DatabaseTests))
    result=unittest.TextTestRunner(verbosity=1).run(suite)
    raise SystemExit(0 if result.wasSuccessful() else 1)
