#!/usr/bin/env node

// Upload only approved Edge Function settings from the ignored .env.local.
// Never pass the entire file to `supabase secrets set`: it also holds the DB password.
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'

const INVENTORY = [
  'APNS_BUNDLE_ID', 'APNS_ENV', 'APNS_KEY_ID', 'APNS_PRIVATE_KEY', 'APNS_TEAM_ID',
  'APPLE_BUNDLE_ID', 'APPLE_IAP_SHARED_SECRET', 'APPLE_ISSUER_ID',
  'APPLE_KEY_ID', 'APPLE_PRIVATE_KEY', 'GOOGLE_CLIENT_ID',
  'GOOGLE_CLIENT_SECRET', 'LIVE_ACTIVITY_DISPATCH_SECRET',
  'STRIPE_SECRET_KEY', 'STRIPE_WEBHOOK_SECRET',
]
const EMAIL = [
  'EMAIL_PROVIDER', 'EMAIL_FROM_ADDRESS', 'RESEND_API_KEY',
  'POSTMARK_SERVER_TOKEN', 'SEND_EMAIL_HOOK_SECRET',
]
const BILLING = ['STRIPE_MONTHLY_PRICE_ID','STRIPE_YEARLY_PRICE_ID','APPLE_BILLING_ENVIRONMENT']
const ALLOWED = new Set([...INVENTORY, ...EMAIL, ...BILLING])
const apply = process.argv.slice(2).includes('--apply')
if (process.argv.slice(2).some((argument) => argument !== '--apply')) {
  throw new Error('Only --apply is supported; omit it for a names-only check.')
}

const lines = new Map()
let multilineKey = null
let multilineValue = ''
for (const raw of readFileSync(resolve('.env.local'), 'utf8').split(/\r?\n/)) {
  if (multilineKey) {
    multilineValue += `\n${raw}`
    if (raw.trimEnd().endsWith('"')) {
      lines.set(multilineKey, multilineValue)
      multilineKey = null
      multilineValue = ''
    }
    continue
  }
  const line = raw.trim()
  if (!line || line.startsWith('#')) continue
  const match = /^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/.exec(line)
  if (!match) throw new Error('Malformed .env.local line; use one KEY=VALUE per line.')
  const [, key, value] = match
  if (lines.has(key)) throw new Error(`Duplicate .env.local key: ${key}`)
  if (value.startsWith('"') && !value.endsWith('"')) {
    multilineKey = key
    multilineValue = value
  } else {
    lines.set(key, value)
  }
}
if (multilineKey) throw new Error(`Unterminated quoted value for ${multilineKey}`)

function unquote(value) {
  if (value.length >= 2 && ['"', "'"].includes(value[0]) && value[0] === value.at(-1)) {
    return value.slice(1, -1)
  }
  return value
}

const projectRef = unquote(lines.get('SUPABASE_PROJECT_REF') ?? '')
const projectUrl = unquote(lines.get('SUPABASE_URL') ?? '')
if (!projectRef || new URL(projectUrl).hostname !== `${projectRef}.supabase.co`) {
  throw new Error('The local Supabase project ref and URL do not match.')
}
const provider = unquote(lines.get('EMAIL_PROVIDER') ?? '')
if (provider && !['resend', 'postmark'].includes(provider)) {
  throw new Error('EMAIL_PROVIDER must be resend or postmark.')
}

const ready = [...ALLOWED].filter((key) => {
  const value = lines.get(key)
  return value !== undefined && unquote(value).length > 0
})
const missingInventory = INVENTORY.filter((key) => !ready.includes(key))
const matchingProviderKey = provider === 'resend' ? 'RESEND_API_KEY' : 'POSTMARK_SERVER_TOKEN'
const emailReady = Boolean(provider && ready.includes('EMAIL_FROM_ADDRESS') && ready.includes(matchingProviderKey))

if (!apply) {
  console.log(JSON.stringify({ ready, missingInventory, emailReady }, null, 2))
  process.exit(0)
}
if (ready.length === 0) throw new Error('No approved function settings are present in .env.local.')

const privateRoot = resolve('.migration-private')
mkdirSync(privateRoot, { recursive: true, mode: 0o700 })
const stagingDir = mkdtempSync(join(privateRoot, 'function-secrets-'))
try {
  const stagingFile = join(stagingDir, 'secrets.env')
  writeFileSync(stagingFile, ready.map((key) => `${key}=${JSON.stringify(unquote(lines.get(key)))}`).join('\n') + '\n', { mode: 0o600 })
  const result = spawnSync('supabase', [
    'secrets', 'set', '--project-ref', projectRef, '--env-file', stagingFile,
  ], { encoding: 'utf8' })
  if (result.error || result.status !== 0) {
    throw new Error(`Secret upload failed (exit ${result.status ?? 'unknown'}); output withheld to protect values.`)
  }
  const listed = spawnSync('supabase', [
    'secrets', 'list', '--project-ref', projectRef, '--output', 'json',
  ], { encoding: 'utf8' })
  if (listed.error || listed.status !== 0) {
    throw new Error('Secrets were uploaded but their names could not be verified.')
  }
  const remoteSecrets = JSON.parse(listed.stdout)
  const remoteNames = new Set(remoteSecrets.map((item) => item.name))
  const absent = ready.filter((key) => !remoteNames.has(key))
  if (absent.length > 0) throw new Error(`Secrets were uploaded but names were not listed: ${absent.join(', ')}`)
  // The CLI exposes SHA-256 digests as `value`; some versions use `digest`.
  const remoteDigests = new Map(remoteSecrets.map((item) => [item.name, item.digest ?? item.value]))
  const mismatched = ready.filter((key) => {
    const expected = createHash('sha256').update(unquote(lines.get(key))).digest('hex')
    return remoteDigests.get(key) !== expected
  })
  if (mismatched.length > 0) throw new Error(`Uploaded secret digest mismatch: ${mismatched.join(', ')}`)
  console.log(JSON.stringify({ applied: ready, digestsVerified: true, missingInventory, emailReady }, null, 2))
} finally {
  rmSync(stagingDir, { recursive: true, force: true })
}
