// No stores or Auth client may initialize before the approved local reset.
import { CACHE_FIELDS, RECOVERY_KEY } from './migrationRecovery';

export const PREVIOUS_OWNED_CACHE_PREFIX = 'spacetime-owned-device:v1:zzoeywmurqiqticikyaf:';
export const CURRENT_OWNED_CACHE_PREFIX = 'spacetime-owned-device:v2:zzoeywmurqiqticikyaf:';
export const AUTHORITATIVE_CACHE_MARKER = 'spacetime-authoritative-cache:zzoeywmurqiqticikyaf:v2';

/** Owner approved discarding pre-cutover device copies; never clear new v2 work. */
export function prepareAuthoritativeCache(storage: Storage) {
  if (storage.getItem(AUTHORITATIVE_CACHE_MARKER) === 'ready') return;
  const obsolete = new Set<string>([RECOVERY_KEY, ...Object.keys(CACHE_FIELDS)]);
  for (let index = 0; index < storage.length; index++) {
    const key = storage.key(index);
    if (key?.startsWith(PREVIOUS_OWNED_CACHE_PREFIX)) obsolete.add(key);
  }
  for (const key of obsolete) {
    storage.removeItem(key);
    if (storage.getItem(key) !== null) throw new Error('Local cache reset did not complete.');
  }
  storage.setItem(AUTHORITATIVE_CACHE_MARKER, 'ready');
  if (storage.getItem(AUTHORITATIVE_CACHE_MARKER) !== 'ready') throw new Error('Local cache reset did not complete.');
}

export async function startAuthoritativeApp(root: HTMLElement, loadApp: () => Promise<void>, owned: boolean) {
  try {
    if (owned) prepareAuthoritativeCache(localStorage);
    await loadApp();
  } catch {
    root.replaceChildren();
    const panel = document.createElement('section');
    panel.className = 'migration-recovery-blocked';
    const title = document.createElement('h1');
    title.textContent = 'Unable to open Spacetime';
    const message = document.createElement('p');
    message.textContent = 'Please close and reopen the app, or retry.';
    const retry = document.createElement('button');
    retry.textContent = 'Retry';
    retry.onclick = () => { void startAuthoritativeApp(root, loadApp, owned); };
    panel.append(title, message, retry);
    root.appendChild(panel);
  }
}
