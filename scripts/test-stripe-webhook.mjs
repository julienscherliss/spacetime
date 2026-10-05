// Owned backend + real Stripe TEST objects and test-only pm_card_visa. No live
// payments. Signed replay triggers are synthetic; state is fetched from Stripe.
import assert from 'node:assert/strict';
import {createHmac,randomUUID,randomBytes} from 'node:crypto';
import {createClient} from '@supabase/supabase-js';
import {writeFileSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
process.loadEnvFile('.env.local');
assert.equal(process.env.SUPABASE_PROJECT_REF,'zzoeywmurqiqticikyaf');
assert.ok(process.env.STRIPE_SECRET_KEY.startsWith('sk_test_'));
const admin=createClient(process.env.SUPABASE_URL,process.env.SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false,autoRefreshToken:false}});
const marker=`stripe-repair-${randomUUID()}`, subscriptions=[], sessions=[],checks=[];
let uid,customer,token;
async function stripe(path,method='GET',body) {
 const r=await fetch('https://api.stripe.com/v1/'+path,{method,headers:{Authorization:'Bearer '+process.env.STRIPE_SECRET_KEY,
  'Stripe-Version':'2025-08-27.basil','Content-Type':'application/x-www-form-urlencoded'},body:body&&new URLSearchParams(body)});
 const data=await r.json();if(!r.ok)throw Error(`Stripe TEST HTTP ${r.status}: ${data.error?.code??'unknown'}`);return data;
}
async function row(){return (await admin.from('subscriptions').select('*').eq('user_id',uid).single().throwOnError()).data;}
async function edge(name,body,origin='http://localhost:5175'){
 const r=await fetch(`${process.env.SUPABASE_URL}/functions/v1/${name}`,{method:'POST',headers:{Authorization:'Bearer '+token,
  apikey:process.env.SUPABASE_ANON_KEY,'Content-Type':'application/json',Origin:origin},body:JSON.stringify(body)});return {status:r.status,body:await r.json()};
}
async function event(type,obj,options={}) {
 const body=JSON.stringify({id:options.id??`${marker}-${randomUUID()}`,object:'event',type,api_version:'2026-02-25.clover',livemode:options.live??false,
  created:Math.floor(Date.now()/1000),data:{object:obj}});
 const timestamp=Math.floor(Date.now()/1000)-(options.expired?600:0);
 const digest=createHmac('sha256',process.env.STRIPE_WEBHOOK_SECRET).update(`${timestamp}.${body}`).digest('hex');
 const signature=`t=${timestamp},v1=${options.invalid?'0'.repeat(64):digest}`;
 const r=await fetch(process.env.SUPABASE_URL+'/functions/v1/stripe-webhook',{method:'POST',headers:{'Content-Type':'application/json',
  ...(options.missing?{}:{'stripe-signature':signature})},body});
 assert.equal(r.status,options.expected??200,`Stripe webhook ${type}`);return r.status===200?await r.json():null;
}
const before=(await admin.from('subscriptions').select('user_id',{head:true,count:'exact'}).throwOnError()).count;
try {
 const password=randomBytes(24).toString('base64url'),email=`${marker}@migration.invalid`;
 const created=await admin.auth.admin.createUser({email,password,email_confirm:true});if(created.error)throw created.error;uid=created.data.user.id;
 const client=createClient(process.env.SUPABASE_URL,process.env.SUPABASE_ANON_KEY,{auth:{persistSession:false,autoRefreshToken:false}});
 const login=await client.auth.signInWithPassword({email,password});if(login.error)throw login.error;token=login.data.session.access_token;
 const monthly=await edge('stripe-checkout',{plan:'monthly'});assert.equal(monthly.status,200);assert.match(monthly.body.url,/^https:\/\/checkout.stripe.com\//);
 const repeated=await edge('stripe-checkout',{plan:'monthly'});assert.equal(repeated.status,200);assert.equal(repeated.body.url,monthly.body.url);
 const parallel=await Promise.all([edge('stripe-checkout',{plan:'monthly'}),edge('stripe-checkout',{plan:'monthly'})]);
 assert.ok(parallel.every(result=>[200,409].includes(result.status)));
 assert.ok(parallel.some(result=>result.status===200));
 assert.ok(parallel.filter(result=>result.status===200).every(result=>result.body.url===monthly.body.url));
 checks.push('repeated and parallel monthly requests reuse one real TEST checkout');
 const yearly=await edge('stripe-checkout',{plan:'yearly'});assert.equal(yearly.status,200);assert.notEqual(yearly.body.url,monthly.body.url);
 checks.push('yearly plan change expires prior monthly checkout before replacement');
 customer=(await row()).stripe_customer_id;assert.ok(customer);
 const open=await stripe(`checkout/sessions?customer=${encodeURIComponent(customer)}&status=open`);
 for(const session of open.data){sessions.push(session.id);await stripe(`checkout/sessions/${session.id}/expire`,'POST',{});}
 assert.equal(open.data.length,1);
 const all=await stripe(`checkout/sessions?customer=${encodeURIComponent(customer)}&limit=100`);
 assert.equal(all.data.length,2);assert.ok(all.data.some(session=>session.status==='expired' && session.metadata.plan==='monthly'));
 assert.equal((await edge('stripe-checkout',{plan:'monthly'},'https://unapproved.invalid')).status,500);
 assert.equal((await edge('customer-portal',{})).status,200);
 checks.push('stored customer portal and return-origin allowlist verified');
 const pm=await stripe('payment_methods/pm_card_visa/attach','POST',{customer});
 const createSubscription=async()=>{
  const sub=await stripe('subscriptions','POST',{customer,default_payment_method:pm.id,'items[0][price]':process.env.STRIPE_MONTHLY_PRICE_ID,
   payment_behavior:'error_if_incomplete','metadata[user_id]':uid,'metadata[plan]':'monthly'});
  assert.equal(sub.livemode,false);assert.equal(sub.status,'active');subscriptions.push(sub.id);
  const invoice=await stripe(`invoices/${sub.latest_invoice}`);assert.equal(invoice.status,'paid');assert.equal(invoice.amount_paid,300);
  return sub;
 };
 let sub=await createSubscription();
 for(const options of [{missing:true},{invalid:true},{expired:true},{live:true}])await event('customer.subscription.updated',{id:sub.id,customer},{...options,expected:400});
 checks.push('missing, invalid, expired and opposite-mode signatures/events rejected');
 const checkoutEvent=()=>({mode:'subscription',subscription:sub.id,customer,metadata:{user_id:uid,plan:'monthly'}});
 const id=`${marker}-checkout`;
 await event('checkout.session.completed',checkoutEvent(),{id});
 const saved=await row();assert.equal(saved.status,'active');assert.equal(saved.stripe_subscription_id,sub.id);assert.equal(saved.payment_source,'stripe');assert.equal(saved.billing_environment,'test');assert.ok(Date.parse(saved.current_period_end)>Date.now());
 assert.equal((await event('checkout.session.completed',checkoutEvent(),{id})).duplicate,true);
 checks.push('paid TEST invoice grants finite entitlement and durable duplicate is a no-op');
 await stripe(`subscriptions/${sub.id}`,'POST',{cancel_at_period_end:'true'});
 await event('customer.subscription.updated',{id:sub.id,customer,status:'active'});assert.equal((await row()).status,'cancelling');
 await stripe(`subscriptions/${sub.id}`,'DELETE');
 await event('customer.subscription.updated',{id:sub.id,customer,status:'active'});assert.equal((await row()).status,'cancelled');
 checks.push('stale active snapshots reconcile scheduled and completed cancellation');
 const old=sub.id;sub=await createSubscription();
 const graceEnd=new Date(Date.now()+60000).toISOString();
 await admin.from('subscriptions').update({payment_source:'apple_iap',status:'active',apple_original_transaction_id:`${marker}-apple`,
  apple_environment:'Sandbox',billing_environment:'Sandbox',current_period_end:new Date(Date.now()-1000).toISOString(),grace_period_end:graceEnd}).eq('user_id',uid).throwOnError();
 assert.equal((await edge('stripe-checkout',{plan:'monthly'})).status,409);
 const conflictId=`${marker}-paid-conflict`;
 assert.equal((await event('checkout.session.completed',checkoutEvent(),{id:conflictId})).outcome,'pending_checkout');
 assert.equal((await row()).payment_source,'apple_iap');
 assert.equal((await event('checkout.session.completed',checkoutEvent(),{id:conflictId})).outcome,'pending_checkout');
 checks.push('paid TEST checkout conflict remains durable and replayable while Apple grace is protected');
 const recover=()=>{
  const result=spawnSync('node',['scripts/reconcile-pending-checkouts.mjs','--apply'],{encoding:'utf8'});
  assert.equal(result.status,0,'Operator TEST recovery tool');return JSON.parse(result.stdout.trim());
 };
 const waiting=recover();assert.equal(waiting.pendingBefore,1);assert.equal(waiting.results.pending_checkout,1);assert.equal(waiting.providerMutations,0);
 await admin.from('subscriptions').update({status:'expired',grace_period_end:null}).eq('user_id',uid).throwOnError();
 const recovered=recover();assert.equal(recovered.pendingBefore,1);assert.equal(recovered.results.applied,1);assert.equal(recovered.providerMutations,0);
 checks.push('operator recovery rereads real TEST provider and applies only after conflict ends');
 await event('invoice.paid',{customer,parent:{subscription_details:{subscription:sub.id}}});
 assert.equal((await row()).payment_source,'stripe');
 assert.equal((await event('checkout.session.completed',checkoutEvent(),{id:conflictId})).duplicate,true);
 const pending=await admin.rpc('pending_stripe_checkouts',{p_environment:'test',p_user_id:uid});if(pending.error)throw pending.error;
 assert.equal(pending.data.length,0);
 checks.push('later authoritative invoice recovers paid conflict and resolves checkout deduplication');
 assert.equal((await row()).stripe_subscription_id,sub.id);
 await event('customer.subscription.deleted',{id:old,customer});
 await event('invoice.paid',{customer,parent:{subscription_details:{subscription:old}}});
 assert.equal((await row()).stripe_subscription_id,sub.id);assert.equal((await row()).status,'active');
 checks.push('old subscription deletion and old invoice preserve new paid entitlement');
 await event('checkout.session.completed',{...checkoutEvent(),metadata:{user_id:randomUUID()}},{expected:500});
 checks.push('identity processing error remains retryable');
 const awaiting=await stripe('subscriptions','POST',{customer,'items[0][price]':process.env.STRIPE_MONTHLY_PRICE_ID,
  payment_behavior:'default_incomplete','metadata[user_id]':uid,'metadata[plan]':'monthly'});
 subscriptions.push(awaiting.id);assert.equal(awaiting.status,'incomplete');
 const awaitingId=`${marker}-awaiting-payment`;
 assert.equal((await event('checkout.session.completed',{mode:'subscription',subscription:awaiting.id,customer,
  metadata:{user_id:uid,plan:'monthly'}},{id:awaitingId})).outcome,'pending_checkout');
 await stripe(`subscriptions/${sub.id}`,'DELETE');
 await event('customer.subscription.deleted',{id:sub.id,customer});
 assert.equal((await event('invoice.payment_failed',{customer,parent:{subscription_details:{subscription:awaiting.id}}})).outcome,'pending_checkout');
 const payment=await stripe(`invoices/${awaiting.latest_invoice}/pay`,'POST',{payment_method:pm.id});
 assert.equal(payment.status,'paid');assert.equal(payment.amount_paid,300);
 await event('invoice.paid',{customer,parent:{subscription_details:{subscription:awaiting.id}}});
 assert.equal((await row()).stripe_subscription_id,awaiting.id);assert.equal((await row()).status,'active');
 assert.equal((await event('checkout.session.completed',{mode:'subscription',subscription:awaiting.id,customer,
  metadata:{user_id:uid,plan:'monthly'}},{id:awaitingId})).duplicate,true);
 checks.push('real TEST incomplete subscription stays pending and recovers after its invoice is paid');
 console.log(JSON.stringify({passed:checks.length,checks,livePayments:0,paidTestInvoices:3,hostedCheckoutCompletion:false},null,2));
} finally {
 // Keep a resumable private cleanup receipt even if a provider request fails.
 writeFileSync('.migration-private/stripe-repair-fixture.json',JSON.stringify({uid,customer,subscriptions,sessions,marker}),{mode:0o600});
 for(const id of subscriptions){const s=await stripe(`subscriptions/${id}`);if(s.status!=='canceled')await stripe(`subscriptions/${id}`,'DELETE');}
 if(customer)await stripe(`customers/${customer}`,'DELETE');
 if(uid){const deleted=await admin.auth.admin.deleteUser(uid);if(deleted.error)throw deleted.error;}
 const clean=spawnSync('.migration-private/data-import-venv/bin/python',['-c',`
from pathlib import Path
import psycopg,sys,json
v={}
for line in Path('.env.local').read_text().splitlines():
 k,s,x=line.partition('=')
 if s and k in {'SUPABASE_PROJECT_REF','SUPABASE_DB_PASSWORD'}:v[k]=x.strip().strip('"\\\'')
assert v['SUPABASE_PROJECT_REF']=='zzoeywmurqiqticikyaf'
u=Path('supabase/.temp/pooler-url').read_text().strip();assert v['SUPABASE_PROJECT_REF'] in u
with psycopg.connect(u,password=v['SUPABASE_DB_PASSWORD']) as c:
 c.execute("delete from private.billing_events where provider='stripe' and environment='test' and identity=any(%s)",(json.loads(sys.argv[2]),))
 c.execute("delete from private.billing_provider_state where provider='stripe' and environment='test' and user_id is null and identity=any(%s)",(json.loads(sys.argv[2]),))
 if sys.argv[1]:
  c.execute('delete from public.deleted_records_recovery where user_id=%s',(sys.argv[1],))
  c.execute('delete from public.audit_log where user_id=%s',(sys.argv[1],))
`,uid??'',JSON.stringify(subscriptions)],{encoding:'utf8'});
 if(clean.status!==0)throw Error('Stripe fixture cleanup failed');
 const after=(await admin.from('subscriptions').select('user_id',{head:true,count:'exact'}).throwOnError()).count;assert.equal(after,before);
 writeFileSync('.migration-private/stripe-repair-fixture.json',JSON.stringify({uid,customer,subscriptions,sessions,marker,cleaned:true}),{mode:0o600});
 console.log('Disposable Stripe customer/subscriptions/Auth fixtures removed; subscription count restored');
}
