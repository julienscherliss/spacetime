import { privateRecoveryFile, quarantineDeviceCache } from './migrationRecovery';
import { privateOwnedCopy } from './ownedDeviceCache';

export function downloadDeviceCopy(storage: Storage) {
  const legacy = JSON.parse(privateRecoveryFile(storage));
  const blob = new Blob([JSON.stringify({ ...legacy, owned: privateOwnedCopy() }, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = 'spacetime-private-device-copy.json';
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** Loader is not called until a verified private copy precedes store hydration. */
export async function startProtectedApp(root: HTMLElement, storageSource: Storage | (() => Storage), loadApp: () => Promise<void>, enabled = true) {
  const getStorage = () => typeof storageSource === 'function' ? storageSource() : storageSource;
  try {
    const storage = enabled ? getStorage() : null;
    const journal = enabled ? quarantineDeviceCache(storage) : null;
    await loadApp();
    if (journal?.copies.length) {
      const button = document.createElement('button');
      button.textContent = 'Download private device copy';
      button.title = 'Saved device data has not been restored. Keep this file private; ownership and changes need review.';
      button.className = 'migration-recovery-download';
      button.onclick = () => { try { downloadDeviceCopy(storage); } catch { button.textContent = 'Unable to download — keep device data intact'; } };
      document.body.appendChild(button);
    }
  } catch {
    root.replaceChildren();
    const panel = document.createElement('section');
    panel.className = 'migration-recovery-blocked';
    const title = document.createElement('h1');
    title.textContent = 'Keep your device data safe';
    const message = document.createElement('p');
    message.textContent = 'Spacetime could not save a recovery copy. Your app has not started. Download a private copy if available, and keep this app installed. Do not sign out or clear its data.';
    const download = document.createElement('button');
    download.textContent = 'Download private device copy';
    download.onclick = () => { try { downloadDeviceCopy(getStorage()); } catch { message.textContent = 'The copy could not be read safely. Keep the app and its data intact and contact support.'; } };
    const retry = document.createElement('button');
    retry.textContent = 'Retry';
    retry.onclick = () => { void startProtectedApp(root, storageSource, loadApp, enabled); };
    panel.append(title, message, download, retry);
    root.appendChild(panel);
  }
}
