// Execute actual handlers/shared reconciliation against the actual owned DB RPCs.
// Provider signatures/API responses are test doubles for already-verified current
// state. Cryptography has a separate authentic-Apple test. Requires --database;
// creates/cleans one disposable Auth fixture, never uses an imported account.
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import { spawnSync } from 'node:child_process';
if (!process.argv.includes('--database')) {
  console.log('Run --database to use the owned backend and a disposable fixture; provider calls are mocked.');
  process.exit(0);
}
process.loadEnvFile('.env.local');
assert.equal(process.env.SUPABASE_PROJECT_REF,'zzoeywmurqiqticikyaf');
const admin=createClient(process.env.SUPABASE_URL,process.env.SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false,autoRefreshToken:false}});
const prefix=`billing-review-${randomUUID()}`;
const result=await admin.auth.admin.createUser({email:`${prefix}@migration.invalid`,email_confirm:true});
if(result.error) throw result.error;
const user=result.data.user;
const identity=`${prefix}-new`,oldIdentity=`${prefix}-old`,customer=`${prefix}-customer`,apple=`${prefix}-apple`;
let currentStripe,currentApple;
const future=Date.now()+86400000;
const transaction=(patch={})=>({originalTransactionId:apple,transactionId:`${prefix}-tx`,productId:'spacetime_monthly',
  bundleId:'com.spacetimelabs.spacetime',environment:'Sandbox',expiresDate:future,purchaseDate:Date.now()-10000,signedDate:Date.now(),...patch});
const subscription=(patch={})=>({id:identity,customer,livemode:false,status:'active',metadata:{user_id:user.id},items:{data:[{
  quantity:1,price:{id:process.env.STRIPE_MONTHLY_PRICE_ID,livemode:false,currency:'usd',type:'recurring',unit_amount:300,recurring:{interval:'month',interval_count:1}},
  current_period_start:Math.floor(Date.now()/1000)-10,current_period_end:Math.floor(future/1000)}]},...patch});
