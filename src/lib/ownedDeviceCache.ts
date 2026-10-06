// No stores, Auth client or session keys may be imported/read here.
import { CACHE_FIELDS, RecoveryError, blockRecovery } from './migrationRecovery';
import { CURRENT_OWNED_CACHE_PREFIX } from './authoritativeBootstrap';
import { decodeDeviceStorage, encodeDeviceStorage } from './deviceStorageEncoding';

import { journalChanges, replayJournal, MAX_JOURNAL_CHANGES, MAX_JOURNAL_CHARS,
  type CacheJournal, type Workspace, type Entries, type RestartCopy, type SyncBaseline } from './ownedCacheJournal';
export type { RestartCopy, SyncBaseline } from './ownedCacheJournal';

export const ownedCacheEnabled = import.meta.env.VITE_AUTH_BACKEND === 'owned';
const PROJECT = 'zzoeywmurqiqticikyaf';
export const OWNED_CACHE_PREFIX = CURRENT_OWNED_CACHE_PREFIX;
let owner: string | null = null;
let verifiedWorkspace: { id: string; stored: string | null; value: Workspace; journal?: CacheJournal } | null = null;
const listeners = new Set<() => void>();
export const subscribeOwnedCache = (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; };
export const currentOwnedCacheOwner = () => owner;
const emit = () => listeners.forEach(listener => listener());

function validateCopy(copy: RestartCopy) {
  if (!copy.entries || typeof copy.entries !== 'object' || Array.isArray(copy.entries)) throw new RecoveryError();
  for (const [key, value] of Object.entries(copy.entries)) {
    if (!Object.prototype.hasOwnProperty.call(CACHE_FIELDS, key) || typeof value !== 'string') throw new RecoveryError();
  }
  for (const [name, raw] of Object.entries(copy.entries)) validateEntry(name, raw!);
  if (copy.baseline !== null) {
    if (!copy.baseline || Object.keys(copy.baseline).sort().join(',') !== 'categories,library,tasks') throw new RecoveryError();
    for (const value of Object.values(copy.baseline)) {
      if (typeof value !== 'string' || !Array.isArray(JSON.parse(value))) throw new RecoveryError();
    }
  }
}

function validateEntry(name: string, raw: string) {
  const parsed = JSON.parse(raw);
  if (!parsed || !parsed.state || typeof parsed.state !== 'object' || Array.isArray(parsed.state)
    || Object.keys(parsed).some(key => !['state', 'version'].includes(key))) throw new RecoveryError();
  const fields = CACHE_FIELDS[name as keyof Entries];
  if (!fields || (name === 'do-calendar-store' && Object.keys(parsed.state).some(key => !(fields as readonly string[]).includes(key)))) throw new RecoveryError();
  const arrays = new Set(['tasks', 'items', 'categories', 'completedEventIds', 'deletedEventIds', 'customReasons', 'recentTips', 'goals']);
  for (const field of fields) {
    if (!(field in parsed.state)) continue;
    const value = parsed.state[field];
    if (arrays.has(field) ? !Array.isArray(value) : value === null || typeof value !== 'object' || Array.isArray(value)) throw new RecoveryError();
  }
}
function validateWorkspace(value: Workspace, id: string) {
  if (!value || value.format !== 1 || value.owner !== id || value.project !== PROJECT || !Array.isArray(value.review)
    || value.review.length > 16 || Object.keys(value).some(key => !['format','owner','project','entries','baseline','review'].includes(key))) throw new RecoveryError();
  validateCopy(value);
  for (const copy of value.review) {
    if (!copy || typeof copy.capturedAt !== 'string' || Object.keys(copy).some(key => !['entries','baseline','capturedAt'].includes(key))) throw new RecoveryError();
    validateCopy(copy);
  }
}
function readWorkspace(id: string): Workspace {
  const raw = localStorage.getItem(OWNED_CACHE_PREFIX + id);
  // Other windows and failed writes must remain visible despite memoization.
  if (verifiedWorkspace?.id === id && verifiedWorkspace.stored === raw) return verifiedWorkspace.value;
  if (raw === null) {
    const value: Workspace = { format: 1, owner: id, project: PROJECT, entries: {}, baseline: null, review: [] };
    verifiedWorkspace = { id, stored: raw, value };
    return value;
  }
  const parsed = JSON.parse(decodeDeviceStorage(raw));
  let journal: CacheJournal | undefined;
  let value: Workspace;
  if (parsed?.format === 2) {
    if (raw.length > MAX_JOURNAL_CHARS || typeof parsed.checkpoint !== 'string') throw new RecoveryError();
    journal = parsed;
    const checkpoint = JSON.parse(decodeDeviceStorage(journal!.checkpoint));
    validateWorkspace(checkpoint, id);
    value = replayJournal(journal!, checkpoint, CACHE_FIELDS, decodeDeviceStorage);
  } else value = parsed;
  validateWorkspace(value, id);
  verifiedWorkspace = { id, stored: raw, value, journal };
  return value;
}

