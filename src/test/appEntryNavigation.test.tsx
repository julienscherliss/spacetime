import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, waitFor } from '@testing-library/react';
import { StrictMode } from 'react';
import { AppEntryAccountContext, useAppEntryNavigation } from '@/hooks/useAppEntryNavigation';
import { DayView } from '@/components/DayView';
import { FocusView } from '@/components/FocusView';
import { useTaskStore, type Task } from '@/store/taskStore';
import { useTimezoneStore } from '@/store/timezoneStore';
import { useQuickAddStore } from '@/store/quickAddStore';
import { useTutorialStore } from '@/tutorial/tutorialStore';
import { useLibraryStore } from '@/store/libraryStore';
import { useCalendarStore } from '@/store/calendarStore';
import { useCarryStore } from '@/store/carryStore';
import { useReflectionStore } from '@/store/reflectionStore';
import { emitEntryRefresh } from '@/lib/appActivity';

const date = '2026-10-06';
const active: Task = { id: 'active', title: 'Entry test task', date, time: '10:00', duration: 30,
  type: 'one-time', priority: 0, originalPriority: 0, completed: false,
  createdAt: '2026-10-06T00:00:00Z', moveCount: 0 };
const checkbox = { id: 'checkbox', title: 'Entry test subtask', completed: false };
const entry = (phase: 'start' | 'finish' | 'cancel', generation = 1, userId = 'user-a') =>
  act(() => emitEntryRefresh({ phase, generation, userId }));
function Harness({ user = 'user-a', blocked = false, showFocus = false, showDay = false }: {
  user?: string | null; blocked?: boolean; showFocus?: boolean; showDay?: boolean;
}) {
  return <AppEntryAccountContext.Provider value={user}>
    <Entry blocked={blocked} showFocus={showFocus} showDay={showDay}/>
  </AppEntryAccountContext.Provider>;
}
function Entry({ blocked, showFocus, showDay }: { blocked: boolean; showFocus: boolean; showDay: boolean }) {
  const notify = useAppEntryNavigation(blocked);
  const view = useTaskStore(s => s.viewMode);
  return <><button onClick={notify}>Notification</button>{showFocus && view === 'focus' && <FocusView/>}{showDay && view === 'day' && <DayView/>}</>;
}

beforeEach(() => {
  vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} });
  vi.useFakeTimers(); vi.setSystemTime(new Date('2026-10-06T17:15:00Z'));
  localStorage.clear(); window.history.replaceState(null, '', '/app');
  Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' });
  useTimezoneStore.setState({ timezone: 'America/Los_Angeles' });
  useTaskStore.setState({ tasks: [active], viewMode: 'week', daySubMode: 'sequencer',
    focusEntryPanel: null, editingTaskId: null, routinesEnabled: true,
    navigateToDate: null, currentDate: '2026-10-03', focusTaskId: 'future' });
  useQuickAddStore.setState({ open: false });
  useTutorialStore.setState({ active: false });
  useLibraryStore.setState({ panelOpen: false });
  useCalendarStore.setState({ panelOpen: false });
  useCarryStore.setState({ carried: null });
  useReflectionStore.setState({ activePrompt: null });
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); vi.useRealTimers(); });

