import React from 'react';
import { act, cleanup, fireEvent, render, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
vi.mock('@/integrations/supabase/client', () => ({ supabase: { auth: {
  getSession: async () => ({ data: { session: null } }),
  onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }),
} } }));
const A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const date = '2026-10-05';
const task = { id: 'synthetic', title: 'Synthetic task', type: 'one-time' as const, date, time: '09:00',
  duration: 30, priority: 0 as const, originalPriority: 0 as const, completed: false,
  createdAt: '2026-10-01T00:00:00Z', moveCount: 0 };
async function fixture() {
  const { useTaskStore: store } = await import('@/store/taskStore');
  const cache = await import('@/lib/ownedDeviceCache'); cache.openVerifiedOwnedCache(A);
  store.setState({ tasks: [{ ...task }] });
  const { useTimezoneStore } = await import('@/store/timezoneStore');
  useTimezoneStore.setState({ mobilityMode: 'normal' });
  return { store, cache };
}
describe('task interactions save once and retain their semantics', () => {
  beforeEach(() => { vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} }); vi.resetModules(); localStorage.clear(); vi.stubEnv('VITE_AUTH_BACKEND', 'owned');
    vi.stubEnv('VITE_SUPABASE_URL', 'https://zzoeywmurqiqticikyaf.supabase.co'); });
  afterEach(async () => { cleanup(); (await import('@/lib/ownedDeviceCache')).closeOwnedCache(); vi.restoreAllMocks(); vi.unstubAllGlobals(); vi.unstubAllEnvs(); });
  it('avoids durable writes for transient editor/navigation state and retains view preferences', async () => {
    const { store, cache } = await fixture(); const write = vi.spyOn(Storage.prototype, 'setItem');
    store.getState().setEditingTask(task.id); store.getState().setEditingTask(null);
    store.getState().setFocusTask(task.id); store.getState().setCurrentDate('2026-10-06');
    expect(write).not.toHaveBeenCalled();
    store.getState().setViewMode('week'); expect(write).toHaveBeenCalledTimes(1);
    cache.closeOwnedCache(); cache.openVerifiedOwnedCache(A); await store.persist.rehydrate();
    expect(store.getState().viewMode).toBe('week'); expect(store.getState().editingTaskId).toBeNull();
    expect(store.getState().tasks).toHaveLength(1);
  });
  it('commits time and duration together and resolves collisions using the final duration', async () => {
    const { store } = await fixture();
    store.setState({ tasks: [{ ...task }, { ...task, id: 'occupied', time: '10:30' }] });
    const write = vi.spyOn(Storage.prototype, 'setItem');
    store.getState().reorderTask(task.id, '10:00', 45);
    expect(write).toHaveBeenCalledTimes(1);
    expect(store.getState().tasks[0]).toMatchObject({ time: '09:45', duration: 45 });
    write.mockClear(); store.getState().moveTask(task.id, '2026-10-06', '10:00', 60);
    expect(write).toHaveBeenCalledTimes(1);
    expect(store.getState().tasks[0]).toMatchObject({ date: '2026-10-06', time: '10:00', duration: 60, moveCount: 1, priority: 1 });
  });
  it('retains the calendar source link through an edit, delete and app cache rehydration', async () => {
    const { store, cache } = await fixture();
    const { convertedCalendarEventKeys, calendarEventKey } = await import('@/lib/calendarConversion');
    store.setState({ tasks: [{ ...task, sourceCalendarId: 'calendar', sourceCalendarEventId: 'event' }] });
    store.getState().moveTask(task.id, '2026-10-06', '10:00', 60);
    store.getState().deleteTask(task.id);
    cache.closeOwnedCache();
    // Closed cache cannot overwrite the saved workspace while memory is reset.
    store.setState({ tasks: [] });
    cache.openVerifiedOwnedCache(A);
    await store.persist.rehydrate();
    expect(store.getState().tasks[0]).toMatchObject({ date: '2026-10-06', archiveReason: 'deleted',
      sourceCalendarId: 'calendar', sourceCalendarEventId: 'event' });
    expect(convertedCalendarEventKeys(store.getState().tasks).has(calendarEventKey({ calendarId: 'calendar', id: 'event' }))).toBe(true);
  });
  it('keeps locked moves pending until reflection confirms the time and duration together', async () => {
    const { store, cache } = await fixture();
    store.setState({ tasks: [{ ...task, priority: 3 }] });
    const write = vi.spyOn(cache.accountCacheStorage, 'setItem');
    store.getState().reorderTask(task.id, '10:00', 45);
    const { useReflectionStore: reflection } = await import('@/store/reflectionStore');
    await waitFor(() => expect(reflection.getState().activePrompt).not.toBeNull());
    expect(store.getState().tasks[0]).toMatchObject({ time: '09:00', duration: 30 });
    expect(write.mock.calls.filter(([name]) => name === 'task-storage')).toHaveLength(0);
    const pending = reflection.getState().activePrompt!;
    store.getState().forceMoveTask(pending.taskId, pending.newDate, pending.newTime, pending.newDuration);
    expect(store.getState().tasks[0]).toMatchObject({ time: '10:00', duration: 45 });
  });
  it('previews resize movement without saving until release', async () => {
    const { store, cache } = await fixture();
    const { TimelineColumn } = await import('@/components/TimelineColumn');
    function Timeline() { const tasks = store(state => state.tasks); return <TimelineColumn date={date} tasks={tasks} nowMinutes={0} isToday={false} hourHeight={60}/>; }
    const view = render(<Timeline/>);
    const handle = view.container.querySelector('[data-task-block] .bottom-0.cursor-ns-resize');
    expect(handle).not.toBeNull();
    const write = vi.spyOn(cache.accountCacheStorage, 'setItem');
    fireEvent.mouseDown(handle!, { clientY: 100 });
    fireEvent.mouseMove(window, { clientY: 115 }); fireEvent.mouseMove(window, { clientY: 130 });
    expect(store.getState().tasks[0].duration).toBe(30);
    expect(write).not.toHaveBeenCalled();
    // The actual block grows while runtime data remains uncommitted.
    expect((view.container.querySelector('[data-task-block]') as HTMLElement).style.height).toBe('60px');
    fireEvent.mouseUp(window);
    expect(store.getState().tasks[0].duration).toBe(60);
    expect(write.mock.calls.filter(([name]) => name === 'task-storage')).toHaveLength(1);
    await act(async () => { await store.persist.rehydrate(); });
    expect(store.getState().tasks[0].duration).toBe(60);
  });
});
