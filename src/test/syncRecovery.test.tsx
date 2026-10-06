import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, waitFor } from '@testing-library/react';

describe('failed-save and account recovery guards', () => {
  beforeEach(() => { vi.resetModules(); localStorage.clear(); vi.unstubAllEnvs(); });
  afterEach(() => { cleanup(); vi.restoreAllMocks(); });

  async function harness(native = false, owned = false) {
    if (owned) { vi.stubEnv('VITE_AUTH_BACKEND', 'owned'); vi.stubEnv('VITE_SUPABASE_URL', 'https://zzoeywmurqiqticikyaf.supabase.co'); }
    else { vi.stubEnv('VITE_AUTH_BACKEND', 'lovable'); }
    const userA = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
    const userB = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
    let authId = userA;
    let authFailure = false;
    let fail = true;
    const id = '11111111-1111-4111-8111-111111111111';
    const rows: Record<string, any[]> = {
      tasks: [{ id, user_id: userA, title: 'Server task', type: 'one-time', date: '2026-10-04',
        created_at: '2026-10-04T00:00:00Z', group_order: 0 }],
      library_items: [{ id, user_id: userA, title: 'Server library' }],
      library_categories: [{ id, user_id: userA, value: 'work', label: 'Work' }],
    };
    let deferTasks: Promise<any> | null = null;
    const ranges = Object.fromEntries(Object.keys(rows).map(table => [table, vi.fn(() =>
      table === 'tasks' && deferTasks ? deferTasks : Promise.resolve({ data: structuredClone(rows[table]), error: null }))]));
    const writes = Object.fromEntries(Object.keys(rows).map(table => [table, vi.fn((values?: any[]) => {
      if (!fail && values) for (const value of values) {
        const index = rows[table].findIndex(row => table === 'library_categories' ? row.value === value.value : row.id === value.id);
        if (index < 0) rows[table].push(value); else rows[table][index] = { ...rows[table][index], ...value };
      }
      return Promise.resolve({ error: fail ? { message: 'offline' } : null });
    })]));
    const handlers: Record<string, (payload: any) => void> = {};
    const channel = { on: vi.fn((_kind, config, callback) => { handlers[config.table] = callback; return channel; }),
      subscribe: vi.fn(() => channel) };
    let appState: ((value: { isActive: boolean }) => Promise<void>) | undefined;
    vi.doMock('@capacitor/app', () => ({ App: { addListener: vi.fn(async (_event, callback) => {
      appState = callback; return { remove: vi.fn() };
    }) } }));
    vi.doMock('@/utils/nativePlatform', () => ({ isNativePlatform: () => native, isElectron: () => false }));
    vi.doMock('@/integrations/supabase/client', () => ({ supabase: {
      from: (table: string) => ({ select: () => ({ eq: () => ({ order: () => ({ range: ranges[table] }) }) }),
        upsert: writes[table], update: (patch: any) => ({ eq: () => ({ eq: () => {
          if (!fail) rows[table][0] = { ...rows[table][0], ...patch };
          return writes[table]();
        } }) }) }),
      auth: { getUser: vi.fn(async () => ({ data: { user: { id: authId } }, error: authFailure ? { message: 'offline' } : null })), getSession: async () => ({ data: { session: null } }),
        onAuthStateChange: () => ({ data: { subscription: { unsubscribe: vi.fn() } } }) },
      channel: () => channel, removeChannel: vi.fn(),
    } }));
    const React = await import('react');
    const sync = await import('@/hooks/useDataSync');
    const { useTaskStore: tasks } = await import('@/store/taskStore');
    const { useLibraryStore: library } = await import('@/store/libraryStore');
    function Harness({ userId }: { userId: string }) { sync.useDataSync({ id: userId } as any); return null; }
    let view = render(React.createElement(Harness, { userId: userA }));
    await waitFor(() => expect(sync.isInitialSyncComplete()).toBe(true));
    return { rows, ranges, writes, handlers, tasks, library, sync, userA, userB,
      restart: async () => { view.unmount(); view = render(React.createElement(Harness, { userId: authId })); await waitFor(() => expect(sync.isInitialSyncComplete()).toBe(true)); },
      unmount: () => view.unmount(),
      denyAuth: () => { authFailure = true; },
      resume: async () => {
        if (native) { await waitFor(() => expect(appState).toBeDefined()); await appState!({ isActive: false }); await appState!({ isActive: true }); }
        else {
          Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'hidden' });
          fireEvent(document, new Event('visibilitychange'));
          Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'visible' });
          fireEvent(document, new Event('visibilitychange'));
        }
      }, succeed: () => { fail = false; }, defer: (promise: Promise<any>) => { deferTasks = promise; },
      switchUser: (id = userB) => { authId = id; view.rerender(React.createElement(Harness, { userId: id })); } };
  }

  for (const [table, native] of [['tasks', false], ['library_items', false], ['library_categories', false], ['tasks', true]] as const) {
    it(`keeps unsaved ${table} through ${native ? 'native resume' : 'web resume and realtime'} and resolved API errors`, async () => {
      const h = await harness(native);
      if (table === 'tasks') h.tasks.setState({ tasks: h.tasks.getState().tasks.map(row => ({ ...row, title: 'Unsaved' })) });
      if (table === 'library_items') h.library.setState({ items: h.library.getState().items.map(row => ({ ...row, title: 'Unsaved' })) });
      if (table === 'library_categories') h.library.setState({ categories: [{ value: 'work', label: 'Unsaved' }] });
      await waitFor(() => expect(h.writes[table]).toHaveBeenCalled());
      await h.resume();
      h.handlers[table]({ eventType: 'UPDATE', new: { id: h.rows.tasks[0].id } });
      await new Promise(resolve => setTimeout(resolve, 500));
      expect(h.ranges.tasks).toHaveBeenCalledTimes(1);
      const label = table === 'tasks' ? h.tasks.getState().tasks[0].title : table === 'library_items'
        ? h.library.getState().items[0].title : h.library.getState().categories[0].label;
      expect(label).toBe('Unsaved');
    });
  }

  it('rejects a read that began clean but finished after a local edit', async () => {
    const h = await harness();
    let resolve!: (value: any) => void;
    h.defer(new Promise(r => { resolve = r; }));
    const read = h.sync.loadFromDB(h.userA);
    h.tasks.setState({ tasks: h.tasks.getState().tasks.map(row => ({ ...row, title: 'New edit during read' })) });
    resolve({ data: h.rows.tasks, error: null });
    expect(await read).toBe(false);
    expect(h.tasks.getState().tasks[0].title).toBe('New edit during read');
  });

  it('quarantines the previous account rather than uploading its cache to an empty account', async () => {
    const h = await harness();
    const { useGoalsStore: goals } = await import('@/store/goalsStore');
    const { useReflectionStore: reflection } = await import('@/store/reflectionStore');
    const { useCalendarStore: calendar } = await import('@/store/calendarStore');
    goals.setState({ goals: [{ id: 'local-goal', title: 'Prior private goal' } as any], lastCelebrated: { 'local-goal': 'old' } });
    reflection.setState({ customReasons: ['Prior private reflection'] });
    calendar.setState({ completedEventIds: ['prior-event'], eventCategories: { 'prior-event': 'private-category' } });
    localStorage.setItem('do-task-store', JSON.stringify({ state: { tasks: [{ id: 'old', title: 'Prior account private task' }] } }));
    localStorage.setItem('do-library-store', JSON.stringify({ state: { items: [{ id: crypto.randomUUID(), title: 'Prior private library' }] } }));
    h.rows.tasks = []; h.rows.library_items = []; h.rows.library_categories = [];
    h.switchUser();
    await waitFor(() => expect(h.ranges.tasks).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(h.tasks.getState().tasks).toEqual([]));
    expect(h.library.getState().items).toEqual([]);
    expect(goals.getState().goals).toEqual([]);
    expect(reflection.getState().customReasons).toEqual([]);
    expect(calendar.getState().eventCategories).toEqual({});
    expect(Object.values(h.writes).every(write => write.mock.calls.length === 0)).toBe(true);
    expect(localStorage.getItem('spacetime-migration-recovery:v1')).toContain('Prior private library');
    expect(localStorage.getItem('spacetime-migration-recovery:v1')).toContain('Prior private goal');
    expect(localStorage.getItem('spacetime-migration-recovery:v1')).toContain('Prior private reflection');
  });

  it('resumes normal refetch after an acknowledged retry while retaining unrelated remote fields', async () => {
    const h = await harness();
    h.tasks.setState({ tasks: h.tasks.getState().tasks.map(row => ({ ...row, title: 'Unsaved' })) });
    await waitFor(() => expect(h.writes.tasks).toHaveBeenCalled());
    h.rows.tasks[0].duration = 90;
    h.succeed(); await h.resume();
    await waitFor(() => expect(h.ranges.tasks).toHaveBeenCalledTimes(2));
    expect(h.tasks.getState().tasks[0].title).toBe('Unsaved');
    expect(h.tasks.getState().tasks[0].duration).toBe(90);
  });

  it('keeps new owned goals/reflections/calendar across repeated restarts without filling the legacy journal', async () => {
    const h = await harness(false, true);
    const { useGoalsStore: goals } = await import('@/store/goalsStore');
    const { useReflectionStore: reflection } = await import('@/store/reflectionStore');
    const { useCalendarStore: calendar } = await import('@/store/calendarStore');
    const { quarantineDeviceCache, RECOVERY_KEY } = await import('@/lib/migrationRecovery');
    for (let i = 0; i < 20; i++) {
      const goal = goals.getState().addGoal({ tag: 'work', metric: 'completed-tasks', period: 'daily', target: i + 1 });
      reflection.setState({ customReasons: [`Reflection ${i}`] });
      calendar.setState({ completedEventIds: [`event-${i}`] });
      quarantineDeviceCache(localStorage); // actual pre-import bootstrap operation
      await h.restart();
      expect(goals.getState().goals.some(row => row.id === goal)).toBe(true);
      expect(reflection.getState().customReasons).toEqual([`Reflection ${i}`]);
      expect(calendar.getState().completedEventIds).toEqual([`event-${i}`]);
    }
    expect(localStorage.getItem(RECOVERY_KEY)).toBeNull();
  });

  it('retains A local work while B is signed in, and restores it only after A is verified again', async () => {
    const h = await harness(false, true);
    const { useGoalsStore: goals } = await import('@/store/goalsStore');
    const { privateOwnedCopy, currentOwnedCacheOwner } = await import('@/lib/ownedDeviceCache');
    goals.getState().addGoal({ tag: 'private-a', metric: 'completed-tasks', period: 'daily', target: 3 });
    const original = privateOwnedCopy()!.entries['spaacetime.goals.v1'];
    h.switchUser();
    await waitFor(() => expect(currentOwnedCacheOwner()).toBe(h.userB));
    await waitFor(() => expect(h.sync.isInitialSyncComplete()).toBe(true));
    expect(goals.getState().goals).toEqual([]);
    goals.getState().addGoal({ tag: 'private-b', metric: 'completed-tasks', period: 'daily', target: 4 });
    h.switchUser(h.userA);
    await waitFor(() => expect(goals.getState().goals[0]?.tag).toBe('private-a'));
    expect(privateOwnedCopy()!.entries['spaacetime.goals.v1']).toBe(original);
    expect(Object.values(h.writes).every(write => write.mock.calls.length === 0)).toBe(true);
  });

  it('restores failed owned task/library/category saves after restart against an unchanged server baseline, then retries', async () => {
    const h = await harness(false, true);
    h.tasks.setState({ tasks: h.tasks.getState().tasks.map(row => ({ ...row, title: 'Pending restart task' })) });
    h.library.setState({ items: h.library.getState().items.map(row => ({ ...row, title: 'Pending restart library' })),
      categories: h.library.getState().categories.map(row => ({ ...row, label: 'Pending restart category' })) });
    await waitFor(() => expect(h.writes.tasks).toHaveBeenCalled());
    await h.restart();
    expect(h.tasks.getState().tasks[0].title).toBe('Pending restart task');
    expect(h.library.getState().items[0].title).toBe('Pending restart library');
    expect(h.library.getState().categories[0].label).toBe('Pending restart category');
    h.succeed();
    expect(await h.sync.saveTasksNow(h.userA)).toBe(true);
    expect(h.rows.tasks[0].title).toBe('Pending restart task');
    await h.resume();
    await waitFor(() => expect(h.rows.library_items[0].title).toBe('Pending restart library'));
    await waitFor(() => expect(h.rows.library_categories[0].label).toBe('Pending restart category'));
    await h.restart();
    const { privateOwnedCopy } = await import('@/lib/ownedDeviceCache');
    expect(privateOwnedCopy()!.review).toEqual([]);
    expect(h.tasks.getState().tasks[0].title).toBe('Pending restart task');
  });

  for (const failurePoint of ['library'] as const) {
    it(`keeps the complete pending library through quota failure ${failurePoint} and retry`, async () => {
      const h = await harness(false, true);
      const { OWNED_CACHE_PREFIX, accountCacheStorage, privateOwnedCopy } = await import('@/lib/ownedDeviceCache');
      const key = OWNED_CACHE_PREFIX + h.userA;
      h.library.setState({ items: h.library.getState().items.map(row => ({ ...row, title: 'Pending item' })),
        categories: [{ value: 'work', label: 'Pending category' }] });
      await waitFor(() => expect(h.writes.library_categories).toHaveBeenCalled());
      // A real changed hydration write, rather than an identical-cache rewrite:
      // older store copies lack this persisted setting.
      const olderLibrary = JSON.parse(privateOwnedCopy()!.entries['do-library-store']!);
      delete olderLibrary.state.sidebarMode;
      accountCacheStorage.setItem('do-library-store', JSON.stringify(olderLibrary));
      const savedLibrary = privateOwnedCopy()!.entries['do-library-store'];
      let libraryWrite = false;
      let rejected = false;
      const durableCategoryLabels: string[][] = [];
      const originalAdapterWrite = accountCacheStorage.setItem;
      vi.spyOn(accountCacheStorage, 'setItem').mockImplementation((name, value) => {
        libraryWrite = name === 'do-library-store';
        try {
          originalAdapterWrite(name, value);
        } finally { libraryWrite = false; }
      });
      const awaitlessCodec = await import('@/lib/deviceStorageEncoding');
      const journalHelpers = await import('@/lib/ownedCacheJournal');
      const cacheFields = await import('@/lib/migrationRecovery');
      const originalStorageWrite = Storage.prototype.setItem;
      const storageSpy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(function(name, value) {
        if (name === key) {
          const shouldFail = libraryWrite;
          if (shouldFail) {
            rejected = true;
            throw new DOMException('Simulated quota', 'QuotaExceededError');
          }
          const { decodeDeviceStorage } = awaitlessCodec;
          const parsed = JSON.parse(decodeDeviceStorage(value));
          const workspace = parsed.format === 2
            ? journalHelpers.replayJournal(parsed, JSON.parse(decodeDeviceStorage(parsed.checkpoint)), cacheFields.CACHE_FIELDS, decodeDeviceStorage)
            : parsed;
          const library = JSON.parse(workspace.entries['do-library-store']).state;
          durableCategoryLabels.push(library.categories.map((row: any) => row.label));
        }
        return originalStorageWrite.call(this, name, value);
      });
      await expect(h.restart()).rejects.toThrow();
      expect(rejected).toBe(true);
      expect(h.sync.isInitialSyncComplete()).toBe(false);
      const pending = JSON.parse(privateOwnedCopy()!.entries['do-library-store']!).state;
      expect(pending.items).toEqual(JSON.parse(savedLibrary!).state.items);
      expect(pending.categories).toEqual(JSON.parse(savedLibrary!).state.categories);
      expect(durableCategoryLabels.every(labels => labels.includes('Pending category'))).toBe(true);
      storageSpy.mockRestore();
      await h.restart();
      expect(h.library.getState().items[0].title).toBe('Pending item');
      expect(h.library.getState().categories).toEqual([{ value: 'work', label: 'Pending category' }]);
      expect(privateOwnedCopy()!.review).toEqual([]);
      h.succeed(); await h.resume();
      await waitFor(() => expect(h.rows.library_items[0].title).toBe('Pending item'));
      await waitFor(() => expect(h.rows.library_categories[0].label).toBe('Pending category'));
    });
  }

  it('restores an identical pending cache without writing it again even when storage is full', async () => {
    const h = await harness(false, true);
    h.library.setState({ items: h.library.getState().items.map(row => ({ ...row, title: 'Pending item' })),
      categories: [{ value: 'work', label: 'Pending category' }] });
    await waitFor(() => expect(h.writes.library_categories).toHaveBeenCalled());
    const writes = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('full'); });
    await h.restart();
    expect(writes).not.toHaveBeenCalled();
    expect(h.library.getState().items[0].title).toBe('Pending item');
    expect(h.library.getState().categories[0].label).toBe('Pending category');
  });

  it('does not schedule cloud saves for view changes but still saves task edits', async () => {
    const h = await harness(false, true);
    h.tasks.getState().setViewMode('week');
    h.library.getState().setPanelOpen(true);
    await new Promise(resolve => setTimeout(resolve, 400));
    for (const write of Object.values(h.writes)) expect(write).not.toHaveBeenCalled();
    h.tasks.setState({ tasks: h.tasks.getState().tasks.map(row => ({ ...row, title: 'Changed task' })) });
    await waitFor(() => expect(h.writes.tasks).toHaveBeenCalled());
  });

  it('preserves intentionally skipped library fields during a partial server refresh', async () => {
    const h = await harness(false, true);
    const categories = structuredClone(h.library.getState().categories);
    h.rows.library_items[0].title = 'Fresh remote item';
    h.rows.library_categories[0].label = 'Fresh remote category';
    expect(await h.sync.loadFromDB(h.userA, { skipTasks: true, skipCategories: true })).toBe(true);
    expect(h.library.getState().items[0].title).toBe('Fresh remote item');
    expect(h.library.getState().categories).toEqual(categories);
    const items = structuredClone(h.library.getState().items);
    expect(await h.sync.loadFromDB(h.userA, { skipTasks: true, skipLibrary: true })).toBe(true);
    expect(h.library.getState().items).toEqual(items);
    expect(h.library.getState().categories[0].label).toBe('Fresh remote category');
  });

  it('retains a changed-server conflict and deleted-row edit as review evidence without replay or resurrection', async () => {
    const h = await harness(false, true);
    const { privateOwnedCopy } = await import('@/lib/ownedDeviceCache');
    h.tasks.setState({ tasks: h.tasks.getState().tasks.map(row => ({ ...row, title: 'Pending conflicted edit' })) });
    await waitFor(() => expect(h.writes.tasks).toHaveBeenCalled());
    h.rows.tasks = []; // removed on the other backend/client
    Object.values(h.writes).forEach(write => write.mockClear());
    await h.restart();
    expect(h.tasks.getState().tasks).toEqual([]);
    expect(privateOwnedCopy()!.review[0].entries['task-storage']).toContain('Pending conflicted edit');
    await new Promise(resolve => setTimeout(resolve, 400));
    expect(Object.values(h.writes).every(write => write.mock.calls.length === 0)).toBe(true);
    await h.restart();
    expect(privateOwnedCopy()!.review).toHaveLength(1);
  });

  it('does not open an owned account cache when fresh account verification fails', async () => {
    const h = await harness(false, true);
    const { useGoalsStore: goals } = await import('@/store/goalsStore');
    const { OWNED_CACHE_PREFIX, currentOwnedCacheOwner } = await import('@/lib/ownedDeviceCache');
    goals.getState().addGoal({ tag: 'kept-private', metric: 'completed-tasks', period: 'daily', target: 3 });
    const raw = localStorage.getItem(OWNED_CACHE_PREFIX + h.userA);
    h.denyAuth(); h.unmount();
    // Mount a new guard with the same cached identity but a failing backend check.
    const React = await import('react');
    render(React.createElement(() => { h.sync.useDataSync({ id: h.userA } as any); return null; }));
    await act(async () => { await new Promise(resolve => setTimeout(resolve, 50)); });
    expect(currentOwnedCacheOwner()).toBeNull();
    expect(goals.getState().goals).toEqual([]);
    expect(localStorage.getItem(OWNED_CACHE_PREFIX + h.userA)).toBe(raw);
  });
});
