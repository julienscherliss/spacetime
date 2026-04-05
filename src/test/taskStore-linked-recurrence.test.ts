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
    linked: false,
    seriesId: 'series-1',
    linkedGroupId: undefined,
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

  it('moves only the active instance when the repeating task is unlinked', () => {
    const parent = makeTask({ id: 'parent', linked: false, seriesId: 'series-1', linkedGroupId: undefined, date: '2026-04-01' });
    const instance = makeTask({ id: 'instance', recurrenceParentId: 'parent', isRecurrenceInstance: true, linked: false, seriesId: 'series-1', linkedGroupId: undefined, date: '2026-04-02' });

    resetStore([parent, instance]);
    useTaskStore.getState().reorderTask('instance', '14:00');

    const tasks = useTaskStore.getState().tasks;
    expect(tasks.find((task) => task.id === 'instance')?.time).toBe('14:00');
    expect(tasks.find((task) => task.id === 'parent')?.time).toBe('13:00');
  });

  it('propagates time changes across truly linked instances in the same recurrence series', () => {
    const parent = makeTask({ id: 'parent', linked: true, seriesId: 'series-1', linkedGroupId: 'group-1', date: '2026-04-01' });
    const linkedA = makeTask({ id: 'linked-a', recurrenceParentId: 'parent', isRecurrenceInstance: true, linked: true, seriesId: 'series-1', linkedGroupId: 'group-1', date: '2026-04-02' });
    const linkedB = makeTask({ id: 'linked-b', recurrenceParentId: 'parent', isRecurrenceInstance: true, linked: true, seriesId: 'series-1', linkedGroupId: 'group-1', date: '2026-04-03' });
    const detached = makeTask({ id: 'detached', recurrenceParentId: 'parent', isRecurrenceInstance: true, linked: false, seriesId: 'series-1', linkedGroupId: undefined, date: '2026-04-04' });

    resetStore([parent, linkedA, linkedB, detached]);
    useTaskStore.getState().reorderTask('linked-a', '14:00');

    const tasks = useTaskStore.getState().tasks;
    expect(tasks.find((task) => task.id === 'parent')?.time).toBe('14:00');
    expect(tasks.find((task) => task.id === 'linked-a')?.time).toBe('14:00');
    expect(tasks.find((task) => task.id === 'linked-b')?.time).toBe('14:00');
    expect(tasks.find((task) => task.id === 'detached')?.time).toBe('13:00');
  });

  it('propagates duration and start-time changes only across linked instances', () => {
    const parent = makeTask({ id: 'parent', linked: true, seriesId: 'series-1', linkedGroupId: 'group-1', date: '2026-04-01' });
    const linked = makeTask({ id: 'linked', recurrenceParentId: 'parent', isRecurrenceInstance: true, linked: true, seriesId: 'series-1', linkedGroupId: 'group-1', date: '2026-04-02' });
    const detached = makeTask({ id: 'detached', recurrenceParentId: 'parent', isRecurrenceInstance: true, linked: false, seriesId: 'series-1', linkedGroupId: undefined, date: '2026-04-03' });

    resetStore([parent, linked, detached]);
    useTaskStore.getState().resizeTask('linked', '15:00', 45);

    const tasks = useTaskStore.getState().tasks;
    expect(tasks.find((task) => task.id === 'parent')).toMatchObject({ time: '15:00', duration: 45 });
    expect(tasks.find((task) => task.id === 'linked')).toMatchObject({ time: '15:00', duration: 45 });
    expect(tasks.find((task) => task.id === 'detached')).toMatchObject({ time: '13:00', duration: 30 });
  });
  it('does NOT propagate across different linkedGroupIds even if seriesId matches', () => {
    const parent = makeTask({ id: 'parent', linked: true, seriesId: 'series-1', linkedGroupId: 'group-A', date: '2026-04-01' });
    const sameGroup = makeTask({ id: 'same-group', recurrenceParentId: 'parent', isRecurrenceInstance: true, linked: true, seriesId: 'series-1', linkedGroupId: 'group-A', date: '2026-04-02' });
    const diffGroup = makeTask({ id: 'diff-group', recurrenceParentId: 'parent', isRecurrenceInstance: true, linked: true, seriesId: 'series-1', linkedGroupId: 'group-B', date: '2026-04-03' });

    resetStore([parent, sameGroup, diffGroup]);
    useTaskStore.getState().reorderTask('parent', '15:00');

    const tasks = useTaskStore.getState().tasks;
    expect(tasks.find((task) => task.id === 'parent')?.time).toBe('15:00');
    expect(tasks.find((task) => task.id === 'same-group')?.time).toBe('15:00');
    expect(tasks.find((task) => task.id === 'diff-group')?.time).toBe('13:00');
  });

  it('links this and following when started from a later occurrence', () => {
    const parent = makeTask({ id: 'parent', linked: false, seriesId: 'series-1', linkedGroupId: undefined, date: '2026-04-01' });
    const tuesday = makeTask({ id: 'tuesday', recurrenceParentId: 'parent', isRecurrenceInstance: true, linked: false, seriesId: 'series-1', linkedGroupId: undefined, date: '2026-04-02' });
    const wednesday = makeTask({ id: 'wednesday', recurrenceParentId: 'parent', isRecurrenceInstance: true, linked: false, seriesId: 'series-1', linkedGroupId: undefined, date: '2026-04-03' });
    const thursday = makeTask({ id: 'thursday', recurrenceParentId: 'parent', isRecurrenceInstance: true, linked: false, seriesId: 'series-1', linkedGroupId: undefined, date: '2026-04-04' });

    resetStore([parent, tuesday, wednesday, thursday]);
    useTaskStore.getState().linkSeriesFromDate('wednesday', '2026-04-03', true);
    useTaskStore.getState().reorderTask('wednesday', '16:00');

    const tasks = useTaskStore.getState().tasks;
    expect(tasks.find((task) => task.id === 'parent')).toMatchObject({ linked: false, time: '13:00' });
    expect(tasks.find((task) => task.id === 'tuesday')).toMatchObject({ linked: false, time: '13:00' });
    expect(tasks.find((task) => task.id === 'wednesday')).toMatchObject({ linked: true, linkedGroupId: 'wednesday', time: '16:00' });
    expect(tasks.find((task) => task.id === 'thursday')).toMatchObject({ linked: true, linkedGroupId: 'wednesday', time: '16:00' });
  });

  it('keeps generated future instances linked after a mid-series link point', () => {
    const parent = makeTask({ id: 'parent', linked: false, seriesId: 'series-1', linkedGroupId: undefined, date: '2026-04-01' });
    const tuesday = makeTask({ id: 'tuesday', recurrenceParentId: 'parent', isRecurrenceInstance: true, linked: false, seriesId: 'series-1', linkedGroupId: undefined, date: '2026-04-02' });
    const wednesday = makeTask({ id: 'wednesday', recurrenceParentId: 'parent', isRecurrenceInstance: true, linked: false, seriesId: 'series-1', linkedGroupId: undefined, date: '2026-04-03' });

    resetStore([parent, tuesday, wednesday]);
    useTaskStore.getState().linkSeriesFromDate('wednesday', '2026-04-03', true);
    useTaskStore.getState().generateRecurringInstances('2026-04-04', '2026-04-05');

    const tasks = useTaskStore.getState().tasks;
    const thursday = tasks.find((task) => task.date === '2026-04-04');
    const friday = tasks.find((task) => task.date === '2026-04-05');

    expect(thursday).toMatchObject({ linked: true, linkedGroupId: 'wednesday', recurrenceParentId: 'parent' });
    expect(friday).toMatchObject({ linked: true, linkedGroupId: 'wednesday', recurrenceParentId: 'parent' });
    expect(tasks.find((task) => task.id === 'parent')).toMatchObject({ linked: false, linkedGroupId: undefined });
  });

  it('unlinks only the selected occurrence when turning linked off', () => {
    const parent = makeTask({ id: 'parent', linked: true, seriesId: 'series-1', linkedGroupId: 'group-1', date: '2026-04-01' });
    const linkedA = makeTask({ id: 'linked-a', recurrenceParentId: 'parent', isRecurrenceInstance: true, linked: true, seriesId: 'series-1', linkedGroupId: 'group-1', date: '2026-04-02' });
    const linkedB = makeTask({ id: 'linked-b', recurrenceParentId: 'parent', isRecurrenceInstance: true, linked: true, seriesId: 'series-1', linkedGroupId: 'group-1', date: '2026-04-03' });

    resetStore([parent, linkedA, linkedB]);
    useTaskStore.getState().linkSeriesFromDate('linked-a', '2026-04-02', false);

    const tasks = useTaskStore.getState().tasks;
    expect(tasks.find((task) => task.id === 'parent')).toMatchObject({ linked: true, linkedGroupId: 'group-1' });
    expect(tasks.find((task) => task.id === 'linked-a')).toMatchObject({ linked: false, linkedGroupId: undefined });
    expect(tasks.find((task) => task.id === 'linked-b')).toMatchObject({ linked: true, linkedGroupId: 'group-1' });
  });
});