function handler(name) {
  let serve;
  class Stripe {
    webhooks={constructEventAsync:async body=>JSON.parse(body)};
    subscriptions={retrieve:async id=>({...currentStripe,id})};
  }
  class AppStoreServerAPIClient { async getAllSubscriptionStatuses() { return {
    bundleId:'com.spacetimelabs.spacetime',environment:'Sandbox',data:[{lastTransactions:[{originalTransactionId:apple,
      status:currentApple.revocationDate?5:1,signedTransactionInfo:JSON.stringify(currentApple),
      signedRenewalInfo:JSON.stringify({originalTransactionId:apple,environment:'Sandbox',signedDate:currentApple.signedDate,autoRenewStatus:1})}]}]}; } }
  class AppleJwsError extends Error {}
  const source=['_shared/billing.ts','_shared/stripeBilling.ts','_shared/appleBilling.ts',`${name}/index.ts`]
    .map(file=>readFileSync(new URL(`../supabase/functions/${file}`,import.meta.url),'utf8')
    .replace(/^import[\s\S]*?from\s+["'][^"']+["'];?\s*/gm,'').replace(/^export /gm,'')).join('\n');
  const context={Request,Response,Date,Math,Map,Set,crypto:{randomUUID},console:{log(){},error(){},warn(){}},Stripe,AppStoreServerAPIClient,
    AbortSignal, SignJWT: class {
      setProtectedHeader(){return this;} setIssuer(){return this;} setAudience(){return this;}
      setIssuedAt(){return this;} setExpirationTime(){return this;} async sign(){return 'fixture';}
    }, importPKCS8:async()=>null,
    fetch:async()=>Response.json({bundleId:'com.spacetimelabs.spacetime',environment:'Sandbox',data:[{lastTransactions:[{
      originalTransactionId:apple,status:currentApple.revocationDate?5:1,signedTransactionInfo:JSON.stringify(currentApple),
      signedRenewalInfo:JSON.stringify({originalTransactionId:apple,environment:'Sandbox',signedDate:currentApple.signedDate,autoRenewStatus:1})}]}]}),
    Environment:{SANDBOX:'Sandbox',PRODUCTION:'Production'},
    APPLE_BUNDLE_ID:'com.spacetimelabs.spacetime',AppleJwsError,
    verifyAppleJws:async jws=>JSON.parse(jws),assertBundleId:v=>assert.equal(v,'com.spacetimelabs.spacetime'),
    assertEnvironment:v=>{assert.equal(v,'Sandbox');return v;},assertProductId:v=>{assert.equal(v,'spacetime_monthly');return 'monthly';},
    createClient:()=>({rpc:(...args)=>admin.rpc(...args),from:(...args)=>admin.from(...args),
      auth:{getUser:async()=>({data:{user},error:null})}}),
    Deno:{serve:fn=>serve=fn,env:{get:key=>['STRIPE_SECRET_KEY','APPLE_PRIVATE_KEY','APPLE_KEY_ID','APPLE_ISSUER_ID'].includes(key)
      ? 'fixture-key-never-used-for-network' : process.env[key] ?? 'fixture'}},
  };
  vm.runInNewContext(ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.None}}).outputText,context);
  return async body=>{
    const response=await serve(new Request('https://fixture.invalid',{method:'POST',headers:{authorization:'Bearer fixture','stripe-signature':'fixture'},body:JSON.stringify(body)}));
    assert.equal(response.status,200,`${name} HTTP ${response.status}`);
    return response.json();
  };
}
const state=async()=> (await admin.from('subscriptions').select('*').eq('user_id',user.id).single().throwOnError()).data;
const event=(type,id,obj)=>({id:`${prefix}-${id}`,type,created:100,livemode:false,data:{object:obj}});
const findings=[];
try {
  await admin.from('subscriptions').update({payment_source:'stripe',stripe_customer_id:customer,stripe_subscription_id:identity,status:'active',current_period_end:new Date(future).toISOString()}).eq('user_id',user.id).throwOnError();
  const stripe=handler('stripe-webhook');
  currentStripe=subscription({status:'canceled'});
  await stripe(event('customer.subscription.deleted','delete',{id:identity,customer}));
  await stripe(event('customer.subscription.updated','older-update',{id:identity,customer,status:'active'}));
  assert.equal((await state()).status,'cancelled');findings.push('Older Stripe active event reconciles authoritative cancellation');
  await admin.from('subscriptions').update({status:'active'}).eq('user_id',user.id).throwOnError();
  await stripe(event('customer.subscription.deleted','old-sub-delete',{id:oldIdentity,customer}));
  assert.equal((await state()).status,'active');findings.push('Older Stripe subscription deletion preserves newer subscription');
  await admin.from('subscriptions').update({payment_source:'apple_iap',apple_original_transaction_id:apple,apple_environment:'Sandbox',billing_environment:'Sandbox',status:'active'}).eq('user_id',user.id).throwOnError();
  currentApple=transaction({revocationDate:Date.now()});
  const notification=handler('apple-iap-notifications');
  const notify=(type,id,tx)=>({signedPayload:JSON.stringify({notificationType:type,notificationUUID:`${prefix}-${id}`,signedDate:Date.now(),
    data:{bundleId:tx.bundleId,environment:'Sandbox',signedTransactionInfo:JSON.stringify(tx)}})});
  await notification(notify('REFUND','refund',currentApple));
  await notification(notify('DID_RENEW','older-renew',transaction({signedDate:Date.now()-1000})));
  assert.equal((await state()).status,'expired');findings.push('Older Apple renewal reconciles authoritative refund');
  // Even an API snapshot missing the already-recorded revocation cannot undo it.
  currentApple=transaction();
  const verify=handler('apple-iap-verify');
  const restored=await verify({signedTransaction:JSON.stringify(transaction({signedDate:Date.now()-2000}))});
  assert.equal(restored.status,'expired');assert.equal((await state()).status,'expired');findings.push('Pre-refund receipt replay remains revoked after current provider lookup');
  console.log(JSON.stringify({passed:findings.length,findings,scope:'actual handlers + owned atomic RPC; provider API/signature doubles; disposable fixture'},null,2));
} finally {
  // Avoid retaining disposable ledger identifiers or recovery/audit records.
  const cleanup=spawnSync('.migration-private/data-import-venv/bin/python',['-c',`
from pathlib import Path
from urllib.parse import urlsplit
import sys,psycopg
values={}
for line in Path('.env.local').read_text().splitlines():
 k,s,v=line.partition('=')
 if s and k in {'SUPABASE_PROJECT_REF','SUPABASE_DB_PASSWORD'}:values[k]=v.strip().strip('"\\\'')
assert values['SUPABASE_PROJECT_REF']=='zzoeywmurqiqticikyaf'
u=Path('supabase/.temp/pooler-url').read_text().strip();assert values['SUPABASE_PROJECT_REF'] in urlsplit(u).username
with psycopg.connect(u,password=values['SUPABASE_DB_PASSWORD']) as c:
 c.execute("delete from private.billing_events where event_id like %s or (provider='apple_iap' and identity=%s and event_id like 'verify:%%')",(sys.argv[1]+'-%',sys.argv[1]+'-apple'))
 c.execute('delete from private.apple_revoked_transactions where original_transaction_id=%s',(sys.argv[1]+'-apple',))
 c.execute('delete from private.billing_provider_state where identity like %s',(sys.argv[1]+'-%',))
`,prefix],{encoding:'utf8'});
  if(cleanup.status!==0) throw Error('Fixture ledger cleanup failed; private fixture must be preserved');
  const deleted=await admin.auth.admin.deleteUser(user.id);if(deleted.error) throw deleted.error;
  const recovery=spawnSync('.migration-private/data-import-venv/bin/python',['-c',`
from pathlib import Path
import sys,psycopg
v={}
for line in Path('.env.local').read_text().splitlines():
 k,s,x=line.partition('=')
 if s and k in {'SUPABASE_PROJECT_REF','SUPABASE_DB_PASSWORD'}:v[k]=x.strip().strip('"\\\'')
assert v['SUPABASE_PROJECT_REF']=='zzoeywmurqiqticikyaf'
u=Path('supabase/.temp/pooler-url').read_text().strip();assert v['SUPABASE_PROJECT_REF'] in u
with psycopg.connect(u,password=v['SUPABASE_DB_PASSWORD']) as c:
 c.execute('delete from public.deleted_records_recovery where user_id=%s',(sys.argv[1],))
 c.execute('delete from public.audit_log where user_id=%s',(sys.argv[1],))
`,user.id],{encoding:'utf8'});
  if(recovery.status!==0) throw Error('Disposable recovery/audit cleanup failed');
  assert.equal((await admin.from('subscriptions').select('id').eq('user_id',user.id).throwOnError()).data.length,0);
  console.log('Disposable Auth fixture and billing state removed');
}
