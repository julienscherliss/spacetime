// Publish the real web app for owner review, independently of native releases.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const sha = bytes => createHash('sha256').update(bytes).digest('hex');
export async function verifyAsset(url, expectedHash, fetchAsset = fetch, pause = ms => new Promise(resolve => setTimeout(resolve, ms))) {
  // An alias can reach a previous deployment briefly while the new files propagate.
  for (let attempt = 0; attempt < 8; attempt++) {
    const response = await fetchAsset(url, { cache: 'no-store', signal: AbortSignal.timeout(20000) });
    if (response.status === 200 && sha(Buffer.from(await response.arrayBuffer())) === expectedHash) return;
    if (attempt < 7) await pause(2000);
  }
  throw Error('Review asset did not reach the prepared version: ' + new URL(url).pathname);
}
export function collectAssets(directory, privateValues = []) {
  const visit = folder => fs.readdirSync(folder, { withFileTypes: true }).flatMap(entry => {
    assert(!entry.isSymbolicLink(), 'Review assets cannot include symbolic links.');
    const file = path.join(folder, entry.name);
    if (entry.isDirectory()) return visit(file);
    const relative = path.relative(directory, file).split(path.sep).join('/');
    assert(!/(^|\/)(?:\.env|\.git|\.migration-private|auth_users|node_modules)|\.(?:map|p8|zip|csv)$/i.test(relative), 'Private/source file in review assets.');
    const bytes = fs.readFileSync(file);
    const text = bytes.toString();
    assert(!/\b(?:sk|rk)_(?:live|test)_[A-Za-z0-9]+|sb_secret_|-----BEGIN (?:EC |RSA )?PRIVATE KEY-----/.test(text), 'Private credential in review assets.');
    for (const value of privateValues.filter(value => value.length > 10)) assert(!text.includes(value), 'Private value in review assets.');
    for (const token of text.match(/[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]+/g) ?? []) {
      let claims;
      try { claims = JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString()); } catch { continue; }
      assert.notEqual(claims.role, 'service_role', 'Privileged credential in review assets.');
    }
    assert(!text.includes('rhguyvbysqmcwzeuqipr'), 'Old backend in review assets.');
    return [{ path: relative, bytes: bytes.length, sha256: sha(bytes) }];
  });
  return visit(directory).sort((a, b) => a.path.localeCompare(b.path));
}

export function outputConfig() {
  return { version: 3, routes: [
    { src: '/(.*)', headers: { 'X-Robots-Tag': 'noindex, nofollow', 'Cache-Control': 'no-cache' }, continue: true },
    { handle: 'filesystem' },
    { src: '/(?:assets/.*|.*\\.[^/]+)', status: 404 },
    { src: '/(.*)', dest: '/index.html' },
  ] };
}

