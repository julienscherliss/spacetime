import React from 'react';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
vi.mock('@/integrations/supabase/client', () => ({ supabase: { auth: {
  getSession: async () => ({ data: { session: null } }),
  onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }),
} } }));
const owner = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
beforeEach(() => {
  vi.resetModules(); localStorage.clear();
  vi.stubEnv('VITE_AUTH_BACKEND', 'owned');
  vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} });
});
afterEach(async () => {
  cleanup(); (await import('@/lib/ownedDeviceCache')).closeOwnedCache();
  vi.unstubAllGlobals(); vi.unstubAllEnvs();
});

it('expands descriptions with the view toggle, excludes subtasks, and remembers the preference without changing items', async () => {
  const cache = await import('@/lib/ownedDeviceCache'); cache.openVerifiedOwnedCache(owner);
  const { useLibraryStore: store } = await import('@/store/libraryStore');
  const { useTaskStore } = await import('@/store/taskStore'); useTaskStore.setState({ viewMode: 'day' });
  const items = [{ id: 'library-probe', title: 'Review the brief', note: 'Read the background notes.\nThen prepare the outline.',
    category: '', defaultDuration: 30, createdAt: '2026-10-10T00:00:00Z', isUrgent: false, isImportant: false,
    dueDate: null, subtasks: [{ id: 'subtask', title: 'Hidden checklist item', completed: false }] },
    { id: 'blank-note', title: 'No description', note: ' ', category: '', defaultDuration: 30,
      createdAt: '2026-10-10T00:00:00Z', isUrgent: false, isImportant: false, dueDate: null, subtasks: [] }];
  store.setState({ items, categories: [], panelOpen: true, sidebarMode: true, showDetails: false });
  const { LibraryPanel } = await import('@/components/LibraryPanel');
  const view = render(<LibraryPanel />);
  expect(view.container.querySelector('[data-library-description]')).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: 'Show library details' }));
  expect(screen.getByRole('button', { name: 'Hide library details' })).toHaveAttribute('aria-pressed', 'true');
  expect(view.container.querySelectorAll('[data-library-description]')).toHaveLength(1);
  expect(view.container.querySelector('[data-library-description]')).toHaveTextContent('Read the background notes.');
  expect(screen.queryByText('Hidden checklist item')).not.toBeInTheDocument();
  expect(store.getState().items).toEqual(items);

  view.unmount(); cache.closeOwnedCache();
  store.setState({ items: [], showDetails: false });
  cache.openVerifiedOwnedCache(owner);
  await act(async () => { await store.persist.rehydrate(); });
  expect(store.getState().showDetails).toBe(true);
  expect(store.getState().items).toEqual(items);
  act(() => store.getState().setPanelOpen(true));
  const reopened = render(<LibraryPanel />);
  expect(reopened.container.querySelector('[data-library-description]')).not.toBeNull();
  fireEvent.click(screen.getByRole('button', { name: 'Hide library details' }));
  expect(reopened.container.querySelector('[data-library-description]')).toBeNull();
});
