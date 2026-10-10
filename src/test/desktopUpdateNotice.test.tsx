import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { DesktopUpdateNotice } from '@/components/DesktopUpdateNotice';
import { registerDesktopRestartPreparation, type DesktopUpdateState } from '@/lib/desktopUpdates';

let removeSave: (() => void) | undefined;
afterEach(() => { cleanup(); removeSave?.(); removeSave = undefined; delete window.spacetimeUpdates; });
function fixture(phase: DesktopUpdateState['phase'] = 'available') {
  let listener!: (value: DesktopUpdateState) => void;
  let state: DesktopUpdateState = { phase, visible: true, revision: 1, version: '1.0.27' };
  const emit = (next: Partial<DesktopUpdateState>) => act(() => { state = { ...state, ...next, revision: state.revision + 1 }; listener(state); });
  const unsubscribe = vi.fn();
  const bridge = { subscribe: vi.fn(fn => { listener = fn; fn(state); return unsubscribe; }),
    download: vi.fn(async () => { emit({ phase: 'downloading', percent: 35 }); }),
    dismiss: vi.fn(async () => { emit({ visible: false }); }), check: vi.fn().mockResolvedValue(undefined),
    restart: vi.fn().mockResolvedValue(true) };
  window.spacetimeUpdates = bridge;
  const view = render(<DesktopUpdateNotice />);
  return { bridge, emit, view, unsubscribe };
}
describe('desktop update notice', () => {
  it('is absent on web/iOS without a native update bridge', () => {
    render(<DesktopUpdateNotice />); expect(screen.queryByLabelText('Spacetime update')).toBeNull();
  });
  it('downloads only on click, shows progress, and Later dismisses without installing', async () => {
    const h = fixture(); expect(h.bridge.download).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Download' }));
    expect(await screen.findByText(/35% downloaded/)).toBeVisible();
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '35');
    await waitFor(() => expect(h.bridge.download).toHaveBeenCalledOnce());
    fireEvent.click(screen.getByRole('button', { name: 'Later' }));
    await waitFor(() => expect(screen.queryByLabelText('Spacetime update')).toBeNull());
    expect(h.bridge.restart).not.toHaveBeenCalled(); h.view.unmount(); expect(h.unsubscribe).toHaveBeenCalledOnce();
  });
  it('requires confirmation and successful sync before issuing exactly one restart', async () => {
    const h = fixture('downloaded');
    let resolve!: (ok: boolean) => void;
    const saved = vi.fn(() => new Promise<boolean>(done => { resolve = done; }));
    removeSave = registerDesktopRestartPreparation(saved);
    fireEvent.click(screen.getByRole('button', { name: 'Restart to update' }));
    expect(screen.getByRole('alertdialog')).toBeVisible();
    expect(h.bridge.restart).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Save and restart' }));
    expect(screen.getByRole('button', { name: 'Syncing…' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Later', hidden: false })).toBeDisabled();
    expect(h.bridge.restart).not.toHaveBeenCalled();
    await act(async () => resolve(true));
    expect(h.bridge.restart).toHaveBeenCalledOnce(); expect(saved).toHaveBeenCalledOnce();
  });
  it('keeps the app open on failed sync and allows a successful retry', async () => {
    const h = fixture('downloaded');
    const saved = vi.fn().mockResolvedValueOnce(false).mockResolvedValue(true);
    removeSave = registerDesktopRestartPreparation(saved);
    fireEvent.click(screen.getByRole('button', { name: 'Restart to update' }));
    fireEvent.click(screen.getByRole('button', { name: 'Save and restart' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Could not finish syncing');
    expect(h.bridge.restart).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    await waitFor(() => expect(h.bridge.restart).toHaveBeenCalledOnce());
  });
  it('contains rejected bridge commands without an unhandled rejection', async () => {
    const h = fixture(); h.bridge.download.mockRejectedValueOnce(new Error('offline'));
    fireEvent.click(screen.getByRole('button', { name: 'Download' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Could not connect to the updater');
    expect(h.bridge.restart).not.toHaveBeenCalled();
  });
  it('offers the right retry command and shows a completed manual check', async () => {
    const h = fixture('error'); h.emit({ retry: 'check' });
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    await waitFor(() => expect(h.bridge.check).toHaveBeenCalledOnce());
    h.emit({ phase: 'current' });
    expect(screen.getByText('You’re up to date')).toBeVisible();
    expect(screen.queryByRole('button', { name: 'Download' })).toBeNull();
  });
  it('keeps update controls and restart dialog keys out of global task shortcuts', () => {
    fixture('downloaded');
    const globalShortcut = vi.fn(); window.addEventListener('keydown', globalShortcut);
    fireEvent.keyDown(screen.getByRole('button', { name: 'Restart to update' }), { key: 'Tab' });
    fireEvent.click(screen.getByRole('button', { name: 'Restart to update' }));
    fireEvent.keyDown(screen.getByRole('button', { name: 'Save and restart' }), { key: 'x' });
    expect(globalShortcut).not.toHaveBeenCalled(); window.removeEventListener('keydown', globalShortcut);
  });
});
