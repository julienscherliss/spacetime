#!/usr/bin/env python3
"""Exercise forward reversal SQL with fixture-only writes and full rollback."""
from pathlib import Path
from uuid import uuid4
from datetime import datetime, timezone, timedelta
import json
from psycopg.types.json import Jsonb
from refresh_common import connect

c=connect(readonly=False); checks=[]
function="private.commit_billing_reconcile(uuid,text,text,text,text,jsonb,jsonb,boolean)"
original=c.execute('select pg_get_functiondef(%s::regprocedure)',(function,)).fetchone()[0]
user=uuid4(); identity='migration-reversal-'+str(user); tx=identity+'-tx'
future=(datetime.now(timezone.utc)+timedelta(days=1)).isoformat()
past=(datetime.now(timezone.utc)-timedelta(days=1)).isoformat()
try:
    c.execute(Path('supabase/migrations/20261005144654_apple_refund_reversal_reconciliation.sql').read_text())
    c.execute("insert into auth.users(id,email,raw_user_meta_data) values(%s,%s,'{}')",(user,str(user)+'@migration.invalid'))
    def reset():
        c.execute('delete from private.billing_events where identity=%s',(identity,))
        c.execute('delete from private.billing_provider_state where identity=%s',(identity,))
        c.execute('delete from private.apple_revoked_transactions where original_transaction_id=%s',(identity,))
        c.execute('delete from private.stripe_checkout_attempts where user_id=%s',(user,))
        c.execute("update public.subscriptions set payment_source='apple_iap',apple_original_transaction_id=%s,\
            billing_environment='Sandbox',status='active',current_period_end=%s,grace_period_end=null,lifetime_access=false where user_id=%s",
            (identity,future,user))
    def run(event,version=500,revoked=None,reversal=None,end=future,owner=user,handle=None,environment='Sandbox',claim=False):
        args=[owner,'apple_iap',environment,identity,event]
        ticket=handle or c.execute('select public.begin_billing_reconcile(%s,%s,%s,%s,%s)',args).fetchone()[0]
        snapshot={'status':'active','plan':'monthly','transaction_id':tx,'signed_date':version,
            'period_end':end,'revoked_transaction':tx if revoked is not None else None}
        if revoked is not None:snapshot['revocation_event']={'event_id':event,'signed_date':revoked}
        if reversal is not None:snapshot['refund_reversal']={'transaction_id':tx,'original_transaction_id':identity,
            'environment':'Sandbox','event_id':event,'signed_date':reversal,'transaction_signed_date':version}
        return c.execute('select public.commit_billing_reconcile(%s,%s,%s,%s,%s,%s,%s,%s)',
            args+[Jsonb(ticket),Jsonb(snapshot),claim]).fetchone()[0]
    def ledger():return c.execute('select last_event_signed_date,reversed from private.apple_revoked_transactions where environment=%s and transaction_id=%s',('Sandbox',tx)).fetchone()
    def status():return c.execute('select status from public.subscriptions where user_id=%s',(user,)).fetchone()[0]
    reset();run('refund',revoked=100);assert status()=='expired' and ledger()==(100,False)
    run('ordinary-restore',version=600);assert status()=='expired';checks.append('ordinary current receipt cannot clear a refund')
    run('reverse',version=700,reversal=200);assert status()=='active' and ledger()==(200,True)
    checks.append('verified newer reversal restores finite access and retains the ledger row')
    assert c.execute('select public.begin_billing_reconcile(%s,%s,%s,%s,%s)',[user,'apple_iap','Sandbox',identity,'reverse']).fetchone()[0]['duplicate']
    checks.append('reversal event remains durably deduplicated')
    run('delayed-old-refund',version=800,revoked=100);assert status()=='active' and ledger()==(200,True)
    checks.append('older refund cannot undo reversal despite a fresh provider snapshot')
    run('new-refund',version=900,revoked=300);assert status()=='expired' and ledger()==(300,False)
    run('delayed-reversal',version=1000,reversal=200);assert status()=='expired' and ledger()==(300,False)
    checks.append('newer refund wins over a delayed old reversal')
    run('equal-time-reversal',version=1100,reversal=300);assert status()=='expired' and ledger()==(300,False)
    checks.append('equal event dates retain revocation')
    reset();run('reverse-first',reversal=200);run('refund-after',version=600,revoked=100)
    assert status()=='active' and ledger()==(200,True);checks.append('reversal before refund creates an ordering tombstone')
    reset();c.execute('insert into private.apple_revoked_transactions(environment,transaction_id,original_transaction_id) values(%s,%s,%s)',('Sandbox',tx,identity))
    run('legacy-reverse',reversal=200);assert status()=='active' and ledger()==(200,True)
    checks.append('legacy sticky revocations recover without deleting history')
    reset();run('old-paid-period-reversal',reversal=200,end=past);assert status()=='expired'
    checks.append('reversal does not invent a new expiry')
    reset();c.execute('update public.subscriptions set lifetime_access=true where user_id=%s',(user,))
    assert run('protected-reversal',reversal=200)['outcome']=='protected';checks.append('protected grants survive reversal')
    reset();run('unclaimed-reverse',reversal=200,owner=None);assert ledger()==(200,True)
    checks.append('unclaimed transaction ordering survives until first claim')
    reset();args=[user,'apple_iap','Sandbox',identity,'superseded']
    ticket=c.execute('select public.begin_billing_reconcile(%s,%s,%s,%s,%s)',args).fetchone()[0]
    c.execute('select public.begin_billing_reconcile(%s,%s,%s,%s,%s)',[user,'apple_iap','Sandbox',identity,'newer-read'])
    assert run('superseded',reversal=200,handle=ticket)['retry'];assert ledger() is None
    checks.append('revision fence prevents stale read from changing reversal ledger')
    reset();assert run('real-purchase',environment='Production',claim=True)['outcome']=='applied'
    assert c.execute('select billing_environment from public.subscriptions where user_id=%s',(user,)).fetchone()[0]=='Production'
    assert run('sandbox-after-paid',claim=True)['outcome']=='environment_conflict'
    c.execute("update public.subscriptions set status='expired' where user_id=%s",(user,))
    assert run('sandbox-after-expiry',claim=True)['outcome']=='environment_conflict'
    checks.append('production purchase supersedes Sandbox; Sandbox cannot replace live history even after expiry')
    reset();token=uuid4()
    result=c.execute('select public.manage_stripe_checkout(%s,%s,%s,%s)',(user,'live',token,'reserve')).fetchone()[0]
    assert not result.get('conflict');checks.append('live Stripe checkout is admitted over a Sandbox entitlement')
    reset();c.execute('update public.subscriptions set billing_environment=null,apple_environment=null where user_id=%s',(user,))
    result=c.execute('select public.manage_stripe_checkout(%s,%s,%s,%s)',(user,'live',uuid4(),'reserve')).fetchone()[0]
    assert result['conflict']=='entitlement'
    assert run('sandbox-unknown-mode',claim=True)['outcome']=='environment_conflict'
    checks.append('unknown legacy paid environment stays protected from checkout and Sandbox claims')
    for role in ('anon','authenticated'):
        assert not c.execute('select has_function_privilege(%s,%s,%s)',(role,function,'EXECUTE')).fetchone()[0]
        assert not c.execute("select has_table_privilege(%s,'private.apple_revoked_transactions','UPDATE')",(role,)).fetchone()[0]
    checks.append('client roles cannot mutate reconciliation or reversal history')
finally:
    c.rollback();c.close()
with connect() as current:
    assert current.execute('select pg_get_functiondef(%s::regprocedure)',(function,)).fetchone()[0]==original
    assert not current.execute('select 1 from auth.users where id=%s',(user,)).fetchone()
    current.rollback()
print(json.dumps({'passed':len(checks),'checks':checks,'rolled_back':True,'fixture_users_remaining':0,'deployed':False}))
