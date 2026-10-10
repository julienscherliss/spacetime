import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { TaskEditPanel } from '@/components/TaskEditPanel';
import { useTaskStore, type Task } from '@/store/taskStore';
import { useTimezoneStore } from '@/store/timezoneStore';
import { useLibraryStore } from '@/store/libraryStore';

vi.mock('framer-motion', () => ({
  AnimatePresence: ({ children }: any) => children,
  motion: { div: React.forwardRef<HTMLDivElement, any>(({ initial, animate, exit, transition, ...props }, ref) => <div ref={ref} {...props}/>), span: ({ initial, animate, exit, transition, ...props }: any) => <span {...props}/> },
}));

vi.mock('@/integrations/supabase/client', () => ({ supabase: {} }));
const request = vi.hoisted(() => vi.fn());
vi.mock('@/components/LibraryDueDatePrompt', () => ({ useLibraryDuePrompt: { getState: () => ({ request }) } }));
const original = useTaskStore.getState();
const library = useLibraryStore.getState();
const timezone = useTimezoneStore.getState().timezone;
const sample: Task = { id: 'editor-test', title: 'Morning review', date: '2026-10-10', time: '08:30', duration: 30, priority: 0, type: 'one-time', createdAt: '2026-10-01T12:00:00Z', completed: false, moveCount: 0, originalPriority: 0, description: 'Plan the day.', dueDate: '2026-10-13', subtasks: [{ id: 'one', title: 'Check inbox', completed: false }], reminders: [5], icon: 'Sun' };

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-10-11T02:30:00Z'));
  useTimezoneStore.setState({ timezone: 'America/Los_Angeles' });
  useLibraryStore.setState({ categories: [{ value: 'work', label: 'Work' }] });
  useTaskStore.setState({ tasks: [structuredClone(sample)], editingTaskId: sample.id, generateRecurringInstances: vi.fn() });
  request.mockClear();
});
afterEach(() => {
  cleanup();
  useTaskStore.setState(original);
  useLibraryStore.setState(library);
  useTimezoneStore.setState({ timezone });
  vi.useRealTimers();
  vi.restoreAllMocks();
});
const description = () => screen.getByPlaceholderText('Description');
const quick = () => document.querySelector('.quick-controls') as HTMLElement;
const current = () => useTaskStore.getState().tasks.find(t => t.id === sample.id)!;

it('shows only applied attributes, with app-timezone due days and a visible missing tag', () => {
  render(<TaskEditPanel />);
  expect(screen.getByLabelText('Edit due date')).toHaveTextContent('3d left');
  expect(screen.getByLabelText('Edit tag')).toHaveTextContent('no tag');
  expect(screen.getByLabelText('Edit tag')).toHaveClass('missing-tag');
  expect(screen.getByLabelText('Edit reminders')).toBeVisible();
  expect(quick()).not.toBeVisible();
});

it('keeps drafts and the pending subtask when switching settings and saving', () => {
  render(<TaskEditPanel />);
  fireEvent.change(screen.getByLabelText('Task name'), { target: { value: 'Changed title' } });
  fireEvent.change(description(), { target: { value: 'Changed description' } });
  const boxes = screen.getAllByRole('textbox');
  fireEvent.change(boxes[boxes.length - 1], { target: { value: 'Pending subtask' } });
  fireEvent.click(screen.getByLabelText('Open task settings'));
  expect(screen.getByRole('dialog', { name: 'Task settings' })).toBeVisible();
  expect(screen.getByLabelText('Task name')).not.toBeVisible();
  fireEvent.click(screen.getByLabelText('Back to task'));
  expect(screen.getByLabelText('Task name')).toHaveValue('Changed title');
  act(() => vi.advanceTimersByTime(400));
  fireEvent.click(screen.getByLabelText('Done editing task'));
  expect(current().title).toBe('Changed title');
  expect(current().description).toBe('Changed description');
  expect(current().subtasks?.map(s => s.title)).toEqual(['Check inbox', 'Pending subtask']);
  act(() => vi.advanceTimersByTime(500));
  expect(useTaskStore.getState().editingTaskId).toBeNull();
});

it('keeps quick settings during the actual recurrence menu, hides them on leaving details', () => {
  render(<TaskEditPanel />);
  fireEvent.focus(description());
  expect(quick()).toBeVisible();
  fireEvent.click(screen.getByLabelText('Repeat', { exact: true }));
  const daily = screen.getByRole('button', { name: /^Daily$/ });
  fireEvent.pointerDown(daily);
  fireEvent.focus(daily);
  expect(daily).toBeVisible();
  fireEvent.click(daily);
  expect(screen.getByLabelText('Edit repeat')).toHaveTextContent('Daily');
  fireEvent.pointerDown(screen.getByLabelText('Task name'));
  expect(quick()).not.toBeVisible();
  act(() => vi.advanceTimersByTime(400));
  fireEvent.click(screen.getByLabelText('Done editing task'));
  expect(current().recurrence).toEqual({ type: 'daily' });
});

