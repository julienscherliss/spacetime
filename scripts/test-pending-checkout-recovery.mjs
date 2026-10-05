// Actual operator policy plus existing reconcile/snapshot helpers. Transport
// doubles only; no keys, database, Stripe requests or payments.
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import assert from 'node:assert/strict';
import {webcrypto} from 'node:crypto';
const files = ['supabase/functions/_shared/billing.ts', 'supabase/functions/_shared/stripeBilling.ts',
  'scripts/pending-checkout-recovery.ts'];
const source = files.map(file => readFileSync(file, 'utf8')
  .replace(/^import[\s\S]*?from\s+["'][^"']+["'];?\s*/gm, '').replace(/^export /gm, '')).join('\n');
const checks = [];
function fixture(mode = 'test', count = 1) {
  const uid = '00000000-0000-4000-8000-000000000001', at = new Date().toISOString();
  const binding = {project: 'zzoeywmurqiqticikyaf', environment: mode, account: 'acct_fixture',
    monthly: 'price_month', yearly: 'price_year'};
  const state = {rows: Array.from({length: count}, (_, i) => ({environment: mode, identity: `sub_fixture${i}`,
    user_id: uid, customer_id: 'cus_fixture', event_id: `evt_fixture${i}`, reason: 'provider_conflict',
    created_at: at, updated_at: at})), calls: [], records: [], ticket: 0, retries: 0,
    account: {id: binding.account, object: 'account'}, customer: {id: 'cus_fixture', livemode: mode === 'live', metadata: {user_id: uid}},
    price: {id: 'price_month', livemode: mode === 'live', currency: 'usd', type: 'recurring', unit_amount: 300,
      recurring: {interval: 'month', interval_count: 1}}, outcome: 'applied'};
  const rpc = async (name, args) => {
    state.calls.push(name);
    if (name === 'begin_billing_reconcile') {
      if (state.onBegin) await state.onBegin();
      return {data: state.duplicate ? {duplicate: true} : state.conflict ? {conflict: true}
        : {revision: ++state.ticket, user_revision: state.ticket}, error: null};
    }
    assert.equal(name, 'commit_billing_reconcile');
    assert.equal(args.p_claim, true); assert.equal(args.p_environment, mode); assert.equal(args.p_user_id, uid);
    assert.equal(args.p_ticket.revision, state.ticket);
    if (state.retries-- > 0) return {data: {retry: true}, error: null};
    if (state.commitFailure) return {data: null, error: Error('private untrusted server message')};
    if (state.outcome === 'applied') state.rows = state.rows.filter(r => r.identity !== args.p_identity);
    return {data: {outcome: state.outcome}, error: null};
  };
  const context = {crypto: webcrypto, TextEncoder, structuredClone, Date, console,
    createClient: () => ({rpc}),
    Deno: {env: {get: name => ({STRIPE_SECRET_KEY: 'sk_' + mode + '_fixture',
      STRIPE_MONTHLY_PRICE_ID: binding.monthly, STRIPE_YEARLY_PRICE_ID: binding.yearly}[name])}}};
  vm.runInNewContext(ts.transpileModule(source, {compilerOptions: {target: ts.ScriptTarget.ES2022,
    module: ts.ModuleKind.None}}).outputText, context);
  const deps = {
    account: async () => {state.calls.push('account-GET'); return state.account;},
    claims: async () => {state.calls.push('pending-read'); return structuredClone(state.rows);},
    customer: async () => {state.calls.push('customer-GET'); return state.customer;},
    snapshot: async claim => context.currentStripeSnapshot({subscriptions: {retrieve: async identity => {
      state.calls.push('subscription-GET');
      if (state.onSubscription) await state.onSubscription();
      return {id: identity, customer: state.customer.id, livemode: mode === 'live', metadata: {user_id: uid},
        status: 'active', cancel_at_period_end: false, items: {data: [{quantity: 1, price: state.price,
          current_period_start: Math.floor(Date.now()/1000), current_period_end: Math.floor(Date.now()/1000) + 86400}]}};
    }}}, claim.identity, claim.customer_id, claim.user_id),
    reconcile: context.reconcileBilling,
    record: async entry => {
      if (state.recordFailure === entry.phase) throw Error('private disk failure');
      state.records.push(structuredClone(entry)); state.calls.push('journal-' + entry.phase);
    },
  };
  const prepare = () => context.prepareRecovery(binding, state.rows, state.rows.map(r => r.event_id));
  const apply = async (plan, hash) => context.applyRecovery(plan, binding, hash ?? await context.sha256(plan), deps);
  return {state, binding, context, deps, prepare, apply};
}
async function test(label, fn) {await fn(); checks.push(label);}
await test('selection is exact, sorted, immutable and account/mode-bound', async () => {
  const f = fixture('live', 2), before = JSON.stringify(f.state.rows);
  const plan = await f.context.prepareRecovery(f.binding, f.state.rows, ['evt_fixture1']);
  assert.equal(plan.claims.length, 1); assert.equal(plan.claims[0].event_id, 'evt_fixture1');
  assert.equal(JSON.stringify(f.state.rows), before);
  for (const ids of [[], ['evt_missing'], ['evt_fixture0','evt_fixture0']])
    await assert.rejects(f.context.prepareRecovery(f.binding, f.state.rows, ids));
});
for (const mode of ['test', 'live']) await test(`${mode} selected recovery uses current facts after revision and journals first`, async () => {
  const f = fixture(mode, 2), plan = await f.context.prepareRecovery(f.binding, f.state.rows, ['evt_fixture0']);
  assert.equal((await f.apply(plan)).completed, 1); assert.equal(f.state.rows.length, 1);
  assert.equal(f.state.rows[0].event_id, 'evt_fixture1');
  assert.ok(f.state.calls.indexOf('journal-attempt-started') < f.state.calls.indexOf('begin_billing_reconcile'));
  assert.ok(f.state.calls.indexOf('begin_billing_reconcile') < f.state.calls.indexOf('subscription-GET'));
  assert.deepEqual(f.state.records.map(r => r.phase), ['attempt-started', 'result']);
});
await test('edited plan or binding and stale approval refuse before any RPC write', async () => {
  for (const mutate of [p => p.claims[0].user_id = '00000000-0000-4000-8000-000000000002',
    p => p.binding.account = 'acct_other', p => p.binding.environment = 'live', p => p.binding.yearly = 'price_other',
    p => p.format = 2, p => p.extra = true]) {
    const f = fixture(), plan = await f.prepare(), hash = await f.context.sha256(plan); mutate(plan);
    await assert.rejects(f.apply(plan, hash)); assert.equal(f.state.calls.length, 0);
  }
});
await test('actual account mismatch rejects before claim reconciliation', async () => {
  const f = fixture(), plan = await f.prepare(); f.state.account.id = 'acct_wrong';
  await assert.rejects(f.apply(plan)); assert.ok(!f.state.calls.includes('begin_billing_reconcile'));
});
await test('malformed, duplicate or opposite-mode inventory is rejected', async () => {
  for (const mutate of [r => r[0].environment = 'live', r => r.push({...r[0]}),
    r => r[0].customer_id = 'wrong', r => r[0].created_at = null, r => r[0].extra = 'hidden',
    r => r[0].user_id = 'wrong', r => r[0].reason = '']) {
    const f = fixture(); mutate(f.state.rows); await assert.rejects(f.prepare());
  }
});
await test('changed or missing selected beforeimages reject whole batch before first write', async () => {
  for (const mutate of [r => r[1].reason = 'changed', r => r.pop()]) {
    const f = fixture('test', 2), plan = await f.prepare(); mutate(f.state.rows);
    await assert.rejects(f.apply(plan)); assert.ok(!f.state.calls.includes('begin_billing_reconcile'));
  }
});
await test('late claim changes after begin and after provider read never commit', async () => {
  for (const hook of ['onBegin', 'onSubscription']) {
    const f = fixture(), plan = await f.prepare(); f.state[hook] = () => f.state.rows[0].reason = 'changed';
    await assert.rejects(f.apply(plan)); assert.ok(!f.state.calls.includes('commit_billing_reconcile'));
    assert.equal(f.state.records.at(-1).phase, 'uncertain-or-refused');
  }
});
await test('customer ownership, deletion, mode and subscription price mismatches cannot commit', async () => {
  for (const mutate of [s => s.customer.metadata.user_id = 'other', s => s.customer.deleted = true,
    s => s.customer.livemode = true, s => s.price.id = 'price_other', s => s.price.livemode = true]) {
    const f = fixture(), plan = await f.prepare(); mutate(f.state);
    await assert.rejects(f.apply(plan)); assert.ok(!f.state.calls.includes('commit_billing_reconcile'));
  }
});
await test('revision retries reread customer and subscription; exhausted retries stop', async () => {
  const f = fixture(), plan = await f.prepare(); f.state.retries = 2; await f.apply(plan);
  assert.equal(f.state.calls.filter(c => c === 'subscription-GET').length, 3);
  assert.equal(f.state.calls.filter(c => c === 'customer-GET').length, 3);
  const g = fixture(), p = await g.prepare(); g.state.retries = 3;
  await assert.rejects(g.apply(p)); assert.equal(g.state.records.at(-1).phase, 'uncertain-or-refused');
});
await test('protected/provider conflict remains pending and privately recorded', async () => {
  const f = fixture(), plan = await f.prepare(); f.state.outcome = 'pending_checkout'; await f.apply(plan);
  assert.equal(f.state.rows.length, 1); assert.equal(f.state.records.at(-1).outcome, 'pending_checkout');
});
await test('duplicate durable event does not reread provider or clear pending manually', async () => {
  const f = fixture(), plan = await f.prepare(); f.state.duplicate = true; await f.apply(plan);
  assert.ok(!f.state.calls.includes('subscription-GET')); assert.equal(f.state.records.at(-1).outcome, 'duplicate');
});
await test('ownership conflict stops and transport uncertainty never claims rollback or continues batch', async () => {
  for (const flag of ['conflict','commitFailure']) {
    const f = fixture('test', 2), plan = await f.prepare(); f.state[flag] = true;
    await assert.rejects(f.apply(plan)); assert.equal(f.state.calls.filter(c => c === 'begin_billing_reconcile').length, 1);
    assert.equal(f.state.records.at(-1).phase, 'uncertain-or-refused');
    assert.ok(!JSON.stringify(f.state.records).includes('private untrusted server message'));
  }
});
await test('journal failure before attempt prevents writes; after commit stops remaining claims', async () => {
  for (const phase of ['attempt-started','result']) {
    const f = fixture('test', 2), plan = await f.prepare(); f.state.recordFailure = phase;
    await assert.rejects(f.apply(plan));
    assert.equal(f.state.calls.filter(c => c === 'begin_billing_reconcile').length, phase === 'attempt-started' ? 0 : 1);
  }
});
// Exercise the actual runner's GET-only transport and count branch without
// touching the filesystem or network. The fake SDK still passes every HTTP
// request through the runner's real custom fetch client.
const runner = readFileSync('scripts/run-pending-checkout-recovery.ts', 'utf8')
  .replace(/^import[\s\S]*?from\s+["'][^"']+["'];?\s*/gm, '');
