import { afterEach, describe, expect, it, vi } from 'vitest';

async function setup(native = false, electron = false, getState?: () => Promise<{ isActive: boolean }>) {
  vi.resetModules();
  vi.doMock('@/utils/nativePlatform', () => ({ isNativePlatform: () => native, isElectron: () => electron }));
  let callback: ((state: { isActive: boolean }) => void) | undefined;
  const remove = vi.fn();
  const addListener = vi.fn(async (_event, listener) => { callback = listener; return { remove }; });
  vi.doMock('@capacitor/app', () => ({ App: { addListener, ...(getState ? { getState } : {}) } }));
  const { subscribeAppActivity } = await import('@/lib/appActivity');
  return { subscribeAppActivity, addListener, remove, native: (isActive: boolean) => callback!({ isActive }) };
}
afterEach(() => {
  delete window.spacetimeActivity;
  vi.restoreAllMocks();
  Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' });
});
describe('platform activity subscription', () => {
  it('uses visibility on web and removes the listener', async () => {
    const h = await setup(); const callback = vi.fn();
    const stop = h.subscribeAppActivity(callback);
    Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'hidden' });
    document.dispatchEvent(new Event('visibilitychange'));
    expect(callback).toHaveBeenLastCalledWith(false);
    Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' });
    document.dispatchEvent(new Event('visibilitychange'));
    expect(callback).toHaveBeenLastCalledWith(true);
    stop(); callback.mockClear(); document.dispatchEvent(new Event('visibilitychange'));
    expect(callback).not.toHaveBeenCalled();
  });
  it('uses native app state exclusively, without duplicate visibility input', async () => {
    const h = await setup(true); const callback = vi.fn();
    const stop = h.subscribeAppActivity(callback);
    await vi.waitFor(() => expect(h.addListener).toHaveBeenCalled());
    document.dispatchEvent(new Event('visibilitychange'));
    expect(callback).not.toHaveBeenCalled();
    h.native(false); h.native(true);
    expect(callback.mock.calls).toEqual([[false], [true]]);
    stop(); expect(h.remove).toHaveBeenCalledTimes(1);
  });
  it('initializes an already backgrounded native app and ignores a stale initial state after an event', async () => {
    const callback = vi.fn();
    let resolve!: (value: { isActive: boolean }) => void;
    const state = new Promise<{ isActive: boolean }>(r => { resolve = r; });
    const h = await setup(true, false, () => state);
    const stop = h.subscribeAppActivity(callback);
    await vi.waitFor(() => expect(h.addListener).toHaveBeenCalled());
    h.native(false); h.native(true); resolve({ isActive: false });
    await Promise.resolve();
    expect(callback.mock.calls).toEqual([[false], [true]]);
    stop();
    const second = await setup(true, false, async () => ({ isActive: false }));
    const initial = vi.fn(); const stopSecond = second.subscribeAppActivity(initial);
    await vi.waitFor(() => expect(initial).toHaveBeenCalledWith(false));
    second.native(true); expect(initial).toHaveBeenLastCalledWith(true); stopSecond();
  });
  it('removes a native listener whose asynchronous registration finishes after unmount', async () => {
    const h = await setup(true); const stop = h.subscribeAppActivity(vi.fn());
    stop(); await vi.waitFor(() => expect(h.remove).toHaveBeenCalledTimes(1));
  });
  it('uses the limited desktop bridge exclusively and unsubscribes', async () => {
    const h = await setup(true, true); const remove = vi.fn();
    let receive!: (active: boolean) => void;
    window.spacetimeActivity = { subscribe: vi.fn(cb => { receive = cb; return remove; }) };
    const callback = vi.fn(); const stop = h.subscribeAppActivity(callback);
    document.dispatchEvent(new Event('visibilitychange'));
    expect(callback).not.toHaveBeenCalled(); expect(h.addListener).not.toHaveBeenCalled();
    receive(false); receive(true); expect(callback.mock.calls).toEqual([[false], [true]]);
    stop(); expect(remove).toHaveBeenCalledTimes(1);
  });
});
