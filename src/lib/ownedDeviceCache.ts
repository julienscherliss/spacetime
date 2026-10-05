// No stores, Auth client or session keys may be imported/read here.
import { CACHE_FIELDS, contentOf, RecoveryError, blockRecovery } from './migrationRecovery';
import { CURRENT_OWNED_CACHE_PREFIX } from './authoritativeBootstrap';
import { decodeDeviceStorage, encodeDeviceStorage } from './deviceStorageEncoding';

export const ownedCacheEnabled = import.meta.env.VITE_AUTH_BACKEND === 'owned';
const PROJECT = 'zzoeywmurqiqticikyaf';
export const OWNED_CACHE_PREFIX = CURRENT_OWNED_CACHE_PREFIX;
type Entries = Partial<Record<keyof typeof CACHE_FIELDS, string>>;
export type SyncBaseline = { tasks: string; library: string; categories: string };
export type RestartCopy = { entries: Entries; baseline: SyncBaseline | null };
interface Workspace extends RestartCopy {
  format: 1; owner: string; project: string;
  review: Array<RestartCopy & { capturedAt: string }>;
}
let owner: string | null = null;
const listeners = new Set<() => void>();
export const subscribeOwnedCache = (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; };
export const currentOwnedCacheOwner = () => owner;
const emit = () => listeners.forEach(listener => listener());

function validateCopy(copy: RestartCopy) {
  if (!copy.entries || typeof copy.entries !== 'object' || Array.isArray(copy.entries)) throw new RecoveryError();
  for (const [key, value] of Object.entries(copy.entries)) {
    if (!(key in CACHE_FIELDS) || typeof value !== 'string') throw new RecoveryError();
  }
  contentOf(copy.entries);
  if (copy.baseline !== null) {
    if (!copy.baseline || Object.keys(copy.baseline).sort().join(',') !== 'categories,library,tasks') throw new RecoveryError();
    for (const value of Object.values(copy.baseline)) {
      if (typeof value !== 'string' || !Array.isArray(JSON.parse(value))) throw new RecoveryError();
    }
  }
}

function readWorkspace(id: string): Workspace {
  const raw = localStorage.getItem(OWNED_CACHE_PREFIX + id);
  if (raw === null) return { format: 1, owner: id, project: PROJECT, entries: {}, baseline: null, review: [] };
  const value = JSON.parse(decodeDeviceStorage(raw)) as Workspace;
  if (value.format !== 1 || value.owner !== id || value.project !== PROJECT || !Array.isArray(value.review)
    || value.review.length > 16 || Object.keys(value).some(key => !['format','owner','project','entries','baseline','review'].includes(key))) throw new RecoveryError();
  validateCopy(value);
  for (const copy of value.review) {
    if (typeof copy.capturedAt !== 'string' || Object.keys(copy).some(key => !['entries','baseline','capturedAt'].includes(key))) throw new RecoveryError();
    validateCopy(copy);
  }
  return value;
}

function changeWorkspace(change: (workspace: Workspace) => void) {
  if (!owner) return;
  try {
    const key = OWNED_CACHE_PREFIX + owner;
    const workspace = readWorkspace(owner);
    change(workspace);
    validateCopy(workspace);
    const raw = JSON.stringify(workspace);
    const encoded = encodeDeviceStorage(raw);
    localStorage.setItem(key, encoded);
    const saved = localStorage.getItem(key);
    if (saved !== encoded || decodeDeviceStorage(saved) !== raw) throw new RecoveryError();
    emit();
  } catch { blockRecovery(); throw new RecoveryError(); }
}

/** Called only after a fresh auth.getUser() matches this exact UUID. */
export function openVerifiedOwnedCache(id: string): RestartCopy {
  if (!ownedCacheEnabled || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)
    || import.meta.env.VITE_SUPABASE_URL !== `https://${PROJECT}.supabase.co`) throw new RecoveryError();
  try {
    const workspace = readWorkspace(id);
    owner = id;
    emit();
    return { entries: { ...workspace.entries }, baseline: workspace.baseline && { ...workspace.baseline } };
  } catch { blockRecovery(); throw new RecoveryError(); }
}

/** Suspend persistence BEFORE clearing any runtime store on account changes. */
export function closeOwnedCache() { owner = null; emit(); }

export const accountCacheStorage = {
  getItem(name: string): string | null {
    if (!ownedCacheEnabled) return localStorage.getItem(name);
    if (!owner) return null;
    try { return readWorkspace(owner).entries[name as keyof Entries] ?? null; }
    catch { blockRecovery(); throw new RecoveryError(); }
  },
  setItem(name: string, raw: string) {
    if (!ownedCacheEnabled) { localStorage.setItem(name, raw); return; }
    if (!Object.prototype.hasOwnProperty.call(CACHE_FIELDS, name)) throw new RecoveryError();
    changeWorkspace(workspace => { workspace.entries[name as keyof Entries] = raw; });
  },
  removeItem(name: string) {
    if (!ownedCacheEnabled) { localStorage.removeItem(name); return; }
    changeWorkspace(workspace => { delete workspace.entries[name as keyof Entries]; });
  },
};

export function rememberOwnedBaseline(baseline: SyncBaseline) {
  if (ownedCacheEnabled) changeWorkspace(workspace => { workspace.baseline = { ...baseline }; });
}

/** Archive conflicts before replacing caches with fresh server data. No uploads. */
export function retainOwnedReviewCopy(copy: RestartCopy) {
  changeWorkspace(workspace => {
    const signature = JSON.stringify(copy);
    if (workspace.review.some(item => JSON.stringify({ entries: item.entries, baseline: item.baseline }) === signature)) return;
    if (workspace.review.length >= 16) throw new RecoveryError();
    workspace.review.push({ ...copy, capturedAt: new Date().toISOString() });
  });
}

export function ownedReviewCount() {
  try { return owner ? readWorkspace(owner).review.length : 0; }
  catch { return 0; } // Actual cache reads/writes fail closed; a render snapshot cannot recursively emit.
}
export function privateOwnedCopy() { return owner ? readWorkspace(owner) : null; }
