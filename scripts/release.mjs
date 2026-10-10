#!/usr/bin/env node
// Explicit, resumable release stages. No credentials, caches or backend changes.
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { runReleasePipeline } from './release-pipeline.mjs';

const root = process.cwd();
const command = process.argv[2] ?? 'status';
if (command === 'package' || command === 'distribute') {
  runReleasePipeline(command, { script: fileURLToPath(import.meta.url), cwd: root });
  process.exit(0);
}
const config = JSON.parse(fs.readFileSync('release.config.json', 'utf8'));
const dir = path.resolve('.migration-private/releases', `${config.mac}-ios${config.ios}`);
fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
const receiptPath = path.join(dir, 'receipt.json');
const receipt = fs.existsSync(receiptPath) ? JSON.parse(fs.readFileSync(receiptPath, 'utf8')) : {};
const env = { ...process.env };
delete env.GH_TOKEN; delete env.GITHUB_TOKEN;
delete env.SPACETIME_MIGRATION_TEST; delete env.SKIP_NOTARIZE;
const privateSettings = fs.existsSync('.env.local') ? fs.readFileSync('.env.local', 'utf8').split(/\r?\n/).flatMap(line => {
  const match = /^([A-Z_]+)=(.*)$/.exec(line);
  return match && /SECRET|PRIVATE_KEY|SERVICE_ROLE|PASSWORD|RESEND_API_KEY/.test(match[1])
    ? [match[2].replace(/^("|')(.*)\1$/, '$2')] : [];
}) : [];
privateSettings.push(env.APPLE_APP_PASSWORD ?? '');
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
function run(tool, args, label, cwd = root, extra = {}) {
  const result = spawnSync(tool, args, { cwd, env: { ...env, ...extra }, encoding: 'utf8', maxBuffer: 100 * 1024 * 1024 });
  if (label) fs.writeFileSync(path.join(dir, `${label}.log`), (result.stdout ?? '') + (result.stderr ?? ''), { mode: 0o600 });
  if (result.error || result.status !== 0) throw new Error(`${label ?? tool} failed; inspect the private release log.`);
  return result.stdout.trim();
}
const git = (...args) => run('git', args);
const head = git('rev-parse', 'HEAD');
function save() {
  const current = fs.existsSync(receiptPath) ? JSON.parse(fs.readFileSync(receiptPath, 'utf8')) : {};
  // Stages run sequentially; receipts also retain fields recorded by dashboard checks.
  Object.assign(receipt, { ...current, ...receipt });
  fs.writeFileSync(receiptPath, JSON.stringify(receipt, null, 2) + '\n', { mode: 0o600 });
}
function pin() {
  assert.equal(git('status', '--porcelain'), '', 'Commit source changes before preparing a release.');
  if (receipt.source) assert.equal(receipt.source, head, 'A release receipt belongs to another commit; bump release versions.');
  receipt.source = head; receipt.mac = config.mac; receipt.ios = config.ios; save();
}
function prepared() { pin(); assert(receipt.webFiles?.length, 'Run prepare first.'); verifyFiles('dist', receipt.webFiles); }
function files(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap(entry => entry.isDirectory()
    ? files(path.join(directory, entry.name)) : [path.join(directory, entry.name)]);
}
function inspectWeb(directory) {
  const list = files(directory).filter(file => !file.endsWith('/.DS_Store')).map(file => {
    const bytes = fs.readFileSync(file); const text = bytes.toString();
    for (const secret of privateSettings.filter(value => value.length > 10)) assert(!text.includes(secret), 'Private credential in web assets.');
    assert(!text.includes('rhguyvbysqmcwzeuqipr'), 'Old project in web assets.');
    assert(!/\b(?:sk|rk)_(?:live|test)_[A-Za-z0-9]+|sb_secret_|-----BEGIN (?:EC |RSA )?PRIVATE KEY-----/.test(text), 'Secret-like bytes in web assets.');
    for (const token of text.match(/[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]+/g) ?? []) {
      let claims; try { claims = JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString()); } catch { continue; }
      assert.notEqual(claims.role, 'service_role', 'Service credential in web assets.');
    }
    return { path: path.relative(directory, file), bytes: bytes.length, sha256: hash(bytes) };
  });
  const js = list.filter(file => file.path.endsWith('.js')).map(file => fs.readFileSync(path.join(directory, file.path), 'utf8')).join('\n');
  assert(js.includes('zzoeywmurqiqticikyaf'), 'Owned backend missing.');
  assert(list.some(file => /ownedCacheCompression\.worker-.*\.js$/.test(file.path)), 'Cache worker missing.');
  return list;
}
function verifyFiles(directory, list) { for (const file of list) assert.equal(hash(fs.readFileSync(path.join(directory, file.path))), file.sha256, `Changed build asset: ${file.path}`); }
function verifyIos(directory) {
  const app = path.join(directory, 'Products/Applications/App.app');
  const plist = file => JSON.parse(run('plutil', ['-convert', 'json', '-o', '-', file]));
  const main = plist(path.join(app, 'Info.plist'));
  const widget = plist(path.join(app, 'PlugIns/SpacetimeLiveActivity.appex/Info.plist'));
  assert.equal(main.CFBundleIdentifier, 'com.spacetimelabs.spacetime');
  assert.equal(main.CFBundleVersion, String(config.ios)); assert.equal(widget.CFBundleVersion, String(config.ios));
  verifyFiles(path.join(app, 'public'), receipt.webFiles);
  run('codesign', ['--verify', '--deep', '--strict', app], 'ios-signature');
  receipt.iosArchiveVerified = true; save();
}

if (command === 'prepare') {
  pin(); assert.equal(JSON.parse(fs.readFileSync('electron/package.json')).version, config.mac);
  if (!receipt.webFiles) {
    console.log('Building shared production assets…');
    run('npm', ['run', 'build'], 'web-build'); receipt.webFiles = inspectWeb('dist'); save();
  } else verifyFiles('dist', receipt.webFiles);
  console.log('Copying the same assets to both native projects…');
  run('npx', ['cap', 'copy', 'electron'], 'electron-copy');
  run('npx', ['cap', 'sync', 'ios'], 'ios-sync');
  verifyFiles('electron/app', receipt.webFiles); verifyFiles('ios/App/App/public', receipt.webFiles);
  receipt.nativeCopiesVerified = true; save();
} else if (command === 'mac') {
  prepared(); assert(receipt.nativeCopiesVerified); assert(env.APPLE_ID && env.APPLE_APP_PASSWORD, 'Apple signing credentials are required in the environment.');
  if (!receipt.macVerified) {
    console.log('Building and notarizing Mac package…');
    run('npx', ['tsc'], 'electron-compile', path.join(root, 'electron'));
    run('node', ['--test', 'tests/window-activation.test.cjs'], 'electron-tests', path.join(root, 'electron'));
    run('npx', ['electron-builder', 'build', '--mac', '--arm64', '-c', 'electron-builder.config.json', '--publish', 'never'], 'mac-package', path.join(root, 'electron'));
    const app = path.join(root, 'electron/dist/mac-arm64/Spacetime.app');
    run('codesign', ['--verify', '--deep', '--strict', app], 'mac-signature');
    run('xcrun', ['stapler', 'validate', app], 'mac-ticket');
    run('spctl', ['--assess', '--type', 'execute', '--verbose', app], 'mac-gatekeeper');
    run('hdiutil', ['verify', `electron/dist/Spacetime-${config.mac}-arm64.dmg`], 'mac-dmg');
    run('unzip', ['-tq', `electron/dist/Spacetime-${config.mac}-arm64.zip`], 'mac-zip');
    const { createRequire } = await import('node:module'); const require = createRequire(import.meta.url);
    const asar = require('../electron/node_modules/asar'); const packed = path.join(app, 'Contents/Resources/app.asar');
    for (const file of receipt.webFiles) assert.equal(hash(asar.extractFile(packed, `app/${file.path}`)), file.sha256, `Packaged Mac mismatch: ${file.path}`);
    const output = path.join(dir, 'mac'); fs.mkdirSync(output, { recursive: true });
    const names = [`Spacetime-${config.mac}-arm64.dmg`, `Spacetime-${config.mac}-arm64.dmg.blockmap`, `Spacetime-${config.mac}-arm64.zip`, `Spacetime-${config.mac}-arm64.zip.blockmap`, 'latest-mac.yml'];
    receipt.macAssets = names.map(name => { const bytes = fs.readFileSync(path.join(root, 'electron/dist', name)); fs.writeFileSync(path.join(output, name), bytes); return { name, bytes: bytes.length, sha256: hash(bytes) }; });
    receipt.macVerified = true; save();
  }
} else if (command === 'ios') {
  prepared(); assert(receipt.nativeCopiesVerified);
  const archive = path.join(dir, 'Spacetime.xcarchive');
  if (!receipt.iosArchiveVerified) {
    console.log('Archiving internal iPhone build…');
    run('xcodebuild', ['-project', 'ios/App/App.xcodeproj', '-scheme', 'App', '-configuration', 'Release', '-destination', 'generic/platform=iOS', '-archivePath', archive, '-derivedDataPath', path.resolve('.migration-private/ios-derived-data'), `CURRENT_PROJECT_VERSION=${config.ios}`, 'archive', '-allowProvisioningUpdates'], 'ios-archive');
    verifyIos(archive);
  }
} else if (command === 'upload-ios') {
  prepared(); assert(receipt.iosArchiveVerified); verifyIos(path.join(dir, 'Spacetime.xcarchive'));
  if (!receipt.iosUploaded) {
    const options = path.join(dir, 'internal-upload.plist');
    fs.writeFileSync(options, `<?xml version="1.0" encoding="UTF-8"?><plist version="1.0"><dict><key>destination</key><string>upload</string><key>manageAppVersionAndBuildNumber</key><false/><key>method</key><string>app-store-connect</string><key>signingStyle</key><string>automatic</string><key>teamID</key><string>Z78U44P95V</string><key>testFlightInternalTestingOnly</key><true/><key>uploadSymbols</key><true/></dict></plist>`);
    run('xcodebuild', ['-exportArchive', '-archivePath', path.join(dir, 'Spacetime.xcarchive'), '-exportOptionsPlist', options, '-exportPath', path.join(dir, 'ios-export'), '-allowProvisioningUpdates'], 'ios-upload');
    receipt.iosUploaded = true; receipt.iosAvailability = 'Awaiting App Store Connect processing/group verification'; save();
  }
} else if (command === 'web') {
  pin(); git('fetch', 'origin', 'main');
  if (!receipt.webCommit) {
    const base = git('rev-parse', 'origin/main'); const index = path.join(dir, 'web.index');
    const paths = ['src', 'public', 'index.html', 'package.json', 'package-lock.json', 'vite.config.ts', 'scripts/release.mjs', 'scripts/release-pipeline.mjs', 'scripts/release-pipeline.test.mjs', 'scripts/verify-release-web.mjs', 'release.config.json', 'docs/RELEASING.md'];
    const patch = run('git', ['diff', '--binary', config.webBaseSource, head, '--', ...paths]);
    const patchFile = path.join(dir, 'web.patch'); fs.writeFileSync(patchFile, patch + '\n');
    run('git', ['read-tree', base], 'web-read-tree', root, { GIT_INDEX_FILE: index });
    run('git', ['apply', '--cached', '--3way', patchFile], 'web-apply', root, { GIT_INDEX_FILE: index });
    const changed = run('git', ['diff', '--cached', '--name-only', base], null, root, { GIT_INDEX_FILE: index }).split('\n');
    assert(changed.every(file => paths.some(allowed => file === allowed || file.startsWith(allowed + '/'))));
    const tree = run('git', ['write-tree'], null, root, { GIT_INDEX_FILE: index });
    assert.equal(git('rev-parse', `${tree}:supabase`), git('rev-parse', `${base}:supabase`), 'Backend tree must remain unchanged.');
    const message = path.join(dir, 'web-message.txt'); fs.writeFileSync(message, `Release Spacetime ${config.mac}\n`);
    const commit = run('git', ['commit-tree', tree, '-p', base, '-F', message]);
    const candidate = path.join(dir, 'website'); fs.mkdirSync(candidate, { recursive: true });
    run('git', ['checkout-index', '-a', '--prefix', candidate + '/'], 'web-checkout', root, { GIT_INDEX_FILE: index });
    fs.symlinkSync(path.join(root, 'node_modules'), path.join(candidate, 'node_modules'));
    for (const file of changed.filter(file => file.startsWith('src/') && !file.startsWith('src/test/'))) assert.equal(git('show', `${commit}:${file}`), fs.readFileSync(file, 'utf8').trim());
    run('npm', ['run', 'build'], 'website-build', candidate);
    receipt.websiteFiles = inspectWeb(path.join(candidate, 'dist')); receipt.webBase = base; receipt.webCommit = commit; receipt.webChangedFiles = changed; save();
  }
} else if (command === 'check-release') {
  prepared();
  assert(receipt.nativeCopiesVerified && receipt.macVerified && receipt.iosArchiveVerified && receipt.webCommit, 'Package all three clients before distributing.');
  verifyIos(path.join(dir, 'Spacetime.xcarchive'));
  assert(receipt.macAssets?.length === 5, 'Mac updater/download assets are incomplete.');
  for (const file of receipt.macAssets) assert.equal(hash(fs.readFileSync(path.join(dir, 'mac', file.name))), file.sha256, `Changed Mac asset: ${file.name}`);
  git('fetch', 'origin', 'main');
  const current = git('rev-parse', 'origin/main');
  assert(current === receipt.webBase || current === receipt.webCommit, 'Main moved; reconcile before distributing.');
} else if (command === 'push-web') {
  pin(); assert(receipt.webCommit); git('fetch', 'origin', 'main');
  const current = git('rev-parse', 'origin/main');
  assert(current === receipt.webBase || current === receipt.webCommit, 'Main moved; reconcile before pushing.');
  if (current !== receipt.webCommit) run('git', ['push', 'origin', `${receipt.webCommit}:refs/heads/main`], 'web-push');
  receipt.webPushed = true; receipt.websitePublished = 'Awaiting Lovable Publish and live verification'; save();
} else if (command === 'publish-mac') {
  pin(); assert(receipt.macVerified); const tag = `v${config.mac}`;
  for (const file of receipt.macAssets) assert.equal(hash(fs.readFileSync(path.join(dir, 'mac', file.name))), file.sha256);
  const query = spawnSync('gh', ['release', 'view', tag, '--repo', config.repo, '--json', 'isDraft'], { env, encoding: 'utf8' });
  if (query.status !== 0) {
    const notes = path.join(dir, 'release-notes.md'); fs.writeFileSync(notes, (config.notes ?? `Spacetime ${config.mac} update. Existing account data is retained.`) + '\n');
    run('gh', ['release', 'create', tag, '--repo', config.repo, '--target', head, '--draft', '--title', `Spacetime ${config.mac}`, '--notes-file', notes], 'mac-release-draft');
  } else assert(JSON.parse(query.stdout).isDraft || receipt.macPublished, 'Existing public release requires explicit reconciliation.');
  if (!receipt.macPublished) {
    run('gh', ['release', 'upload', tag, '--repo', config.repo, ...receipt.macAssets.map(file => path.join(dir, 'mac', file.name)), '--clobber'], 'mac-release-assets');
    const actual = JSON.parse(run('gh', ['release', 'view', tag, '--repo', config.repo, '--json', 'assets']));
    for (const file of receipt.macAssets) { const remote = actual.assets.find(asset => asset.name === file.name); assert(remote && remote.size === file.bytes && remote.digest === `sha256:${file.sha256}`, `Remote Mac asset mismatch: ${file.name}`); }
    run('gh', ['release', 'edit', tag, '--repo', config.repo, '--draft=false', '--latest'], 'mac-release-publish');
    receipt.macPublished = true; save();
  }
} else if (command === 'verify-web') {
  const { verifyReleaseWeb } = await import('./verify-release-web.mjs');
  const proof = await verifyReleaseWeb({ receipt, dir, website: config.website, privateSettings });
  receipt.websiteProof = { appAssets: proof.appAssets, checkedAt: proof.at, cacheModuleMatched: true, workerMatched: true, repairInvariants: true };
  receipt.websitePublished = true; save();
} else if (command !== 'status') throw new Error('Use package, distribute, prepare, mac, ios, upload-ios, web, check-release, push-web, publish-mac, verify-web or status.');
console.log(JSON.stringify({ source: receipt.source, mac: config.mac, ios: config.ios, prepared: Boolean(receipt.nativeCopiesVerified), macVerified: receipt.macVerified ?? false, macPublished: receipt.macPublished ?? false, iosArchiveVerified: receipt.iosArchiveVerified ?? false, iosUploaded: receipt.iosUploaded ?? false, iosAvailability: receipt.iosAvailability ?? 'Not uploaded', webCommit: receipt.webCommit, websitePublished: receipt.websitePublished ?? false, receipt: receiptPath }, null, 2));