function cloneCopy(copy: RestartCopy): RestartCopy {
  return { entries: { ...copy.entries }, baseline: copy.baseline && { ...copy.baseline } };
}

let compressionWorker: Worker | null = null;
let workerUnavailable = false;
let compactTimer: ReturnType<typeof setTimeout> | null = null;
let compressionRequest = 0;
let inFlight: { request: number; id: string; stored: string; value: Workspace } | null = null;

function writeVerified(key: string, encoded: string) {
  localStorage.setItem(key, encoded);
  if (localStorage.getItem(key) !== encoded) throw new RecoveryError();
}
function scheduleCompaction() {
  if (!owner || workerUnavailable || typeof Worker === 'undefined') return;
  if (compactTimer) clearTimeout(compactTimer);
  compactTimer = setTimeout(() => {
    compactTimer = null;
    if (!owner || inFlight) return;
    try {
      const value = readWorkspace(owner);
      const record = verifiedWorkspace!;
      if (!record.journal || !record.stored) return;
      if (!compressionWorker) {
        compressionWorker = new Worker(new URL('./ownedCacheCompression.worker.ts', import.meta.url), { type: 'module' });
        compressionWorker.onmessage = (event: MessageEvent<{ request: number; encoded?: string; failed?: boolean }>) => {
          const captured = inFlight;
          if (!captured || event.data.request !== captured.request) return;
          inFlight = null;
          // Never replace edits made since the copy was handed to the worker.
          const stillCurrent = owner === captured.id
            && localStorage.getItem(OWNED_CACHE_PREFIX + captured.id) === captured.stored;
          if (!event.data.failed && typeof event.data.encoded === 'string' && stillCurrent) {
            try {
              writeVerified(OWNED_CACHE_PREFIX + captured.id, event.data.encoded);
              verifiedWorkspace = { id: captured.id, stored: event.data.encoded, value: captured.value };
            } catch { /* Compaction is optional; the journal is already durable. */ }
          }
          if (!event.data.failed && !stillCurrent && owner && verifiedWorkspace?.journal) scheduleCompaction();
        };
        compressionWorker.onerror = () => {
          compressionWorker?.terminate(); compressionWorker = null;
          inFlight = null; workerUnavailable = true;
        };
      }
      const captured = { request: ++compressionRequest, id: owner, stored: record.stored,
        value: { ...value, ...cloneCopy(value), review: value.review.map(copy => ({ ...cloneCopy(copy), capturedAt: copy.capturedAt })) } };
      inFlight = captured;
      compressionWorker.postMessage({ request: captured.request, workspace: captured.value });
    } catch {
      compressionWorker?.terminate(); compressionWorker = null;
      inFlight = null; workerUnavailable = true;
    }
  }, 250);
}
function stopCompaction() {
  if (compactTimer) clearTimeout(compactTimer);
  compactTimer = null;
  compressionWorker?.terminate(); compressionWorker = null; inFlight = null;
}
function changeWorkspace(change: (workspace: Workspace) => boolean) {
  if (!owner) return;
  try {
    const key = OWNED_CACHE_PREFIX + owner;
    const previous = readWorkspace(owner);
    const record = verifiedWorkspace!;
    const workspace = { ...previous, ...cloneCopy(previous), review: [...previous.review] };
    if (!change(workspace)) return;
    // Existing fields were validated at activation; validate only changed bytes.
    for (const [name, raw] of Object.entries(workspace.entries)) {
      if (raw !== previous.entries[name as keyof Entries]) validateEntry(name, raw!);
    }
    if (workspace.baseline) for (const name of ['tasks', 'library', 'categories'] as const) {
      if (workspace.baseline[name] !== previous.baseline?.[name] && !Array.isArray(JSON.parse(workspace.baseline[name]))) throw new RecoveryError();
    }
    const changes = journalChanges(previous, workspace, encodeDeviceStorage);
    let journal: CacheJournal | undefined = { format: 2, owner, project: PROJECT,
      checkpoint: record.journal?.checkpoint ?? record.stored ?? JSON.stringify(previous),
      changes: [...(record.journal?.changes ?? []), ...changes] };
    let encoded = JSON.stringify(journal);
    // Initial loads/large replacements may need a full checkpoint to fit quota.
    // Normal edits keep only small durable changes, without bulk compression.
    if (journal.changes.length > MAX_JOURNAL_CHANGES || encoded.length > MAX_JOURNAL_CHARS) {
      encoded = encodeDeviceStorage(JSON.stringify(workspace)); journal = undefined;
    }
    try { writeVerified(key, encoded); }
    catch (error) {
      if (!(error instanceof DOMException) || error.name !== 'QuotaExceededError' || !journal) throw error;
      // The quota fallback preserves the same complete data and single-key commit.
      encoded = encodeDeviceStorage(JSON.stringify(workspace)); journal = undefined;
      writeVerified(key, encoded);
    }
    verifiedWorkspace = { id: owner, stored: encoded, value: workspace, journal };
    emit();
    if (journal) scheduleCompaction();
  } catch { blockRecovery(); throw new RecoveryError(); }
}

