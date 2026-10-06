import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/integrations/supabase/client', () => ({ supabase: { auth: {
  getSession: async () => ({ data: { session: null } }),
  onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }),
} } }));

describe('Limbo survives sync and device reloads', () => {
  beforeEach(() => {
    vi.resetModules(); localStorage.clear();
    vi.stubEnv('VITE_AUTH_BACKEND', 'owned');
    vi.stubEnv('VITE_SUPABASE_URL', 'https://zzoeywmurqiqticikyaf.supabase.co');
  });
  afterEach(() => { vi.unstubAllEnvs(); vi.useRealTimers(); });
  const row = { id: 'overdue', title: 'Overdue task', type: 'one-time', priority: 0,
    original_priority: 0, date: '2026-10-01', time: '09:00', duration: 30,
    completed: false, in_waiting_room: true, waiting_room_count: 1,
    created_at: '2026-10-01T00:00:00Z', move_count: 0 };

  async function fixture() {
    const sync = await import('@/hooks/useDataSync');
    const { useTaskStore: store } = await import('@/store/taskStore');
    const cache = await import('@/lib/ownedDeviceCache');
    cache.openVerifiedOwnedCache('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa');
    const task = sync.rowToTask(row);
    store.setState({ tasks: [task] });
    return { sync, store, cache };
  }

  it('keeps the explicit server flag and old schedule across a full row round trip', async () => {
    const { sync, store } = await fixture();
    expect(store.getState().tasks[0]).toMatchObject({ inWaitingRoom: true, date: row.date, time: row.time });
    expect(sync.rowToTask(sync.taskToRow(store.getState().tasks[0], 'owner')).inWaitingRoom).toBe(true);
  });

  it('keeps a swept overdue task in Limbo after persistence hydration and the next server read', async () => {
    const { sync, store, cache } = await fixture();
    vi.useFakeTimers(); vi.setSystemTime(new Date('2026-10-05T12:00:00Z'));
    store.setState({ tasks: [{ ...store.getState().tasks[0], inWaitingRoom: false, waitingRoomCount: 0 }] });
    store.getState().moveOverdueToWaitingRoom();
    const swept = store.getState().tasks[0];
    expect(swept.inWaitingRoom).toBe(true);
    store.setState({ tasks: [] });
    // Restore the durable pre-clear bytes as a cold-start fixture.
    cache.accountCacheStorage.setItem('task-storage', JSON.stringify({ state: { tasks: [swept] }, version: 0 }));
    await store.persist.rehydrate();
    expect(store.getState().tasks[0].inWaitingRoom).toBe(true);
    expect(sync.rowToTask(sync.taskToRow(swept, 'owner')).inWaitingRoom).toBe(true);
    store.getState().moveOverdueToWaitingRoom();
    expect(store.getState().tasks[0].waitingRoomCount).toBe(1);
  });

  it('preserves Limbo during unrelated edits and only clears it when explicitly rescheduled', async () => {
    const { store } = await fixture();
    store.getState().updateTask('overdue', { title: 'Renamed', description: 'New note' });
    expect(store.getState().tasks[0].inWaitingRoom).toBe(true);
    store.getState().updateTask('overdue', { date: '2026-10-06', time: '10:00' });
    expect(store.getState().tasks[0].inWaitingRoom).toBe(false);
    store.getState().updateTask('overdue', { date: '2026-10-01', time: '09:00', inWaitingRoom: true });
    expect(store.getState().tasks[0].inWaitingRoom).toBe(true);
  });

  it('still removes stale completed flags so completed scheduled tasks remain visible', async () => {
    const { sync, store, cache } = await fixture();
    expect(sync.rowToTask({ ...row, completed: true }).inWaitingRoom).toBe(false);
    cache.accountCacheStorage.setItem('task-storage', JSON.stringify({ state: { tasks: [{ ...store.getState().tasks[0], completed: true }] }, version: 0 }));
    await store.persist.rehydrate();
    expect(store.getState().tasks[0].inWaitingRoom).toBe(false);
  });
});
