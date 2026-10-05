"""Safety checks for plan-only TEST identity clearance and mode-scoped pending review."""
import copy
import importlib.util
from pathlib import Path
import sys
import unittest
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from refresh_common import *
from billing_activation import cleanup_plan, assert_preconditions, pending_plan
spec=importlib.util.spec_from_file_location('provider_reader',Path(__file__).resolve().parents[1]/'prepare-billing-activation.py')
reader_module=importlib.util.module_from_spec(spec);spec.loader.exec_module(reader_module)


def fixture():
    row = {'id': 'row', 'user_id': 'person', 'stripe_customer_id': 'cus_fixture', 'stripe_subscription_id': None,
           'status': 'active', 'lifetime_access': True, 'trial_start': 'original-start', 'trial_end': 'original-end',
           'payment_source': None, 'billing_environment': None, 'apple_original_transaction_id': None,
           'apple_latest_transaction_id': 'old-apple-proof', 'apple_environment': 'Sandbox', 'updated_at': 'original-stamp'}
    auth = [{'id': 'person', 'email': 'fixture@example.invalid'}]
    owned = {'project': OWNED, 'auth': auth, 'catalog': {'version': 68},
             'public': {'subscriptions': [row], 'user_roles': [{'user_id': 'person', 'role': 'admin'}]},
             'private': {table: [] for table in PRIVATE_TABLES}}
    source = {'project': SOURCE, 'auth': copy.deepcopy(auth), 'public': {'subscriptions': [copy.deepcopy(row)]}}
    proof = {'accounts': {'test': 'acct_test_fixture', 'live': 'acct_live_fixture'},
             'live_contracts': {'complete': True, 'data': []}, 'customers': [{'user_id': 'person', 'customer_id': 'cus_fixture',
        'test_customer': {'status': 200, 'body': {'object': 'customer', 'id': 'cus_fixture', 'livemode': False,
            'metadata': {'user_id': 'person'}}},
        'live_customer': {'status': 404, 'body': {'error': {'code': 'resource_missing'}}},
        'test_subscriptions': {'complete': True, 'data': []}, 'live_subscriptions': {'complete': True, 'data': []},
        'test_sessions': {'complete': True, 'data': []}}]}
    return source, owned, proof


