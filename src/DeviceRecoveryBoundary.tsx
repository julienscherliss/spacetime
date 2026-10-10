import { useSyncExternalStore, type ReactNode } from 'react';
import { isRecoveryBlocked, subscribeRecoveryBlocked } from './lib/migrationRecovery';
import { downloadDeviceCopy } from './lib/protectedBootstrap';

export function DeviceRecoveryBoundary({ children }: { children: ReactNode }) {
  const blocked = useSyncExternalStore(subscribeRecoveryBlocked, isRecoveryBlocked);
  if (!blocked) return <>{children}</>;
  return <section className="migration-recovery-blocked">
    <h1>Device storage needs attention</h1>
    <p>Spacetime could not save your latest changes on this device. Download a private copy before retrying.</p>
    <button onClick={() => { try { downloadDeviceCopy(localStorage); } catch { /* Preserve existing data; retry/support remains available. */ } }}>Download private device copy</button>
    <button onClick={() => location.reload()}>Retry</button>
  </section>;
}
