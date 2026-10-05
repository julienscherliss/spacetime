import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
const A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const raw = JSON.stringify({ state: { goals: [{ id: 'synthetic-goal' }], lastCelebrated: {} } });
describe('owned cache persistence and evidence boundaries', () => {
  beforeEach(() => { vi.resetModules(); localStorage.clear(); vi.stubEnv('VITE_AUTH_BACKEND', 'owned');
    vi.stubEnv('VITE_SUPABASE_URL', 'https://zzoeywmurqiqticikyaf.supabase.co'); });
  afterEach(() => { vi.restoreAllMocks(); vi.unstubAllEnvs(); });
  it('does not hydrate before verified activation, survives cold imports, and separates accounts', async () => {
    let c = await import('@/lib/ownedDeviceCache');
    c.openVerifiedOwnedCache(A); c.accountCacheStorage.setItem('spaacetime.goals.v1', raw);
    c.closeOwnedCache(); c.accountCacheStorage.setItem('spaacetime.goals.v1', JSON.stringify({ state: { goals: [] } }));
    expect(c.accountCacheStorage.getItem('spaacetime.goals.v1')).toBeNull();
    vi.resetModules(); c = await import('@/lib/ownedDeviceCache');
    expect(c.accountCacheStorage.getItem('spaacetime.goals.v1')).toBeNull();
    c.openVerifiedOwnedCache(B); expect(c.accountCacheStorage.getItem('spaacetime.goals.v1')).toBeNull();
    c.closeOwnedCache(); c.openVerifiedOwnedCache(A);
    expect(c.accountCacheStorage.getItem('spaacetime.goals.v1')).toBe(raw);
  });
  it('fails closed on quota and retains the previous verified workspace', async () => {
    const c = await import('@/lib/ownedDeviceCache'); c.openVerifiedOwnedCache(A);
    c.accountCacheStorage.setItem('spaacetime.goals.v1', raw);
    const before = localStorage.getItem(c.OWNED_CACHE_PREFIX + A);
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('quota'); });
    expect(() => c.accountCacheStorage.setItem('spaacetime.goals.v1', JSON.stringify({ state: { goals: [] } }))).toThrow();
    expect(localStorage.getItem(c.OWNED_CACHE_PREFIX + A)).toBe(before);
    const r = await import('@/lib/migrationRecovery'); expect(r.isRecoveryBlocked()).toBe(true);
  });
  it('refuses corrupt evidence, wrong owner/project and wrong configured backend before opening', async () => {
    for (const mutation of ['corrupt','owner','project']) {
      vi.resetModules(); const c = await import('@/lib/ownedDeviceCache');
      const original = { format: 1, owner: A, project: 'zzoeywmurqiqticikyaf', entries: {}, baseline: null, review: [] };
      if (mutation === 'owner') original.owner = B;
      if (mutation === 'project') original.project = 'wrong';
      localStorage.setItem(c.OWNED_CACHE_PREFIX + A, mutation === 'corrupt' ? '{broken' : JSON.stringify(original));
      expect(() => c.openVerifiedOwnedCache(A)).toThrow(); expect(c.currentOwnedCacheOwner()).toBeNull();
    }
    vi.stubEnv('VITE_SUPABASE_URL', 'https://wrong.supabase.co'); vi.resetModules();
    const c = await import('@/lib/ownedDeviceCache'); expect(() => c.openVerifiedOwnedCache(A)).toThrow();
  });
  it('exports only the active verified account and never reads Auth/session keys', async () => {
    const c = await import('@/lib/ownedDeviceCache');
    c.openVerifiedOwnedCache(A); c.accountCacheStorage.setItem('spaacetime.goals.v1', raw);
    c.openVerifiedOwnedCache(B); c.accountCacheStorage.setItem('spaacetime.goals.v1', JSON.stringify({ state: { goals: [{ id: 'B-only' }] } }));
    localStorage.setItem('sb-auth-token', 'never-export');
    const get = vi.spyOn(Storage.prototype, 'getItem');
    const result = JSON.stringify(c.privateOwnedCopy());
    expect(result).toContain('B-only'); expect(result).not.toContain('synthetic-goal'); expect(result).not.toContain('never-export');
    expect(get.mock.calls.some(([key]) => key === 'sb-auth-token')).toBe(false);
  });
  it('refuses an unverified write/readback and keeps earlier cache bytes', async () => {
    const c = await import('@/lib/ownedDeviceCache'); c.openVerifiedOwnedCache(A);
    c.accountCacheStorage.setItem('spaacetime.goals.v1', raw);
    const before = localStorage.getItem(c.OWNED_CACHE_PREFIX + A);
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {});
    expect(() => c.accountCacheStorage.setItem('spaacetime.goals.v1', JSON.stringify({ state: { goals: [] } }))).toThrow();
    expect(localStorage.getItem(c.OWNED_CACHE_PREFIX + A)).toBe(before);
  });
});