for (const request of ['GET account', 'POST account', 'GET other-host', 'GET customers-list', 'redirect',
  'wrong backend', 'wrong key mode', 'wrong prices'])
  await test(`runner transport ${request} is ${request === 'GET account' ? 'allowed' : 'refused'}`, async () => {
    const f = fixture(), writes = [], calls = [], output = [];
    const options = {action: 'count', binding: f.binding, output: '/private/fixture'};
    class Stripe {
      static createFetchHttpClient(fetcher) {return fetcher;}
      constructor(key, config) {this.http = config.httpClient;}
      accounts = {retrieve: async () => {
        const url = request === 'GET other-host' ? 'https://other.invalid/v1/account'
          : request === 'GET customers-list' ? 'https://api.stripe.com/v1/customers' : 'https://api.stripe.com/v1/account';
        await this.http(url, {method: request.startsWith('POST') ? 'POST' : 'GET'});
        return f.state.account;
      }};
    }
    const context = {Stripe, Request, Response, URL, TextEncoder, crypto: webcrypto, structuredClone,
      console: {log: text => output.push(JSON.parse(text)), error() {}},
      fetch: async (req, init) => {calls.push(req.method); assert.equal(init.redirect, 'error');
        if (request === 'redirect') throw Error('redirect refused'); return new Response('{}');},
      billingAdmin: () => ({rpc: async name => {assert.equal(name, 'pending_stripe_checkouts'); return {data: [], error: null};}}),
      reconcileBilling: () => {throw Error('count mode must not reconcile');},
      Deno: {env: {get: name => ({SPACETIME_RECOVERY_OPTIONS: JSON.stringify(options),
        SUPABASE_URL: request === 'wrong backend' ? 'https://wrong.supabase.co' : 'https://zzoeywmurqiqticikyaf.supabase.co',
        STRIPE_SECRET_KEY: request === 'wrong key mode' ? 'sk_live_fixture' : 'sk_test_fixture',
        STRIPE_MONTHLY_PRICE_ID: request === 'wrong prices' ? 'price_other' : f.binding.monthly,
        STRIPE_YEARLY_PRICE_ID: f.binding.yearly}[name])},
        open: async name => ({write: async bytes => {writes.push(name); return bytes.length;}, sync: async () => {}, close() {}}),
        exit: code => {throw Error('runner exit ' + code);}}};
    Object.assign(context, {claimsChecked: f.context.claimsChecked, checkAccount: f.context.checkAccount});
    const code = ts.transpileModule('(async () => {' + runner + '})()',
      {compilerOptions: {target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None}}).outputText;
    const run = vm.runInNewContext(code, context);
    if (request === 'GET account') {
      await run; assert.equal(output[0].databaseMutations, 0); assert.equal(output[0].pending, 0);
      assert.deepEqual(calls, ['GET']); assert.equal(writes.length, 2);
    } else {await assert.rejects(run); assert.equal(writes.length, 0);}
  });
