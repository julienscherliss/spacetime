import { isElectron, isNativePlatform } from '@/utils/nativePlatform';

export const APP_ENTRY_REFRESH = 'app-entry:refresh';
export interface EntryRefreshEvent {
  userId: string;
  generation: number;
  phase: 'start' | 'finish' | 'cancel';
}
export function emitEntryRefresh(detail: EntryRefreshEvent) {
  window.dispatchEvent(new CustomEvent<EntryRefreshEvent>(APP_ENTRY_REFRESH, { detail }));
}

/** Choose one authoritative activity source; native and visibility events overlap. */
export function subscribeAppActivity(callback: (active: boolean) => void): () => void {
  let disposed = false;
  let remove: (() => void) | undefined;
  if (isElectron() && window.spacetimeActivity) {
    return window.spacetimeActivity.subscribe(callback);
  }
  const visibilityFallback = () => {
    if (disposed) return;
    const handler = () => callback(document.visibilityState === 'visible');
    document.addEventListener('visibilitychange', handler);
    remove = () => document.removeEventListener('visibilitychange', handler);
    if (document.visibilityState === 'hidden') callback(false);
  };
  if (isNativePlatform() && !isElectron()) {
    void import('@capacitor/app').then(async ({ App }) => {
      let receivedEvent = false;
      const listener = await App.addListener('appStateChange', ({ isActive }) => {
        receivedEvent = true;
        if (!disposed) callback(isActive);
      });
      if (disposed) { void listener.remove(); return; }
      remove = () => { void listener.remove(); };
      // Registration may happen after the app was already backgrounded.
      if (typeof App.getState === 'function') {
        try {
          const { isActive } = await App.getState();
          if (!disposed && !receivedEvent) callback(isActive);
        } catch { /* Retain the registered native listener. */ }
      }
    }).catch(visibilityFallback);
  } else visibilityFallback();
  return () => { disposed = true; remove?.(); };
}

declare global {
  interface Window {
    spacetimeActivity?: { subscribe: (callback: (active: boolean) => void) => () => void };
  }
}
