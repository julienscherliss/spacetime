#!/usr/bin/env node
// Prepare a static candidate locally. This does not deploy or alter dist/,
// Capacitor resources, active backend secrets, or the rehearsal environment.
import { build } from 'vite'
import { createHash } from 'node:crypto'
import { mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'

const ref = 'zzoeywmurqiqticikyaf'
const publicNames = new Set(['SUPABASE_URL', 'SUPABASE_ANON_KEY'])
const env = Object.fromEntries(readFileSync('.env.local', 'utf8').split(/\r?\n/).flatMap(line => {
  const match = /^([A-Z_]+)=(.*)$/.exec(line)
  return match && publicNames.has(match[1]) ? [[match[1], match[2].replace(/^(["'])(.*)\1$/, '$2')]] : []
}))
if (env.SUPABASE_URL !== `https://${ref}.supabase.co`) throw Error('Wrong candidate project')
const claims = JSON.parse(Buffer.from(env.SUPABASE_ANON_KEY?.split('.')[1] ?? '', 'base64url').toString())
if (claims.role !== 'anon' || claims.ref !== ref) throw Error('Expected owned public anon key')
const envDir = resolve('.migration-private/production-app-env')
const outDir = resolve('.migration-private/production-web-dist')
mkdirSync(envDir, { recursive: true, mode: 0o700 })
const publicSettings = {
  VITE_SUPABASE_URL: env.SUPABASE_URL,
  VITE_SUPABASE_PUBLISHABLE_KEY: env.SUPABASE_ANON_KEY,
  VITE_SUPABASE_PROJECT_ID: ref,
  VITE_AUTH_BACKEND: 'owned',
  VITE_ALLOW_SANDBOX_BILLING: 'false',
  VITE_LIVE_ACTIVITY_DIAGNOSTICS: 'false',
}
writeFileSync(join(envDir, '.env.owned-production-candidate.local'), Object.entries(publicSettings)
  .map(([key, value]) => `${key}=${value}`).join('\n') + '\n', { mode: 0o600 })
for (const key of Object.keys(process.env)) if (key.startsWith('VITE_')) delete process.env[key]
await build({ mode: 'owned-production-candidate', envDir, build: { outDir, emptyOutDir: true } })
const files = []
function inspect(dir) {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name)
    if (statSync(path).isDirectory()) { inspect(path); continue }
    const bytes = readFileSync(path)
    const content = bytes.toString('utf8')
    if (/(?:sk|rk)_(?:live|test)_[A-Za-z0-9]+|sb_secret_|-----BEGIN (?:EC |RSA )?PRIVATE KEY-----/.test(content))
      throw Error('Secret-like value found in candidate; do not publish')
    for (const token of content.match(/[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]+/g) ?? []) {
      try {
        if (JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString()).role === 'service_role')
          throw Error('Service-role credential found in candidate; do not publish')
      } catch (error) { if (error.message?.includes('Service-role credential')) throw error }
    }
    files.push({ path: path.slice(outDir.length + 1), bytes: bytes.length,
      sha256: createHash('sha256').update(bytes).digest('hex'),
      oldBackendReference: content.includes('rhguyvbysqmcwzeuqipr'),
      ownedBackendReference: content.includes(ref) })
  }
}
inspect(outDir)
if (!files.some(file => file.path.endsWith('.js') && file.ownedBackendReference))
  throw Error('Owned project missing from built JavaScript')
if (files.some(file => file.oldBackendReference))
  throw Error('Old backend found in candidate artifacts; do not publish')
writeFileSync(resolve('.migration-private/production-build-manifest.json'), JSON.stringify({
  preparedAt: new Date().toISOString(), project: ref, deployed: false,
  sandboxBillingAllowed: false, webSandboxBillingAllowed: false,
  nativeAppleSandboxAllowed: true, stripeTestBillingAllowed: false,
  liveActivityDiagnostics: false, files,
  remainingHtmlPolicyCleanup: files.filter(file => file.oldBackendReference).map(file => file.path),
}, null, 2) + '\n', { mode: 0o600 })
console.log('Local production candidate prepared; no deployment or Capacitor sync. Active backend remains TEST.')
console.log(JSON.stringify({ files: files.length, totalBytes: files.reduce((n, file) => n + file.bytes, 0),
  largestFileBytes: Math.max(...files.map(file => file.bytes)),
  htmlPolicyCleanup: files.filter(file => file.oldBackendReference).map(file => file.path) }))
