import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CACHE_FIELDS, RECOVERY_KEY } from '@/lib/migrationRecovery';
import { AUTHORITATIVE_CACHE_MARKER, CURRENT_OWNED_CACHE_PREFIX, PREVIOUS_OWNED_CACHE_PREFIX,
  prepareAuthoritativeCache, startAuthoritativeApp } from '@/lib/authoritativeBootstrap';

describe('approved transition to authoritative server data', () => {
  beforeEach(() => { vi.restoreAllMocks(); localStorage.clear(); document.body.innerHTML = '<div id="root"></div>'; });

  it('discards even corrupt/full migration copies before imports, retaining Auth and preferences', async () => {
    for (const key of Object.keys(CACHE_FIELDS)) localStorage.setItem(key, '{obsolete');
    localStorage.setItem(RECOVERY_KEY, '{obsolete');
    localStorage.setItem(PREVIOUS_OWNED_CACHE_PREFIX + 'first', '{obsolete');
    localStorage.setItem(PREVIOUS_OWNED_CACHE_PREFIX + 'second', '{obsolete');
    localStorage.setItem('sb-owned-auth-token', 'keep-session');
    localStorage.setItem('theme', 'dark');
    const loader = vi.fn(async () => {
      for (const key of [...Object.keys(CACHE_FIELDS), RECOVERY_KEY,
        PREVIOUS_OWNED_CACHE_PREFIX + 'first', PREVIOUS_OWNED_CACHE_PREFIX + 'second']) expect(localStorage.getItem(key)).toBeNull();
    });
    await startAuthoritativeApp(document.getElementById('root')!, loader, true);
    expect(loader).toHaveBeenCalledOnce();
    expect(localStorage.getItem('sb-owned-auth-token')).toBe('keep-session');
    expect(localStorage.getItem('theme')).toBe('dark');
    expect(document.body.textContent).not.toContain('Download private device copy');
    expect(document.body.textContent).not.toContain('Keep your device data safe');
  });

  it('never resets future offline edits, including when the marker is lost', () => {
    const pending = 'future pending changes';
    prepareAuthoritativeCache(localStorage);
    localStorage.setItem(CURRENT_OWNED_CACHE_PREFIX + 'owner', pending);
    prepareAuthoritativeCache(localStorage);
    expect(localStorage.getItem(CURRENT_OWNED_CACHE_PREFIX + 'owner')).toBe(pending);
    localStorage.removeItem(AUTHORITATIVE_CACHE_MARKER);
    prepareAuthoritativeCache(localStorage);
    expect(localStorage.getItem(CURRENT_OWNED_CACHE_PREFIX + 'owner')).toBe(pending);
  });

  it('does not initialize stores if a reset was not acknowledged; retry can complete', async () => {
    localStorage.setItem(RECOVERY_KEY, '{obsolete');
    const remove = vi.spyOn(Storage.prototype, 'removeItem').mockImplementation(() => {});
    const loader = vi.fn(async () => {});
    await startAuthoritativeApp(document.getElementById('root')!, loader, true);
    expect(loader).not.toHaveBeenCalled();
    expect(localStorage.getItem(AUTHORITATIVE_CACHE_MARKER)).toBeNull();
    remove.mockRestore();
    await startAuthoritativeApp(document.getElementById('root')!, loader, true);
    expect(loader).toHaveBeenCalledOnce();
  });

  it('does not touch the source-backend client cache', async () => {
    localStorage.setItem('task-storage', 'untouched source data');
    await startAuthoritativeApp(document.getElementById('root')!, async () => {}, false);
    expect(localStorage.getItem('task-storage')).toBe('untouched source data');
  });
});
