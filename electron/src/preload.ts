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
