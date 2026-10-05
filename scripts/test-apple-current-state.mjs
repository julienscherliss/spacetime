// Read-only real Apple server reconciliation of the cleaned Sandbox purchase.
import {readFileSync,writeFileSync,rmSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import assert from 'node:assert/strict';
process.loadEnvFile('.env.local');
assert.equal(process.env.SUPABASE_PROJECT_REF,'zzoeywmurqiqticikyaf');
const file='.migration-private/apple-current-state-input.json';
const source='.migration-private/apple-current-state-run.ts';
try {
  const fixture=JSON.parse(readFileSync('.migration-private/ios-purchase-fixture.json'));
  assert.equal(fixture.cleaned,true);
  const identity=fixture.restoreVerifiedSubscription.apple_original_transaction_id;
  assert.ok(identity);
  const env=Object.fromEntries(['APPLE_BUNDLE_ID','APPLE_PRIVATE_KEY','APPLE_KEY_ID','APPLE_ISSUER_ID','APPLE_BILLING_ENVIRONMENT'].map(key=>[key,process.env[key]]));
  writeFileSync(file,JSON.stringify({identity,env}),{mode:0o600});
  writeFileSync(source,`
import { currentAppleSnapshot } from '../supabase/functions/_shared/appleBilling.ts';
const {identity,env}=JSON.parse(Deno.readTextFileSync('${file}'));
for(const [key,value] of Object.entries(env))Deno.env.set(key,value as string);
const snapshot=await currentAppleSnapshot(identity,'Sandbox',null);
console.log(JSON.stringify({verifiedCurrentState:true,status:snapshot.status,finiteExpiry:Boolean(snapshot.period_end),signedVersion:Boolean(snapshot.signed_date),mutations:false}));
`,{mode:0o600});
  const out=execFileSync('npm',['exec','--yes','--package=deno@2.9.6','--','deno','run','--no-lock','--node-modules-dir=none','--allow-env','--allow-read','--allow-net',source],{stdio:['ignore','pipe','pipe']});
  console.log(out.toString().trim());
} catch { console.error('Real Apple current-state check failed; provider details withheld');process.exitCode=1; }
finally {rmSync(file,{force:true});rmSync(source,{force:true});}
