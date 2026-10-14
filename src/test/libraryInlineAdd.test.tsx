import React from 'react';
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { QuickAddBar } from '@/components/QuickAddBar';
import { LibraryPanel } from '@/components/LibraryPanel';
import { useQuickAddStore } from '@/store/quickAddStore';
import { useLibraryStore } from '@/store/libraryStore';
import { useTaskStore } from '@/store/taskStore';
import { useLibraryDuePrompt } from '@/components/LibraryDueDatePrompt';

vi.mock('@/integrations/supabase/client', () => ({ supabase: { auth: {
  getSession: async () => ({ data: { session: null } }),
  onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }),
} } }));
vi.mock('framer-motion', () => ({
  AnimatePresence: ({ children }: any) => children,
  motion: {
    div: React.forwardRef<HTMLDivElement, any>(({ initial, animate, exit, transition, ...props }, ref) => <div ref={ref} {...props} />),
    span: ({ initial, animate, exit, transition, ...props }: any) => <span {...props} />,
  },
}));
beforeEach(() => {
  localStorage.clear();
  vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} });
  useLibraryStore.setState({ items: [], categories: [], panelOpen: true, sidebarMode: true,
    filters: { category: 'work', urgency: 'all', hasDueDate: null } });
  useTaskStore.setState({ viewMode: 'day' });
  useQuickAddStore.setState({ open: true, initialText: '' });
  useLibraryDuePrompt.setState({ pending: null });
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });

it.each(['quick', 'sidebar', 'fullscreen'] as const)('keeps %s drafts inline and saves all fields once, including uncommitted subtask text', (surface) => {
  if (surface === 'fullscreen') useLibraryStore.setState({ sidebarMode: false });
  render(surface === 'quick' ? <QuickAddBar /> : <LibraryPanel />);
  fireEvent.click(screen.getByRole('button', { name: 'Expand details' }));
  const region = screen.getByRole('region', { name: 'New library item details' });
  expect(useLibraryStore.getState().items).toHaveLength(0);
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  expect(screen.getByRole('button', { name: /^Add$/ })).toBeDisabled();
  fireEvent.change(screen.getByPlaceholderText(/^Add to library/), { target: { value: 'Prepare outline' } });
  fireEvent.change(screen.getByLabelText('Details', { exact: true }), { target: { value: 'Read the brief first.' } });
  fireEvent.change(screen.getByLabelText('Duration'), { target: { value: '45' } });
  fireEvent.click(screen.getByRole('button', { name: /^Important$/ }));
  fireEvent.change(within(region).getAllByRole('textbox')[1], { target: { value: 'Uncommitted checklist line' } });
  fireEvent.click(screen.getByRole('button', { name: 'Collapse details' }));
  expect(screen.queryByRole('region', { name: 'New library item details' })).not.toBeInTheDocument();
  expect(useLibraryStore.getState().items).toHaveLength(0);
  fireEvent.click(screen.getByRole('button', { name: 'Expand details' }));
  expect(screen.getByLabelText('Details', { exact: true })).toHaveValue('Read the brief first.');
  fireEvent.change(screen.getByLabelText('Add subtask…'), { target: { value: 'Typed just before saving' } });
  fireEvent.click(screen.getByRole('button', { name: /^Add$/ }));
  expect(useLibraryStore.getState().items).toHaveLength(1);
  expect(useLibraryStore.getState().items[0]).toMatchObject({ title: 'Prepare outline', note: 'Read the brief first.',
    defaultDuration: 45, isImportant: true, dueDate: null, category: surface === 'quick' ? '' : 'work',
    subtasks: [{ title: 'Uncommitted checklist line', completed: false }, { title: 'Typed just before saving', completed: false }] });
  expect(useLibraryDuePrompt.getState().pending).toBeNull();
  if (surface === 'quick') expect(useQuickAddStore.getState().open).toBe(false);
  else expect(screen.getByPlaceholderText(/^Add to library/)).toHaveValue('');
});

it('discards an unsubmitted Quick Add draft on close and starts clean on reopening', () => {
  render(<QuickAddBar />);
  fireEvent.click(screen.getByRole('button', { name: 'Expand details' }));
  fireEvent.change(screen.getByLabelText('Details', { exact: true }), { target: { value: 'Unsaved note' } });
  act(() => useQuickAddStore.getState().close());
  act(() => useQuickAddStore.getState().openBar('Fresh title'));
  expect(screen.getByRole('button', { name: 'Expand details' })).toHaveAttribute('aria-expanded', 'false');
  fireEvent.click(screen.getByRole('button', { name: 'Expand details' }));
  expect(screen.getByLabelText('Details', { exact: true })).toHaveValue('');
  expect(useLibraryStore.getState().items).toHaveLength(0);
});

it('retains the compact Enter-to-date-prompt flow', async () => {
  render(<QuickAddBar />);
  const title = screen.getByPlaceholderText(/^Add to library/);
  fireEvent.change(title, { target: { value: 'Quick capture' } });
  await act(async () => { fireEvent.keyDown(title, { key: 'Enter' }); });
  expect(useLibraryStore.getState().items).toHaveLength(0);
  expect(useLibraryDuePrompt.getState().pending).toMatchObject({ title: 'Quick capture', duration: 30, subtasks: [] });
  expect(useQuickAddStore.getState().open).toBe(true);
  act(() => useLibraryDuePrompt.getState().clear());
  expect(useQuickAddStore.getState().open).toBe(false);
});
