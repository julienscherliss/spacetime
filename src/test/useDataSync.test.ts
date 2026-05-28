import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { render, waitFor, cleanup } from '@testing-library/react';

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {},
}));

import { shouldShowScheduledTask } from '@/utils/taskVisibility';

describe('useDataSync regression guard', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  it('deduplicates concurrent task saves so stale reloads cannot race ahead of an active write', async () => {
    const upsertTasks = vi.fn().mockImplementation(
      () => new Promise((resolve) => setTimeout(() => resolve({ error: null }), 10)),
    );

    const from = vi.fn((table: string) => {
      if (table === 'tasks') {
        return {
          select: () => ({
            eq: () => Promise.resolve({ data: [], error: null }),
          }),
          upsert: upsertTasks,
          delete: () => ({ in: vi.fn() }),
        };
      }

      return {
        select: () => ({
          eq: () => Promise.resolve({ data: [], error: null }),
        }),
        upsert: vi.fn().mockResolvedValue({ error: null }),
        delete: () => ({ in: vi.fn() }),
      };
    });

    const auth = {
      onAuthStateChange: vi.fn(() => ({ data: { subscription: { unsubscribe: vi.fn() } } })),
      getSession: vi.fn().mockResolvedValue({ data: { session: null } }),
    };

    vi.doMock('@/integrations/supabase/client', () => ({
      supabase: { from, auth },
    }));

    const { useTaskStore } = await import('@/store/taskStore');
    const syncModule = await import('@/hooks/useDataSync');

    useTaskStore.setState({
      tasks: [{
        id: crypto.randomUUID(),
        title: 'Persist me',
        type: 'one-time',
        priority: 0,
        originalPriority: 0,
        date: '2026-05-06',
        completed: false,
        createdAt: '2026-05-06T00:00:00.000Z',
        moveCount: 0,
      }],
    });

    const first = (syncModule as any).saveTasksNow('user-1');
    const second = (syncModule as any).saveTasksNow('user-1');

    await Promise.all([first, second]);
    expect(upsertTasks).toHaveBeenCalledTimes(1);
  });

  it('never issues hard DELETE statements for tasks (archive-only model)', async () => {
    const deleteIn = vi.fn().mockResolvedValue({ error: null });
    const upsertTasks = vi.fn().mockResolvedValue({ error: null });

    const from = vi.fn((table: string) => {
      if (table === 'tasks') {
        return {
          upsert: upsertTasks,
          delete: () => ({ in: deleteIn }),
        };
      }

      return {
        select: () => ({
          eq: () => Promise.resolve({ data: [], error: null }),
        }),
        upsert: vi.fn().mockResolvedValue({ error: null }),
        delete: () => ({ in: vi.fn() }),
      };
    });

    const auth = {
      onAuthStateChange: vi.fn(() => ({ data: { subscription: { unsubscribe: vi.fn() } } })),
      getSession: vi.fn().mockResolvedValue({ data: { session: null } }),
    };

    vi.doMock('@/integrations/supabase/client', () => ({
      supabase: { from, auth },
    }));

    const { useTaskStore } = await import('@/store/taskStore');
    const syncModule = await import('@/hooks/useDataSync');

    const completedTask = {
      id: crypto.randomUUID(),
      title: 'Completed task',
      type: 'one-time' as const,
      priority: 0 as const,
      originalPriority: 0 as const,
      date: '2026-05-06',
      completed: true,
      archivedAt: '2026-05-06T10:00:00.000Z',
      archiveReason: 'completed' as const,
      createdAt: '2026-05-06T00:00:00.000Z',
      moveCount: 0,
    };

    useTaskStore.setState({ tasks: [completedTask] });
    await (syncModule as any).saveTasksNow('user-1');

    // Even when a row disappears from local state, the sync layer must NOT
    // send a DELETE to the server. Hard deletion is reserved for the
    // account-deletion edge function (service_role).
    useTaskStore.setState({ tasks: [] });
    await (syncModule as any).saveTasksNow('user-1');
    expect(deleteIn).not.toHaveBeenCalled();

    useTaskStore.setState({ tasks: [] });
    await (syncModule as any).saveTasksNow('user-1');
    expect(deleteIn).not.toHaveBeenCalled();
  });

  it('loads task data across multiple backend pages instead of stopping at 1000 rows', async () => {
    const pageA = Array.from({ length: 1000 }, (_, i) => ({
      id: crypto.randomUUID(),
      title: `Task ${i + 1}`,
      type: 'one-time',
      priority: 0,
      original_priority: 0,
      date: '2026-05-06',
      completed: false,
      move_count: 0,
      created_at: '2026-05-06T00:00:00.000Z',
    }));
    const pageB = [{
      id: crypto.randomUUID(),
      title: 'Photo Edits A1',
      type: 'one-time',
      priority: 0,
      original_priority: 0,
      date: '2026-05-06',
      time: '07:30',
      duration: 30,
      completed: true,
      archived_at: '2026-05-06T15:52:53.587Z',
      archive_reason: 'completed',
      move_count: 0,
      created_at: '2026-05-06T00:00:00.000Z',
    }];

    const tasksRange = vi.fn((from: number, to: number) => {
      if (from === 0 && to === 999) return Promise.resolve({ data: pageA, error: null });
      if (from === 1000 && to === 1999) return Promise.resolve({ data: pageB, error: null });
      return Promise.resolve({ data: [], error: null });
    });

    const from = vi.fn((table: string) => {
      if (table === 'tasks') {
        return {
          select: () => ({
            eq: () => ({
              order: () => ({ range: tasksRange }),
            }),
          }),
          upsert: vi.fn().mockResolvedValue({ error: null }),
          delete: () => ({ in: vi.fn().mockResolvedValue({ error: null }) }),
        };
      }

      return {
        select: () => ({
          eq: () => ({
            order: () => ({
              range: vi.fn().mockResolvedValue({ data: [], error: null }),
            }),
          }),
        }),
        upsert: vi.fn().mockResolvedValue({ error: null }),
        delete: () => ({ in: vi.fn() }),
      };
    });

    const auth = {
      onAuthStateChange: vi.fn(() => ({ data: { subscription: { unsubscribe: vi.fn() } } })),
      getSession: vi.fn().mockResolvedValue({ data: { session: null } }),
    };

    vi.doMock('@/integrations/supabase/client', () => ({
      supabase: { from, auth },
    }));

    const { useTaskStore } = await import('@/store/taskStore');
    const syncModule = await import('@/hooks/useDataSync');

    await (syncModule as any).loadFromDB('user-1');

    const titles = useTaskStore.getState().tasks.map((task) => task.title);
    expect(tasksRange).toHaveBeenCalledTimes(2);
    expect(titles).toContain('Photo Edits A1');
  });

  it('keeps completed recurring routines visible in schedule views when show completed is enabled', () => {
    expect(shouldShowScheduledTask({
      id: crypto.randomUUID(),
      title: 'Daily Checkin',
      type: 'recurring',
      priority: 0,
      originalPriority: 0,
      date: '2026-05-06',
      time: '07:00',
      duration: 30,
      completed: true,
      archivedAt: '2026-05-06T14:31:53.634Z',
      archiveReason: 'completed',
      isRoutine: true,
      createdAt: '2026-05-06T00:00:00.000Z',
      moveCount: 0,
    }, {
      showCompleted: true,
      routinesEnabled: false,
    })).toBe(true);
  });

  it('refuses to wipe tasks when local state transiently empties (sign-out / failed load race)', async () => {
    const deleteIn = vi.fn().mockResolvedValue({ error: null });
    const upsertTasks = vi.fn().mockResolvedValue({ error: null });

    const from = vi.fn((table: string) => {
      if (table === 'tasks') {
        return {
          upsert: upsertTasks,
          delete: () => ({ in: deleteIn }),
        };
      }
      return {
        select: () => ({ eq: () => Promise.resolve({ data: [], error: null }) }),
        upsert: vi.fn().mockResolvedValue({ error: null }),
        delete: () => ({ in: vi.fn() }),
      };
    });
    const auth = {
      onAuthStateChange: vi.fn(() => ({ data: { subscription: { unsubscribe: vi.fn() } } })),
      getSession: vi.fn().mockResolvedValue({ data: { session: null } }),
    };
    vi.doMock('@/integrations/supabase/client', () => ({ supabase: { from, auth } }));

    const { useTaskStore } = await import('@/store/taskStore');
    const syncModule = await import('@/hooks/useDataSync');

    // Seed snapshot with a populated state (simulates a successful load).
    // Use >= BULK_DELETE_MIN items so the empty-state guard engages.
    const seed = Array.from({ length: 6 }, (_, i) => ({
      id: crypto.randomUUID(),
      title: `Task ${i}`,
      type: 'one-time' as const,
      priority: 0 as const,
      originalPriority: 0 as const,
      date: '2026-05-06',
      completed: false,
      createdAt: '2026-05-06T00:00:00.000Z',
      moveCount: 0,
    }));
    useTaskStore.setState({ tasks: seed });
    await (syncModule as any).saveTasksNow('user-1');
    deleteIn.mockClear();
    upsertTasks.mockClear();

    // Now simulate a transient empty store (the historical wipe pattern).
    useTaskStore.setState({ tasks: [] });
    const ok = await (syncModule as any).saveTasksNow('user-1');

    expect(ok).toBe(false);
    expect(deleteIn).not.toHaveBeenCalled();
    expect(upsertTasks).not.toHaveBeenCalled();
  });

  it('short-circuits saves once markSigningOut is called', async () => {
    const deleteIn = vi.fn().mockResolvedValue({ error: null });
    const upsertTasks = vi.fn().mockResolvedValue({ error: null });

    const from = vi.fn(() => ({
      upsert: upsertTasks,
      delete: () => ({ in: deleteIn }),
      select: () => ({ eq: () => Promise.resolve({ data: [], error: null }) }),
    }));
    const auth = {
      onAuthStateChange: vi.fn(() => ({ data: { subscription: { unsubscribe: vi.fn() } } })),
      getSession: vi.fn().mockResolvedValue({ data: { session: null } }),
    };
    vi.doMock('@/integrations/supabase/client', () => ({ supabase: { from, auth } }));

    const { useTaskStore } = await import('@/store/taskStore');
    const syncModule = await import('@/hooks/useDataSync');

    useTaskStore.setState({
      tasks: [{
        id: crypto.randomUUID(),
        title: 'persist me',
        type: 'one-time',
        priority: 0,
        originalPriority: 0,
        date: '2026-05-06',
        completed: false,
        createdAt: '2026-05-06T00:00:00.000Z',
        moveCount: 0,
      }],
    });

    (syncModule as any).markSigningOut();
    const ok = await (syncModule as any).saveTasksNow('user-1');
    expect(ok).toBe(false);
    expect(upsertTasks).not.toHaveBeenCalled();
    expect(deleteIn).not.toHaveBeenCalled();
  });

  it('refuses a single save that would delete more than half of the previously-synced rows', async () => {
    const deleteIn = vi.fn().mockResolvedValue({ error: null });
    const upsertTasks = vi.fn().mockResolvedValue({ error: null });

    const from = vi.fn((table: string) => {
      if (table === 'tasks') {
        return { upsert: upsertTasks, delete: () => ({ in: deleteIn }) };
      }
      return {
        select: () => ({ eq: () => Promise.resolve({ data: [], error: null }) }),
        upsert: vi.fn().mockResolvedValue({ error: null }),
        delete: () => ({ in: vi.fn() }),
      };
    });
    const auth = {
      onAuthStateChange: vi.fn(() => ({ data: { subscription: { unsubscribe: vi.fn() } } })),
      getSession: vi.fn().mockResolvedValue({ data: { session: null } }),
    };
    vi.doMock('@/integrations/supabase/client', () => ({ supabase: { from, auth } }));

    const { useTaskStore } = await import('@/store/taskStore');
    const syncModule = await import('@/hooks/useDataSync');

    const seed = Array.from({ length: 10 }, (_, i) => ({
      id: crypto.randomUUID(),
      title: `Task ${i}`,
      type: 'one-time' as const,
      priority: 0 as const,
      originalPriority: 0 as const,
      date: '2026-05-06',
      completed: false,
      createdAt: '2026-05-06T00:00:00.000Z',
      moveCount: 0,
    }));
    useTaskStore.setState({ tasks: seed });
    await (syncModule as any).saveTasksNow('user-1');
    deleteIn.mockClear();

    // Keep only 2 of 10 — a 80% delete in one save. Should be refused.
    useTaskStore.setState({ tasks: seed.slice(0, 2) });
    const ok = await (syncModule as any).saveTasksNow('user-1');
    expect(ok).toBe(false);
    expect(deleteIn).not.toHaveBeenCalled();
  });

  it('per-row diff: only persists tasks that actually changed', async () => {
    const upsertTasks = vi.fn().mockResolvedValue({ error: null });
    const updatePatches: any[] = [];
    const updateTasks = vi.fn((patch: any) => {
      updatePatches.push(patch);
      return { eq: () => ({ eq: () => Promise.resolve({ error: null }) }) };
    });
    const from = vi.fn((table: string) => {
      if (table === 'tasks') {
        return { upsert: upsertTasks, update: updateTasks, delete: () => ({ in: vi.fn() }) };
      }
      return {
        select: () => ({ eq: () => Promise.resolve({ data: [], error: null }) }),
        upsert: vi.fn().mockResolvedValue({ error: null }),
        delete: () => ({ in: vi.fn() }),
      };
    });
    const auth = {
      onAuthStateChange: vi.fn(() => ({ data: { subscription: { unsubscribe: vi.fn() } } })),
      getSession: vi.fn().mockResolvedValue({ data: { session: null } }),
    };
    vi.doMock('@/integrations/supabase/client', () => ({ supabase: { from, auth } }));

    const { useTaskStore } = await import('@/store/taskStore');
    const syncModule = await import('@/hooks/useDataSync');

    const mkTask = (i: number) => ({
      id: crypto.randomUUID(),
      title: `Task ${i}`,
      type: 'one-time' as const,
      priority: 0 as const,
      originalPriority: 0 as const,
      date: '2026-05-06',
      completed: false,
      createdAt: '2026-05-06T00:00:00.000Z',
      moveCount: 0,
    });
    const tasks = Array.from({ length: 20 }, (_, i) => mkTask(i));
    useTaskStore.setState({ tasks });

    // First save: full upload (snapshot is empty before this).
    await (syncModule as any).saveTasksNow('user-1');
    expect(upsertTasks).toHaveBeenCalledTimes(1);
    expect((upsertTasks.mock.calls[0]![0] as any[]).length).toBe(20);

    // Mutate ONE task. The diff must update exactly that one row.
    upsertTasks.mockClear();
    updateTasks.mockClear();
    updatePatches.length = 0;
    const next = tasks.slice();
    next[7] = { ...next[7], title: 'Edited' };
    useTaskStore.setState({ tasks: next });
    await (syncModule as any).saveTasksNow('user-1');
    expect(upsertTasks).not.toHaveBeenCalled();
    expect(updateTasks).toHaveBeenCalledTimes(1);
    expect(updatePatches.length).toBe(1);
    expect(updatePatches[0].title).toBe('Edited');

    // Save again with no further change: snapshot match should early-exit
    // and no write should be issued at all.
    upsertTasks.mockClear();
    updateTasks.mockClear();
    await (syncModule as any).saveTasksNow('user-1');
    expect(upsertTasks).not.toHaveBeenCalled();
    expect(updateTasks).not.toHaveBeenCalled();
  });

  it('per-row diff: reorder/groupOrder/attachments changes are detected and persisted', async () => {
    const upsertTasks = vi.fn().mockResolvedValue({ error: null });
    const updatePatches: any[] = [];
    const updateTasks = vi.fn((patch: any) => {
      updatePatches.push(patch);
      return { eq: () => ({ eq: () => Promise.resolve({ error: null }) }) };
    });
    const from = vi.fn((table: string) => {
      if (table === 'tasks') {
        return { upsert: upsertTasks, update: updateTasks, delete: () => ({ in: vi.fn() }) };
      }
      return {
        select: () => ({ eq: () => Promise.resolve({ data: [], error: null }) }),
        upsert: vi.fn().mockResolvedValue({ error: null }),
        delete: () => ({ in: vi.fn() }),
      };
    });
    const auth = {
      onAuthStateChange: vi.fn(() => ({ data: { subscription: { unsubscribe: vi.fn() } } })),
      getSession: vi.fn().mockResolvedValue({ data: { session: null } }),
    };
    vi.doMock('@/integrations/supabase/client', () => ({ supabase: { from, auth } }));

    const { useTaskStore } = await import('@/store/taskStore');
    const syncModule = await import('@/hooks/useDataSync');

    const a = {
      id: crypto.randomUUID(),
      title: 'A',
      type: 'one-time' as const,
      priority: 0 as const,
      originalPriority: 0 as const,
      date: '2026-05-06',
      completed: false,
      createdAt: '2026-05-06T00:00:00.000Z',
      moveCount: 0,
      groupOrder: 0,
      attachments: [],
    };
    const b = { ...a, id: crypto.randomUUID(), title: 'B', groupOrder: 1 };
    useTaskStore.setState({ tasks: [a, b] });
    await (syncModule as any).saveTasksNow('user-1');
    upsertTasks.mockClear();
    updateTasks.mockClear();
    updatePatches.length = 0;

    // Swap groupOrder (reorder) on both rows.
    useTaskStore.setState({
      tasks: [
        { ...a, groupOrder: 1 },
        { ...b, groupOrder: 0 },
      ],
    });
    await (syncModule as any).saveTasksNow('user-1');
    expect(updateTasks).toHaveBeenCalledTimes(2);
    expect(updatePatches.length).toBe(2);
    expect(updatePatches.every((p) => p.group_order !== undefined)).toBe(true);
    expect(updatePatches.map((p) => p.group_order).sort()).toEqual([0, 1]);

    // Now change only `attachments` on one row — must still be detected.
    updateTasks.mockClear();
    updatePatches.length = 0;
    useTaskStore.setState({
      tasks: [
        { ...a, groupOrder: 1, attachments: [{ id: 'att', name: 'doc' } as any] },
        { ...b, groupOrder: 0 },
      ],
    });
    await (syncModule as any).saveTasksNow('user-1');
    expect(updateTasks).toHaveBeenCalledTimes(1);
    expect(updatePatches.length).toBe(1);
    expect(updatePatches[0].attachments).toEqual([{ id: 'att', name: 'doc' }]);
  });

  // ── Per-field partial-patch tests (two-device stale-overwrite fix) ──
  //
  // After the per-field diff change, an upsert payload for an EXISTING task
  // must contain only `id`, `user_id`, and the DB columns that actually
  // changed since the last synced snapshot. This protects against a stale
  // device clobbering unrelated fields that another device updated.

  const mountSyncWithUpsertSpy = async () => {
    const upsertTasks = vi.fn().mockResolvedValue({ error: null });
    // Existing-task changes now go through `.update(patch).eq().eq()`.
    const updatePatches: any[] = [];
    const updateTasks = vi.fn((patch: any) => {
      updatePatches.push(patch);
      return { eq: () => ({ eq: () => Promise.resolve({ error: null }) }) };
    });
    const from = vi.fn((table: string) => {
      if (table === 'tasks') {
        return { upsert: upsertTasks, update: updateTasks, delete: () => ({ in: vi.fn() }) };
      }
      return {
        select: () => ({ eq: () => Promise.resolve({ data: [], error: null }) }),
        upsert: vi.fn().mockResolvedValue({ error: null }),
        delete: () => ({ in: vi.fn() }),
      };
    });
    const auth = {
      onAuthStateChange: vi.fn(() => ({ data: { subscription: { unsubscribe: vi.fn() } } })),
      getSession: vi.fn().mockResolvedValue({ data: { session: null } }),
    };
    vi.doMock('@/integrations/supabase/client', () => ({ supabase: { from, auth } }));
    const { useTaskStore } = await import('@/store/taskStore');
    const syncModule = await import('@/hooks/useDataSync');
    return { upsertTasks, updateTasks, updatePatches, useTaskStore, syncModule };
  };

  const baseTask = (overrides: Partial<any> = {}) => ({
    id: crypto.randomUUID(),
    title: 'T',
    type: 'one-time' as const,
    priority: 0 as const,
    originalPriority: 0 as const,
    date: '2026-05-06',
    completed: false,
    createdAt: '2026-05-06T00:00:00.000Z',
    moveCount: 0,
    ...overrides,
  });

  it('partial-patch: changed title uses update and sends only title', async () => {
    const { upsertTasks, updateTasks, updatePatches, useTaskStore, syncModule } = await mountSyncWithUpsertSpy();
    const t = baseTask({ title: 'Original', duration: 30, category: 'work' });
    useTaskStore.setState({ tasks: [t] });
    await (syncModule as any).saveTasksNow('user-1');
    upsertTasks.mockClear();
    updateTasks.mockClear();
    updatePatches.length = 0;

    useTaskStore.setState({ tasks: [{ ...t, title: 'Edited' }] });
    await (syncModule as any).saveTasksNow('user-1');

    // Existing task → update, never upsert.
    expect(upsertTasks).not.toHaveBeenCalled();
    expect(updateTasks).toHaveBeenCalledTimes(1);
    expect(Object.keys(updatePatches[0]).sort()).toEqual(['title']);
    expect(updatePatches[0].title).toBe('Edited');
  });

  it('partial-patch: changed duration uses update and sends only duration', async () => {
    const { upsertTasks, updateTasks, updatePatches, useTaskStore, syncModule } = await mountSyncWithUpsertSpy();
    const t = baseTask({ duration: 30 });
    useTaskStore.setState({ tasks: [t] });
    await (syncModule as any).saveTasksNow('user-1');
    updateTasks.mockClear();
    updatePatches.length = 0;

    useTaskStore.setState({ tasks: [{ ...t, duration: 60 }] });
    await (syncModule as any).saveTasksNow('user-1');

    expect(updateTasks).toHaveBeenCalledTimes(1);
    expect(Object.keys(updatePatches[0]).sort()).toEqual(['duration']);
    expect(updatePatches[0].duration).toBe(60);
  });

  it('partial-patch: changed groupOrder uses update and sends only group_order', async () => {
    const { updateTasks, updatePatches, useTaskStore, syncModule } = await mountSyncWithUpsertSpy();
    const t = baseTask({ groupOrder: 0 });
    useTaskStore.setState({ tasks: [t] });
    await (syncModule as any).saveTasksNow('user-1');
    updateTasks.mockClear();
    updatePatches.length = 0;

    useTaskStore.setState({ tasks: [{ ...t, groupOrder: 3 }] });
    await (syncModule as any).saveTasksNow('user-1');

    expect(Object.keys(updatePatches[0]).sort()).toEqual(['group_order']);
    expect(updatePatches[0].group_order).toBe(3);
  });

  it('partial-patch: brand-new tasks (no previous snapshot) send the full row', async () => {
    const { upsertTasks, useTaskStore, syncModule } = await mountSyncWithUpsertSpy();
    const existing = baseTask({ title: 'Existing' });
    useTaskStore.setState({ tasks: [existing] });
    await (syncModule as any).saveTasksNow('user-1');
    upsertTasks.mockClear();

    const fresh = baseTask({ title: 'New' });
    useTaskStore.setState({ tasks: [existing, fresh] });
    await (syncModule as any).saveTasksNow('user-1');

    const rows = upsertTasks.mock.calls[0]![0] as any[];
    expect(rows.length).toBe(1);
    // Full row must include every NOT NULL column so INSERT succeeds.
    const keys = Object.keys(rows[0]);
    for (const col of ['id', 'user_id', 'title', 'type', 'priority', 'original_priority', 'date', 'completed', 'move_count']) {
      expect(keys).toContain(col);
    }
    expect(rows[0].title).toBe('New');
  });

  it('partial-patch: unchanged task sends nothing', async () => {
    const { upsertTasks, updateTasks, useTaskStore, syncModule } = await mountSyncWithUpsertSpy();
    const t = baseTask();
    useTaskStore.setState({ tasks: [t] });
    await (syncModule as any).saveTasksNow('user-1');
    upsertTasks.mockClear();
    updateTasks.mockClear();

    await (syncModule as any).saveTasksNow('user-1');
    expect(upsertTasks).not.toHaveBeenCalled();
    expect(updateTasks).not.toHaveBeenCalled();
  });

  // ── Two-device stale-overwrite scenarios ──
  //
  // These simulate Device B saving from a stale local snapshot AFTER Device
  // A has already changed an unrelated/protective field on the server.
  // Because Device B only sends the columns it actually touched, the
  // server's row keeps A's changes.

  // Simulate "Device A updated the server" by replaying A's patch through
  // the same upsert path: we record the patch and then mutate a synthetic
  // server-side row to prove omitted columns are NOT included.

  it('stale device: B duration edit does not include or revert title', async () => {
    const { updatePatches, useTaskStore, syncModule } = await mountSyncWithUpsertSpy();
    const t = baseTask({ title: 'A-title', duration: 30 });
    // Device B's snapshot was taken when title was 'A-title' and duration 30.
    useTaskStore.setState({ tasks: [t] });
    await (syncModule as any).saveTasksNow('user-1');
    updatePatches.length = 0;

    // Device B never sees A's title edit. Locally B changes only duration.
    useTaskStore.setState({ tasks: [{ ...t, duration: 45 }] });
    await (syncModule as any).saveTasksNow('user-1');

    expect(updatePatches[0]).not.toHaveProperty('title');
    expect(updatePatches[0].duration).toBe(45);
  });

  it('stale device: B title edit does not include archived_at / archive_reason / completed', async () => {
    const { updatePatches, useTaskStore, syncModule } = await mountSyncWithUpsertSpy();
    // B's last-synced snapshot has the task NOT archived and NOT completed.
    const t = baseTask({ title: 'Original' });
    useTaskStore.setState({ tasks: [t] });
    await (syncModule as any).saveTasksNow('user-1');
    updatePatches.length = 0;

    // Meanwhile Device A archives the task on the server. B has no idea.
    // B locally renames the task from its stale state.
    useTaskStore.setState({ tasks: [{ ...t, title: 'Renamed' }] });
    await (syncModule as any).saveTasksNow('user-1');

    expect(updatePatches[0]).not.toHaveProperty('archived_at');
    expect(updatePatches[0]).not.toHaveProperty('archive_reason');
    expect(updatePatches[0]).not.toHaveProperty('completed');
    expect(updatePatches[0].title).toBe('Renamed');
  });

  it('stale device: B completion does not include priority / group_order (no reorder revert)', async () => {
    const { updatePatches, useTaskStore, syncModule } = await mountSyncWithUpsertSpy();
    const t = baseTask({ priority: 0, groupOrder: 0 });
    useTaskStore.setState({ tasks: [t] });
    await (syncModule as any).saveTasksNow('user-1');
    updatePatches.length = 0;

    // Device A has since reordered (priority/groupOrder changed on server).
    // Device B, unaware, marks the task completed from stale state.
    useTaskStore.setState({ tasks: [{ ...t, completed: true }] });
    await (syncModule as any).saveTasksNow('user-1');

    expect(updatePatches[0]).not.toHaveProperty('priority');
    expect(updatePatches[0]).not.toHaveProperty('original_priority');
    expect(updatePatches[0]).not.toHaveProperty('group_order');
    expect(updatePatches[0]).not.toHaveProperty('group_id');
    expect(updatePatches[0].completed).toBe(true);
  });

  it('partial-patch: protective fields are never included unless actually changed', async () => {
    const { updatePatches, useTaskStore, syncModule } = await mountSyncWithUpsertSpy();
    const t = baseTask({ title: 'P' });
    useTaskStore.setState({ tasks: [t] });
    await (syncModule as any).saveTasksNow('user-1');
    updatePatches.length = 0;

    // Touch every non-protective field that exists on the snapshot.
    useTaskStore.setState({
      tasks: [{
        ...t,
        title: 'P2',
        description: 'd',
        category: 'c',
        duration: 90,
        time: '09:00',
        dueDate: '2026-05-07',
      }],
    });
    await (syncModule as any).saveTasksNow('user-1');

    for (const protectedCol of ['archived_at', 'archive_reason', 'completed']) {
      expect(updatePatches[0]).not.toHaveProperty(protectedCol);
    }

    // Now explicitly archive the task — protective fields MUST appear.
    updatePatches.length = 0;
    const arch = useTaskStore.getState().tasks[0];
    useTaskStore.setState({
      tasks: [{ ...arch, archivedAt: '2026-05-06T12:00:00.000Z', archiveReason: 'completed', completed: true }],
    });
    await (syncModule as any).saveTasksNow('user-1');
    expect(updatePatches[0].archived_at).toBe('2026-05-06T12:00:00.000Z');
    expect(updatePatches[0].archive_reason).toBe('completed');
    expect(updatePatches[0].completed).toBe(true);
  });

  // Schema-drift guard: the three task projections must stay aligned, or
  // partial-patch saves silently drop new fields. If you add a column to
  // `taskToRow`, you MUST also add it to `taskSnapshotFields` and
  // `TASK_KEY_TO_COLUMN` (and vice-versa). This test fails loudly if not.
  it('schema sync: taskToRow ↔ taskSnapshotFields ↔ TASK_KEY_TO_COLUMN stay aligned', async () => {
    vi.doMock('@/integrations/supabase/client', () => ({
      supabase: {
        from: vi.fn(),
        auth: {
          onAuthStateChange: vi.fn(() => ({ data: { subscription: { unsubscribe: vi.fn() } } })),
          getSession: vi.fn().mockResolvedValue({ data: { session: null } }),
        },
      },
    }));
    const { taskToRow, taskSnapshotFields, TASK_KEY_TO_COLUMN } = await import('@/hooks/useDataSync');

    const sample: any = {
      id: '11111111-1111-1111-1111-111111111111',
      title: 'T',
      type: 'one-time',
      priority: 0,
      originalPriority: 0,
      date: '2026-05-06',
      completed: false,
      createdAt: '2026-05-06T00:00:00.000Z',
      moveCount: 0,
    };

    const rowCols = new Set(Object.keys(taskToRow(sample, 'user-1')));
    // id + user_id are infrastructure columns the partial-patch builder
    // always supplies — they don't belong to the camelCase projection map.
    rowCols.delete('id');
    rowCols.delete('user_id');

    const snapKeys = new Set(Object.keys(taskSnapshotFields(sample)));
    snapKeys.delete('id');

    const mapKeys = new Set(Object.keys(TASK_KEY_TO_COLUMN));
    const mapCols = new Set(Object.values(TASK_KEY_TO_COLUMN));

    // Every camelCase key in the snapshot must have a mapping entry.
    expect([...snapKeys].sort()).toEqual([...mapKeys].sort());
    // Every DB column written by taskToRow must be reachable via the map.
    expect([...rowCols].sort()).toEqual([...mapCols].sort());
  });

  it('realtime remote task changes refetch open clients, while self-echo task events are ignored once', async () => {
    vi.useFakeTimers();

    const taskId = crypto.randomUUID();
    const serverRows: any[] = [{
      id: taskId,
      title: 'Initial title',
      type: 'one-time',
      priority: 0,
      original_priority: 0,
      date: '2026-05-06',
      completed: false,
      move_count: 0,
      created_at: '2026-05-06T00:00:00.000Z',
      group_order: 0,
    }];

    const tasksRange = vi.fn(() => Promise.resolve({ data: serverRows.slice(), error: null }));
    const updateTasks = vi.fn(() => ({ eq: () => ({ eq: () => Promise.resolve({ error: null }) }) }));
    const upsertTasks = vi.fn().mockResolvedValue({ error: null });

    const realtimeHandlers: Record<string, (payload: any) => void> = {};
    const subscribe = vi.fn((callback?: (status: string) => void) => {
      callback?.('SUBSCRIBED');
      return { id: 'channel-1' };
    });
    const on = vi.fn((event: string, config: any, handler: (payload: any) => void) => {
      realtimeHandlers[config.table] = handler;
      return channel;
    });
    const channel = { on, subscribe };

    const from = vi.fn((table: string) => {
      if (table === 'tasks') {
        return {
          select: () => ({
            eq: () => ({
              order: () => ({ range: tasksRange }),
            }),
          }),
          upsert: upsertTasks,
          update: updateTasks,
          delete: () => ({ in: vi.fn() }),
        };
      }

      return {
        select: () => ({
          eq: () => ({
            order: () => ({ range: vi.fn().mockResolvedValue({ data: [], error: null }) }),
          }),
        }),
        upsert: vi.fn().mockResolvedValue({ error: null }),
        delete: () => ({ in: vi.fn() }),
      };
    });

    const auth = {
      onAuthStateChange: vi.fn(() => ({ data: { subscription: { unsubscribe: vi.fn() } } })),
      getSession: vi.fn().mockResolvedValue({ data: { session: null } }),
    };

    vi.doMock('@/integrations/supabase/client', () => ({
      supabase: {
        from,
        auth,
        channel: vi.fn(() => channel),
        removeChannel: vi.fn(),
      },
    }));
    vi.doMock('@/utils/nativePlatform', () => ({
      isNativePlatform: vi.fn(() => true),
    }));

    const React = await import('react');
    const { useDataSync } = await import('@/hooks/useDataSync');
    const { useTaskStore } = await import('@/store/taskStore');

    function Harness() {
      useDataSync({ id: 'user-1' } as any);
      return null;
    }

    render(React.createElement(Harness));

    await waitFor(() => {
      expect(tasksRange).toHaveBeenCalledTimes(1);
      expect(useTaskStore.getState().tasks[0]?.title).toBe('Initial title');
    });

    serverRows[0] = { ...serverRows[0], title: 'Browser changed title' };
    realtimeHandlers.tasks({ eventType: 'UPDATE', new: { id: taskId }, old: { id: taskId } });
    await vi.advanceTimersByTimeAsync(450);
    await Promise.resolve();
    expect(tasksRange).toHaveBeenCalledTimes(2);
    expect(useTaskStore.getState().tasks[0]?.title).toBe('Browser changed title');

    useTaskStore.setState({
      tasks: [{
        ...useTaskStore.getState().tasks[0],
        duration: 45,
      }],
    });

    await vi.advanceTimersByTimeAsync(350);
    await Promise.resolve();
    expect(updateTasks).toHaveBeenCalledTimes(1);
    expect((updateTasks.mock.calls as any[]).at(0)?.[0]).toEqual({ duration: 45 });

    realtimeHandlers.tasks({ eventType: 'UPDATE', new: { id: taskId }, old: { id: taskId } });
    await vi.advanceTimersByTimeAsync(450);
    expect(tasksRange).toHaveBeenCalledTimes(2);

    realtimeHandlers.tasks({ eventType: 'UPDATE', new: { id: taskId }, old: { id: taskId } });
    await vi.advanceTimersByTimeAsync(450);
    await Promise.resolve();
    expect(tasksRange).toHaveBeenCalledTimes(3);
  }, 10000);

  it('visibility resume refetches from DB and preserves remote task changes before local edits save', async () => {
    const taskId = crypto.randomUUID();
    const serverRows: any[] = [{
      id: taskId,
      title: 'Original',
      type: 'one-time',
      priority: 0,
      original_priority: 0,
      date: '2026-05-06',
      completed: false,
      move_count: 0,
      created_at: '2026-05-06T00:00:00.000Z',
      group_order: 0,
    }];

    const tasksRange = vi.fn(() => Promise.resolve({ data: serverRows.slice(), error: null }));
    const updateTasks = vi.fn(() => ({ eq: () => ({ eq: () => Promise.resolve({ error: null }) }) }));
    const upsertTasks = vi.fn().mockResolvedValue({ error: null });
    const channel = { on: vi.fn(() => channel), subscribe: vi.fn(() => ({ id: 'channel-1' })) };

    const from = vi.fn((table: string) => {
      if (table === 'tasks') {
        return {
          select: () => ({
            eq: () => ({
              order: () => ({ range: tasksRange }),
            }),
          }),
          upsert: upsertTasks,
          update: updateTasks,
          delete: () => ({ in: vi.fn() }),
        };
      }

      return {
        select: () => ({
          eq: () => ({
            order: () => ({ range: vi.fn().mockResolvedValue({ data: [], error: null }) }),
          }),
        }),
        upsert: vi.fn().mockResolvedValue({ error: null }),
        delete: () => ({ in: vi.fn() }),
      };
    });

    const auth = {
      onAuthStateChange: vi.fn(() => ({ data: { subscription: { unsubscribe: vi.fn() } } })),
      getSession: vi.fn().mockResolvedValue({ data: { session: null } }),
    };

    vi.doMock('@/integrations/supabase/client', () => ({
      supabase: {
        from,
        auth,
        channel: vi.fn(() => channel),
        removeChannel: vi.fn(),
      },
    }));

    const React = await import('react');
    const { fireEvent } = await import('@testing-library/react');
    const { useDataSync } = await import('@/hooks/useDataSync');
    const { useTaskStore } = await import('@/store/taskStore');

    function Harness() {
      useDataSync({ id: 'user-1' } as any);
      return null;
    }

    render(React.createElement(Harness));

    await waitFor(() => {
      expect(tasksRange).toHaveBeenCalledTimes(1);
      expect(useTaskStore.getState().tasks[0]?.title).toBe('Original');
    });

    serverRows[0] = { ...serverRows[0], title: 'Browser renamed me', archived_at: '2026-05-06T12:00:00.000Z', archive_reason: 'completed', completed: true };
    Object.defineProperty(document, 'visibilityState', {
      configurable: true,
      get: () => 'visible',
    });

    fireEvent(document, new Event('visibilitychange'));

    await waitFor(() => {
      expect(tasksRange.mock.calls.length).toBeGreaterThanOrEqual(2);
      expect(useTaskStore.getState().tasks[0]?.title).toBe('Browser renamed me');
      expect(useTaskStore.getState().tasks[0]?.archivedAt).toBe('2026-05-06T12:00:00.000Z');
    });

    useTaskStore.setState({
      tasks: [{
        ...useTaskStore.getState().tasks[0],
        duration: 30,
      }],
    });

    await waitFor(() => {
      expect(updateTasks).toHaveBeenCalledTimes(1);
      expect((updateTasks.mock.calls as any[]).at(0)?.[0]).toEqual({ duration: 30 });
    });
  });
});