async function main() {
  const root = process.cwd();
  const config = JSON.parse(fs.readFileSync('review.config.json', 'utf8'));
  assert.equal(config.project, 'spacetime-review', 'Only the dedicated review project is allowed.');
  assert.equal(config.scope, 'imprint8', 'Review must stay in the owner workspace.');
  assert(new URL(config.url).hostname.endsWith('.vercel.app'), 'Review cannot target the live website.');
  const command = process.argv[2] ?? 'publish';
  assert(['publish', 'prepare', 'verify', 'status'].includes(command), 'Use publish, prepare, verify or status.');
  const dir = path.join(root, '.migration-private', 'web-review');
  fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  const receiptPath = path.join(dir, 'receipt.json');
  let receipt = fs.existsSync(receiptPath) ? JSON.parse(fs.readFileSync(receiptPath, 'utf8')) : {};
  const save = () => fs.writeFileSync(receiptPath, JSON.stringify(receipt, null, 2) + '\n', { mode: 0o600 });
  const run = (tool, args, cwd, label) => {
    const result = spawnSync(tool, args, { cwd, encoding: 'utf8', maxBuffer: 100 * 1024 * 1024 });
    if (label) fs.writeFileSync(path.join(dir, label + '.log'), (result.stdout ?? '') + (result.stderr ?? ''), { mode: 0o600 });
    assert(!result.error && result.status === 0, `${label ?? tool} failed; inspect the private review log.`);
    return (result.stdout ?? '').trim();
  };
  const git = (...args) => run('git', args, root);
  if (command === 'status') {
    console.log(JSON.stringify({ source: receipt.source, url: config.url, published: !!receipt.deployment, verified: receipt.verifiedAt ?? null }, null, 2));
    return;
  }
  const privateValues = fs.existsSync('.env.local') ? fs.readFileSync('.env.local', 'utf8').split(/\r?\n/).flatMap(line => {
    const match = /^([A-Z_]+)=(.*)$/.exec(line);
    return match && /SECRET|PRIVATE_KEY|SERVICE_ROLE|PASSWORD|API_KEY/.test(match[1]) ? [match[2].replace(/^("|')(.*)\1$/, '$2')] : [];
  }) : [];
  const deploymentDir = path.join(dir, 'deployment');
  const output = path.join(deploymentDir, '.vercel', 'output');
  if (command !== 'verify') {
    assert.equal(git('status', '--porcelain'), '', 'Commit the review candidate before uploading it.');
    const source = git('rev-parse', 'HEAD');
    if (receipt.source !== source) {
      const sourceDir = path.join(dir, 'source-' + source);
      fs.mkdirSync(sourceDir, { recursive: true });
      const archive = path.join(dir, 'source.tar');
      run('git', ['archive', '--format=tar', '--output', archive, source], root, 'source-archive');
      run('tar', ['-xf', archive, '-C', sourceDir], root, 'source-checkout');
      if (!fs.existsSync(path.join(sourceDir, 'node_modules'))) fs.symlinkSync(path.join(root, 'node_modules'), path.join(sourceDir, 'node_modules'));
      console.log('Building the full app for web review…');
      run('npm', ['run', 'build'], sourceDir, 'build');
      // Only built public assets reach Vercel; source, .env.local and exports stay here.
      fs.rmSync(output, { recursive: true, force: true });
      fs.mkdirSync(output, { recursive: true });
      fs.cpSync(path.join(sourceDir, 'dist'), path.join(output, 'static'), { recursive: true });
      fs.writeFileSync(path.join(output, 'static', 'robots.txt'), 'User-agent: *\nDisallow: /\n');
      fs.writeFileSync(path.join(output, 'static', 'review-version.json'), JSON.stringify({ source }) + '\n');
      fs.writeFileSync(path.join(output, 'config.json'), JSON.stringify(outputConfig(), null, 2));
      const files = collectAssets(path.join(output, 'static'), privateValues);
      assert(files.some(file => file.path.startsWith('assets/ownedCacheCompression.worker-')), 'Missing production cache worker.');
      receipt = { source, files, preparedAt: new Date().toISOString() };
      save();
    }
    assert.deepEqual(collectAssets(path.join(output, 'static'), privateValues), receipt.files, 'Review build changed after preparation.');
    if (command === 'prepare') { console.log('Web review prepared. No native builds or publication.'); return; }
    const project = JSON.parse(fs.readFileSync(path.join(deploymentDir, '.vercel', 'project.json'), 'utf8'));
    assert.equal(project.projectName, config.project, 'Wrong linked hosting project.');
    if (!receipt.deployment) {
      console.log('Uploading the review website…');
      receipt.deployment = run('npx', ['--yes', `vercel@${config.vercelCli}`, 'deploy', '--prebuilt', '--prod', '--yes', '--scope', config.scope], deploymentDir, 'deploy');
      save();
    }
  }
  assert(receipt.deployment && receipt.files?.length, 'Publish the prepared review first.');
  for (const file of receipt.files) {
    await verifyAsset(new URL(file.path, config.url + '/'), file.sha256);
  }
  const response = await fetch(config.url + '/app', { signal: AbortSignal.timeout(20000) });
  assert.equal(response.status, 200, 'App route unavailable.');
  assert((await response.text()).includes('id="root"'), 'App route must serve the React app.');
  assert.equal(response.headers.get('x-robots-tag'), 'noindex, nofollow');
  receipt.verifiedAt = new Date().toISOString(); save();
  console.log(`Review ready: ${config.url}/app`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(error => { console.error(error.message); process.exitCode = 1; });
}