class BillingActivationTests(unittest.TestCase):
    def test_only_customer_binding_changes_and_grants_trials_apple_evidence_survive(self):
        source, owned, proof = fixture()
        before = copy.deepcopy(owned)
        plan = cleanup_plan(source, owned, proof)
        self.assertEqual(plan['operations'][0]['set'], {'stripe_customer_id': None})
        expected = copy.deepcopy(before['public']['subscriptions'][0]); expected['stripe_customer_id'] = None
        self.assertEqual(plan['operations'][0]['after'], expected)
        self.assertEqual(owned, before)
        self.assertFalse(plan['ready_to_apply'])

    def test_historical_404_in_both_modes_does_not_authorize_clearance(self):
        s,n,p = fixture()
        s['public']['subscriptions'][0]['stripe_subscription_id'] = n['public']['subscriptions'][0]['stripe_subscription_id'] = 'sub_missing'
        plan = cleanup_plan(s,n,p)
        self.assertEqual(plan['operations'], [])
        self.assertIn('historical_subscription_unresolved_do_not_clear', plan['conflicts'][0]['reasons'])

    def test_no_clearance_on_customer_owner_mode_or_uncertain_live_lookup(self):
        for field,value in (('livemode', True), ('deleted', True), ('id', 'cus_wrong'), ('metadata', {'user_id': 'another'})):
            s,n,p = fixture(); p['customers'][0]['test_customer']['body'][field] = value
            self.assertEqual(cleanup_plan(s,n,p)['operations'], [])
        for status in (401,429,500):
            s,n,p = fixture(); p['customers'][0]['live_customer']['status'] = status
            self.assertEqual(cleanup_plan(s,n,p)['operations'], [])

    def test_contracts_incomplete_lists_open_and_paid_sessions_block(self):
        for mode in ('test','live'):
            s,n,p = fixture();p['customers'][0][mode+'_subscriptions']['data'] = [{'id': 'sub_fixture'}]
            self.assertEqual(cleanup_plan(s,n,p)['operations'], [])
            s,n,p = fixture();p['customers'][0][mode+'_subscriptions']['complete'] = False
            self.assertEqual(cleanup_plan(s,n,p)['operations'], [])
        for session in ({'status': 'open', 'livemode': False}, {'status':'complete','payment_status':'paid','livemode':False}):
            s,n,p = fixture();p['customers'][0]['test_sessions']['data'] = [session]
            self.assertEqual(cleanup_plan(s,n,p)['operations'], [])

    def test_source_auth_or_active_provider_changes_block(self):
        for mutation in ('source','auth','apple','live','stripe'):
            s,n,p = fixture()
            if mutation=='source':s['public']['subscriptions'][0]['stripe_customer_id']='cus_changed'
            if mutation=='auth':s['auth'][0]['email']='changed@example.invalid'
            if mutation=='apple':n['public']['subscriptions'][0]['apple_original_transaction_id']='chain'
            if mutation=='live':n['public']['subscriptions'][0]['billing_environment']='live'
            if mutation=='stripe':n['public']['subscriptions'][0]['payment_source']='stripe'
            self.assertEqual(cleanup_plan(s,n,p)['operations'], [])

    def test_late_row_insertion_role_change_and_private_revision_invalidate(self):
        s,n,p = fixture();plan = cleanup_plan(s,n,p);assert_preconditions(plan,n)
        for section in ('public','private','auth','catalog'):
            late = copy.deepcopy(n)
            if section=='public':late['public']['subscriptions'].append({'id':'late','user_id':'new'})
            if section=='private':late['private']['billing_revisions'].append({'user_id':'person','revision':1})
            if section=='auth':late['auth'][0]['email']='late@example.invalid'
            if section=='catalog':late['catalog']['version']=69
            with self.assertRaises(RefreshError):assert_preconditions(plan,late)
        late=copy.deepcopy(n);late['public']['user_roles'][0]['role']='changed'
        with self.assertRaises(RefreshError):assert_preconditions(plan,late)

    def test_pending_reviews_require_mode_and_account_isolation(self):
        s,n,p=fixture()
        n['private']['pending_stripe_checkouts']=[{'environment':'test','identity':'test-claim'}, {'environment':'live','identity':'live-claim'}]
        live=pending_plan(n,p,'live','acct_live_fixture')
        self.assertEqual([r['identity'] for r in live['claims']], ['live-claim'])
        self.assertEqual(live['other_mode_count'],1)
        self.assertFalse(live['ready_to_apply'])
        for env,acct in (('live','acct_test_fixture'),('test','acct_live_fixture'),('Production','acct_live_fixture')):
            with self.assertRaises(RefreshError):pending_plan(n,p,env,acct)

    def test_duplicate_identity_and_project_mismatch_fail_closed(self):
        s,n,p=fixture();p['customers'].append(copy.deepcopy(p['customers'][0]))
        with self.assertRaises(RefreshError):cleanup_plan(s,n,p)

    def test_provider_pagination_is_complete_and_duplicate_or_empty_pages_stop(self):
        reader=object.__new__(reader_module.StripeReader)
        requests=[]
        pages=[{'object':'list','data':[{'id':'one'}],'has_more':True},
               {'object':'list','data':[{'id':'two'}],'has_more':False}]
        def fake_get(path,parameters):
            requests.append(dict(parameters))
            return {'status':200,'body':pages.pop(0)}
        reader.get=fake_get
        result=reader.inventory('/v1/subscriptions')
        self.assertEqual([v['id'] for v in result['data']],['one','two'])
        self.assertEqual(requests[1]['starting_after'],'one')
        for page in ({'object':'list','data':[],'has_more':True},
                     {'object':'list','data':[{'id':'one'},{'id':'one'}],'has_more':False},
                     {'object':'list','data':[],'has_more':None}):
            reader.get=lambda *_:{'status':200,'body':page}
            with self.assertRaises(RefreshError):reader.inventory('/v1/subscriptions')

    def test_provider_get_mode_and_error_are_not_inventory_success(self):
        with self.assertRaises(RefreshError):reader_module.StripeReader('sk_test_fixture','live')
        reader=object.__new__(reader_module.StripeReader)
        reader.get=lambda *_:{'status':429,'body':{'error':{'code':'rate_limit'}}}
        with self.assertRaises(RefreshError):reader.inventory('/v1/subscriptions')
        s,n,p=fixture();n['project']=SOURCE
        with self.assertRaises(RefreshError):cleanup_plan(s,n,p)


if __name__=='__main__':unittest.main()
