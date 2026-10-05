// Default: count-only. Preparation selects exact event IDs; application requires
// a previously reviewed plan hash. This never changes active secrets/config.
import {spawnSync} from 'node:child_process';
import {lstatSync, mkdirSync, readFileSync, realpathSync, openSync, fsyncSync, closeSync} from 'node:fs';
import {resolve, dirname, join, relative, isAbsolute} from 'node:path';
import {fileURLToPath} from 'node:url';
import assert from 'node:assert/strict';

try {
  const app = resolve(dirname(fileURLToPath(import.meta.url)), '..');
  assert.equal(realpathSync(process.cwd()), realpathSync(app), 'Run from app root');
  const options = {}, events = [];
  const flags = new Set(['--environment', '--account', '--out', '--select-event', '--plan', '--approve-sha256']);
  let action = 'count';
  for (let i = 2; i < process.argv.length; i++) {
    const flag = process.argv[i];
    if (flag === '--prepare' || flag === '--apply') {assert.equal(action, 'count'); action = flag.slice(2); continue;}
    assert.ok(flags.has(flag) && process.argv[i + 1] && !process.argv[i + 1].startsWith('--'));
    const value = process.argv[++i];
    if (flag === '--select-event') events.push(value);
    else {assert.ok(!(flag in options)); options[flag] = value;}
  }
  assert.ok(['test', 'live'].includes(options['--environment']));
  assert.match(options['--account'] ?? '', /^acct_[A-Za-z0-9]+$/);
  assert.ok(options['--out']);
  assert.ok(action === 'prepare' ? events.length > 0 : events.length === 0);
  assert.ok(action === 'apply' ? options['--plan'] && /^[a-f0-9]{64}$/.test(options['--approve-sha256'] ?? '')
    : !options['--plan'] && !options['--approve-sha256']);
  const root = join(app, '.migration-private', 'final-refresh');
  const checkPrivatePath = (input, existing) => {
    const path = resolve(input), rel = relative(root, path);
    assert.ok(rel && !rel.startsWith('..') && !isAbsolute(rel));
    const parts = relative(app, path).split('/');
    let cursor = app;
    for (let i = 0; i < parts.length; i++) {
      cursor = join(cursor, parts[i]);
      const last = i === parts.length - 1;
      if (last && !existing) continue;
      const stat = lstatSync(cursor);
      assert.ok(!stat.isSymbolicLink());
      if (!last) assert.ok(stat.isDirectory());
      else assert.ok(stat.isFile() && stat.size <= 5_000_000 && (stat.mode & 0o077) === 0);
    }
    return path;
  };
  const output = checkPrivatePath(options['--out'], false);
  const plan = options['--plan'] ? checkPrivatePath(options['--plan'], true) : undefined;
  if (plan) JSON.parse(readFileSync(plan, 'utf8')); // Fail before creating receipt directory.
  const envStat = lstatSync(join(app, '.env.local'));
  assert.ok(envStat.isFile() && !envStat.isSymbolicLink() && (envStat.mode & 0o077) === 0);
  process.loadEnvFile(join(app, '.env.local'));
  assert.equal(process.env.SUPABASE_PROJECT_REF, 'zzoeywmurqiqticikyaf');
  assert.equal(process.env.SUPABASE_URL, 'https://zzoeywmurqiqticikyaf.supabase.co');
  const mode = options['--environment'], live = mode === 'live';
  const key = process.env[live ? 'MIGRATION_STRIPE_LIVE_SECRET_KEY' : 'STRIPE_SECRET_KEY'];
  const monthly = process.env[live ? 'MIGRATION_STRIPE_LIVE_MONTHLY_PRICE_ID' : 'STRIPE_MONTHLY_PRICE_ID'];
  const yearly = process.env[live ? 'MIGRATION_STRIPE_LIVE_YEARLY_PRICE_ID' : 'STRIPE_YEARLY_PRICE_ID'];
  assert.ok(key?.startsWith('sk_' + mode + '_') && process.env.SUPABASE_SERVICE_ROLE_KEY);
  assert.match(monthly ?? '', /^price_[A-Za-z0-9]+$/); assert.match(yearly ?? '', /^price_[A-Za-z0-9]+$/);
  assert.notEqual(monthly, yearly);
  const binding = {project: process.env.SUPABASE_PROJECT_REF, environment: mode,
    account: options['--account'], monthly, yearly};
  mkdirSync(output, {mode: 0o700}); // Fresh directory only; never overwrite a previous run.
  for (const directory of [output, dirname(output)]) {
    const fd = openSync(directory, 'r');
    try {fsyncSync(fd);} finally {closeSync(fd);}
  }
  const env = {...process.env, STRIPE_SECRET_KEY: key, STRIPE_MONTHLY_PRICE_ID: monthly, STRIPE_YEARLY_PRICE_ID: yearly,
    SPACETIME_RECOVERY_OPTIONS: JSON.stringify({action, binding, output, plan, events, approvedHash: options['--approve-sha256']})};
  const result = spawnSync('npm', ['exec', '--yes', '--package=deno@2.9.6', '--', 'deno', 'run',
    '--no-lock', '--node-modules-dir=none',
    '--allow-env=SUPABASE_URL,SUPABASE_SERVICE_ROLE_KEY,STRIPE_SECRET_KEY,STRIPE_MONTHLY_PRICE_ID,STRIPE_YEARLY_PRICE_ID,SPACETIME_RECOVERY_OPTIONS',
    '--allow-net=zzoeywmurqiqticikyaf.supabase.co,api.stripe.com',
    '--allow-read=' + [output, ...(plan ? [plan] : [])].join(','), '--allow-write=' + output,
    join(app, 'scripts/run-pending-checkout-recovery.ts')], {env, encoding: 'utf8', timeout: 180000, maxBuffer: 1_000_000});
  assert.equal(result.status, 0);
  const summary = JSON.parse(result.stdout.trim());
  console.log(JSON.stringify(summary));
} catch {
  console.error('Recovery refused or interrupted. Check options and private receipts; prepare a fresh plan before retrying.');
  process.exitCode = 1;
}
