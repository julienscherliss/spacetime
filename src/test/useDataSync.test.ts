import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {},
}));

import { shouldShowScheduledTask } from '@/utils/taskVisibility';

describe('useDataSync regression guard', () => {
  beforeEach(() => {
    vi.resetModules();
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
});