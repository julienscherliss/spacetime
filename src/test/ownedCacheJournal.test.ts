import type { CacheJournal, Workspace, Entries } from '@/lib/ownedCacheJournal';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
const A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const tasks = Array.from({ length: 400 }, (_, i) => ({ id: `task-${i}`, title: `Task ${i} 🌎`, note: 'Synthetic note '.repeat(50) }));
const taskRaw = (rows = tasks) => JSON.stringify({ state: { tasks: rows }, version: 0 });
const baseline = (rows = tasks) => ({ tasks: JSON.stringify(rows), library: '[]', categories: '[]' });
async function seed() {
  const cache = await import('@/lib/ownedDeviceCache');
  cache.openVerifiedOwnedCache(A);
  cache.accountCacheStorage.setItem('task-storage', taskRaw());
  cache.rememberOwnedBaseline(baseline());
  return cache;
}
class TestWorker {
  static workers: TestWorker[] = [];
  onmessage: ((event: { data: { request: number; encoded: string } }) => void) | null = null;
  onerror: (() => void) | null = null;
  message!: { request: number; workspace: Workspace };
  terminated = false;
  postCount = 0;
  constructor() { TestWorker.workers.push(this); }
  postMessage(message: TestWorker['message']) { this.postCount++; this.message = structuredClone(message); }
  terminate() { this.terminated = true; }
  async complete() {
    const { encodeDeviceStorage } = await import('@/lib/deviceStorageEncoding');
    this.onmessage?.({ data: { request: this.message.request, encoded: encodeDeviceStorage(JSON.stringify(this.message.workspace)) } });
  }
}
describe('durable small-change cache journal', () => {
  beforeEach(() => {
    vi.resetModules(); localStorage.clear(); vi.stubEnv('VITE_AUTH_BACKEND', 'owned');
    vi.stubEnv('VITE_SUPABASE_URL', 'https://zzoeywmurqiqticikyaf.supabase.co');
    TestWorker.workers = [];
  });
  afterEach(async () => {
    (await import('@/lib/ownedDeviceCache')).closeOwnedCache();
    vi.restoreAllMocks(); vi.unstubAllGlobals(); vi.unstubAllEnvs(); vi.useRealTimers();
  });
  it('saves exact pending edits, deletions and baselines across cold imports without bulk encoding', async () => {
    let c = await seed();
    const codec = await import('@/lib/deviceStorageEncoding');
    const encode = vi.spyOn(codec, 'encodeDeviceStorage');
    const edited = tasks.map((task, i) => i === 200 ? { ...task, title: 'Edited \ud800 🌎' } : task);
    c.accountCacheStorage.setItem('task-storage', taskRaw(edited));
    c.rememberOwnedBaseline(baseline(edited));
    c.accountCacheStorage.setItem('spaacetime.goals.v1', JSON.stringify({ state: { goals: [], lastCelebrated: {} } }));
    c.accountCacheStorage.removeItem('spaacetime.goals.v1');
    expect(encode).not.toHaveBeenCalled();
    expect(JSON.parse(localStorage.getItem(c.OWNED_CACHE_PREFIX + A)!).format).toBe(2);
    c.closeOwnedCache(); vi.resetModules(); c = await import('@/lib/ownedDeviceCache');
    c.openVerifiedOwnedCache(A);
    expect(c.accountCacheStorage.getItem('task-storage')).toBe(taskRaw(edited));
    expect(c.privateOwnedCopy()!.baseline).toEqual(baseline(edited));
    expect(c.accountCacheStorage.getItem('spaacetime.goals.v1')).toBeNull();
  });
  it('keeps sequential changes to distant rows small rather than rewriting the span between them', async () => {
    const c = await seed();
    const before = localStorage.getItem(c.OWNED_CACHE_PREFIX + A)!;
    let rows = tasks.map((task, i) => i === 0 ? { ...task, title: 'First edit' } : task);
    c.accountCacheStorage.setItem('task-storage', taskRaw(rows));
    rows = rows.map((task, i) => i === 399 ? { ...task, title: 'Last edit' } : task);
    c.accountCacheStorage.setItem('task-storage', taskRaw(rows));
    expect(localStorage.getItem(c.OWNED_CACHE_PREFIX + A)!.length - before.length).toBeLessThan(1500);
    c.closeOwnedCache(); c.openVerifiedOwnedCache(A);
    expect(c.accountCacheStorage.getItem('task-storage')).toBe(taskRaw(rows));
  });
  it('rejects invalid change ranges and owners before hydration or overwrite', async () => {
    const c = await seed();
    c.accountCacheStorage.setItem('task-storage', taskRaw(tasks.map((t, i) => i === 100 ? { ...t, title: 'Pending' } : t)));
    const stored = localStorage.getItem(c.OWNED_CACHE_PREFIX + A)!;
    const journal = JSON.parse(stored);
    for (const mutate of [(j: CacheJournal) => { const change = j.changes[0]; if (change.kind === 'entry' && change.patch) change.patch.start = -1; }, (j: CacheJournal) => { j.owner = B; },
      (j: CacheJournal) => { const change = j.changes[0]; if (change.kind === 'entry' && change.patch) change.patch.length++; }, (j: CacheJournal) => { j.changes.push({ kind: 'entry', name: '__proto__' as keyof Entries, patch: null }); }]) {
      c.closeOwnedCache(); const broken = structuredClone(journal); mutate(broken);
      localStorage.setItem(c.OWNED_CACHE_PREFIX + A, JSON.stringify(broken));
      expect(() => c.openVerifiedOwnedCache(A)).toThrow();
      expect(localStorage.getItem(c.OWNED_CACHE_PREFIX + A)).toBe(JSON.stringify(broken));
    }
  });
  it('compacts in a worker only after the edit is durable and preserves cold restart bytes', async () => {
    vi.stubGlobal('Worker', TestWorker); vi.useFakeTimers(); const c = await seed();
    const edited = tasks.map((task, i) => i === 10 ? { ...task, title: 'Pending worker edit' } : task);
    c.accountCacheStorage.setItem('task-storage', taskRaw(edited));
    const durable = localStorage.getItem(c.OWNED_CACHE_PREFIX + A)!;
    expect(JSON.parse(durable).format).toBe(2);
    expect(TestWorker.workers).toHaveLength(0);
    await vi.advanceTimersByTimeAsync(250);
    await TestWorker.workers[0].complete();
    expect(localStorage.getItem(c.OWNED_CACHE_PREFIX + A)).not.toBe(durable);
    c.closeOwnedCache(); c.openVerifiedOwnedCache(A);
    expect(c.accountCacheStorage.getItem('task-storage')).toBe(taskRaw(edited));
  });
  it('cannot compact over newer edits or another account', async () => {
    vi.stubGlobal('Worker', TestWorker); vi.useFakeTimers(); const c = await seed();
    const first = tasks.map((task, i) => i === 10 ? { ...task, title: 'First edit' } : task);
    c.accountCacheStorage.setItem('task-storage', taskRaw(first));
    await vi.advanceTimersByTimeAsync(250);
    const worker = TestWorker.workers[0];
    const latest = first.map((task, i) => i === 399 ? { ...task, title: 'Latest edit' } : task);
    c.accountCacheStorage.setItem('task-storage', taskRaw(latest));
    const durable = localStorage.getItem(c.OWNED_CACHE_PREFIX + A);
    await worker.complete();
    expect(localStorage.getItem(c.OWNED_CACHE_PREFIX + A)).toBe(durable);
    c.closeOwnedCache(); c.openVerifiedOwnedCache(B);
    await worker.complete();
    expect(c.accountCacheStorage.getItem('task-storage')).toBeNull();
    c.closeOwnedCache(); c.openVerifiedOwnedCache(A);
    expect(c.accountCacheStorage.getItem('task-storage')).toBe(taskRaw(latest));
  });
  it('keeps durable edits when the worker reports an error', async () => {
    vi.stubGlobal('Worker', TestWorker); vi.useFakeTimers(); const c = await seed();
    c.accountCacheStorage.setItem('task-storage', taskRaw(tasks.map((task, i) => i === 10 ? { ...task, title: 'Durable' } : task)));
    const durable = localStorage.getItem(c.OWNED_CACHE_PREFIX + A);
    await vi.advanceTimersByTimeAsync(250);
    TestWorker.workers[0].onerror?.();
    expect(localStorage.getItem(c.OWNED_CACHE_PREFIX + A)).toBe(durable);
    c.closeOwnedCache(); c.openVerifiedOwnedCache(A);
    expect(c.accountCacheStorage.getItem('task-storage')).toContain('Durable');
  });
  it('keeps the journal on a failed background checkpoint without a retry loop', async () => {
    vi.stubGlobal('Worker', TestWorker); vi.useFakeTimers(); const c = await seed();
    c.accountCacheStorage.setItem('task-storage', taskRaw(tasks.map((t, i) => i === 5 ? { ...t, title: 'Durable despite quota' } : t)));
    const durable = localStorage.getItem(c.OWNED_CACHE_PREFIX + A);
    await vi.advanceTimersByTimeAsync(250);
    const worker = TestWorker.workers[0];
    const write = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new DOMException('Quota', 'QuotaExceededError'); });
    await worker.complete(); await vi.advanceTimersByTimeAsync(1000);
    expect(worker.postCount).toBe(1);
    expect(localStorage.getItem(c.OWNED_CACHE_PREFIX + A)).toBe(durable);
    write.mockRestore(); c.closeOwnedCache(); c.openVerifiedOwnedCache(A);
    expect(c.accountCacheStorage.getItem('task-storage')).toContain('Durable despite quota');
  });
  it('can recover a journal quota error with a complete compressed checkpoint', async () => {
    const c = await seed(); const write = Storage.prototype.setItem;
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(function(key, value) {
      if (value.startsWith('{"format":2')) throw new DOMException('Quota', 'QuotaExceededError');
      write.call(this, key, value);
    });
    const edited = tasks.map((t, i) => i === 20 ? { ...t, title: 'Fits compressed' } : t);
    c.accountCacheStorage.setItem('task-storage', taskRaw(edited));
    c.closeOwnedCache(); c.openVerifiedOwnedCache(A);
    expect(c.accountCacheStorage.getItem('task-storage')).toBe(taskRaw(edited));
  });
});