describe('entry navigation integration', () => {
  it('waits for the ready account, then applies once even under StrictMode', () => {
    const applied = vi.fn(); window.addEventListener('app-entry:applied', applied);
    const view = render(<StrictMode><Harness user={null}/></StrictMode>);
    expect(useTaskStore.getState().viewMode).toBe('week');
    view.rerender(<StrictMode><Harness/></StrictMode>);
    expect(useTaskStore.getState()).toMatchObject({ viewMode: 'focus', focusEntryPanel: 'completed' });
    expect(applied).toHaveBeenCalledTimes(1);
    act(() => useTaskStore.getState().setViewMode('calendar'));
    view.rerender(<StrictMode><Harness/></StrictMode>);
    expect(useTaskStore.getState().viewMode).toBe('calendar');
    window.removeEventListener('app-entry:applied', applied);
  });
  it('retains tasks identity and does not persist a no-op recurrence generation or the panel', () => {
    const tasks = useTaskStore.getState().tasks;
    const write = vi.spyOn(Storage.prototype, 'setItem');
    useTaskStore.getState().generateRecurringInstances(date, date);
    expect(write).not.toHaveBeenCalled();
    render(<Harness/>);
    expect(useTaskStore.getState().tasks).toBe(tasks);
    const persisted = useTaskStore.persist.getOptions().partialize!(useTaskStore.getState());
    expect(persisted).not.toHaveProperty('focusEntryPanel');
  });
  it('generates a recurring occurrence before deciding to open its Focus details', () => {
    useTaskStore.setState({ tasks: [{ ...active, date: '2026-10-05', recurrence: { type: 'daily' },
      type: 'recurring', isRoutine: true, subtasks: [checkbox] }] });
    render(<Harness/>);
    expect(useTaskStore.getState()).toMatchObject({ viewMode: 'focus', focusEntryPanel: 'detail' });
    expect(useTaskStore.getState().tasks.filter(t => t.date === date)).toHaveLength(1);
    useTaskStore.getState().generateRecurringInstances(date, date);
    expect(useTaskStore.getState().tasks.filter(t => t.date === date)).toHaveLength(1);
  });
  it('resets a different Day date and Sequencer to today timeline on idle return', () => {
    render(<Harness/>);
    act(() => useTaskStore.setState({ viewMode: 'day', daySubMode: 'sequencer', currentDate: '2026-10-03' }));
    entry('start');
    act(() => useTaskStore.setState({ tasks: [] })); // settled remote snapshot
    entry('finish');
    expect(useTaskStore.getState()).toMatchObject({ viewMode: 'day', daySubMode: 'timeline',
      currentDate: date, navigateToDate: date, focusEntryPanel: null });
  });
  it('updates an already mounted Day timeline to today without cross-component render updates', () => {
    useTaskStore.setState({ tasks: [] });
    const errors = vi.spyOn(console, 'error').mockImplementation(() => {});
    const view = render(<Harness showDay/>);
    act(() => useTaskStore.setState({ currentDate: '2026-10-07', navigateToDate: '2026-10-07' }));
    expect(view.getByRole('heading', { name: 'Wednesday, October 7' })).toBeInTheDocument();
    entry('start'); entry('finish');
    expect(view.getByRole('heading', { name: 'Tuesday, October 6' })).toBeInTheDocument();
    expect(errors.mock.calls.filter(call => String(call[0]).includes('Cannot update a component'))).toEqual([]);
  });
  it('does not route on a task save, clock tick or ordinary rerender', () => {
    const view = render(<Harness/>);
    act(() => useTaskStore.getState().setViewMode('calendar'));
    act(() => { useTaskStore.setState({ tasks: [] }); vi.advanceTimersByTime(60 * 60 * 1000); });
    view.rerender(<Harness/>);
    expect(useTaskStore.getState().viewMode).toBe('calendar');
  });
  it.each(['pointer', 'key', 'wheel', 'navigation'])('cancels a delayed entry after manual %s', action => {
    render(<Harness/>);
    act(() => useTaskStore.getState().setViewMode('calendar'));
    entry('start');
    if (action === 'pointer') fireEvent.pointerDown(document.body);
    if (action === 'key') fireEvent.keyDown(document.body, { key: 'ArrowDown' });
    if (action === 'wheel') fireEvent.wheel(document.body);
    if (action === 'navigation') act(() => useTaskStore.getState().setViewMode('week'));
    entry('finish');
    expect(useTaskStore.getState().viewMode).toBe(action === 'navigation' ? 'week' : 'calendar');
  });
  it('skips an editor present on entry even if it closes before refresh finishes', () => {
    render(<Harness/>);
    act(() => useTaskStore.setState({ viewMode: 'week', editingTaskId: 'active' }));
    entry('start');
    act(() => useTaskStore.getState().setEditingTask(null));
    entry('finish');
    expect(useTaskStore.getState().viewMode).toBe('week');
  });
  it('skips a protected overlay or callback on cold entry and resume', () => {
    const view = render(<Harness blocked/>);
    expect(useTaskStore.getState().viewMode).toBe('week');
    entry('start'); view.rerender(<Harness/>); entry('finish');
    expect(useTaskStore.getState().viewMode).toBe('week');
    window.history.replaceState(null, '', '/app?checkout=success');
    entry('start', 2); entry('finish', 2);
    expect(useTaskStore.getState().viewMode).toBe('week');
    window.history.replaceState(null, '', '/app#error=cancelled');
    entry('start', 3); entry('finish', 3);
    expect(useTaskStore.getState().viewMode).toBe('week');
  });
  it('ignores stale generations, other accounts and duplicate completion', () => {
    render(<Harness/>);
    act(() => useTaskStore.getState().setViewMode('week'));
    entry('start', 1); entry('cancel', 2); entry('start', 3);
    entry('finish', 1); entry('finish', 3, 'user-b');
    expect(useTaskStore.getState().viewMode).toBe('week');
    entry('finish', 3);
    expect(useTaskStore.getState().viewMode).toBe('focus');
    act(() => useTaskStore.getState().setViewMode('calendar'));
    entry('finish', 3);
    expect(useTaskStore.getState().viewMode).toBe('calendar');
  });
  it('a notification follows overdue precedence and cannot bypass an outstanding refresh', () => {
    const view = render(<Harness/>);
    act(() => useTaskStore.setState({ tasks: [{ ...active, time: '09:00' }], viewMode: 'week' }));
    fireEvent.click(view.getByText('Notification'));
    expect(useTaskStore.getState()).toMatchObject({ viewMode: 'day', daySubMode: 'timeline' });
    act(() => useTaskStore.getState().setViewMode('calendar'));
    entry('start'); fireEvent.pointerDown(document.body);
    fireEvent.click(view.getByText('Notification'));
    expect(useTaskStore.getState().viewMode).toBe('calendar');
    entry('finish');
    expect(useTaskStore.getState().viewMode).toBe('calendar');
  });
  it('renders the actual upper Focus list, and switches to the actual subtasks panel on return', async () => {
    vi.useRealTimers(); vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-10-06T17:15:00Z'));
    const view = render(<Harness showFocus/>);
    await waitFor(() => expect(view.getByText('Entry test task')).toBeVisible());
    expect(view.container.textContent).not.toContain('Entry test subtask');
    entry('start');
    act(() => useTaskStore.setState({ tasks: [{ ...active, subtasks: [checkbox] }] }));
    entry('finish');
    await waitFor(() => expect(view.getByText('Entry test subtask')).toBeVisible());
    expect(useTaskStore.getState().focusEntryPanel).toBeNull();
  });
});
