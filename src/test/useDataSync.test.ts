import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {},
}));

describe('useDataSync regression guard', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it('deduplicates concurrent task saves so stale reloads cannot race ahead of an active write', async () => {
    const selectTaskIds = vi.fn().mockResolvedValue({ data: [], error: null });
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

    expect(first).toBe(second);
    await first;
    expect(upsertTasks).toHaveBeenCalledTimes(1);
  });
});