for (const failJournalSync of [false, true]) await test(`runner persists journal directory before reconcile (${failJournalSync ? 'disk failure' : 'success'})`, async () => {
  const f = fixture(); f.state.duplicate = true;
  const plan = await f.prepare(), synced = [], fileOptions = [];
  let directorySyncs = 0;
  const options = {action: 'apply', binding: f.binding, output: '/private/fixture', plan: '/private/plan.json',
    approvedHash: await f.context.sha256(plan)};
  class Stripe {
    static createFetchHttpClient(fetcher) {return fetcher;}
    accounts = {retrieve: f.deps.account};
  }
  const context = {...f.context, Stripe, Request, Response, URL,
    console: {log() {}, error() {}},
    billingAdmin: () => ({rpc: async () => ({data: f.state.rows, error: null})}),
    Deno: {env: {get: name => ({SPACETIME_RECOVERY_OPTIONS: JSON.stringify(options),
      SUPABASE_URL: 'https://zzoeywmurqiqticikyaf.supabase.co', STRIPE_SECRET_KEY: 'sk_test_fixture',
      STRIPE_MONTHLY_PRICE_ID: f.binding.monthly, STRIPE_YEARLY_PRICE_ID: f.binding.yearly}[name])},
      readTextFile: async () => JSON.stringify(plan),
      open: async (name, settings) => {
        fileOptions.push({name, ...settings});
        return {write: async bytes => bytes.length, close() {}, sync: async () => {
          synced.push(name);
          if (name === options.output) {
            directorySyncs++;
            if (failJournalSync && directorySyncs === 3) throw Error('directory sync failed');
          }
        }};
      }, exit: code => {throw Error('runner exit ' + code);}},
    reconcileBilling: async (...args) => {
      assert.equal(directorySyncs, 3);
      assert.equal(synced.at(-2), options.output + '/journal-0001.json');
      assert.equal(synced.at(-1), options.output);
      return await f.context.reconcileBilling(...args);
    }};
  const code = ts.transpileModule('(async () => {' + runner + '})()',
    {compilerOptions: {target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None}}).outputText;
  const run = vm.runInNewContext(code, context);
  if (failJournalSync) await assert.rejects(run); else await run;
  assert.equal(f.state.calls.filter(c => c === 'begin_billing_reconcile').length, failJournalSync ? 0 : 1);
  assert.ok(fileOptions.filter(x => x.name !== options.output).every(x => x.createNew && x.mode === 0o600));
  assert.ok(fileOptions.filter(x => x.name === options.output).every(x => x.read === true));
});
console.log(JSON.stringify({passed: checks.length, checks, scope: 'actual policy/reconcile/snapshot with local doubles',
  realDatabaseMutations: 0, providerMutations: 0}, null, 2));