it('retains edited text when moving to Limbo', () => {
  render(<TaskEditPanel />);
  fireEvent.change(description(), { target: { value: 'Unsaved draft' } });
  fireEvent.click(screen.getByLabelText('Open task settings'));
  fireEvent.click(screen.getByTitle('Move to Limbo'));
  expect(current().description).toBe('Unsaved draft');
  expect(current().inWaitingRoom).toBe(true);
  expect(current().time).toBe(sample.time); // Limbo retains its prior scheduling context.
});

it('sends the current draft fields to the Library prompt', async () => {
  render(<TaskEditPanel />);
  fireEvent.change(screen.getByLabelText('Task name'), { target: { value: 'Library draft' } });
  fireEvent.change(description(), { target: { value: 'Library description' } });
  await act(async () => { fireEvent.click(screen.getByLabelText('Send to Library')); });
  expect(request).toHaveBeenCalledWith(expect.objectContaining({ title: 'Library draft', note: 'Library description', dueDate: sample.dueDate }));
});

it('fits the visual viewport when the keyboard reduces available height', () => {
  const vv = new EventTarget();
  Object.assign(vv, { height: 844, offsetTop: 0 });
  Object.defineProperty(window, 'visualViewport', { configurable: true, value: vv });
  render(<TaskEditPanel />);
  Object.assign(vv, { height: 330, offsetTop: 48 });
  act(() => vv.dispatchEvent(new Event('resize')));
  expect(document.querySelector('.task-editor-overlay')).toHaveStyle({ height: '330px', top: '48px' });
  expect(screen.getByRole('dialog')).toHaveStyle({ maxHeight: '306px' });
  Object.defineProperty(window, 'visualViewport', { configurable: true, value: undefined });
});

it('saves the draft on Escape and restores page scrolling', () => {
  const overflow = document.body.style.overflow;
  render(<TaskEditPanel />);
  expect(document.activeElement).toBe(screen.getByRole('dialog'));
  expect(document.body.style.overflow).toBe('hidden');
  fireEvent.change(description(), { target: { value: 'Escape draft' } });
  fireEvent.keyDown(description(), { key: 'Escape' });
  expect(current().description).toBe('Escape draft');
  act(() => vi.advanceTimersByTime(500));
  expect(useTaskStore.getState().editingTaskId).toBeNull();
  expect(document.body.style.overflow).toBe(overflow);
});

it('dismisses title suggestions with Escape without saving or closing the editor', () => {
  render(<TaskEditPanel />);
  const title = screen.getByLabelText('Task name');
  fireEvent.change(title, { target: { value: 'Draft #' } });
  expect(screen.getByRole('button', { name: '#Work' })).toBeVisible();
  fireEvent.keyDown(title, { key: 'Escape' });
  act(() => vi.advanceTimersByTime(500));
  expect(screen.queryByRole('button', { name: '#Work' })).not.toBeInTheDocument();
  expect(screen.getByRole('dialog', { name: 'Edit task' })).toBeVisible();
  expect(current().title).toBe(sample.title);
});

it('allows a suggestion list touch to scroll before selecting a tag on click', () => {
  render(<TaskEditPanel />);
  fireEvent.change(screen.getByLabelText('Task name'), { target: { value: 'Draft #' } });
  const suggestion = screen.getByRole('button', { name: '#Work' });
  fireEvent.pointerDown(suggestion, { pointerType: 'touch' });
  expect(screen.getByLabelText('Edit tag')).toHaveTextContent('no tag');
  fireEvent.click(suggestion);
  expect(screen.getByLabelText('Task name')).toHaveValue('Draft');
  expect(screen.getByLabelText('Edit tag')).toHaveTextContent('Work');
  expect(screen.getByRole('dialog', { name: 'Edit task' })).toBeVisible();
});


it('uses the available phone height when the keyboard also resizes the layout viewport', () => {
  const width = window.innerWidth;
  const height = window.innerHeight;
  const oldViewport = window.visualViewport;
  const vv = new EventTarget();
  Object.assign(vv, { height: 460, offsetTop: 0 });
  Object.defineProperty(window, 'innerWidth', { configurable: true, value: 390 });
  Object.defineProperty(window, 'innerHeight', { configurable: true, value: 460 });
  Object.defineProperty(window, 'visualViewport', { configurable: true, value: vv });
  try {
    render(<TaskEditPanel />);
    expect(screen.getByRole('dialog')).toHaveStyle({ maxHeight: '436px' });
  } finally {
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: width });
    Object.defineProperty(window, 'innerHeight', { configurable: true, value: height });
    Object.defineProperty(window, 'visualViewport', { configurable: true, value: oldViewport });
  }
});
