// Operator recovery: default is a count-only dry run. --apply rereads Stripe TEST
// state and retries durable claims; it never creates/cancels/refunds payments.
import {spawnSync} from 'node:child_process';
import {writeFileSync,unlinkSync} from 'node:fs';
import assert from 'node:assert/strict';
process.loadEnvFile('.env.local');
assert.equal(process.env.SUPABASE_PROJECT_REF,'zzoeywmurqiqticikyaf');
assert.equal(process.env.SUPABASE_URL,'https://zzoeywmurqiqticikyaf.supabase.co');
assert.ok(process.env.STRIPE_SECRET_KEY?.startsWith('sk_test_'),'This rehearsal recovery tool accepts Stripe TEST only');
const script=new URL('../.migration-private/reconcile-pending-checkouts.ts',import.meta.url);
writeFileSync(script,`
import {billingAdmin} from '../supabase/functions/_shared/billing.ts';
import {stripeClient,stripeMode} from '../supabase/functions/_shared/stripeBilling.ts';
import {recoverPendingStripeCheckouts} from '../supabase/functions/_shared/stripeCheckout.ts';
const {data,error}=await billingAdmin().rpc('pending_stripe_checkouts',{p_environment:stripeMode(),p_user_id:null});
if(error) throw new Error('Unable to read pending checkout claims');
let outcomes:string[]=[];
if(Deno.args.includes('--apply')) outcomes=await recoverPendingStripeCheckouts(stripeClient());
console.log(JSON.stringify({mode:Deno.args.includes('--apply')?'reconcile':'dry-run',pendingBefore:data.length,
  results:outcomes.reduce((totals:Record<string,number>,outcome:string)=>{totals[outcome]=(totals[outcome]??0)+1;return totals;},{}),
  providerMutations:0}));
`,{mode:0o600});
try {
  const result=spawnSync('npm',['exec','--yes','--package=deno@2.9.6','--','deno','run','--no-lock','--node-modules-dir=none',
    '--allow-env','--allow-net',script.pathname,...(process.argv.includes('--apply')?['--apply']:[])],{encoding:'utf8'});
  if(result.status!==0) throw new Error('Pending checkout recovery failed; no provider mutation was requested');
  console.log(result.stdout.trim());
} finally {unlinkSync(script);}
