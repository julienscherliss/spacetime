// Lovable rebuilds chunks: verify its real asset graph, stable cache/worker code
// and this release's interaction invariants, rather than guessing chunk names.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';

export async function verifyReleaseWeb({ receipt, dir, website, privateSettings }) {
  assert(receipt.webPushed, 'Push the reviewed hosting commit and publish it first.');
  const response = await fetch(website + '/', { cache: 'no-store', signal: AbortSignal.timeout(20000) });
  assert.equal(response.status, 200);
  const html = await response.text();
  const queue = [...html.matchAll(/(?:src|href)="([^"]+\.js)"/g)].map(match => new URL(match[1], website).href);
  const seen = new Map();
  while (queue.length) {
    const url = queue.shift();
    if (seen.has(url) || !url.startsWith(website + '/assets/')) continue;
    const result = await fetch(url, { signal: AbortSignal.timeout(20000), cache: 'no-store' });
    assert.equal(result.status, 200, 'Missing live app asset: ' + url);
    const text = await result.text(); seen.set(url, text);
    for (const match of text.matchAll(/["'`]((?:\.\/|\/assets\/|assets\/)[^"'`\s]+\.js)["'`]/g)) {
      queue.push(new URL(match[1], match[1].startsWith('assets/') ? website : url).href);
    }
  }
  assert(seen.size > 10, 'Incomplete app asset graph.');
  const all = [...seen.values()].join('\n');
  assert(all.includes('zzoeywmurqiqticikyaf') && !all.includes('rhguyvbysqmcwzeuqipr'), 'Wrong backend in live app.');
  assert(!/\b(?:sk|rk)_(?:live|test)_[A-Za-z0-9]+|sb_secret_|-----BEGIN (?:EC |RSA )?PRIVATE KEY-----/.test(all), 'Secret-like bytes in live app.');
  for (const value of privateSettings.filter(value => value.length > 10)) assert(!all.includes(value), 'Private credential in live app.');
  for (const token of all.match(/[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]+/g) ?? []) {
    let claims; try { claims = JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString()); } catch { continue; }
    assert.notEqual(claims.role, 'service_role', 'Service credential in live app.');
  }
  const normalized = text => text.replace(/([\w.]+)-[A-Za-z0-9_-]{8}\.js/g, '$1-HASH.js');
  for (const name of ['ownedCacheCompression.worker', 'ownedDeviceCache']) {
    const expected = receipt.websiteFiles.find(file => file.path.startsWith('assets/' + name + '-'));
    assert(expected, 'Missing prepared module: ' + name);
    const live = [...seen].find(([url]) => new URL(url).pathname.startsWith('/assets/' + name + '-'));
    assert(live, 'Missing live module: ' + name);
    assert.equal(normalized(live[1]), normalized(fs.readFileSync(path.join(dir, 'website/dist', expected.path), 'utf8')), 'Live cache/worker differs from verified code: ' + name);
  }
  const policies = [...all.matchAll(/partialize:[A-Za-z_$][\w$]*=>\(\{([^}]+)\}\)/g)].map(match => match[1]);
  assert(policies.some(policy => /tasks:/.test(policy) && /viewMode:/.test(policy) && !/editingTask|focusTask|currentDate:/.test(policy)), 'Task editor persistence repair missing.');
  assert(policies.some(policy => /items:/.test(policy) && /categories:/.test(policy) && !/panelOpen:|editingItemId:/.test(policy)), 'Library editor persistence repair missing.');
  assert(/inWaitingRoom:\(([\w$]+)\.in_waiting_room\?\?!1\)&&!\(\1\.completed&&\1\.date&&\1\.time\)/.test(all), 'Limbo conversion repair missing.');
  assert(all.includes('newDuration:'), 'Combined drop/reflection duration support missing.');
  const proof = { at: new Date().toISOString(), hostingCommit: receipt.webCommit, appAssets: seen.size,
    cacheModuleMatchedIgnoringChunkNames: true, workerMatched: true, interactionAndLimboInvariants: true,
    privateValuesAbsent: true, oldReferences: 0,
    limits: 'Host rebuild uses different bundling/minification. Core cache/worker code and repair invariants are checked; whole bundle byte identity is not claimed. Also perform bounded rendered startup/navigation/reopen checks.',
    assets: [...seen].map(([url, text]) => ({ url, sha256: createHash('sha256').update(text).digest('hex') })) };
  fs.writeFileSync(path.join(dir, 'live-web-proof.json'), JSON.stringify(proof, null, 2), { mode: 0o600 });
  return proof;
}
