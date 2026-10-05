// Real Apple signed transaction/current-state validation on the deployed owned
// verifier. Uses only the already-cleaned Sandbox purchase and disposable users.
import {readFileSync,writeFileSync,rmSync} from 'node:fs';
import {execFileSync,spawnSync} from 'node:child_process';
import {randomBytes} from 'node:crypto';
import {createClient} from '@supabase/supabase-js';
import assert from 'node:assert/strict';
process.loadEnvFile('.env.local');
assert.equal(process.env.SUPABASE_PROJECT_REF,'zzoeywmurqiqticikyaf');
const admin=createClient(process.env.SUPABASE_URL,process.env.SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false,autoRefreshToken:false}});
const anon=()=>createClient(process.env.SUPABASE_URL,process.env.SUPABASE_ANON_KEY,{auth:{persistSession:false,autoRefreshToken:false}});
const fixture=JSON.parse(readFileSync('.migration-private/ios-purchase-fixture.json'));
assert.equal(fixture.cleaned,true);
const identity=fixture.restoreVerifiedSubscription.apple_original_transaction_id;
assert.ok(identity);
const rows=await admin.from('subscriptions').select('id').eq('apple_original_transaction_id',identity).throwOnError();assert.equal(rows.data.length,0);
const owner=await admin.rpc('billing_owner',{p_provider:'apple_iap',p_environment:'Sandbox',p_identity:identity});assert.equal(owner.error,null);assert.equal(owner.data,null);
const input='.migration-private/apple-deployed-input.json',run='.migration-private/apple-deployed-run.ts',txFile='.migration-private/apple-deployed-transaction.json';
const users=[];
try {
  const env=Object.fromEntries(['APPLE_BUNDLE_ID','APPLE_PRIVATE_KEY','APPLE_KEY_ID','APPLE_ISSUER_ID','APPLE_BILLING_ENVIRONMENT'].map(key=>[key,process.env[key]]));
  writeFileSync(input,JSON.stringify({identity,env}),{mode:0o600});
  writeFileSync(run,`
import { AppStoreServerAPIClient,Environment } from 'npm:@apple/app-store-server-library@3.1.0';
const {identity,env}=JSON.parse(Deno.readTextFileSync('${input}'));
const c=new AppStoreServerAPIClient(env.APPLE_PRIVATE_KEY,env.APPLE_KEY_ID,env.APPLE_ISSUER_ID,env.APPLE_BUNDLE_ID,Environment.SANDBOX);
const r=await c.getAllSubscriptionStatuses(identity);
const t=r.data?.flatMap(v=>v.lastTransactions??[]).find(v=>v.originalTransactionId===identity)?.signedTransactionInfo;
if(!t)throw Error('Current transaction unavailable');
Deno.writeTextFileSync('${txFile}',JSON.stringify({signedTransaction:t}),{mode:0o600});
`,{mode:0o600});
  execFileSync('npm',['exec','--yes','--package=deno@2.9.6','--','deno','run','--no-lock','--node-modules-dir=none','--allow-env','--allow-read','--allow-write','--allow-net',run],{stdio:['ignore','pipe','pipe']});
  const body=readFileSync(txFile,'utf8');
  async function account() {
    const email=`apple-deploy-${randomBytes(8).toString('hex')}@migration.invalid`,password=randomBytes(24).toString('base64url');
    const {data,error}=await admin.auth.admin.createUser({email,password,email_confirm:true});if(error)throw error;
    users.push(data.user.id);
    const client=anon();const login=await client.auth.signInWithPassword({email,password});if(login.error)throw login.error;
    return login.data.session.access_token;
  }
  const token=await account();
  const request=token=>fetch(process.env.SUPABASE_URL+'/functions/v1/apple-iap-verify',{method:'POST',
    headers:{'Content-Type':'application/json',...(token?{Authorization:'Bearer '+token}:{})},body});
  assert.equal((await request(null)).status,401);
  const verified=await request(token);const response=await verified.json();
  assert.equal(verified.status,200,`Hosted Apple verification HTTP ${verified.status}, code ${response.code??'unavailable'}`);
  assert.equal(response.ok,true);
  const sub=await admin.from('subscriptions').select('payment_source,apple_original_transaction_id,current_period_end,status').eq('user_id',users[0]).single().throwOnError();
  if(response.status==='active'||response.status==='cancelling'){
    assert.equal(sub.data.payment_source,'apple_iap');assert.equal(sub.data.apple_original_transaction_id,identity);
    const second=await account();assert.equal((await request(second)).status,409);
  }
  assert.ok(response.expiresAt);
  console.log(JSON.stringify({deployedAuthenticAppleVerification:true,status:response.status,finiteExpiry:true,unauthenticatedRejected:true,
    ownershipConflictChecked:['active','cancelling'].includes(response.status),realPurchasesCreated:0}));
} finally {
  rmSync(input,{force:true});rmSync(run,{force:true});rmSync(txFile,{force:true});
  for(const uid of users){const result=await admin.auth.admin.deleteUser(uid);if(result.error)throw result.error;}
  const cleanup=spawnSync('.migration-private/data-import-venv/bin/python',['-c',`
from pathlib import Path
import psycopg,sys,json
v={}
for line in Path('.env.local').read_text().splitlines():
 k,s,x=line.partition('=')
 if s and k in {'SUPABASE_PROJECT_REF','SUPABASE_DB_PASSWORD'}:v[k]=x.strip().strip('"\\\'')
assert v['SUPABASE_PROJECT_REF']=='zzoeywmurqiqticikyaf'
u=Path('supabase/.temp/pooler-url').read_text().strip();assert v['SUPABASE_PROJECT_REF'] in u
with psycopg.connect(u,password=v['SUPABASE_DB_PASSWORD']) as c:
 c.execute("delete from private.billing_events where provider='apple_iap' and environment='Sandbox' and identity=%s and event_id like 'verify:%%'",(sys.argv[1],))
 for uid in json.loads(sys.argv[2]):
  c.execute('delete from public.deleted_records_recovery where user_id=%s',(uid,))
  c.execute('delete from public.audit_log where user_id=%s',(uid,))
`,identity,JSON.stringify(users)],{encoding:'utf8'});
  if(cleanup.status!==0)throw Error('Apple fixture cleanup failed');
  console.log('Disposable Apple verification fixtures removed');
}
