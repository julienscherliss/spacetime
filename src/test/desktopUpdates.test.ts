import { afterEach, describe, expect, it, vi } from 'vitest';
import { EventEmitter } from 'node:events';
import { resolve } from 'node:path';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
import { prepareDesktopRestart, registerDesktopRestartPreparation } from '@/lib/desktopUpdates';

function native(file: string, modules: Record<string, unknown>, globals = {}) {
  const source = readFileSync(resolve('electron/src', file), 'utf8');
  const exports: Record<string, unknown> = {};
  runInNewContext(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText,
    { exports, console: { log() {} }, require: (name: string) => modules[name] ?? {}, ...globals });
  return exports;
}
function fixture() {
  const app = new EventEmitter();
  const updater = Object.assign(new EventEmitter(), { checkForUpdates: vi.fn().mockResolvedValue({}),
    downloadUpdate: vi.fn().mockResolvedValue([]), quitAndInstall: vi.fn() });
  const commands = new Map<string, (event: unknown) => unknown>();
  const mainFrame = { url: 'capacitor-electron://-/app' };
  const webContents = { send: vi.fn(), isDestroyed: () => false, mainFrame };
  const win = { webContents, isDestroyed: () => false, show: vi.fn(), focus: vi.fn() };
  const event = { sender: webContents, senderFrame: mainFrame };
  const queued: Array<() => void> = [];
  const install = native('desktopUpdates.ts', { electron: { app, ipcMain: { handle: (name: string, fn: (e: unknown) => unknown) => commands.set(name, fn) } },
    'electron-updater': { autoUpdater: updater } }, { setInterval: () => ({ unref() {} }), clearInterval() {}, setImmediate: (fn: () => void) => queued.push(fn) }).installDesktopUpdates as (win: () => unknown, scheme: string) => { check: (manual?: boolean) => Promise<unknown> };
  const controller = install(() => win, 'capacitor-electron');
  const invoke = (name: string, e = event) => commands.get(`spacetime:update:${name}`)!(e);
  const state = () => invoke('state') as { phase: string; visible: boolean; percent: number; retry: string };
  return { updater, invoke, state, controller, event, win, queued };
}
afterEach(() => vi.useRealTimers());

describe('desktop updater main process', () => {
  it('checks quietly, requires explicit download, and disables automatic installation/downgrades', async () => {
    const h = fixture();
    await h.controller.check();
    expect(h.state()).toMatchObject({ phase: 'checking', visible: false });
    expect(h.updater).toMatchObject({ autoDownload: false, autoInstallOnAppQuit: false, allowDowngrade: false, allowPrerelease: false });
    h.updater.emit('update-available', { version: '1.0.27' });
    expect(h.state()).toMatchObject({ phase: 'available', visible: true });
    expect(h.updater.downloadUpdate).not.toHaveBeenCalled();
    await h.invoke('download');
    expect(h.updater.downloadUpdate).toHaveBeenCalledOnce();
  });
  it('coalesces checks and makes a manual no-update result visible', async () => {
    const h = fixture();
    const a = h.controller.check(); const b = h.controller.check(true);
    await Promise.all([a, b]);
    expect(h.updater.checkForUpdates).toHaveBeenCalledOnce();
    h.updater.emit('update-not-available', {});
    expect(h.state()).toMatchObject({ phase: 'current', visible: true });
    expect(h.win.focus).toHaveBeenCalledOnce();
  });
  it('contains check/download failures, supports retry, and keeps errors private', async () => {
    const h = fixture();
    h.updater.checkForUpdates.mockRejectedValueOnce(new Error('private feed URL'));
    await h.invoke('check');
    expect(h.state()).toMatchObject({ phase: 'error', retry: 'check', visible: true });
    expect(JSON.stringify(h.state())).not.toContain('private');
    h.updater.emit('update-available', { version: '1.0.27' });
    h.updater.downloadUpdate.mockRejectedValueOnce(new Error('network'));
    await h.invoke('download');
    expect(h.state()).toMatchObject({ phase: 'error', retry: 'download' });
    await h.invoke('download');
    expect(h.updater.downloadUpdate).toHaveBeenCalledTimes(2);
  });
  it('does not double-download, clamps progress and defers installation to one restart command', async () => {
    const h = fixture();
    expect(h.invoke('restart')).toBe(false);
    h.updater.emit('update-available', { version: '1.0.27' });
    const a = h.invoke('download'); const b = h.invoke('download');
    await Promise.all([a, b]);
    expect(h.updater.downloadUpdate).toHaveBeenCalledOnce();
    h.updater.emit('download-progress', { percent: 150 });
    expect(h.state().percent).toBe(100);
    h.updater.emit('update-downloaded', { version: '1.0.27' });
    expect(h.updater.quitAndInstall).not.toHaveBeenCalled();
    h.invoke('dismiss'); expect(h.state().visible).toBe(false);
    await h.invoke('check'); expect(h.state().phase).toBe('downloaded');
    expect(h.updater.checkForUpdates).not.toHaveBeenCalled();
    expect(h.invoke('restart')).toBe(true); expect(h.invoke('restart')).toBe(false);
    h.queued[0](); expect(h.updater.quitAndInstall).toHaveBeenCalledOnce();
  });
  it('rejects foreign windows, subframes and remote navigation on every command', () => {
    const h = fixture();
    for (const command of ['state', 'check', 'download', 'dismiss', 'restart']) {
      expect(() => h.invoke(command, { ...h.event, sender: {} } as typeof h.event)).toThrow();
      expect(() => h.invoke(command, { ...h.event, senderFrame: { url: h.event.senderFrame.url } })).toThrow();
    }
    h.event.senderFrame.url = 'https://example.com/';
    expect(() => h.invoke('restart')).toThrow();
  });
  it('turns synchronous install failure into a retryable notice', () => {
    const h = fixture(); h.updater.emit('update-downloaded', { version: '1.0.27' });
    h.updater.quitAndInstall.mockImplementationOnce(() => { throw new Error('native failure'); });
    h.invoke('restart'); h.queued[0]();
    expect(h.state()).toMatchObject({ phase: 'error', retry: 'restart', visible: true });
    expect(h.invoke('restart')).toBe(true);
  });
});

