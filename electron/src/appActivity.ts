import { app, BrowserWindow } from 'electron';

/** App activation excludes internal window/dialog focus changes on macOS. */
export function installAppActivity(window: BrowserWindow) {
  let appActive = true;
  let lastActive = true;
  const send = (active: boolean) => {
    if (window.isDestroyed() || active === lastActive) return;
    lastActive = active;
    window.webContents.send('spacetime:activity', active);
  };
  const activate = () => { appActive = true; send(window.isVisible() && !window.isMinimized()); };
  const deactivate = () => { appActive = false; send(false); };
  const hidden = () => send(false);
  const shown = () => { if (appActive) send(true); };
  if (process.platform === 'darwin') {
    app.on('did-become-active', activate);
    app.on('did-resign-active', deactivate);
  } else {
    window.on('focus', activate);
    window.on('blur', deactivate);
  }
  window.on('minimize', hidden);
  window.on('hide', hidden);
  window.on('restore', shown);
  window.on('show', shown);
  window.once('closed', () => {
    app.removeListener('did-become-active', activate);
    app.removeListener('did-resign-active', deactivate);
  });
}
