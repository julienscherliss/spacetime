import { useSyncExternalStore, type ReactNode } from 'react';
import { isRecoveryBlocked, subscribeRecoveryBlocked } from './lib/migrationRecovery';
import { downloadDeviceCopy } from './lib/protectedBootstrap';
import { ownedReviewCount, subscribeOwnedCache } from './lib/ownedDeviceCache';

export function DeviceRecoveryBoundary({ children }: { children: ReactNode }) {
  const blocked = useSyncExternalStore(subscribeRecoveryBlocked, isRecoveryBlocked);
  const reviewCount = useSyncExternalStore(subscribeOwnedCache, ownedReviewCount);
  if (!blocked) return <>{reviewCount > 0 && <aside className="migration-recovery-notice">
    Saved device changes need review. <button onClick={() => { try { downloadDeviceCopy(localStorage); } catch { /* Keep the existing private copy intact. */ } }}>Download private copy</button>
  </aside>}{children}</>;
  return <section className="migration-recovery-blocked">
    <h1>Keep your device data safe</h1>
    <p>Spacetime could not save a recovery copy. Keep this app installed and do not clear its data. Download a private copy if available before retrying.</p>
    <button onClick={() => { try { downloadDeviceCopy(localStorage); } catch { /* Preserve existing data; retry/support remains available. */ } }}>Download private device copy</button>
    <button onClick={() => location.reload()}>Retry</button>
  </section>;
}
