#!/usr/bin/env node
// Request a genuine Apple sandbox TEST. Keep JWT/JWS/test token private.
import assert from 'node:assert/strict'
import { createPrivateKey, sign } from 'node:crypto'
import { writeFileSync, readFileSync } from 'node:fs'
import { createClient } from '@supabase/supabase-js'
process.loadEnvFile('.env.local')
assert.equal(process.env.SUPABASE_PROJECT_REF, 'zzoeywmurqiqticikyaf')
const service = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false, autoRefreshToken: false } })
const rows = async () => (await service.from('subscriptions').select('*').order('id').throwOnError()).data
const before = await rows()
const enc = value => Buffer.from(JSON.stringify(value)).toString('base64url')
const issued = Math.floor(Date.now() / 1000)
const input = `${enc({ alg: 'ES256', kid: process.env.MIGRATION_APPLE_KEY_ID, typ: 'JWT' })}.${enc({
  iss: process.env.MIGRATION_APPLE_ISSUER_ID, iat: issued, exp: issued + 300,
  aud: 'appstoreconnect-v1', bid: process.env.APPLE_BUNDLE_ID,
})}`
const key = createPrivateKey(process.env.MIGRATION_APPLE_PRIVATE_KEY)
const token = `${input}.${sign('sha256', Buffer.from(input), { key, dsaEncoding: 'ieee-p1363' }).toString('base64url')}`
const root = 'https://api.storekit-sandbox.apple.com/inApps/v1/notifications/test'
const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }
const receipt = '.migration-private/apple-notification-test.json'
let testToken
if (process.argv.includes('--resume')) {
  testToken = JSON.parse(readFileSync(receipt, 'utf8')).testNotificationToken
} else {
  const response = await fetch(root, { method: 'POST', headers })
  if (!response.ok) {
    const error = await response.json().catch(() => ({}))
    throw Error(`Apple sandbox TEST request HTTP ${response.status}; code ${error.errorCode ?? 'unknown'}`)
  }
  const result = await response.json()
  assert.ok(result.testNotificationToken)
  testToken = result.testNotificationToken
  writeFileSync(receipt, JSON.stringify(result), { mode: 0o600 })
  console.log('Apple sandbox TEST requested successfully')
}
const response = await fetch(`${root}/${encodeURIComponent(testToken)}`, { headers })
if (!response.ok) throw Error(`Apple TEST status HTTP ${response.status}`)
const result = await response.json()
writeFileSync(receipt, JSON.stringify({ testNotificationToken: testToken, ...result }), { mode: 0o600 })
assert.deepEqual(await rows(), before, 'TEST must not change subscription rows')
const attempts = result.sendAttempts ?? []
console.log(JSON.stringify({ firstSendAttemptResult: result.firstSendAttemptResult ?? null,
  attempts: attempts.map(attempt => ({ result: attempt.sendAttemptResult,
    time: attempt.attemptDate })), subscriptionsUnchanged: true, signedPayloadReturned: Boolean(result.signedPayload) }, null, 2))
if (result.signedPayload) {
  // Replay the Apple-signed TEST to prove certificate validation and safe retries.
  const replay = await fetch(`${process.env.SUPABASE_URL}/functions/v1/apple-iap-notifications`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ signedPayload: result.signedPayload }),
  })
  console.log('Apple signed TEST replay HTTP', replay.status)
  if (replay.status !== 200) {
    const error = await replay.json().catch(() => ({}))
    throw Error(`Signed TEST rejected: ${error.code ?? 'unknown'}`)
  }
  assert.deepEqual(await rows(), before, 'Replay must not change subscriptions')
}
