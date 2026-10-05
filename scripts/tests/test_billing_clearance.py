"""Focused clearance safety regressions; no provider or database requests."""
import copy
import sys
from pathlib import Path
import unittest
import tempfile
import hashlib
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from refresh_common import *
from billing_clearance import *
from test_refresh_resolutions import fixture as full_fixture
from test_billing_activation import fixture as bill_fixture


def fixture():
    _,source,owned=full_fixture(); s,n,p=bill_fixture()
    owned['catalog']['triggers']=[]
    for packet,bill in ((source,s),(owned,n)):
        packet['auth']=copy.deepcopy(bill['auth']);packet['public']['subscriptions']=copy.deepcopy(bill['public']['subscriptions'])
        packet['public']['user_roles']=[dict(r,id='role-fixture') for r in n['public']['user_roles']]
    owned['private']=copy.deepcopy(n['private']);p['accounts']=dict(ACCOUNTS)
    source['manifest']=manifest(source);owned['manifest']=manifest(owned)
    return source,owned,p,{'mode':'rehearsal-only','objects':[]}


class ClearanceTests(unittest.TestCase):
    def historical(self,s,n,p,root):
        for packet in (s,n):
            row=packet['public']['subscriptions'][0]
            row.update(stripe_subscription_id='sub_missing',status='cancelled',payment_source='stripe',lifetime_access=False,
                current_period_end='2099-01-01T00:00:00+00:00')
            packet['public']['user_roles']=[];packet['manifest']=manifest(packet)
        proof=p['customers'][0]
        proof['historical_subscription']={mode:{'status':404,'body':{'error':{'code':'resource_missing'}}} for mode in ('test','live')}
        path=root.resolve()/'answer.json';path.write_text(canonical({'historical_stripe':{
            'answer':'Yes, it was only a test','account_email':'fixture@example.invalid'}}))
        row=n['public']['subscriptions'][0]
        return {'user_id':row['user_id'],'id':row['id'],'customer_id':row['stripe_customer_id'],
            'subscription_id':row['stripe_subscription_id'],'source_before_sha256':digest(s['public']['subscriptions'][0]),
            'owned_before_sha256':digest(row),'test_only_evidence':{'path':str(path),'sha256':hashlib.sha256(path.read_bytes()).hexdigest()}}

    def test_confirmed_history_archives_before_and_preserves_all_other_fields(self):
        with tempfile.TemporaryDirectory() as directory:
            s,n,p,o=fixture();choice=self.historical(s,n,p,Path(directory));pkg=clearance_package(s,n,p,o,historical=choice)
            self.assertEqual(len(pkg['operations']),1);self.assertEqual(pkg['blocked_bindings'],[])
            op=pkg['operations'][0];self.assertEqual(op['before'],n['public']['subscriptions'][0])
            self.assertEqual({k for k in op['before'] if op['before'][k]!=op['after'][k]},
                {'stripe_customer_id','stripe_subscription_id','payment_source'})
            self.assertEqual(op['after']['status'],'cancelled');self.assertEqual(op['after']['trial_end'],'original-end')
            self.assertEqual(op['after']['current_period_end'],'2099-01-01T00:00:00+00:00')

    def test_confirmation_cannot_bypass_changed_row_live_or_private_claim(self):
        for mutation in ('changed','paid','live','private','ownership'):
            with tempfile.TemporaryDirectory() as directory:
                s,n,p,o=fixture();choice=self.historical(s,n,p,Path(directory))
                if mutation=='changed':n['public']['subscriptions'][0]['updated_at']='new';n['manifest']=manifest(n)
                if mutation=='paid':p['customers'][0]['test_sessions']['data']=[{'status':'complete','payment_status':'paid','livemode':False}]
                if mutation=='live':p['customers'][0]['historical_subscription']['live']={'status':200,'body':{}}
                if mutation=='private':n['private']['billing_provider_state']=[{'user_id':'person'}];n['manifest']=manifest(n)
                if mutation=='ownership':p['customers'][0]['test_customer']['body']['metadata']['user_id']='other'
                with self.subTest(mutation=mutation),self.assertRaises(RefreshError):clearance_package(s,n,p,o,historical=choice)

    def test_customer_only_exact_result_and_private_owner_archive(self):
        s,n,p,o=fixture();before=copy.deepcopy(n);pkg=clearance_package(s,n,p,o)
        self.assertEqual(len(pkg['operations']),1);self.assertFalse(pkg['frozen_inputs'])
        row=pkg['expected']['subscriptions'][0];original=before['public']['subscriptions'][0]
        self.assertEqual({k for k in row if row[k]!=original[k]},{'stripe_customer_id'})
        self.assertEqual(pkg['operations'][0]['before'],original);self.assertEqual(n,before)

    def test_history_is_preserved_even_when_customer_exists_in_test(self):
        s,n,p,o=fixture()
        for packet in (s,n):packet['public']['subscriptions'][0]['stripe_subscription_id']='sub_missing';packet['manifest']=manifest(packet)
        pkg=clearance_package(s,n,p,o)
        self.assertEqual(pkg['operations'],[]);self.assertEqual(len(pkg['blocked_bindings']),1)
        self.assertEqual(pkg['expected']['subscriptions'],n['public']['subscriptions'])

    def test_accounts_live_contracts_and_new_triggers_refuse(self):
        for mutation in ('account','live-contract','trigger','private-incomplete'):
            s,n,p,o=fixture()
            if mutation=='account':p['accounts']['live']='acct_wrong'
            if mutation=='live-contract':p['live_contracts']['data']=[{'id':'sub_live'}]
            if mutation=='trigger':n['catalog']['triggers']=[{'schema':'public','table_name':'subscriptions'}];n['manifest']=manifest(n)
            if mutation=='private-incomplete':n['private'].pop(PRIVATE_TABLES[0])
            with self.subTest(mutation=mutation),self.assertRaises(RefreshError):clearance_package(s,n,p,o)

    def test_only_observation_times_are_ignored_for_provider_refresh(self):
        p={'started_at':'before','finished_at':'after','accounts':ACCOUNTS,'customers':[{'id':'cus_original'}]}
        later=copy.deepcopy(p);later.update(started_at='later',finished_at='later-end')
        self.assertEqual(digest(proof_state(p)),digest(proof_state(later)))
        later['customers'][0]['id']='cus_changed'
        self.assertNotEqual(digest(proof_state(p)),digest(proof_state(later)))

    def test_destinations_are_bounded_before_any_sql(self):
        with self.assertRaises(RefreshError):clear_customers(None,{'operations':[]},'auth','users')

    def test_missing_resource_diagnostic_rotation_preserves_billing_facts(self):
        response={'status':404,'body':{'error':{'type':'invalid_request_error','code':'resource_missing',
            'param':'customer','message':'No such customer','request_log_url':'https://dashboard.stripe.com/logs/old'}}}
        p={'accounts':ACCOUNTS,'customers':[{'live_customer':response,
            'test_customer':{'status':200,'body':{'metadata':{'user_id':'owner','request_log_url':'meaningful'}}},
            'historical_subscription':{'test':copy.deepcopy(response),'live':copy.deepcopy(response)}}],
            'live_contracts':{'data':[]}}
        original=copy.deepcopy(p);later=copy.deepcopy(p)
        for r in (later['customers'][0]['live_customer'],*later['customers'][0]['historical_subscription'].values()):
            r['body']['error']['request_log_url']='https://dashboard.stripe.com/logs/new'
        self.assertEqual(proof_state(p),proof_state(later));self.assertEqual(p,original)
        for field,value in (('code','different'),('type','different'),('param','subscription'),('message','different')):
            changed=copy.deepcopy(later);changed['customers'][0]['live_customer']['body']['error'][field]=value
            self.assertNotEqual(proof_state(p),proof_state(changed))
        for mutation in ('status','owner','metadata','contract'):
            changed=copy.deepcopy(later)
            if mutation=='status':changed['customers'][0]['live_customer']['status']=200
            if mutation=='owner':changed['customers'][0]['test_customer']['body']['metadata']['user_id']='other'
            if mutation=='metadata':changed['customers'][0]['test_customer']['body']['metadata']['request_log_url']='other'
            if mutation=='contract':changed['live_contracts']['data']=[{'id':'sub_live'}]
            with self.subTest(mutation=mutation):self.assertNotEqual(proof_state(p),proof_state(changed))


if __name__=='__main__':unittest.main()
