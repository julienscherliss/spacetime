import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useTaskStore } from '@/store/taskStore';

// Stub native/notification side effects so the store actions stay pure in tests.
vi.mock('@/utils/notificationService', () => ({
  cancelNotificationsForTask: vi.fn(),
}));
vi.mock('@/utils/webNotificationService', () => ({
  cancelWebNotificationsForTask: vi.fn(),
}));
vi.mock('@/utils/soundEngine', () => ({
  playUISound: vi.fn(),
}));

function resetStore() {
  useTaskStore.setState({ tasks: [], editingTaskId: null });
}

describe('Group store actions', () => {
  beforeEach(() => resetStore());

  it('convertTaskToGroup turns a task into a Group with the original as first child', () => {
    useTaskStore.getState().addTask({
      title: 'Original task',
      date: '2099-01-01',
      time: '09:00',
      duration: 30,
      priority: 0,
      type: 'one-time',
    });
    const original = useTaskStore.getState().tasks[0];

    const groupId = useTaskStore.getState().convertTaskToGroup(original.id, 'Morning Block');
    expect(groupId).not.toBeNull();

    const tasks = useTaskStore.getState().tasks;
    const group = tasks.find((t) => t.id === groupId)!;
    const child = tasks.find((t) => t.id === original.id)!;

    expect(group.type).toBe('group');
    expect(group.title).toBe('Morning Block');
    expect(group.duration).toBe(30);
    expect(group.time).toBe('09:00');

    expect(child.groupId).toBe(groupId);
    expect(child.groupOrder).toBe(0);
    expect(child.preferredDuration).toBe(30);
    expect(child.title).toBe('Original task'); // data preserved
  });

  it('addTaskToGroup squeezes children using the spec example (30→15+30+15)', () => {
    const store = useTaskStore.getState();
    // Empty 30-min Group at 09:00
    const groupId = store.createEmptyGroup({
      name: 'Block',
      date: '2099-01-01',
      time: '09:00',
      duration: 30,
    });

    // Add 15-min task
    store.addTask({ title: 'A', date: '2099-01-01', time: '10:00', duration: 15, priority: 0, type: 'one-time' });
    const a = useTaskStore.getState().tasks.find((t) => t.title === 'A')!;
    expect(useTaskStore.getState().addTaskToGroup(a.id, groupId)).toBe(true);

    // Add 30-min task
    store.addTask({ title: 'B', date: '2099-01-01', time: '11:00', duration: 30, priority: 0, type: 'one-time' });
    const b = useTaskStore.getState().tasks.find((t) => t.title === 'B')!;
    expect(useTaskStore.getState().addTaskToGroup(b.id, groupId)).toBe(true);

    // Add 15-min task
    store.addTask({ title: 'C', date: '2099-01-01', time: '12:00', duration: 15, priority: 0, type: 'one-time' });
    const c = useTaskStore.getState().tasks.find((t) => t.title === 'C')!;
    expect(useTaskStore.getState().addTaskToGroup(c.id, groupId)).toBe(true);

    const children = useTaskStore.getState().getGroupChildren(groupId);
    expect(children.map((c) => [c.title, c.duration, c.time])).toEqual([
      ['A', 10, '09:00'],
      ['B', 10, '09:10'],
      ['C', 10, '09:20'],
    ]);
  });

  it('rejects adding when Group cannot fit min-duration per child', () => {
    const store = useTaskStore.getState();
    const groupId = store.createEmptyGroup({
      name: 'Tiny',
      date: '2099-01-01',
      time: '09:00',
      duration: 5, // only fits 1 child
    });
    store.addTask({ title: 'A', date: '2099-01-01', time: '10:00', duration: 5, priority: 0, type: 'one-time' });
    const a = useTaskStore.getState().tasks.find((t) => t.title === 'A')!;
    expect(useTaskStore.getState().addTaskToGroup(a.id, groupId)).toBe(true);

    store.addTask({ title: 'B', date: '2099-01-01', time: '10:30', duration: 5, priority: 0, type: 'one-time' });
    const b = useTaskStore.getState().tasks.find((t) => t.title === 'B')!;
    expect(useTaskStore.getState().addTaskToGroup(b.id, groupId)).toBe(false);
  });

  it('removeTaskFromGroup restores preferred duration and re-balances siblings', () => {
    const store = useTaskStore.getState();
    const groupId = store.createEmptyGroup({
      name: 'Block', date: '2099-01-01', time: '09:00', duration: 30,
    });
    store.addTask({ title: 'A', date: '2099-01-01', time: '10:00', duration: 30, priority: 0, type: 'one-time' });
    store.addTask({ title: 'B', date: '2099-01-01', time: '11:00', duration: 30, priority: 0, type: 'one-time' });
    const a = useTaskStore.getState().tasks.find((t) => t.title === 'A')!;
    const b = useTaskStore.getState().tasks.find((t) => t.title === 'B')!;
    useTaskStore.getState().addTaskToGroup(a.id, groupId);
    useTaskStore.getState().addTaskToGroup(b.id, groupId);
    // Both should be 15 each.
    expect(useTaskStore.getState().getGroupChildren(groupId).map((c) => c.duration)).toEqual([15, 15]);

    // Remove A back to 14:00 on the same day.
    useTaskStore.getState().removeTaskFromGroup(a.id, '2099-01-01', '14:00');
    const aAfter = useTaskStore.getState().tasks.find((t) => t.id === a.id)!;
    expect(aAfter.groupId).toBeUndefined();
    expect(aAfter.duration).toBe(30); // preferred restored
    expect(aAfter.time).toBe('14:00');

    // B now fills the whole group (preferred 30, group 30).
    const bAfter = useTaskStore.getState().getGroupChildren(groupId)[0];
    expect(bAfter.duration).toBe(30);
    expect(bAfter.time).toBe('09:00');
  });

  it('completeGroup completes the Group and all children', () => {
    const store = useTaskStore.getState();
    const groupId = store.createEmptyGroup({ name: 'B', date: '2099-01-01', time: '09:00', duration: 30 });
    store.addTask({ title: 'A', date: '2099-01-01', time: '10:00', duration: 15, priority: 0, type: 'one-time' });
    const a = useTaskStore.getState().tasks.find((t) => t.title === 'A')!;
    useTaskStore.getState().addTaskToGroup(a.id, groupId);

    useTaskStore.getState().completeGroup(groupId);
    const tasks = useTaskStore.getState().tasks;
    expect(tasks.find((t) => t.id === groupId)!.completed).toBe(true);
    expect(tasks.find((t) => t.id === a.id)!.completed).toBe(true);
  });

  it('completeChild auto-completes parent Group when last child finishes', () => {
    const store = useTaskStore.getState();
    const groupId = store.createEmptyGroup({ name: 'Container', date: '2099-01-01', time: '09:00', duration: 30 });
    store.addTask({ title: 'ChildA', date: '2099-01-01', time: '11:00', duration: 15, priority: 0, type: 'one-time' });
    store.addTask({ title: 'ChildB', date: '2099-01-01', time: '12:00', duration: 15, priority: 0, type: 'one-time' });
    const a = useTaskStore.getState().tasks.find((t) => t.title === 'ChildA')!;
    const b = useTaskStore.getState().tasks.find((t) => t.title === 'ChildB')!;
    expect(useTaskStore.getState().addTaskToGroup(a.id, groupId)).toBe(true);
    expect(useTaskStore.getState().addTaskToGroup(b.id, groupId)).toBe(true);
    expect(useTaskStore.getState().getGroupChildren(groupId).length).toBe(2);

    useTaskStore.getState().completeChild(a.id);
    expect(useTaskStore.getState().tasks.find((t) => t.id === groupId)!.completed).toBe(false);

    useTaskStore.getState().completeChild(b.id);
    expect(useTaskStore.getState().tasks.find((t) => t.id === groupId)!.completed).toBe(true);
  });

  it('archives overdue routine groups and their children instead of sending them to limbo', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-04-03T10:00:00.000Z'));

    const pastDate = '2026-04-02';
    const groupId = 'routine-group';
    const childId = 'routine-child';

    useTaskStore.setState({
      tasks: [
        {
          id: groupId,
          title: 'Routine block',
          type: 'group',
          priority: 0,
          originalPriority: 0,
          date: pastDate,
          time: '08:00',
          duration: 30,
          completed: false,
          createdAt: '2026-04-01T00:00:00.000Z',
          moveCount: 0,
          recurrence: { type: 'daily' },
          isRoutine: true,
          isRecurrenceInstance: true,
        },
        {
          id: childId,
          title: 'Routine child',
          type: 'one-time',
          priority: 0,
          originalPriority: 0,
          date: pastDate,
          time: '08:00',
          duration: 30,
          completed: false,
          createdAt: '2026-04-01T00:00:00.000Z',
          moveCount: 0,
          groupId,
        },
      ],
      editingTaskId: null,
    });

    useTaskStore.getState().moveOverdueToWaitingRoom();

    const group = useTaskStore.getState().tasks.find((t) => t.id === groupId)!;
    const child = useTaskStore.getState().tasks.find((t) => t.id === childId)!;

    expect(group.archiveReason).toBe('deleted');
    expect(group.inWaitingRoom).not.toBe(true);
    expect(child.archiveReason).toBe('deleted');
    expect(child.inWaitingRoom).not.toBe(true);

    vi.useRealTimers();
  });

  it('getTasksForDate hides Group children but shows the Group itself', () => {
    const store = useTaskStore.getState();
    const groupId = store.createEmptyGroup({ name: 'B', date: '2099-01-01', time: '09:00', duration: 30 });
    store.addTask({ title: 'Child', date: '2099-01-01', time: '10:00', duration: 15, priority: 0, type: 'one-time' });
    const child = useTaskStore.getState().tasks.find((t) => t.title === 'Child')!;
    useTaskStore.getState().addTaskToGroup(child.id, groupId);

    const onTimeline = useTaskStore.getState().getTasksForDate('2099-01-01');
    expect(onTimeline.map((t) => t.id)).toEqual([groupId]); // child hidden, group shown
  });

  it('rejects converting a task that is already a Group', () => {
    const store = useTaskStore.getState();
    const groupId = store.createEmptyGroup({ name: 'B', date: '2099-01-01', time: '09:00', duration: 30 });
    expect(useTaskStore.getState().convertTaskToGroup(groupId, 'Nope')).toBeNull();
  });

  it('rejects adding a Group to another Group (no nesting)', () => {
    const store = useTaskStore.getState();
    const g1 = store.createEmptyGroup({ name: 'G1', date: '2099-01-01', time: '09:00', duration: 30 });
    const g2 = store.createEmptyGroup({ name: 'G2', date: '2099-01-01', time: '10:00', duration: 30 });
    expect(useTaskStore.getState().addTaskToGroup(g2, g1)).toBe(false);
  });
});
