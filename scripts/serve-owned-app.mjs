#!/usr/bin/env node
// Isolated full-app rehearsal; never changes the production env or dist/.
import { build, createServer } from 'vite'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'

const ref = 'zzoeywmurqiqticikyaf'
const allowed = new Set(['SUPABASE_URL', 'SUPABASE_ANON_KEY'])
const env = Object.fromEntries(readFileSync('.env.local', 'utf8').split(/\r?\n/).flatMap(line => {
  const match = /^([A-Z_]+)=(.*)$/.exec(line)
  return match && allowed.has(match[1]) ? [[match[1], match[2].replace(/^(["'])(.*)\1$/, '$2')]] : []
}))
if (env.SUPABASE_URL !== `https://${ref}.supabase.co`) throw Error('Wrong rehearsal project')
const claims = JSON.parse(Buffer.from(env.SUPABASE_ANON_KEY?.split('.')[1] ?? '', 'base64url').toString())
if (claims.role !== 'anon' || claims.ref !== ref) throw Error('Expected the owned public anon key')
const envDir = resolve('.migration-private/app-env')
mkdirSync(envDir, { recursive: true, mode: 0o700 })
// Only public frontend settings are written here. The backend secret file is
// outside Vite's envDir and cannot be loaded into this build.
writeFileSync(resolve(envDir, '.env.owned-smoke.local'), [
  `VITE_SUPABASE_URL=${env.SUPABASE_URL}`,
  `VITE_SUPABASE_PUBLISHABLE_KEY=${env.SUPABASE_ANON_KEY}`,
  `VITE_SUPABASE_PROJECT_ID=${ref}`,
  'VITE_AUTH_BACKEND=owned',
  'VITE_ALLOW_SANDBOX_BILLING=true',
  'VITE_LIVE_ACTIVITY_DIAGNOSTICS=true',
].join('\n') + '\n', { mode: 0o600 })
for (const key of Object.keys(process.env)) if (key.startsWith('VITE_')) delete process.env[key]
const config = { mode: 'owned-smoke', envDir }
if (process.argv.includes('--build')) {
  await build({ ...config, build: { outDir: '.migration-private/web-dist', emptyOutDir: true } })
  console.log('Owned rehearsal build complete; production dist unchanged')
} else {
  // A separate origin keeps disposable billing fixtures out of the user's
  // main rehearsal session. This origin is used for password login only.
  const port = process.argv.includes('--checkout-smoke') ? 5175 : 5173
  const server = await createServer({ ...config,
    server: { host: '127.0.0.1', port, strictPort: true },
  })
  await server.listen()
  console.log(`Full app on owned backend: http://localhost:${port}/auth`)
}
