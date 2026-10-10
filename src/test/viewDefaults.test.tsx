import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { CalendarView } from '@/components/CalendarView';
import { useTaskStore } from '@/store/taskStore';
import { useTimezoneStore } from '@/store/timezoneStore';

const original = useTaskStore.getState();
const originalTimezone = useTimezoneStore.getState().timezone;
beforeEach(() => {
  vi.useFakeTimers();
  // UTC has advanced to October 11, but it is still October 10 in Los Angeles.
  vi.setSystemTime(new Date('2026-10-11T02:30:00Z'));
  useTimezoneStore.setState({ timezone: 'America/Los_Angeles' });
  useTaskStore.setState({ tasks: [], viewMode: 'day', weekSubMode: 'list', generateRecurringInstances: vi.fn() });
});
afterEach(() => {
  cleanup();
  useTaskStore.setState(original);
  useTimezoneStore.setState({ timezone: originalTimezone });
  vi.useRealTimers();
});

describe('view entry defaults', () => {
  it('opens Week in the grid, allows List, and returns to grid on the next entry', () => {
    useTaskStore.getState().setViewMode('week');
    expect(useTaskStore.getState().weekSubMode).toBe('timeline');
    useTaskStore.getState().setWeekSubMode('list');
    expect(useTaskStore.getState().weekSubMode).toBe('list');
    useTaskStore.getState().setViewMode('day');
    useTaskStore.getState().setViewMode('week');
    expect(useTaskStore.getState().weekSubMode).toBe('timeline');
  });

  it('selects the app’s current day when Month opens and again when reopened', () => {
    const first = render(<CalendarView />);
    expect(screen.getByRole('heading', { name: 'Saturday, Oct 10' })).toBeInTheDocument();
    first.unmount();
    render(<CalendarView />);
    expect(screen.getByRole('heading', { name: 'Saturday, Oct 10' })).toBeInTheDocument();
  });
});
