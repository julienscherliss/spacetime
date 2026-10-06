import { describe, expect, it } from 'vitest';
import { chooseAppEntryDestination as choose, getAppClock, getFocusSchedule } from '@/lib/appEntryDestination';
import type { Task } from '@/store/taskStore';

const date = '2026-10-06';
const now = new Date('2026-10-06T17:15:00Z'); // 10:15 Los Angeles
const timezone = 'America/Los_Angeles';
const task = (overrides: Partial<Task> = {}): Task => ({ id: 'task', title: 'Current task',
  date, time: '10:00', duration: 30, type: 'one-time', completed: false,
  priority: 0, originalPriority: 0, createdAt: '2026-10-06T00:00:00Z', moveCount: 0, ...overrides });
const subtask = { id: 'subtask', title: 'Check this', completed: false };

describe('app opening destination', () => {
  it('opens the lower Focus details for an active task with subtasks', () => {
    expect(choose([task({ subtasks: [subtask] })], true, timezone, now))
      .toEqual({ view: 'focus', date, panel: 'detail', taskId: 'task' });
  });
  it('opens the upper Focus day list without subtasks, including an empty checklist', () => {
    for (const subtasks of [undefined, []]) expect(choose([task({ subtasks })], true, timezone, now))
      .toMatchObject({ view: 'focus', panel: 'completed' });
  });
  it('still opens details when all subtasks are checked', () => {
    expect(choose([task({ subtasks: [{ ...subtask, completed: true }] })], true, timezone, now))
      .toMatchObject({ panel: 'detail' });
  });
  it('opens Day when nothing is active, without selecting a future or remembered task', () => {
    expect(choose([task({ time: '11:00' })], true, timezone, now)).toEqual({ view: 'day', date, reason: 'idle' });
    expect(choose([], true, timezone, now)).toMatchObject({ view: 'day', reason: 'idle' });
  });
  it.each([{ subtasks: [] }, { subtasks: [subtask] }])('overdue beats active Focus even with checklist %j', ({ subtasks }) => {
    expect(choose([task({ subtasks }), task({ id: 'overdue', time: '09:44' })], true, timezone, now))
      .toEqual({ view: 'day', date, reason: 'overdue' });
  });
  it('has inclusive start, exclusive end and immediate overdue priority without grace', () => {
    expect(choose([task()], true, timezone, new Date('2026-10-06T16:59:00Z'))).toMatchObject({ reason: 'idle' });
    expect(choose([task()], true, timezone, new Date('2026-10-06T17:00:00Z'))).toMatchObject({ view: 'focus' });
    expect(choose([task()], true, timezone, new Date('2026-10-06T17:30:00Z'))).toMatchObject({ reason: 'overdue' });
  });
  it('uses the existing duration fallback', () => {
    expect(choose([task({ duration: undefined })], true, timezone, now)).toMatchObject({ view: 'focus' });
  });
  it.each([
    { completed: true }, { archivedAt: '2026-10-06T00:00:00Z' }, { archiveReason: 'deleted' as const },
    { inWaitingRoom: true }, { date: '2026-10-05' }, { time: undefined }, { time: '25:00' },
    { time: '10:70' }, { time: 'NaN' }, { duration: -5 },
  ])('excludes ineligible task %j from active and overdue', excluded => {
    expect(choose([task({ ...excluded })], true, timezone, now)).toMatchObject({ reason: 'idle' });
    expect(choose([task({ time: '08:00', ...excluded })], true, timezone, now)).toMatchObject({ reason: 'idle' });
  });
  it('excludes disabled routines but keeps explicitly non-routine recurring tasks', () => {
    expect(choose([task({ type: 'recurring', isRoutine: true })], false, timezone, now)).toMatchObject({ reason: 'idle' });
    expect(choose([task({ type: 'recurring', isRoutine: false })], false, timezone, now)).toMatchObject({ view: 'focus' });
  });
  it('selects the same group child for landing and Focus, even with children first in store', () => {
    const tasks = [task({ id: 'child', groupId: 'group', groupOrder: 0, subtasks: [subtask] }),
      task({ id: 'group', type: 'group' })];
    expect(choose(tasks, true, timezone, now)).toMatchObject({ panel: 'detail', taskId: 'child' });
    expect(getFocusSchedule(tasks, date, 615, true)).toMatchObject({
      activeRoot: { id: 'group' }, activeTask: { id: 'child' }, parentGroup: { id: 'group' },
    });
  });
  it('overdue earlier child wins while its group and another child are active', () => {
    expect(choose([task({ id: 'group', type: 'group', time: '09:45', duration: 60 }),
      task({ id: 'previous', groupId: 'group', time: '09:45', duration: 15 }),
      task({ id: 'current', groupId: 'group', subtasks: [subtask] })], true, timezone, now))
      .toMatchObject({ reason: 'overdue' });
  });
  it('does not leak archived parent children; uses first eligible group child between intervals', () => {
    const group = task({ id: 'group', type: 'group' });
    const child = task({ id: 'child', groupId: 'group', time: '10:20', subtasks: [subtask] });
    expect(choose([group, child], true, timezone, now)).toMatchObject({ panel: 'detail', taskId: 'child' });
    expect(choose([{ ...group, completed: true }, child], true, timezone, now)).toMatchObject({ reason: 'idle' });
  });
  it('chooses overlaps by start then stable store order without mutating the input', () => {
    const tasks = [task({ id: 'late', time: '10:10' }), task({ id: 'first' }), task({ id: 'second' })];
    expect(choose(tasks, true, timezone, now)).toMatchObject({ taskId: 'first' });
    expect(tasks.map(t => t.id)).toEqual(['late', 'first', 'second']);
  });
  it('uses one selected-zone instant across midnight rather than a UTC day or hour 24', () => {
    const midnight = new Date('2026-10-07T07:00:00Z');
    expect(getAppClock(midnight, timezone)).toEqual({ date: '2026-10-07', minutes: 0 });
    expect(getAppClock(new Date('2026-10-07T06:59:00Z'), timezone)).toEqual({ date, minutes: 1439 });
    expect(choose([task({ date, time: '23:50' })], true, timezone, new Date('2026-10-07T06:59:00Z')))
      .toMatchObject({ date, view: 'focus' });
  });
});
