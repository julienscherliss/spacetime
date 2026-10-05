// Exercise the real handler with in-memory DB/APNs substitutes; no network or credentials.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { generateKeyPairSync, webcrypto } from 'node:crypto';
import vm from 'node:vm';
import ts from 'typescript';

const userId = '00000000-0000-0000-0000-000000000001';
const deviceId = '00000000-0000-0000-0000-000000000002';
const device = { user_id: userId, device_id: deviceId, apns_environment: 'production',
  bundle_identifier: 'com.spacetimelabs.spacetime', push_to_start_token: 'stale-test-token',
  current_activity_token: null, current_activity_task_id: null };
const plan = { id: 'plan', user_id: userId, device_id: deviceId, active: true,
  plan_signature: 'unchanged-plan', last_dispatched_signature: null, task_id: 'task', title: 'Test',
  start_at: new Date(Date.now() - 60000).toISOString(), end_at: new Date(Date.now() + 600000).toISOString(),
  payload: {} };
let sends = 0;
const patches = [];
const admin = { from(table) {
  const filters = [];
  let update;
  const query = {
    select() { return query; }, order() { return query; }, limit() { return query; }, or() { return query; },
    eq(key, value) { filters.push([key, value]); return query; },
    update(value) { update = value; return query; },
    upsert() { throw Error('Unexpected repair'); },
    async maybeSingle() { const result = await query; return { data: result.data[0] ?? null, error: null }; },
    then(resolve, reject) {
      try {
        const rows = [table === 'live_activity_devices' ? device : plan].filter(row => filters.every(([k, v]) => row[k] === v));
        if (update) { patches.push({ table, update }); rows.forEach(row => Object.assign(row, update)); }
        return Promise.resolve({ data: rows, error: null }).then(resolve, reject);
      } catch (error) { return Promise.reject(error).then(resolve, reject); }
    },
  };
  return query;
} };
let handler;
const { privateKey } = generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
const settings = { LIVE_ACTIVITY_DISPATCH_SECRET: 'local-test-only', APNS_KEY_ID: 'test', APNS_TEAM_ID: 'test',
  APNS_PRIVATE_KEY: privateKey.export({ type: 'pkcs8', format: 'pem' }) };
const source = readFileSync('supabase/functions/live-activity-dispatch/index.ts', 'utf8').replace(/^import .*;\n/, '');
vm.runInNewContext(ts.transpile(source, { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None }), {
  createClient: () => admin, Deno: { env: { get: name => settings[name] }, serve: callback => { handler = callback; } },
  crypto: webcrypto, TextEncoder, Uint8Array, Request, Response, Date, atob, btoa,
  console: { log() {} }, fetch: async () => { sends++; return Response.json({ reason: 'BadDeviceToken' }, { status: 400 }); },
});
const dispatch = async body => handler(new Request('https://test.invalid', { method: 'POST',
  headers: { 'x-dispatch-secret': 'local-test-only' }, body: JSON.stringify(body) }));
assert.equal((await dispatch({ userId })).status, 400);
assert.equal(sends, 0);
const bad = await (await dispatch({ userId, deviceId })).json();
assert.equal(bad.results[0].status, 400);
assert.equal(device.push_to_start_token, null);
assert.equal(plan.last_dispatched_signature, null, 'Rejected token must not acknowledge the plan');
assert.equal(sends, 1);
device.push_to_start_token = 'fresh-test-token';
const dry = await (await dispatch({ userId, deviceId, dryRun: true })).json();
assert.equal(dry.count, 1, 'Fresh token can retry the unchanged plan');
assert.equal(dry.results[0].ok, true);
assert.equal(sends, 1, 'Dry run must not send');
const saved = JSON.stringify({ device, plan });
device.push_to_start_token = null;
const before = JSON.stringify({ device, plan });
await dispatch({ userId, deviceId, dryRun: true });
assert.equal(JSON.stringify({ device, plan }), before, 'Missing-token dry run must not write');
assert.ok(saved);
assert.equal(patches.length, 2);
console.log('Live Activity handler checks passed: targeted validation, bad-token retirement, unchanged-plan retry, dry-run isolation');