/** Called only after a fresh auth.getUser() matches this exact UUID. */
export function openVerifiedOwnedCache(id: string): RestartCopy {
  if (!ownedCacheEnabled || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)
    || import.meta.env.VITE_SUPABASE_URL !== `https://${PROJECT}.supabase.co`) throw new RecoveryError();
  try {
    stopCompaction();
    const workspace = readWorkspace(id);
    owner = id;
    emit();
    return { entries: { ...workspace.entries }, baseline: workspace.baseline && { ...workspace.baseline } };
  } catch { blockRecovery(); throw new RecoveryError(); }
}

/** Suspend persistence BEFORE clearing any runtime store on account changes. */
export function closeOwnedCache() { stopCompaction(); owner = null; verifiedWorkspace = null; emit(); }

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
    changeWorkspace(workspace => {
      if (workspace.entries[name as keyof Entries] === raw) return false;
      workspace.entries[name as keyof Entries] = raw;
      return true;
    });
  },
  removeItem(name: string) {
    if (!ownedCacheEnabled) { localStorage.removeItem(name); return; }
    changeWorkspace(workspace => {
      if (!(name in workspace.entries)) return false;
      delete workspace.entries[name as keyof Entries];
      return true;
    });
  },
};

export function rememberOwnedBaseline(baseline: SyncBaseline) {
  if (ownedCacheEnabled) changeWorkspace(workspace => {
    if (workspace.baseline?.tasks === baseline.tasks && workspace.baseline.library === baseline.library
      && workspace.baseline.categories === baseline.categories) return false;
    workspace.baseline = { ...baseline };
    return true;
  });
}

/** Archive conflicts before replacing caches with fresh server data. No uploads. */
export function retainOwnedReviewCopy(copy: RestartCopy) {
  changeWorkspace(workspace => {
    validateCopy(copy);
    const signature = JSON.stringify(cloneCopy(copy));
    if (workspace.review.some(item => JSON.stringify({ entries: item.entries, baseline: item.baseline }) === signature)) return false;
    if (workspace.review.length >= 16) throw new RecoveryError();
    workspace.review.push({ ...cloneCopy(copy), capturedAt: new Date().toISOString() });
    return true;
  });
}

export function ownedReviewCount() {
  try { return owner ? readWorkspace(owner).review.length : 0; }
  catch { return 0; } // Actual cache reads/writes fail closed; a render snapshot cannot recursively emit.
}
export function privateOwnedCopy() {
  if (!owner) return null;
  const workspace = readWorkspace(owner);
  return { ...workspace, ...cloneCopy(workspace), review: workspace.review.map(copy => ({ ...cloneCopy(copy), capturedAt: copy.capturedAt })) };
}
