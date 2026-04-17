import { beforeEach, describe, expect, it } from 'vitest';
import { useTaskStore, type Task } from '@/store/taskStore';

const recurrence = { type: 'daily' } as const;

function makeTask(overrides: Partial<Task>): Task {
  return {
    id: crypto.randomUUID(),
    title: 'Task',
    type: 'recurring',
    priority: 0,
    originalPriority: 0,
    date: '2026-04-01',
    time: '13:00',
    duration: 30,
    completed: false,
    createdAt: '2026-04-01T00:00:00.000Z',
    moveCount: 0,
    recurrence,
    linked: true,
    seriesId: 'series-1',
    linkedGroupId: 'series-1',
    detachedFromSeries: false,
    ...overrides,
  };
}

function resetStore(tasks: Task[]) {
  localStorage.removeItem('do-task-store');
  useTaskStore.setState({
    tasks,
    viewMode: 'day',
    routinesEnabled: true,
    focusTaskId: null,
    editingTaskId: null,
    showCompletionStats: false,
    dailyStats: null,
  });
}

describe('linked recurrence schedule propagation', () => {
  beforeEach(() => {
    localStorage.clear();
    resetStore([]);
  });

  it('treats every recurring task as linked (no zombie unlinked instances)', () => {
    // Even legacy data seeded with linked=false on a recurring task is normalized
    // back to linked at the next write.
    const parent = makeTask({ id: 'parent', linked: false, linkedGroupId: undefined });

    resetStore([parent]);
    useTaskStore.getState().reorderTask('parent', '14:00');

    const tasks = useTaskStore.getState().tasks;
    const updated = tasks.find((t) => t.id === 'parent')!;
    expect(updated.linked).toBe(true);
    expect(updated.linkedGroupId).toBeTruthy();
  });

  it('propagates time changes across linked instances in the same recurrence series', () => {
    const parent = makeTask({ id: 'parent', linkedGroupId: 'group-1', date: '2026-04-01' });
    const linkedA = makeTask({ id: 'linked-a', recurrenceParentId: 'parent', isRecurrenceInstance: true, linkedGroupId: 'group-1', date: '2026-04-02' });
    const linkedB = makeTask({ id: 'linked-b', recurrenceParentId: 'parent', isRecurrenceInstance: true, linkedGroupId: 'group-1', date: '2026-04-03' });

    resetStore([parent, linkedA, linkedB]);
    useTaskStore.getState().reorderTask('linked-a', '14:00');

    const tasks = useTaskStore.getState().tasks;
    expect(tasks.find((task) => task.id === 'parent')?.time).toBe('14:00');
    expect(tasks.find((task) => task.id === 'linked-a')?.time).toBe('14:00');
    expect(tasks.find((task) => task.id === 'linked-b')?.time).toBe('14:00');
  });

  it('propagates duration and start-time changes across linked instances', () => {
    const parent = makeTask({ id: 'parent', linkedGroupId: 'group-1', date: '2026-04-01' });
    const linked = makeTask({ id: 'linked', recurrenceParentId: 'parent', isRecurrenceInstance: true, linkedGroupId: 'group-1', date: '2026-04-02' });

    resetStore([parent, linked]);
    useTaskStore.getState().resizeTask('linked', '15:00', 45);

    const tasks = useTaskStore.getState().tasks;
    expect(tasks.find((task) => task.id === 'parent')).toMatchObject({ time: '15:00', duration: 45 });
    expect(tasks.find((task) => task.id === 'linked')).toMatchObject({ time: '15:00', duration: 45 });
  });

  it('does NOT propagate across different linkedGroupIds even if seriesId matches', () => {
    const parent = makeTask({ id: 'parent', linkedGroupId: 'group-A', date: '2026-04-01' });
    const sameGroup = makeTask({ id: 'same-group', recurrenceParentId: 'parent', isRecurrenceInstance: true, linkedGroupId: 'group-A', date: '2026-04-02' });
    const diffGroup = makeTask({ id: 'diff-group', recurrenceParentId: 'parent', isRecurrenceInstance: true, linkedGroupId: 'group-B', date: '2026-04-03' });

    resetStore([parent, sameGroup, diffGroup]);
    useTaskStore.getState().reorderTask('parent', '15:00');

    const tasks = useTaskStore.getState().tasks;
    expect(tasks.find((task) => task.id === 'parent')?.time).toBe('15:00');
    expect(tasks.find((task) => task.id === 'same-group')?.time).toBe('15:00');
    expect(tasks.find((task) => task.id === 'diff-group')?.time).toBe('13:00');
  });

  it('keeps generated future instances linked under the same group', () => {
    const parent = makeTask({ id: 'parent', linkedGroupId: 'series-1', date: '2026-04-01' });

    resetStore([parent]);
    useTaskStore.getState().generateRecurringInstances('2026-04-02', '2026-04-03');

    const tasks = useTaskStore.getState().tasks;
    const generated = tasks.filter((t) => t.recurrenceParentId === 'parent');
    expect(generated.length).toBeGreaterThan(0);
    for (const inst of generated) {
      expect(inst.linked).toBe(true);
      expect(inst.linkedGroupId).toBe('series-1');
    }
  });

  it('converts the selected occurrence to one-time when unlinking, dropping future instances', () => {
    const parent = makeTask({ id: 'parent', linkedGroupId: 'group-1', date: '2026-04-01' });
    const linkedA = makeTask({ id: 'linked-a', recurrenceParentId: 'parent', isRecurrenceInstance: true, linkedGroupId: 'group-1', date: '2026-04-02' });
    const linkedB = makeTask({ id: 'linked-b', recurrenceParentId: 'parent', isRecurrenceInstance: true, linkedGroupId: 'group-1', date: '2026-04-03' });

    resetStore([parent, linkedA, linkedB]);
    useTaskStore.getState().linkSeriesFromDate('linked-a', '2026-04-02', false);

    const tasks = useTaskStore.getState().tasks;
    expect(tasks.find((task) => task.id === 'parent')).toMatchObject({ linked: true, linkedGroupId: 'group-1' });
    expect(tasks.find((task) => task.id === 'linked-a')).toMatchObject({
      linked: false, linkedGroupId: undefined, recurrence: undefined, type: 'one-time',
    });
    expect(tasks.find((task) => task.id === 'linked-b')).toBeUndefined();
  });
});
