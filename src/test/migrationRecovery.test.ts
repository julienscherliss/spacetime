import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CACHE_FIELDS, RECOVERY_KEY, preserveDeviceCache, quarantineDeviceCache, privateRecoveryFile } from '@/lib/migrationRecovery';
import { startProtectedApp } from '@/lib/protectedBootstrap';

const taskRaw = JSON.stringify({ state: { tasks: [{ id: 'legacy', title: 'Unsaved task' }] }, version: 0 });
describe('device recovery before store/Auth imports', () => {
  beforeEach(() => { localStorage.clear(); document.body.innerHTML = '<div id="root"></div>'; });

  it('copies exact bytes, quarantines caches before the loader, and never reads Auth keys', async () => {
    localStorage.setItem('task-storage', taskRaw);
    localStorage.setItem('sb-old-auth-token', 'never-copy');
    const get = vi.spyOn(Storage.prototype, 'getItem');
    const loader = vi.fn(async () => {
      expect(localStorage.getItem('task-storage')).toBeNull();
      expect(JSON.parse(localStorage.getItem(RECOVERY_KEY)!).copies[0].entries['task-storage']).toBe(taskRaw);
    });
    await startProtectedApp(document.getElementById('root')!, localStorage, loader);
    expect(loader).toHaveBeenCalledOnce();
    expect(get.mock.calls.some(([key]) => key === 'sb-old-auth-token')).toBe(false);
    expect(privateRecoveryFile(localStorage)).not.toContain('never-copy');
    expect(document.body.textContent).not.toContain('Unsaved task');
    get.mockRestore();
  });

  it('retains the first copy across empty and different-account sessions without assigning ownership', () => {
    localStorage.setItem('do-task-store', taskRaw);
    const first = quarantineDeviceCache(localStorage).copies[0];
    expect(quarantineDeviceCache(localStorage).copies).toEqual([first]);
    localStorage.setItem('task-storage', JSON.stringify({ state: { tasks: [{ id: 'different', title: 'Other account' }] } }));
    const copies = quarantineDeviceCache(localStorage).copies;
    expect(copies).toHaveLength(2);
    expect(copies[0]).toEqual(first);
    expect(copies.every(copy => copy.owner === null)).toBe(true);
  });

  it('does not replace a private copy with changes to view preferences', () => {
    localStorage.setItem('task-storage', taskRaw);
    preserveDeviceCache(localStorage);
    localStorage.setItem('task-storage', JSON.stringify({ state: { tasks: [{ id: 'legacy', title: 'Unsaved task' }], viewMode: 'month' } }));
    expect(preserveDeviceCache(localStorage).copies).toHaveLength(1);
  });

  it('stops before imports and leaves caches intact when quota/readback verification fails', async () => {
    localStorage.setItem('task-storage', taskRaw);
    const set = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new DOMException('full', 'QuotaExceededError'); });
    const loader = vi.fn();
    await startProtectedApp(document.getElementById('root')!, localStorage, loader);
    expect(loader).not.toHaveBeenCalled();
    expect(localStorage.getItem('task-storage')).toBe(taskRaw);
    expect(document.body.textContent).toContain('Keep your device data safe');
    expect(privateRecoveryFile(localStorage)).toContain('Unsaved task');
    set.mockRestore();
  });

  it('stops on corrupt cache or journal and does not erase either', async () => {
    for (const key of ['task-storage', RECOVERY_KEY]) {
      localStorage.clear(); localStorage.setItem(key, '{broken');
      const loader = vi.fn();
      await startProtectedApp(document.getElementById('root')!, localStorage, loader);
      expect(loader).not.toHaveBeenCalled();
      expect(localStorage.getItem(key)).toBe('{broken');
    }
  });

  it('treats valid JSON with an invalid cache shape as corruption', () => {
    const raw = JSON.stringify({ state: { tasks: 'invalid array' } });
    localStorage.setItem('task-storage', raw);
    expect(() => quarantineDeviceCache(localStorage)).toThrow();
    expect(localStorage.getItem('task-storage')).toBe(raw);
  });

  it('rejects missing backup readback and does not clear original bytes', () => {
    localStorage.setItem('task-storage', taskRaw);
    const set = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {});
    expect(() => quarantineDeviceCache(localStorage)).toThrow();
    expect(localStorage.getItem('task-storage')).toBe(taskRaw);
    set.mockRestore();
  });

  it('rejects corrupt saved evidence before deduplication can authorize cache clearing', () => {
    localStorage.setItem('task-storage', taskRaw);
    const journal = preserveDeviceCache(localStorage);
    journal.copies[0].entries['task-storage'] = '{broken';
    localStorage.setItem(RECOVERY_KEY, JSON.stringify(journal));
    expect(() => quarantineDeviceCache(localStorage)).toThrow();
    expect(localStorage.getItem('task-storage')).toBe(taskRaw);
  });

  it('blocks unknown legacy calendar credentials instead of exporting them', () => {
    localStorage.setItem('do-calendar-store', JSON.stringify({ state: { refreshToken: 'never-export' } }));
    expect(() => quarantineDeviceCache(localStorage)).toThrow();
    expect(() => privateRecoveryFile(localStorage)).toThrow();
    expect(localStorage.getItem('do-calendar-store')).toContain('never-export');
  });

  it('handles inaccessible storage without importing the app', async () => {
    const loader = vi.fn();
    await startProtectedApp(document.getElementById('root')!, () => { throw new Error('storage unavailable'); }, loader);
    expect(loader).not.toHaveBeenCalled();
    expect(document.body.textContent).toContain('Keep your device data safe');
  });

  it('does not silently discard evidence when the bounded journal is full', () => {
    for (let i = 0; i < 16; i++) {
      localStorage.setItem('task-storage', JSON.stringify({ state: { tasks: [{ id: String(i) }] } }));
      preserveDeviceCache(localStorage);
    }
    const before = localStorage.getItem(RECOVERY_KEY);
    localStorage.setItem('task-storage', taskRaw);
    expect(() => quarantineDeviceCache(localStorage)).toThrow();
    expect(localStorage.getItem(RECOVERY_KEY)).toBe(before);
    expect(localStorage.getItem('task-storage')).toBe(taskRaw);
    expect(Object.keys(CACHE_FIELDS)).not.toContain('sb-old-auth-token');
  });
});
