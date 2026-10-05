#!/usr/bin/env node
// Isolated local login rehearsal. No frontend cutover; no tokens in evidence.
import { createServer } from 'vite'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { createClient } from '@supabase/supabase-js'

const keys = new Set(['SUPABASE_URL', 'SUPABASE_ANON_KEY', 'SUPABASE_SERVICE_ROLE_KEY'])
const env = Object.fromEntries(readFileSync('.env.local', 'utf8').split(/\r?\n/).flatMap(line => {
  const m = /^([A-Z_]+)=(.*)$/.exec(line)
  return m && keys.has(m[1]) ? [[m[1], m[2].replace(/^(["'])(.*)\1$/, '$2')]] : []
}))
if (env.SUPABASE_URL !== 'https://zzoeywmurqiqticikyaf.supabase.co') throw Error('Wrong test project')
const recipient = 'julienscherliss@gmail.com'
const admin = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
})
const { data, error } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 })
if (error) throw Error('Unable to establish imported user baseline')
const imported = data.users.find(user => user.email?.toLowerCase() === recipient)
if (!imported) throw Error('Controlled recipient is absent from imported Auth users')
const root = resolve('.migration-private/auth-test')
mkdirSync(root, { recursive: true, mode: 0o700 })
writeFileSync(resolve(root, 'index.html'), `<!doctype html><html><meta charset="utf-8"><title>Spacetime migration sign-in test</title>
<style>body{font:17px system-ui;max-width:600px;margin:70px auto;padding:24px;color:#202d43;background:#f8faff}button,input{font:inherit;padding:12px;margin:8px 0}button{cursor:pointer}#status{white-space:pre-wrap}small{display:block;line-height:1.6}</style>
<h1>Spacetime sign-in test</h1><p>This page uses the new backend. Your live app stays on the old backend.</p>
<p>Test account: ${recipient}</p><form id="otp"><label>Email sign-in code<br><input name="code" autocomplete="one-time-code" required></label><br><button>Verify email code</button></form>
<button id="google">Test Google sign-in</button><p id="status">Enter the code just emailed to you, or test Google after saving its new callback.</p><small>No tasks, payments, or notifications will be created. Use the Gmail account shown above.</small>
<script type="module" src="/main.js"></script></html>`, { mode: 0o600 })
writeFileSync(resolve(root, 'main.js'), `import {createClient} from '@supabase/supabase-js';
const client=createClient(${JSON.stringify(env.SUPABASE_URL)},${JSON.stringify(env.SUPABASE_ANON_KEY)},{auth:{flowType:'pkce',storage:sessionStorage,storageKey:'spacetime-owned-auth-rehearsal'}});
const status=document.querySelector('#status');
async function record(session,method){if(!session){status.textContent='No session returned.';return}const r=await fetch('/verify-evidence',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({token:session.access_token,method})});const result=await r.json();status.textContent=result.ok?'Sign-in passed. Your original imported account ID is preserved.':'Sign-in did not match the expected imported account.';}
document.querySelector('#otp').onsubmit=async e=>{e.preventDefault();status.textContent='Checking code…';const {data,error}=await client.auth.verifyOtp({email:${JSON.stringify(recipient)},token:e.target.code.value.trim(),type:'email'});if(error){status.textContent=error.message;return}await record(data.session,'email-otp');e.target.code.value='';};
document.querySelector('#google').onclick=async()=>{const {error}=await client.auth.signInWithOAuth({provider:'google',options:{redirectTo:'http://localhost:5174/auth/callback',queryParams:{prompt:'select_account'}}});if(error)status.textContent=error.message;};
{ const {data,error}=await client.auth.getSession();if(error)status.textContent=error.message;else if(data.session) await record(data.session,'session');history.replaceState({},'',location.pathname);}
`, { mode: 0o600 })
async function verifyEvidence(req, res) {
  res.setHeader('Content-Type', 'application/json')
  if (req.method !== 'POST' || req.headers.origin !== 'http://localhost:5174') {
    res.statusCode = 403; res.end(JSON.stringify({ ok: false })); return
  }
  try {
    let body = ''; for await (const part of req) { body += part; if (body.length > 15000) throw Error('Too large') }
    const { token, method: requestedMethod } = JSON.parse(body)
    if (!['google', 'email-otp', 'session'].includes(requestedMethod)) throw Error('Invalid method')
    const { data, error } = await admin.auth.getUser(token)
    const claims = !error && JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString())
    const authMethod = claims?.amr?.at(-1)?.method
    const method = authMethod === 'oauth' ? 'google' : authMethod === 'otp' ? 'email-otp' : null
    const ok = Boolean(method) && (requestedMethod === 'session' || requestedMethod === method) && !error && data.user?.id === imported.id && data.user?.email?.toLowerCase() === recipient &&
      (method !== 'google' || data.user.identities?.some(identity => identity.provider === 'google'))
    if (ok) {
      const file = resolve(root, 'evidence.json')
      let evidence = {}; try { evidence = JSON.parse(readFileSync(file, 'utf8')) } catch {}
      evidence[method] = { verified: true, importedIdPreserved: true, at: new Date().toISOString() }
      writeFileSync(file, JSON.stringify(evidence, null, 2), { mode: 0o600 })
      console.log(`Verified ${method}; original imported ID preserved`)
    }
    res.end(JSON.stringify({ ok: Boolean(ok) }))
  } catch { res.statusCode = 400; res.end(JSON.stringify({ ok: false })) }
}
const server = await createServer({ configFile: false, root,
  server: { host: '127.0.0.1', port: 5174, strictPort: true },
  plugins: [{ name: 'owned-auth-evidence', configureServer(server) {
    server.middlewares.use('/verify-evidence', verifyEvidence)
  } }],
})
await server.listen()
console.log('Isolated owned-backend login test: http://localhost:5174')
