// Crypto policy tests use a generated trust root only inside Apple's verifier.
// The application verifier still pins the actual Apple root. No production key.
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
const dir=mkdtempSync(resolve('.migration-private/apple-crypto-'));
const openssl=(...args)=>execFileSync('openssl',args,{cwd:dir,stdio:'ignore'});
try {
  const create=(name,issuer,oid,ca)=>{
    openssl('ecparam','-name','prime256v1','-genkey','-noout','-out',`${name}.key`);
    openssl('req','-new','-key',`${name}.key`,'-subj',`/CN=${name}`,'-out',`${name}.csr`);
    writeFileSync(`${dir}/${name}.ext`,`basicConstraints=critical,CA:${ca?'TRUE':'FALSE'}\n${oid}=DER:05:00\n`);
    if(!issuer) openssl('req','-x509','-key',`${name}.key`,'-in',`${name}.csr`,'-days','2','-out',`${name}.pem`);
    else openssl('x509','-req','-in',`${name}.csr`,'-CA',`${issuer}.pem`,'-CAkey',`${issuer}.key`,'-CAcreateserial','-days','2','-extfile',`${name}.ext`,'-out',`${name}.pem`);
    openssl('x509','-in',`${name}.pem`,'-outform','DER','-out',`${name}.der`);
  };
  create('root',null,'1.2.3.4',true);
  create('intermediate','root','1.2.840.113635.100.6.2.1',true);
  create('leaf','intermediate','1.2.840.113635.100.6.11.1',false);
  create('wrong-leaf','intermediate','1.2.3.4',false);
  create('wrong-intermediate','root','1.2.3.4',true);
  create('wrong-issuer-leaf','wrong-intermediate','1.2.840.113635.100.6.11.1',false);
  create('nonca','root','1.2.840.113635.100.6.2.1',false);
  create('nonca-leaf','nonca','1.2.840.113635.100.6.11.1',false);
  create('ca-leaf','intermediate','1.2.840.113635.100.6.11.1',true);
  writeFileSync(`${dir}/run.ts`, `
import assert from "node:assert/strict";
import { Buffer } from "node:buffer";
import { sign } from "node:crypto";
import { SignedDataVerifier,Environment } from "npm:@apple/app-store-server-library@3.1.0";
import { verifyAppleJws, EdgeSignedDataVerifier } from "${resolve('supabase/functions/_shared/appleJws.ts')}";
import { assertAppleRelationship } from "${resolve('supabase/functions/_shared/appleBilling.ts')}";
Deno.env.set('APPLE_BILLING_ENVIRONMENT','Sandbox');
const root=Deno.readFileSync('${dir}/root.der');
const verifier=new EdgeSignedDataVerifier([Buffer.from(root)],false,Environment.SANDBOX,'com.spacetimelabs.spacetime');
const payload={environment:'Sandbox',bundleId:'com.spacetimelabs.spacetime',signedDate:Date.now(),transactionId:'tx',originalTransactionId:'original',productId:'spacetime_monthly'};
const enc=(v:unknown)=>Buffer.from(JSON.stringify(v)).toString('base64url');
const token=(leaf='leaf',issuer='intermediate',patch={},alg='ES256')=>{
 const x5c=[leaf,issuer,'root'].map(v=>Buffer.from(Deno.readFileSync('${dir}/'+v+'.der')).toString('base64'));
 const input=enc({alg,x5c})+'.'+enc({...payload,...patch});
 return input+'.'+sign('sha256',Buffer.from(input),{key:Deno.readTextFileSync('${dir}/'+leaf+'.key'),dsaEncoding:'ieee-p1363'}).toString('base64url');
};
await verifier.verifyAndDecodeTransaction(token());
await assert.rejects(()=>verifier.verifyAndDecodeTransaction(token('wrong-leaf')));
await assert.rejects(()=>verifier.verifyAndDecodeTransaction(token('wrong-issuer-leaf','wrong-intermediate')));
await assert.rejects(()=>verifier.verifyAndDecodeTransaction(token('nonca-leaf','nonca')));
await assert.rejects(()=>verifier.verifyAndDecodeTransaction(token('ca-leaf')));
await assert.rejects(()=>verifier.verifyAndDecodeTransaction(token('leaf','wrong-intermediate')));
await assert.rejects(()=>verifier.verifyAndDecodeTransaction(token('leaf','intermediate',{},'HS256')));
const broken=token().split('.');broken[2]=(broken[2][0]==='A'?'B':'A')+broken[2].slice(1);
await assert.rejects(()=>verifier.verifyAndDecodeTransaction(broken.join('.')));
const prod=new EdgeSignedDataVerifier([Buffer.from(root)],false,Environment.PRODUCTION,'com.spacetimelabs.spacetime',6768721654);
await assert.rejects(()=>prod.verifyAndDecodeNotification(token('leaf','intermediate',{notificationType:'TEST',notificationUUID:'fixture',data:{environment:'Production',bundleId:'com.spacetimelabs.spacetime',appAppleId:123}})));
await assert.rejects(()=>verifier.verifyAndDecodeTransaction(token('leaf','intermediate',{signedDate:Date.now()-864000000})));
await assert.rejects(()=>verifier.verifyAndDecodeTransaction(token('leaf','intermediate',{signedDate:Date.now()+3*86400000})));
assertAppleRelationship(payload,{originalTransactionId:'original',environment:'Sandbox'},'original','Sandbox');
assert.throws(()=>assertAppleRelationship(payload,{originalTransactionId:'wrong',environment:'Sandbox'},'original','Sandbox'));
assert.throws(()=>assertAppleRelationship({...payload,environment:'Production'},null,'original','Sandbox'));
assert.throws(()=>assertAppleRelationship({...payload,productId:'wrong'},null,'original','Sandbox'));
await assert.rejects(()=>verifier.verifyAndDecodeTransaction(token('leaf','intermediate',{bundleId:'wrong.app'})));
await assert.rejects(()=>verifier.verifyAndDecodeTransaction(token('leaf','intermediate',{environment:'Production'})));
await assert.rejects(()=>verifyAppleJws(token(),'transaction'));
await assert.rejects(()=>verifyAppleJws(token('leaf','intermediate',{},'HS256'),'transaction'));
// Authentic Apple TEST demonstrates official-library compatibility and the real trust root.
const receipt=JSON.parse(Deno.readTextFileSync('${resolve('.migration-private/apple-notification-test.json')}'));
assert.ok(receipt.signedPayload);
await verifyAppleJws(receipt.signedPayload,'notification');
Deno.env.set('APPLE_BILLING_ENVIRONMENT','Production');
await assert.rejects(()=>verifyAppleJws(receipt.signedPayload,'notification'));
Deno.env.set('APPLE_BILLING_ENVIRONMENT','ProductionAndSandbox');
await verifyAppleJws(receipt.signedPayload,'notification');
await assert.rejects(()=>verifyAppleJws(token(),'transaction'));
console.log('23 Apple verifier checks passed: strict modes, explicit dual mode, signature/purpose/identity checks and authentic Apple TEST');
`);
  execFileSync('npm',['exec','--yes','--package=deno@2.9.6','--','deno','run','--no-lock','--node-modules-dir=none','--allow-env','--allow-read',`${dir}/run.ts`],{stdio:['ignore','pipe','pipe']});
  console.log('23 Apple verifier checks passed; authentic Apple TEST accepted; generated keys removed');
} catch (e) {
  // Test process output contains no real credentials, only assertions/dependency diagnostics.
  console.error(e.stderr?.toString().slice(-2500) ?? e.message); process.exitCode=1;
} finally {rmSync(dir,{recursive:true,force:true});}