describe('desktop update preload', () => {
  it('exposes fixed commands, discards stale initial state and removes listeners', async () => {
    const ipc = Object.assign(new EventEmitter(), { invoke: vi.fn().mockResolvedValue({ phase: 'idle', revision: 0 }) });
    let bridge!: { subscribe: (fn: (value: unknown) => void) => () => void; download: () => Promise<unknown> };
    native('preload.ts', { electron: { ipcRenderer: ipc, contextBridge: {
      exposeInMainWorld(name: string, value: typeof bridge) { if (name === 'spacetimeUpdates') bridge = value; },
    } } });
    const callback = vi.fn(); const stop = bridge.subscribe(callback);
    ipc.emit('spacetime:update', { secret: 'not forwarded' }, { phase: 'available', revision: 2 });
    await Promise.resolve();
    expect(callback.mock.calls).toEqual([[{ phase: 'available', revision: 2 }]]);
    expect(Object.keys(bridge).sort()).toEqual(['check', 'dismiss', 'download', 'restart', 'subscribe']);
    await bridge.download(); expect(ipc.invoke).toHaveBeenLastCalledWith('spacetime:update:download');
    stop(); expect(ipc.listenerCount('spacetime:update')).toBe(0);
  });
});

describe('save gate for desktop restart', () => {
  it('fails closed when unavailable, on failure, and after account switch', async () => {
    expect(await prepareDesktopRestart()).toBe(false);
    let stop = registerDesktopRestartPreparation(async () => false);
    expect(await prepareDesktopRestart()).toBe(false); stop();
    stop = registerDesktopRestartPreparation(async () => { throw new Error('offline'); });
    expect(await prepareDesktopRestart()).toBe(false); stop();
    let resolve!: (ok: boolean) => void;
    const oldStop = registerDesktopRestartPreparation(() => new Promise(done => { resolve = done; }));
    const pending = prepareDesktopRestart();
    stop = registerDesktopRestartPreparation(async () => true); oldStop(); resolve(true);
    expect(await pending).toBe(false); expect(await prepareDesktopRestart()).toBe(true); stop();
  });
  it('times out without installing when the save never finishes', async () => {
    vi.useFakeTimers();
    const stop = registerDesktopRestartPreparation(() => new Promise(() => {}));
    const pending = prepareDesktopRestart();
    await vi.advanceTimersByTimeAsync(15000);
    expect(await pending).toBe(false); stop();
  });
});
