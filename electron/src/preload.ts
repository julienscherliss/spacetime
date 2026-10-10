require('./rt/electron-rt');
//////////////////////////////
// User Defined Preload scripts below
console.log('User Preload!');

import { contextBridge, ipcRenderer } from 'electron';

// Expose only a boolean activity subscription, never the IPC event or raw IPC API.
let active = true;
const activityListeners = new Set<(active: boolean) => void>();
ipcRenderer.on('spacetime:activity', (_event, value: unknown) => {
  if (typeof value !== 'boolean') return;
  active = value;
  activityListeners.forEach(listener => listener(active));
});
contextBridge.exposeInMainWorld('spacetimeActivity', {
  subscribe(callback: (active: boolean) => void) {
    activityListeners.add(callback);
    callback(active);
    return () => { activityListeners.delete(callback); };
  },
});

// Fixed update commands only. Never expose raw IPC, feed URLs or file paths.
contextBridge.exposeInMainWorld('spacetimeUpdates', {
  subscribe(callback: (state: unknown) => void) {
    let stopped = false;
    let revision = -1;
    const accept = (value: unknown) => {
      if (stopped || typeof value !== 'object' || value === null) return;
      const next = value as { revision?: unknown };
      if (typeof next.revision !== 'number' || !Number.isInteger(next.revision) || next.revision <= revision) return;
      revision = next.revision;
      callback(value);
    };
    const listener = (_event: unknown, value: unknown) => accept(value);
    ipcRenderer.on('spacetime:update', listener);
    void ipcRenderer.invoke('spacetime:update:state').then(accept).catch(() => {});
    return () => { stopped = true; ipcRenderer.removeListener('spacetime:update', listener); };
  },
  check: () => ipcRenderer.invoke('spacetime:update:check'),
  download: () => ipcRenderer.invoke('spacetime:update:download'),
  dismiss: () => ipcRenderer.invoke('spacetime:update:dismiss'),
  restart: () => ipcRenderer.invoke('spacetime:update:restart'),
});
