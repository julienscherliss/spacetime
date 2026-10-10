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

describe('recurring subtask progress', () => {
  beforeEach(() => { localStorage.clear(); resetStore([]); });

  it.each([false, true])('starts each new occurrence unchecked (routine=%s)', (isRoutine) => {
    const parent = makeTask({ id: 'parent', isRoutine, completed: true,
      subtasks: [{ id: 'a', title: 'First', completed: true }, { id: 'b', title: 'Second', completed: false }] });
    resetStore([parent]);
    useTaskStore.getState().generateRecurringInstances('2026-04-02', '2026-04-03');
    const generated = useTaskStore.getState().tasks.filter(t => t.id !== parent.id);
    expect(generated).toHaveLength(2);
    for (const task of generated) {
      expect(task.subtasks).toEqual(parent.subtasks!.map(st => ({ ...st, completed: false })));
      expect(task.subtasks).not.toBe(parent.subtasks);
      expect(task.subtasks![0]).not.toBe(parent.subtasks![0]);
    }
    useTaskStore.getState().updateTask(generated[0].id, {
      subtasks: generated[0].subtasks!.map(st => ({ ...st, completed: true })),
    });
    expect(useTaskStore.getState().tasks.find(t => t.id === generated[1].id)?.subtasks?.every(st => !st.completed)).toBe(true);
    expect(useTaskStore.getState().tasks.find(t => t.id === parent.id)?.subtasks).toEqual(parent.subtasks);
    const before = useTaskStore.getState().tasks;
    useTaskStore.getState().generateRecurringInstances('2026-04-02', '2026-04-03');
    expect(useTaskStore.getState().tasks).toBe(before);
  });

  it('resets subtasks on both a recurring group and its cloned children', () => {
    const subtasks = [{ id: 'a', title: 'First', completed: true }];
    resetStore([
      makeTask({ id: 'parent', type: 'group', subtasks }),
      makeTask({ id: 'child', type: 'one-time', recurrence: undefined,
        seriesId: undefined, linkedGroupId: undefined, linked: false, groupId: 'parent', subtasks }),
    ]);
    useTaskStore.getState().generateRecurringInstances('2026-04-02', '2026-04-02');
    const generated = useTaskStore.getState().tasks.filter(t => t.isRecurrenceInstance);
    expect(generated).toHaveLength(2);
    expect(generated.every(t => t.subtasks?.[0].completed === false)).toBe(true);
    expect(useTaskStore.getState().tasks.find(t => t.id === 'child')?.subtasks).toEqual(subtasks);
  });

  it.each(['updateTask', 'updateFutureInstances', 'updateLinkedSeries'] as const)(
    'keeps progress independent when checklist edits use %s', (action) => {
      const parent = makeTask({ id: 'parent', subtasks: [
        { id: 'a', title: 'First', completed: true }, { id: 'b', title: 'Second', completed: false },
      ] });
      const future = makeTask({ id: 'future', date: '2026-04-02', isRecurrenceInstance: true,
        recurrenceParentId: 'parent', subtasks: [
          { id: 'a', title: 'First', completed: false }, { id: 'b', title: 'Second', completed: true },
        ] });
      const empty = makeTask({ id: 'empty', date: '2026-04-03', isRecurrenceInstance: true,
        recurrenceParentId: 'parent', subtasks: undefined });
      resetStore([parent, future, empty]);
      const updates = { subtasks: [
        { id: 'b', title: 'Renamed', completed: false },
        { id: 'new', title: 'New item', completed: true },
      ] };
      if (action === 'updateFutureInstances') useTaskStore.getState()[action]('parent', parent.date, updates);
      else useTaskStore.getState()[action]('parent', updates);
      expect(useTaskStore.getState().tasks.find(t => t.id === 'parent')?.subtasks).toEqual(updates.subtasks);
      expect(useTaskStore.getState().tasks.find(t => t.id === 'future')?.subtasks).toEqual([
        { id: 'b', title: 'Renamed', completed: true }, { id: 'new', title: 'New item', completed: false },
      ]);
      expect(useTaskStore.getState().tasks.find(t => t.id === 'empty')?.subtasks?.every(st => !st.completed)).toBe(true);
    });
});

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

  it('treats a detached occurrence with stale recurrence metadata as independent', () => {
    const detached = makeTask({
      id: 'detached',
      type: 'one-time',
      recurrence: undefined,
      linked: false,
      linkedGroupId: undefined,
      detachedFromSeries: true,
      isRecurrenceInstance: true,
      recurrenceParentId: 'parent',
    });

    resetStore([detached]);
    useTaskStore.getState().reorderTask('detached', '14:00');

    const updated = useTaskStore.getState().tasks.find((task) => task.id === 'detached')!;
    expect(updated.linked).toBe(false);
    expect(updated.recurrence).toBeUndefined();
    expect(updated.detachedFromSeries).toBe(true);
  });
});

describe('moved recurrence occurrence identity', () => {
  it.each([true, false])('does not recreate the vacated day (routine=%s)', (isRoutine) => {
    const parent = makeTask({ id: 'parent', date: '2026-04-01', isRoutine });
    resetStore([parent]);
    useTaskStore.getState().generateRecurringInstances('2026-04-01', '2026-04-04');
    const occurrence = useTaskStore.getState().tasks.find(t => t.date === '2026-04-02')!;
    useTaskStore.getState().updateTask(occurrence.id, { date: '2026-04-04', time: '16:00' });
    useTaskStore.getState().generateRecurringInstances('2026-04-01', '2026-04-04');
    expect(useTaskStore.getState().tasks.filter(t => t.date === '2026-04-02')).toHaveLength(0);
    expect(useTaskStore.getState().tasks).toHaveLength(4);
  });

  it('keeps a moved parent anchored to the original recurrence schedule', () => {
    resetStore([makeTask({ id: 'parent', date: '2026-04-01' })]);
    useTaskStore.getState().updateTask('parent', { date: '2026-04-04' });
    useTaskStore.getState().generateRecurringInstances('2026-04-01', '2026-04-04');
    expect(useTaskStore.getState().tasks.map(t => t.originalDate || t.date).sort())
      .toEqual(['2026-04-01', '2026-04-02', '2026-04-03', '2026-04-04']);
  });
});

it.each(['moveTask', 'forceMoveTask'] as const)('preserves legacy occurrence identity through %s and repeated moves', (action) => {
  resetStore([
    makeTask({ id: 'parent' }),
    makeTask({ id: 'instance', date: '2026-04-02', recurrenceParentId: 'parent', isRecurrenceInstance: true }),
  ]);
  // Move earlier so priority escalation cannot block the regression scenario.
  expect(useTaskStore.getState()[action]('instance', '2026-03-31', '16:00').blocked).toBe(false);
  expect(useTaskStore.getState()[action]('instance', '2026-03-30', '16:00').blocked).toBe(false);
  useTaskStore.getState().generateRecurringInstances('2026-04-01', '2026-04-03');
  expect(useTaskStore.getState().tasks.find(t => t.id === 'instance')?.originalDate).toBe('2026-04-02');
  expect(useTaskStore.getState().tasks.filter(t => t.date === '2026-04-02')).toHaveLength(0);
  expect(useTaskStore.getState().tasks).toHaveLength(3);
});
