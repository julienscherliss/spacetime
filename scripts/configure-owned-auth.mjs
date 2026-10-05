#!/usr/bin/env node
// Configure only the owned project. Credentials stay in .env.local / Keychain.
import { readFileSync, writeFileSync, chmodSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { randomBytes } from 'node:crypto'

const apply = process.argv.includes('--apply')
const envPath = '.env.local'
let source = readFileSync(envPath, 'utf8')
const wanted = new Set(['SUPABASE_PROJECT_REF', 'SUPABASE_URL', 'GOOGLE_CLIENT_ID',
  'GOOGLE_CLIENT_SECRET', 'RESEND_API_KEY', 'SEND_EMAIL_HOOK_SECRET'])
const env = Object.fromEntries(source.split(/\r?\n/).flatMap(line => {
  const m = /^([A-Z_]+)=(.*)$/.exec(line)
  return m && wanted.has(m[1]) ? [[m[1], m[2].replace(/^(["'])(.*)\1$/, '$2')]] : []
}))
const ref = 'zzoeywmurqiqticikyaf'
if (env.SUPABASE_PROJECT_REF !== ref || env.SUPABASE_URL !== `https://${ref}.supabase.co`) {
  throw Error('Refusing to configure a different project')
}
for (const key of ['GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET', 'RESEND_API_KEY']) {
  if (!env[key]) throw Error(`Missing ${key}`)
}
const credential = spawnSync('security', ['find-generic-password', '-s', 'Supabase CLI',
  '-a', 'supabase', '-w'], { encoding: 'utf8' })
if (credential.status) throw Error('Authenticated CLI profile unavailable')
const headers = { Authorization: `Bearer ${credential.stdout.trim()}`, 'Content-Type': 'application/json' }
const endpoint = `https://api.supabase.com/v1/projects/${ref}/config/auth`
async function request(method = 'GET', body) {
  const response = await fetch(endpoint, { method, headers, body: body && JSON.stringify(body) })
  if (!response.ok) throw Error(`Auth config ${method}: HTTP ${response.status}; response withheld`)
  return response.json()
}
const before = await request()
const redirects = [
  'https://launchspacetime.com', 'https://launchspacetime.com/auth/callback',
  'https://launchspacetime.com/auth/callback?native=1',
  'https://www.launchspacetime.com', 'https://www.launchspacetime.com/auth/callback',
  'com.spacetimelabs.spacetime://auth/callback',
  'http://localhost:5173', 'http://localhost:5173/auth/callback',
  'http://localhost:5174/auth/callback',
]
if (apply && !env.SEND_EMAIL_HOOK_SECRET) {
  env.SEND_EMAIL_HOOK_SECRET = `v1,whsec_${randomBytes(32).toString('base64')}`
  source += `\nSEND_EMAIL_HOOK_SECRET="${env.SEND_EMAIL_HOOK_SECRET}"\n`
  writeFileSync(envPath, source, { mode: 0o600 }); chmodSync(envPath, 0o600)
}
if (apply) {
  const synced = spawnSync('node', ['scripts/sync-function-secrets.mjs', '--apply'], { encoding: 'utf8' })
  if (synced.status) throw Error('Function secret sync failed; output withheld')
}
const patch = {
  site_url: 'https://launchspacetime.com',
  uri_allow_list: [...new Set([...before.uri_allow_list.split(',').filter(Boolean), ...redirects])].join(','),
  external_google_enabled: true, external_google_client_id: env.GOOGLE_CLIENT_ID,
  external_google_secret: env.GOOGLE_CLIENT_SECRET, external_google_skip_nonce_check: false,
  smtp_host: 'smtp.resend.com', smtp_port: '465', smtp_user: 'resend',
  smtp_pass: env.RESEND_API_KEY, smtp_admin_email: 'noreply@launchspacetime.com',
  smtp_sender_name: 'Spacetime',
  hook_send_email_enabled: true,
  hook_send_email_uri: `${env.SUPABASE_URL}/functions/v1/auth-email-hook`,
  hook_send_email_secrets: env.SEND_EMAIL_HOOK_SECRET,
}
if (apply) await request('PATCH', patch)
const after = await request()
// Management API redacts credentials; functional tests verify their behavior.
const secretFields = new Set(['external_google_secret', 'smtp_pass', 'hook_send_email_secrets'])
const matches = (key, value) => secretFields.has(key)
  ? typeof after[key] === 'string' && after[key].length > 0
  : after[key] === value
const verified = Object.entries(patch).every(([key, value]) => matches(key, value))
if (!verified) throw Error(`Auth config verification mismatch in: ${Object.entries(patch).filter(([key, value]) => !matches(key, value)).map(([key]) => key).join(', ')}; values withheld`)
console.log(JSON.stringify({ applied: apply, verified, credentialValuesRedacted: true, siteUrl: after.site_url,
  googleEnabled: after.external_google_enabled, hookEnabled: after.hook_send_email_enabled,
  smtpHost: after.smtp_host, redirectCount: after.uri_allow_list.split(',').filter(Boolean).length,
  googleCallback: `${env.SUPABASE_URL}/auth/v1/callback` }, null, 2))
