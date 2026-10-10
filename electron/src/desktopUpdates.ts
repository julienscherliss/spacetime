import { app, ipcMain, type BrowserWindow, type IpcMainInvokeEvent } from 'electron';
import { autoUpdater } from 'electron-updater';

type Phase = 'idle' | 'checking' | 'current' | 'available' | 'downloading' | 'downloaded' | 'error';
type State = { phase: Phase; visible: boolean; revision: number; version?: string; percent?: number; retry?: 'check' | 'download' | 'restart' };
const channel = 'spacetime:update';

/** Only our main packaged frame may use these fixed, argument-free commands. */
export function installDesktopUpdates(getWindow: () => BrowserWindow | null, scheme: string) {
  let state: State = { phase: 'idle', visible: false, revision: 0 };
  let checking: Promise<unknown> | null = null;
  let downloading: Promise<unknown> | null = null;
  let downloaded = false;
  let restarting = false;
  let manualCheck = false;
  autoUpdater.autoDownload = false;
  autoUpdater.autoInstallOnAppQuit = false;
  autoUpdater.allowDowngrade = false;
  autoUpdater.allowPrerelease = false;
  const publish = (next: Partial<State>) => {
    state = { ...state, ...next, revision: state.revision + 1 };
    const win = getWindow();
    if (win && !win.isDestroyed() && !win.webContents.isDestroyed()) {
      try { win.webContents.send(channel, state); } catch { /* Closing windows get the snapshot on next launch. */ }
    }
  };
  const failed = (retry: State['retry']) => publish({ phase: 'error', retry, visible: manualCheck || retry !== 'check' });
  // Raw updater errors can contain feed URLs; display only an actionable state.
  autoUpdater.on('error', () => failed(downloaded ? 'restart' : downloading ? 'download' : 'check'));
  autoUpdater.on('update-available', info => publish({ phase: 'available', version: info.version, visible: true, percent: undefined, retry: undefined }));
  autoUpdater.on('update-not-available', () => publish({ phase: 'current', visible: manualCheck, retry: undefined }));
  autoUpdater.on('download-progress', info => {
    const percent = Number.isFinite(info.percent) ? Math.round(Math.min(100, Math.max(0, info.percent))) : 0;
    if (percent !== state.percent) publish({ phase: 'downloading', percent });
  });
  autoUpdater.on('update-downloaded', info => {
    downloaded = true;
    publish({ phase: 'downloaded', version: info.version, visible: true, percent: 100, retry: undefined });
  });
  const check = (manual = false) => {
    if (manual) {
      manualCheck = true;
      const win = getWindow();
      if (win && !win.isDestroyed()) { win.show(); win.focus(); }
    }
    if (downloaded || downloading) { publish({ visible: true }); return Promise.resolve(); }
    if (checking) { if (manual) publish({ visible: true }); return checking; }
    manualCheck = manual;
    publish({ phase: 'checking', visible: manual, retry: undefined });
    checking = Promise.resolve().then(() => autoUpdater.checkForUpdates())
      .catch(() => failed('check')).finally(() => { checking = null; });
    return checking;
  };
  const download = () => {
    if (downloading) return downloading;
    if (!(state.phase === 'available' || (state.phase === 'error' && state.retry === 'download'))) return Promise.resolve();
    publish({ phase: 'downloading', percent: 0, visible: true, retry: undefined });
    downloading = Promise.resolve().then(() => autoUpdater.downloadUpdate())
      .catch(() => failed('download')).finally(() => { downloading = null; });
    return downloading;
  };
  const trusted = (event: IpcMainInvokeEvent) => {
    const win = getWindow();
    return win && !win.isDestroyed() && event.sender === win.webContents &&
      event.senderFrame === win.webContents.mainFrame && event.senderFrame.url.startsWith(`${scheme}://`);
  };
  const handle = (name: string, action: () => unknown) => ipcMain.handle(`${channel}:${name}`, event => {
    if (!trusted(event)) throw new Error('Update command unavailable.');
    return action();
  });
  handle('state', () => state);
  handle('check', () => check(true));
  handle('download', download);
  handle('dismiss', () => publish({ visible: false }));
  handle('restart', () => {
    if (!downloaded || restarting) return false;
    restarting = true;
    // The renderer awaits its save gate before sending this command.
    setImmediate(() => {
      try { autoUpdater.quitAndInstall(false, true); }
      catch { restarting = false; failed('restart'); }
    });
    return true;
  });
  // Check on launch and periodically while running; no automatic download/quit.
  const interval = setInterval(() => { void check(); }, 4 * 60 * 60 * 1000);
  interval.unref();
  app.once('before-quit', () => clearInterval(interval));
  return { check };
}
