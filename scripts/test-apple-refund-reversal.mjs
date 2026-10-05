// Actual Apple snapshot helper with local signed-payload/provider doubles.
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import assert from 'node:assert/strict';
const source=readFileSync('supabase/functions/_shared/appleBilling.ts','utf8')
  .replace(/^import[^\n]*\n/gm,'').replace(/^export /gm,'');
const checks=[];
function fixture(change={}) {
  const tx={originalTransactionId:'chain',transactionId:'tx',productId:'monthly',bundleId:'app',environment:'Sandbox',
    signedDate:500,expiresDate:Date.now()+60000,purchaseDate:Date.now()-60000,appAccountToken:'owner',...change};
  const calls=[];
  class SignJWT {setProtectedHeader(){return this;}setIssuer(){return this;}setAudience(){return this;}
    setIssuedAt(){return this;}setExpirationTime(){return this;}async sign(){return 'fixture';}}
  class AppleJwsError extends Error {}
  const context={SignJWT,AppleJwsError,Date,Number,Math,Boolean,AbortSignal,encodeURIComponent,
    importPKCS8:async()=>({}),isoMillis:n=>n?new Date(n).toISOString():null,
    assertBundleId:b=>assert.equal(b,'app'),assertProductId:p=>{assert.equal(p,'monthly');return 'monthly';},
    Deno:{env:{get:name=>({APPLE_PRIVATE_KEY:'fixture',APPLE_KEY_ID:'fixture',APPLE_ISSUER_ID:'fixture',APPLE_BUNDLE_ID:'app'}[name])}},
    verifyAppleJws:async(payload,kind,environment)=>{
      assert.equal(environment,'Sandbox');calls.push('verify-'+kind);
      if(change.invalidSignature)throw new AppleJwsError('invalid signature');
      return payload==='renewal'?{originalTransactionId:'chain',environment:'Sandbox',signedDate:600,autoRenewStatus:1}:tx;
    },fetch:async(url,options)=>{
      calls.push(url);assert.equal(options.headers.Authorization,'Bearer fixture');
      assert.equal(options.method,'GET');assert.equal(options.redirect,'error');
      if(change.providerUnavailable)return {ok:false,status:503};
      if(url.endsWith('/transactions/tx'))return {ok:true,json:async()=>({signedTransactionInfo:'transaction'})};
      assert.ok(url.endsWith('/subscriptions/chain'));
      return {ok:true,json:async()=>({bundleId:'app',environment:'Sandbox',data:[{lastTransactions:[{
        originalTransactionId:'chain',status:change.currentRevoked?5:1,signedTransactionInfo:'transaction',signedRenewalInfo:'renewal'}]}]})};
    }};
  vm.runInNewContext(ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.None}}).outputText,context);
  return {context,calls,tx};
}
const f=fixture();const reversed=await f.context.refundReversalSnapshot('chain','Sandbox','owner','tx','event',200);
assert.equal(reversed.status,'active');assert.equal(reversed.refund_reversal.event_id,'event');
assert.equal(reversed.refund_reversal.transaction_signed_date,500);assert.equal(f.calls.filter(x=>x.startsWith('https')).length,2);
checks.push('reversal requires fresh verified transaction and current subscription reads');
for(const mutation of [{revocationDate:100},{transactionId:'other'},{originalTransactionId:'other'},
  {environment:'Production'},{signedDate:100},{appAccountToken:'other'},{invalidSignature:true},
  {currentRevoked:true},{providerUnavailable:true}]){
  const g=fixture(mutation);
  await assert.rejects(g.context.refundReversalSnapshot('chain','Sandbox','owner','tx','event',200));
}
checks.push('revoked/wrong identity/environment/owner/old signature/provider failure refuses recovery');
const current=await f.context.currentAppleSnapshot('chain','Sandbox','owner','tx',{event_id:'old',signed_date:100});
assert.equal(current.status,'active');assert.equal(current.revoked_transaction,'tx');assert.equal(current.revocation_event.signed_date,100);
checks.push('explicit refund ordering is left to durable ledger while current provider facts are preserved');
const expired=fixture({expiresDate:Date.now()-60000});
assert.equal((await expired.context.refundReversalSnapshot('chain','Sandbox','owner','tx','event',200)).status,'expired');
checks.push('reversal does not extend an expired paid period');
const handlerSource=readFileSync('supabase/functions/apple-iap-notifications/index.ts','utf8').replace(/^import[^\n]*\n/gm,'');
for(const invalidSignature of [false,true]){
  let handler,called=0;
  class AppleJwsError extends Error {}
  const tx=f.tx,notification={notificationType:'REFUND_REVERSED',notificationUUID:'signed-event',signedDate:200,
    data:{bundleId:'app',environment:'Sandbox',signedTransactionInfo:'tx'}};
  const context={Request,Response,AppleJwsError,console:{error(){}},
    Deno:{serve:fn=>{handler=fn;}},assertBundleId:b=>assert.equal(b,'app'),assertEnvironment:e=>e,
    assertProductId:p=>p,assertAppleRelationship:f.context.assertAppleRelationship,
    verifyAppleJws:async(value,kind)=>{
      if(invalidSignature)throw new AppleJwsError('invalid signature');
      return kind==='notification'?notification:tx;
    },billingAdmin:()=>({from:()=>({select:()=>({eq:()=>({maybeSingle:async()=>({data:{user_id:'owner'},error:null})})})}),
      rpc:async()=>({data:'owner',error:null})}),
    reconcileBilling:async(context,get)=>{called++;assert.equal(context.p_event_id,'signed-event:refund-reversal-v2');
      await get();return {outcome:'applied'};},
    refundReversalSnapshot:async(...args)=>{assert.deepEqual(args,['chain','Sandbox','owner','tx','signed-event:refund-reversal-v2',200]);return {};}};
  vm.runInNewContext(ts.transpileModule(handlerSource,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.None}}).outputText,context);
  const response=await handler(new Request('https://owned.invalid',{method:'POST',body:JSON.stringify({signedPayload:'fixture'})}));
  assert.equal(response.status,invalidSignature?400:200);assert.equal(called,invalidSignature?0:1);
}
checks.push('actual notification handler verifies payload and binds versioned reversal event; invalid signature cannot reconcile');
console.log(JSON.stringify({passed:checks.length,checks,provider_requests:0,database_mutations:0}));
