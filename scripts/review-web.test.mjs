import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { collectAssets, outputConfig, verifyAsset } from './review-web.mjs';

test('hosting propagation waits for the exact candidate rather than accepting old assets', async () => {
  const expected = createHash('sha256').update('new').digest('hex');
  const responses = [new Response('', { status: 404 }), new Response('old'), new Response('new')];
  let calls = 0;
  await verifyAsset('https://review.vercel.app/app.js', expected, async () => responses[calls++], async () => {});
  assert.equal(calls, 3);
});

test('a permanently missing review asset stops verification after bounded attempts', async () => {
  let calls = 0;
  await assert.rejects(verifyAsset('https://review.vercel.app/app.js', 'missing', async () => {
    calls++; return new Response('', { status: 404 });
  }, async () => {}), /did not reach the prepared version/);
  assert.equal(calls, 8);
});

function fixture(files, verify) {
  const folder = fs.mkdtempSync(path.join(os.tmpdir(), 'spacetime-review-'));
  try {
    for (const [name, content] of Object.entries(files)) {
      const file = path.join(folder, name);
      fs.mkdirSync(path.dirname(file), { recursive: true });
      fs.writeFileSync(file, content);
    }
    verify(folder);
  } finally { fs.rmSync(folder, { recursive: true, force: true }); }
}

test('public assets get deterministic manifests and modified bytes change the digest', () => {
  fixture({ 'index.html': '<div id="root"></div>', 'assets/app.js': 'public app' }, folder => {
    const first = collectAssets(folder);
    assert.deepEqual(first.map(file => file.path), ['assets/app.js', 'index.html']);
    assert.deepEqual(first, collectAssets(folder));
    fs.writeFileSync(path.join(folder, 'assets/app.js'), 'changed app');
    assert.notEqual(first[0].sha256, collectAssets(folder)[0].sha256);
  });
});

test('source files and private exports stop review upload', () => {
  for (const name of ['.env.local', '.migration-private/export.json', 'auth_users.json', 'assets/code.js.map', 'AuthKey.p8', 'export.zip']) {
    fixture({ [name]: 'private' }, folder => assert.throws(() => collectAssets(folder), /Private\/source/));
  }
});

test('privileged tokens and known private values stop review upload', () => {
  const jwt = 'eyJhbGciOiJIUzI1NiJ9.' + Buffer.from(JSON.stringify({ role: 'service_role', ref: 'private-project' })).toString('base64url') + '.private_signature_12345';
  fixture({ 'assets/app.js': jwt }, folder => assert.throws(() => collectAssets(folder), /Privileged credential/));
  fixture({ 'assets/app.js': 'sb_secret_private123' }, folder => assert.throws(() => collectAssets(folder), /Private credential/));
  fixture({ 'assets/app.js': 'private-exact-value' }, folder => assert.throws(() => collectAssets(folder, ['private-exact-value']), /Private value/));
});

test('symlinks cannot upload private files outside the built directory', () => {
  fixture({ 'index.html': 'app' }, folder => {
    fs.symlinkSync('/etc/hosts', path.join(folder, 'external.txt'));
    assert.throws(() => collectAssets(folder), /symbolic links/);
  });
});

test('review serves app navigation, leaves missing assets as 404, and excludes indexing', () => {
  const { routes } = outputConfig();
  assert.equal(routes[0].headers['X-Robots-Tag'], 'noindex, nofollow');
  assert.equal(routes[1].handle, 'filesystem');
  assert.equal(routes[2].status, 404);
  assert(new RegExp(routes[2].src).test('/assets/missing.js'));
  assert(!new RegExp(routes[2].src).test('/auth/callback'));
  assert.equal(routes[3].dest, '/index.html');
});
