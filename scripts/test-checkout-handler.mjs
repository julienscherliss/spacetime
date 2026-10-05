// Actual Checkout handler/helpers with local transport doubles. No credentials,
// database or provider requests. SQL and deployed-provider tests cover integration.
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
const source=['_shared/billing.ts','_shared/stripeBilling.ts','_shared/stripeCheckout.ts','stripe-checkout/index.ts']
  .map(file=>readFileSync(`supabase/functions/${file}`,'utf8').replace(/^import[\s\S]*?from\s+["'][^"']+["'];?\s*/gm,'').replace(/^export /gm,'')).join('\n');
function fixture() {
  const user={id:randomUUID(),email:'checkout@migration.invalid'},future=new Date(Date.now()+86400000).toISOString();
  const state={sub:{user_id:user.id,payment_source:null,status:'trialing',trial_end:future,current_period_end:null,lifetime_access:false,
    stripe_customer_id:'customer'},attempt:null,lease:null,sessions:new Map(),providerSubs:[],creates:0,expires:0,onCreate:null,failSave:false};
  const paid=()=>state.sub.lifetime_access || ['admin','promo'].includes(state.sub.payment_source)
    || (['stripe','apple_iap'].includes(state.sub.payment_source) && (state.sub.status==='trialing'
      ? Date.parse(state.sub.trial_end)>Date.now() : ['active','cancelling'].includes(state.sub.status)
        && Math.max(Date.parse(state.sub.current_period_end)||0,Date.parse(state.sub.grace_period_end)||0)>Date.now()));
  const query={select(){return this;},eq(){return this;},single:async()=>({data:state.sub,error:null})};
  const rpc=async(name,args)=>{
    if(name==='pending_stripe_checkouts')return {data:[],error:null};
    assert.equal(name,'manage_stripe_checkout');
    const {p_action:action,p_token:token,p_attempt:attempt}=args;
    if(action==='release'){if(state.lease===token)state.lease=null;return {data:{},error:null};}
    if(action==='reserve'){
      if(state.lease)return {data:{conflict:'busy'},error:null};
      if(paid())return {data:{conflict:'entitlement'},error:null};
      state.lease=token;return {data:{attempt:state.attempt,blocked:false},error:null};
    }
    if(state.lease!==token)return {data:{conflict:'lease'},error:null};
    if(state.failSave && attempt?.session_id){state.failSave=false;return {data:null,error:Error('fixture write failure')};}
    state.attempt=attempt;return {data:{attempt,blocked:paid()},error:null};
  };
  let serve;
  class Stripe {
    prices={retrieve:async id=>({id,active:true,livemode:false,currency:'usd',type:'recurring',unit_amount:id==='monthly'?300:2400,
      recurring:{interval:id==='monthly'?'month':'year',interval_count:1}})};
    customers={retrieve:async()=>({id:'customer',livemode:false,metadata:{user_id:user.id}})};
    subscriptions={list:()=>({async *[Symbol.asyncIterator](){yield* state.providerSubs;}})};
    checkout={sessions:{
      list:()=>({async *[Symbol.asyncIterator](){yield* state.sessions.values();}}),
      retrieve:async id=>state.sessions.get(id),
      create:async(params,options)=>{
        state.creates++;
        assert.equal(options.idempotencyKey,`spacetime-checkout-${params.metadata.checkout_attempt}`);
        const session={...params,id:'session-'+state.creates,customer:params.customer,livemode:false,status:'open',url:'https://checkout.stripe.com/fixture/'+state.creates};
        state.sessions.set(session.id,session);
        if(state.onCreate)await state.onCreate(session);
        return session;
      },
      expire:async id=>{
        state.expires++;const session=state.sessions.get(id);
        if(state.onExpire)await state.onExpire(session);
        if(session.status!=='open')throw Error('Session cannot expire');
        session.status='expired';return session;
      },
    }};
  }
  const context={Request,Response,Date,Math,Set,Stripe,crypto:{randomUUID},console:{error(){}},
    createClient:()=>({from:()=>query,rpc,auth:{getUser:async()=>({data:{user},error:null})}}),
    Deno:{serve:fn=>serve=fn,env:{get:key=>({STRIPE_SECRET_KEY:'sk_test_fixture',STRIPE_MONTHLY_PRICE_ID:'monthly',STRIPE_YEARLY_PRICE_ID:'yearly'}[key])}}};
  vm.runInNewContext(ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.None}}).outputText,context);
  const checkout=async(plan='monthly')=>{
    const response=await serve(new Request('https://fixture.invalid',{method:'POST',headers:{authorization:'Bearer fixture',origin:'http://localhost:5175',
      'content-type':'application/json'},body:JSON.stringify({plan})}));
    return {status:response.status,body:await response.json()};
  };
  return {state,checkout};
}
const checks=[];
{
  const {state,checkout}=fixture();Object.assign(state.sub,{payment_source:'apple_iap',status:'active',current_period_end:new Date(Date.now()-1000).toISOString(),grace_period_end:new Date(Date.now()+60000).toISOString()});
  assert.equal((await checkout()).status,409);assert.equal(state.creates,0);checks.push('Apple grace blocks session creation');
}
{
  const {state,checkout}=fixture();const first=await checkout(),second=await checkout();
  assert.equal(first.status,200);assert.equal(second.body.url,first.body.url);assert.equal(state.creates,1);
  checks.push('repeated request reuses one checkout URL');
  const changed=await checkout('yearly');assert.equal(changed.status,200);assert.notEqual(changed.body.url,first.body.url);
  assert.equal(state.expires,1);assert.equal([...state.sessions.values()].filter(s=>s.status==='open').length,1);
  checks.push('plan change confirms expiration before creating replacement');
  [...state.sessions.values()].find(s=>s.status==='open').status='expired';
  assert.equal((await checkout('yearly')).status,200);assert.equal(state.creates,3);
  checks.push('abandoned expired session can be replaced');
}
{
  const {state,checkout}=fixture();let entered,release;
  const started=new Promise(r=>entered=r),gate=new Promise(r=>release=r);
  state.onCreate=async()=>{entered();await gate;};
  const first=checkout();await started;assert.equal((await checkout()).status,409);release();assert.equal((await first).status,200);
  assert.equal(state.creates,1);checks.push('interleaved clicks create one session');
}
{
  const {state,checkout}=fixture();state.onCreate=async()=>{state.onCreate=null;throw Error('transport timeout after creation');};
  assert.equal((await checkout()).status,500);assert.equal((await checkout()).status,200);assert.equal(state.creates,1);
  checks.push('provider create timeout recovers existing attempt without duplicate');
}
{
  const {state,checkout}=fixture();state.failSave=true;
  assert.equal((await checkout()).status,500);assert.equal((await checkout()).status,200);assert.equal(state.creates,1);
  checks.push('database write failure after creation recovers same session');
}
{
  const {state,checkout}=fixture();state.onCreate=async()=>Object.assign(state.sub,{payment_source:'apple_iap',status:'active',current_period_end:null,grace_period_end:new Date(Date.now()+60000).toISOString()});
  assert.equal((await checkout()).status,409);assert.equal(state.expires,1);assert.equal([...state.sessions.values()][0].status,'expired');
  checks.push('entitlement race expires page before returning its URL');
}
{
  const {state,checkout}=fixture();await checkout();state.onExpire=async session=>{session.status='complete';};
  assert.equal((await checkout('yearly')).status,409);assert.equal(state.creates,1);
  checks.push('completion racing plan change prevents another payment page');
}
{
  const {state,checkout}=fixture();await checkout();state.providerSubs=[{status:'active'}];
  assert.equal((await checkout()).status,409);assert.equal(state.creates,1);assert.equal(state.expires,1);
  checks.push('provider contract blocks second payment even when app row is stale');
}
console.log(JSON.stringify({passed:checks.length,checks,scope:'actual Checkout handler/helpers with local doubles',providerMutations:0},null,2));
