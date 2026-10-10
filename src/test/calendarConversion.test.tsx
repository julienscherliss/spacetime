import React from 'react';
import { beforeEach, afterEach, expect, it, vi } from 'vitest';
import { act, cleanup, render, screen } from '@testing-library/react';
const mocks = vi.hoisted(() => ({ rpc: vi.fn(), getSession: vi.fn(async () => ({ data: { session: null as { user: { id: string } } | null } })) }));
vi.mock('@/integrations/supabase/client', () => ({ supabase: {
  auth: { getSession: mocks.getSession, onAuthStateChange: vi.fn() },
  functions: { invoke: vi.fn(async () => ({ data: { connected: false } })) },
  rpc: mocks.rpc,
} }));
import { convertCalendarEventToTask, calendarEventKey, convertedCalendarEventKeys } from '@/lib/calendarConversion';
import { useTaskStore, type Task } from '@/store/taskStore';
import { useCalendarStore, type CalendarEvent } from '@/store/calendarStore';
import { CalendarEventBlocks } from '@/components/TimelineColumn';
import { AllDayEventStrip } from '@/components/AllDayEventStrip';
import { rowToTask } from '@/lib/taskRow';
import { taskToRow, taskSnapshotFields, TASK_KEY_TO_COLUMN } from '@/hooks/useDataSync';
const event: CalendarEvent = { id: 'event-one', calendarId: 'calendar-one', title: 'Calendar appointment',
  date: '2026-10-10', time: '13:00', duration: 60, endDate: null, isAllDay: false, description: 'Notes', color: null, location: null };
const row = { id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', user_id: 'owner', title: event.title,
  date: event.date, time: event.time, duration: event.duration, category: 'work', description: 'Notes',
  source_calendar_id: event.calendarId, source_calendar_event_id: event.id, priority: 0, type: 'one-time', created_at: '2026-10-10T00:00:00Z' };
const initialTasks = useTaskStore.getState();
const initialCalendar = useCalendarStore.getState();
beforeEach(() => {
  vi.clearAllMocks();
  mocks.getSession.mockResolvedValue({ data: { session: { user: { id: 'owner' } } } });
  mocks.rpc.mockResolvedValue({ data: [row], error: null });
  useTaskStore.setState({ tasks: [] });
  useCalendarStore.setState({ events: [event], deletedEventIds: [], completedEventIds: [], eventCategories: {},
    calendars: [{ id: 'cal-row', google_calendar_id: event.calendarId, name: 'Calendar', visible: true, color: '#4285f4' }] });
});
afterEach(() => { cleanup(); useTaskStore.setState(initialTasks); useCalendarStore.setState(initialCalendar); });

it('saves the task with its source identity and original schedule before hiding the event', async () => {
  const task = await convertCalendarEventToTask(event, 'work');
  expect(mocks.rpc).toHaveBeenCalledWith('convert_calendar_event_to_task', expect.objectContaining({
    calendar_id: event.calendarId, event_id: event.id, event_time: '13:00', event_category: 'work' }));
  expect(task).toMatchObject({ sourceCalendarId: event.calendarId, sourceCalendarEventId: event.id, time: '13:00' });
  expect(convertedCalendarEventKeys(useTaskStore.getState().tasks).has(calendarEventKey(event))).toBe(true);
  expect(useCalendarStore.getState().deletedEventIds).toEqual([]);
});

it('a save failure leaves the event available and does not create a local-only task', async () => {
  mocks.rpc.mockResolvedValue({ data: null, error: { message: 'offline' } });
  await expect(convertCalendarEventToTask(event, '')).rejects.toThrow('Could not save');
  expect(useTaskStore.getState().tasks).toHaveLength(0);
  expect(convertedCalendarEventKeys(useTaskStore.getState().tasks).size).toBe(0);
});

it('retries use the saved task once and preserve local edits that arrive with realtime', async () => {
  await convertCalendarEventToTask(event, 'work');
  useTaskStore.setState({ tasks: [{ ...useTaskStore.getState().tasks[0], title: 'Edited after sync' }] });
  await convertCalendarEventToTask(event, 'work');
  expect(useTaskStore.getState().tasks).toHaveLength(1);
  expect(useTaskStore.getState().tasks[0].title).toBe('Edited after sync');
});

it('does not put an old account response into the next account cache', async () => {
  mocks.getSession.mockResolvedValueOnce({ data: { session: { user: { id: 'owner' } } } })
    .mockResolvedValueOnce({ data: { session: { user: { id: 'other' } } } });
  await expect(convertCalendarEventToTask(event, '')).rejects.toThrow('account changed');
  expect(useTaskStore.getState().tasks).toHaveLength(0);
});

it('source links survive row loading, edit projections, completion, moves and archiving', () => {
  const task = { ...rowToTask(row), completed: true, archivedAt: '2026-10-10T10:00:00Z', date: '2026-10-12', time: '15:00' };
  expect(convertedCalendarEventKeys([task]).has(calendarEventKey(event))).toBe(true);
  expect(convertedCalendarEventKeys([task]).has(calendarEventKey({ ...event, calendarId: 'another-calendar' }))).toBe(false);
  expect(taskToRow(task, 'owner')).toMatchObject({ source_calendar_id: event.calendarId, source_calendar_event_id: event.id });
  expect(taskSnapshotFields(task).sourceCalendarEventId).toBe(event.id);
  expect(TASK_KEY_TO_COLUMN.sourceCalendarEventId).toBe('source_calendar_event_id');
});

it('loading the synced converted row removes the original event on another client', () => {
  const view = render(<CalendarEventBlocks date={event.date} hourHeight={60} showTimeLabels />);
  expect(screen.getByText(event.title)).toBeInTheDocument();
  act(() => useTaskStore.setState({ tasks: [rowToTask(row)] }));
  view.rerender(<CalendarEventBlocks date={event.date} hourHeight={60} showTimeLabels />);
  expect(screen.queryByText(event.title)).not.toBeInTheDocument();
});

it('all-day rendering also respects a synced source link', () => {
  useCalendarStore.setState({ events: [{ ...event, isAllDay: true, time: null }] });
  const view = render(<AllDayEventStrip dates={[event.date]} />);
  expect(screen.getByText(event.title)).toBeInTheDocument();
  act(() => useTaskStore.setState({ tasks: [rowToTask(row)] }));
  view.rerender(<AllDayEventStrip dates={[event.date]} />);
  expect(screen.queryByText(event.title)).not.toBeInTheDocument();
});

it('generated recurring occurrences do not claim the original calendar source again', () => {
  const task: Task = { ...rowToTask(row), type: 'recurring', recurrence: { type: 'daily' }, time: '13:00' };
  useTaskStore.setState({ tasks: [task] });
  useTaskStore.getState().generateRecurringInstances('2026-10-11', '2026-10-11');
  const instance = useTaskStore.getState().tasks.find(t => t.id !== task.id)!;
  expect(instance).toBeDefined();
  expect(instance.sourceCalendarId).toBeUndefined();
  expect(instance.sourceCalendarEventId).toBeUndefined();
});
