#!/usr/bin/env python3
"""Run the actual forward migration and transition RPCs in a rolled-back transaction.
No committed users, subscriptions, events, notifications or migration bookkeeping.
"""
from pathlib import Path
from urllib.parse import urlsplit
from uuid import uuid4
from datetime import datetime, timedelta, timezone
import json
import psycopg
from psycopg.types.json import Jsonb
values={}
for line in Path('.env.local').read_text().splitlines():
    key,sep,value=line.partition('=')
    if sep and key in {'SUPABASE_PROJECT_REF','SUPABASE_DB_PASSWORD'}: values[key]=value.strip().strip('"\'')
assert values['SUPABASE_PROJECT_REF']=='zzoeywmurqiqticikyaf'
url=Path('supabase/.temp/pooler-url').read_text().strip()
assert values['SUPABASE_PROJECT_REF'] in urlsplit(url).username
c=psycopg.connect(url,password=values['SUPABASE_DB_PASSWORD'],connect_timeout=15)
checks=[]
try:
    exists=c.execute("select to_regclass('private.billing_events')").fetchone()[0]
    if not exists: c.execute(Path('supabase/migrations/20261002000042_durable_billing_reconciliation.sql').read_text())
    if not c.execute("select to_regclass('private.pending_stripe_checkouts')").fetchone()[0]:
        c.execute(Path('supabase/migrations/20261002041607_checkout_reconciliation_recovery.sql').read_text())
    if 'provider_status' not in c.execute("select pg_get_functiondef('private.commit_billing_reconcile(uuid,text,text,text,text,jsonb,jsonb,boolean)'::regprocedure)").fetchone()[0]:
        c.execute(Path('supabase/migrations/20261002063922_pending_checkout_payment_retries.sql').read_text())
    users=[uuid4(),uuid4()]
    for user in users:
        c.execute("insert into auth.users(id,email,raw_user_meta_data) values(%s,%s,'{}')",(user,f'billing-{user}@migration.invalid'))
    user=users[0]
    future=(datetime.now(timezone.utc)+timedelta(days=1)).isoformat()
    past=(datetime.now(timezone.utc)-timedelta(days=1)).isoformat()
    def reset(source='stripe',status='active',identity='new',extra=''):
        c.execute('delete from private.pending_stripe_checkouts')
        c.execute('delete from private.billing_events')
        c.execute('delete from private.apple_revoked_transactions')
        c.execute('delete from private.billing_provider_state')
        c.execute("update public.subscriptions set payment_source=%s,status=%s,stripe_customer_id='customer',stripe_subscription_id=%s,apple_original_transaction_id=null,lifetime_access=false,billing_environment=null,current_period_end=%s,grace_period_end=null where user_id=%s",(source,status,identity,future,user))
        if source=='apple_iap': c.execute("update public.subscriptions set apple_original_transaction_id=%s where user_id=%s",(identity,user))
        if extra: c.execute(extra,(user,))
    def begin(provider='stripe',identity='new',event=None,owner=user):
        args=[owner,provider,'test' if provider=='stripe' else 'Sandbox',identity,event or str(uuid4())]
        ticket=c.execute('select public.begin_billing_reconcile(%s,%s,%s,%s,%s)',args).fetchone()[0]
        return args,ticket
    def commit(handle,snapshot,claim=False):
        args,ticket=handle
        return c.execute('select public.commit_billing_reconcile(%s,%s,%s,%s,%s,%s,%s,%s)',args+[Jsonb(ticket),Jsonb(snapshot),claim]).fetchone()[0]
    def snapshot(status='active',**kw):
        return dict(status=status,plan='monthly',customer_id='customer',period_end=future,**kw)
    def status(): return c.execute('select status from public.subscriptions where user_id=%s',(user,)).fetchone()[0]
    reset()
    commit(begin(event='cancel'),snapshot('cancelled'))
    # The old event obtains authoritative cancelled state, rather than its active snapshot.
    commit(begin(event='old-active'),snapshot('cancelled'))
    assert status()=='cancelled';checks.append('older Stripe active event reconciles current cancellation')
    assert begin(event='cancel')[1]['duplicate'];checks.append('durable event idempotency')
    reset();result=commit(begin(identity='old'),snapshot('cancelled'))
    assert result['outcome']=='identity_conflict' and status()=='active';checks.append('old subscription deletion cannot cancel new subscription')
    result=commit(begin(identity='old'),snapshot())
    assert result['outcome']=='identity_conflict';checks.append('old invoice cannot replace current subscription')
    reset();a=begin(event='read-old');b=begin(event='read-new')
    commit(b,snapshot('cancelled'));assert commit(a,snapshot())['retry'] and status()=='cancelled'
    checks.append('overlapping provider reads fenced by revision')
    reset('apple_iap',identity='apple')
    apple=snapshot(transaction_id='tx',signed_date=200,revoked_transaction='tx')
    commit(begin('apple_iap','apple','refund'),apple)
    assert status()=='expired'
    commit(begin('apple_iap','apple','old-renew'),snapshot(transaction_id='tx',signed_date=100))
    assert status()=='expired';checks.append('older Apple renewal cannot undo refund')
    result=commit(begin('apple_iap','apple','restore'),snapshot(transaction_id='tx',signed_date=300))
    assert status()=='expired' and result['status']=='expired';checks.append('pre-refund transaction replay remains revoked after fresh signed date')
    result=commit(begin('apple_iap','apple','new-renew'),snapshot(transaction_id='tx-new',signed_date=400))
    assert status()=='active';checks.append('a new verified transaction can renew a revoked chain')
    conflict=begin('apple_iap','apple','other-user',users[1])[1]
    assert conflict['conflict']=='ownership';checks.append('transaction ownership conflict explicit')
    reset('apple_iap',identity='apple');result=commit(begin(),snapshot(),True)
    assert result['outcome']=='pending_checkout' and status()=='active';checks.append('cross-provider paid entitlement preserved and checkout retained for recovery')
    reset(extra='update public.subscriptions set lifetime_access=true where user_id=%s')
    assert commit(begin(),snapshot('cancelled'))['outcome']=='protected' and status()=='active'
    checks.append('lifetime grant preserved')
    reset();c.execute("update public.subscriptions set billing_environment='live' where user_id=%s",(user,))
    assert commit(begin(),snapshot('cancelled'))['outcome']=='environment_conflict'
    checks.append('provider mode isolation')
    for role in ['anon','authenticated']:
        assert not c.execute("select has_function_privilege(%s,'public.begin_billing_reconcile(uuid,text,text,text,text)','EXECUTE')",(role,)).fetchone()[0]
        assert not c.execute("select has_table_privilege(%s,'private.billing_events','SELECT')",(role,)).fetchone()[0]
    checks.append('private ledger and RPC unavailable to client roles')
    print(json.dumps({'passed':len(checks),'checks':checks,'committed':False},indent=2))
finally:
    c.rollback();c.close()
