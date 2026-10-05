"""Actual forward schema and RPCs, entirely rolled back. No provider requests."""
from pathlib import Path
from urllib.parse import urlsplit
from uuid import uuid4
from datetime import datetime,timedelta,timezone
import json,psycopg
from psycopg.types.json import Jsonb
values={}
for line in Path('.env.local').read_text().splitlines():
    key,sep,value=line.partition('=')
    if sep and key in {'SUPABASE_PROJECT_REF','SUPABASE_DB_PASSWORD'}:values[key]=value.strip().strip('"\'')
assert values['SUPABASE_PROJECT_REF']=='zzoeywmurqiqticikyaf'
url=Path('supabase/.temp/pooler-url').read_text().strip();assert values['SUPABASE_PROJECT_REF'] in urlsplit(url).username
c=psycopg.connect(url,password=values['SUPABASE_DB_PASSWORD'],connect_timeout=15)
checks=[];users=[uuid4(),uuid4()]
future=(datetime.now(timezone.utc)+timedelta(days=1)).isoformat();past=(datetime.now(timezone.utc)-timedelta(days=1)).isoformat()
try:
    if not c.execute("select to_regclass('private.pending_stripe_checkouts')").fetchone()[0]:
        c.execute(Path('supabase/migrations/20261002041607_checkout_reconciliation_recovery.sql').read_text())
    if 'provider_status' not in c.execute("select pg_get_functiondef('private.commit_billing_reconcile(uuid,text,text,text,text,jsonb,jsonb,boolean)'::regprocedure)").fetchone()[0]:
        c.execute(Path('supabase/migrations/20261002063922_pending_checkout_payment_retries.sql').read_text())
    for u in users:c.execute("insert into auth.users(id,email,raw_user_meta_data) values(%s,%s,'{}')",(u,f'checkout-{u}@migration.invalid'))
    u=users[0];identity=str(u)+'-stripe';token=uuid4();second=uuid4()
    def manage(action='reserve',key=token,attempt=None):
        return c.execute('select public.manage_stripe_checkout(%s,%s,%s,%s,%s)',[u,'test',key,action,Jsonb(attempt) if attempt else None]).fetchone()[0]
    def begin(event,owner=u):
        args=[owner,'stripe','test',identity,event]
        return args,c.execute('select public.begin_billing_reconcile(%s,%s,%s,%s,%s)',args).fetchone()[0]
    def commit(event,claim=True,status='active',provider_status='active'):
        args,ticket=begin(event)
        snapshot={'status':status,'plan':'monthly','customer_id':'customer','period_end':future,'provider_status':provider_status}
        return c.execute('select public.commit_billing_reconcile(%s,%s,%s,%s,%s,%s,%s,%s)',args+[Jsonb(ticket),Jsonb(snapshot),claim]).fetchone()[0]
    def apple_grace():
        c.execute("update public.subscriptions set payment_source='apple_iap',status='active',current_period_end=%s,grace_period_end=%s,stripe_customer_id='customer',apple_original_transaction_id=%s,apple_environment='Sandbox',billing_environment='Sandbox' where user_id=%s",(past,future,str(u)+'-apple',u))
    apple_grace();assert manage()['conflict']=='entitlement';checks.append('Apple grace blocks checkout admission')
    c.execute('update public.subscriptions set grace_period_end=null,status=\'expired\' where user_id=%s',(u,))
    assert manage()['attempt'] is None;assert manage(key=second)['conflict']=='busy'
    checks.append('one live checkout lease per account/environment')
    attempt={'id':str(uuid4()),'plan':'monthly','price_id':'price','customer_id':'customer','origin':'http://localhost:5175','created_at':int(datetime.now(timezone.utc).timestamp()),'expires_at':int((datetime.now(timezone.utc)+timedelta(hours=1)).timestamp())}
    assert manage('save',attempt=attempt)['attempt']==attempt
    assert manage('save',key=second,attempt=attempt)['conflict']=='lease'
    c.execute("update private.stripe_checkout_attempts set lease_until=now()-interval '1 second' where user_id=%s",(u,))
    assert manage(key=second)['attempt']==attempt
    assert manage('save',attempt=attempt)['conflict']=='lease'
    manage('release');assert c.execute('select lease_token from private.stripe_checkout_attempts where user_id=%s',(u,)).fetchone()[0]==second
    manage('release',key=second);checks.append('crash recovery retains attempt and fences old lease holders')
    assert manage()['attempt']==attempt
    apple_grace();assert manage('save',attempt=attempt)['blocked'];manage('release')
    checks.append('entitlement change after reservation blocks publishing checkout')
    pending=commit('paid-conflict');assert pending['outcome']=='pending_checkout'
    assert not begin('paid-conflict')[1].get('duplicate');assert begin('other-owner',users[1])[1]['conflict']=='ownership'
    assert len(c.execute('select public.pending_stripe_checkouts(%s,%s)',['test',u]).fetchone()[0])==1
    checks.append('paid conflict durable, retryable and owned')
    c.execute('update public.subscriptions set status=\'expired\',grace_period_end=null where user_id=%s',(u,))
    assert manage()['conflict']=='payment_review';checks.append('unresolved paid claim prevents another payment')
    assert commit('later-invoice',claim=False)['outcome']=='applied'
    assert begin('paid-conflict')[1]['duplicate']
    assert not c.execute('select public.pending_stripe_checkouts(%s,%s)',['test',u]).fetchone()[0]
    checks.append('later provider event recovers verified pending identity after conflict ends')
    apple_grace();assert commit('new-conflict')['outcome']=='pending_checkout'
    c.execute('update public.subscriptions set status=\'expired\',grace_period_end=null where user_id=%s',(u,))
    assert commit('new-conflict')['outcome']=='applied';assert begin('new-conflict')[1]['duplicate']
    checks.append('same checkout completion replay recovers instead of permanently deduplicating')
    apple_grace();assert commit('cancel-conflict')['outcome']=='pending_checkout'
    assert commit('provider-cancelled',claim=False,status='cancelled',provider_status='canceled')['outcome']=='checkout_inactive'
    assert not c.execute('select public.pending_stripe_checkouts(%s,%s)',['test',u]).fetchone()[0]
    assert c.execute('select payment_source,status from public.subscriptions where user_id=%s',(u,)).fetchone()==('apple_iap','active')
    checks.append('provider-inactive pending claim closes without altering other entitlement')
    c.execute("update public.subscriptions set status='expired',grace_period_end=null where user_id=%s",(u,))
    assert commit('awaiting-payment',status='cancelled',provider_status='incomplete')['outcome']=='pending_checkout'
    assert commit('payment-retry',claim=False,status='cancelled',provider_status='past_due')['outcome']=='pending_checkout'
    assert not begin('awaiting-payment')[1].get('duplicate')
    assert commit('payment-succeeded',claim=False)['outcome']=='applied'
    assert begin('awaiting-payment')[1]['duplicate'];checks.append('incomplete and retrying payments stay recoverable until paid')
    apple_grace()
    c.execute("update public.subscriptions set status='trialing',trial_end=%s,current_period_end=null,grace_period_end=null where user_id=%s",(future,u))
    assert manage()['conflict']=='entitlement';assert commit('trial-conflict')['outcome']=='pending_checkout'
    checks.append('paid-provider trial uses same trial boundary for admission and replacement')
    for role in ['anon','authenticated']:
        for fn in ['public.manage_stripe_checkout(uuid,text,uuid,text,jsonb)','public.pending_stripe_checkouts(text,uuid)']:
            assert not c.execute('select has_function_privilege(%s,%s,\'EXECUTE\')',(role,fn)).fetchone()[0]
        for table in ['private.stripe_checkout_attempts','private.pending_stripe_checkouts']:
            assert not c.execute('select has_table_privilege(%s,%s,\'SELECT\')',(role,table)).fetchone()[0]
    checks.append('new checkout state and RPCs inaccessible to clients')
    print(json.dumps({'passed':len(checks),'checks':checks,'committed':False},indent=2))
finally:
    c.rollback();assert c.execute('select count(*) from auth.users where id=any(%s)',(users,)).fetchone()[0]==0
    c.rollback();c.close()
