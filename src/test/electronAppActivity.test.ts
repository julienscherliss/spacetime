import { afterEach, describe, expect, it, vi } from 'vitest';
import { EventEmitter } from 'node:events';
import { resolve } from 'node:path';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';

function evaluateNative(file: string, electron: Record<string, unknown>) {
  const source = readFileSync(resolve(process.cwd(), 'electron/src', file), 'utf8');
  const js = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;
  const exports: Record<string, unknown> = {};
  runInNewContext(js, { exports, console: { log() {} }, process: { platform: 'darwin' },
    require: (name: string) => name === 'electron' ? electron : {} });
  return exports;
}

afterEach(() => vi.restoreAllMocks());

describe('desktop app activity bridge', () => {
  function fixture() {
    const app = new EventEmitter();
    const win = new EventEmitter();
    const send = vi.fn();
    let visible = true;
    Object.assign(win, { webContents: { send }, isDestroyed: () => false,
      isVisible: () => visible, isMinimized: () => false });
    const install = evaluateNative('appActivity.ts', { app }).installAppActivity as (win: EventEmitter) => void;
    install(win);
    return { app, win, send, hide: () => { visible = false; win.emit('hide'); },
      show: () => { visible = true; win.emit('show'); } };
  }
  it('uses actual app deactivation/reactivation rather than internal dialog/window focus', () => {
    const h = fixture();
    h.win.emit('blur'); h.win.emit('focus');
    expect(h.send).not.toHaveBeenCalled();
    h.app.emit('did-resign-active'); h.app.emit('did-resign-active');
    h.win.emit('focus');
    expect(h.send.mock.calls).toEqual([['spacetime:activity', false]]);
    h.app.emit('did-become-active'); h.app.emit('did-become-active');
    expect(h.send.mock.calls).toEqual([['spacetime:activity', false], ['spacetime:activity', true]]);
    h.win.emit('closed');
    expect(h.app.listenerCount('did-become-active')).toBe(0);
    expect(h.app.listenerCount('did-resign-active')).toBe(0);
  });
  it('does not resume a hidden window while another app is active', () => {
    const h = fixture();
    h.app.emit('did-resign-active'); h.hide(); h.show();
    expect(h.send.mock.calls).toEqual([['spacetime:activity', false]]);
    h.app.emit('did-become-active');
    expect(h.send).toHaveBeenLastCalledWith('spacetime:activity', true);
    h.win.emit('minimize'); h.win.emit('restore');
    expect(h.send.mock.calls.map(([, active]) => active)).toEqual([false, true, false, true]);
    h.win.emit('closed');
  });
  it('preload exposes only boolean subscription with current state and proper removal', () => {
    const ipc = new EventEmitter();
    let api!: { subscribe: (callback: (active: boolean) => void) => () => void };
    evaluateNative('preload.ts', { ipcRenderer: ipc, contextBridge: {
      exposeInMainWorld: (name: string, value: typeof api) => {
        if (name === 'spacetimeActivity') api = value;
      },
    } });
    const callback = vi.fn();
    ipc.emit('spacetime:activity', {}, false);
    const stop = api.subscribe(callback);
    expect(Object.keys(api)).toEqual(['subscribe']);
    expect(callback.mock.calls).toEqual([[false]]);
    ipc.emit('spacetime:activity', { sender: 'never exposed' }, 'invalid');
    ipc.emit('spacetime:activity', { sender: 'never exposed' }, true);
    expect(callback.mock.calls).toEqual([[false], [true]]);
    stop(); ipc.emit('spacetime:activity', {}, false);
    expect(callback).toHaveBeenCalledTimes(2);
  });
});
