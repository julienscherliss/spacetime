export interface DesktopUpdateState {
  phase: 'idle' | 'checking' | 'current' | 'available' | 'downloading' | 'downloaded' | 'error';
  visible: boolean;
  revision: number;
  version?: string;
  percent?: number;
  retry?: 'check' | 'download' | 'restart';
}
export interface DesktopUpdateBridge {
  subscribe: (callback: (state: DesktopUpdateState) => void) => () => void;
  check: () => Promise<unknown>;
  download: () => Promise<unknown>;
  dismiss: () => Promise<unknown>;
  restart: () => Promise<boolean>;
}
declare global { interface Window { spacetimeUpdates?: DesktopUpdateBridge } }

let prepare: (() => Promise<boolean>) | undefined;
/** Registered by the existing account sync hook; cleared on unmount/account change. */
export function registerDesktopRestartPreparation(handler: () => Promise<boolean>) {
  prepare = handler;
  return () => { if (prepare === handler) prepare = undefined; };
}
export async function prepareDesktopRestart() {
  const handler = prepare;
  if (!handler) return false;
  let timeout: ReturnType<typeof setTimeout>;
  try {
    const synced = await Promise.race([handler(), new Promise<boolean>(resolve => { timeout = setTimeout(() => resolve(false), 15000); })]);
    return synced && prepare === handler;
  } catch { return false; }
  finally { clearTimeout(timeout); }
}
