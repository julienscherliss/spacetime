// This module must not import React, stores, Auth or the Supabase client.
// Copies are unassigned evidence: they are never hydrated or uploaded.
export const RECOVERY_KEY = 'spacetime-migration-recovery:v1';
export const CACHE_FIELDS = {
  'task-storage': ['tasks'],
  'do-task-store': ['tasks'],
  'do-library-store': ['items', 'categories'],
  'do-calendar-store': ['completedEventIds', 'deletedEventIds', 'eventCategories'],
  'spacetime-reflection': ['daily', 'reasonFreq', 'customReasons', 'recentTips'],
  'spaacetime.goals.v1': ['goals', 'lastCelebrated'],
} as const;

type CacheKey = keyof typeof CACHE_FIELDS;
export interface DeviceCopy {
  id: string;
  capturedAt: string;
  owner: null;
  reason: 'bootstrap' | 'session-change' | 'sign-out';
  entries: Partial<Record<CacheKey, string>>;
}
export interface RecoveryJournal { format: 1; copies: DeviceCopy[] }

export class RecoveryError extends Error {
  constructor() { super('Device data could not be safely preserved.'); }
}

let recoveryBlocked = false;
const blockedListeners = new Set<() => void>();
export const isRecoveryBlocked = () => recoveryBlocked;
export function subscribeRecoveryBlocked(listener: () => void) {
  blockedListeners.add(listener);
  return () => { blockedListeners.delete(listener); };
}
export function blockRecovery() {
  recoveryBlocked = true;
  blockedListeners.forEach(listener => listener());
}

function readJournal(storage: Storage): RecoveryJournal {
  const raw = storage.getItem(RECOVERY_KEY);
  if (raw === null) return { format: 1, copies: [] };
  const journal = JSON.parse(raw) as RecoveryJournal;
  if (journal.format !== 1 || !Array.isArray(journal.copies) || journal.copies.length > 16
    || Object.keys(journal).some(key => !['format','copies'].includes(key))) throw new RecoveryError();
  const ids = new Set<string>();
  for (const copy of journal.copies) {
    if (typeof copy.id !== 'string' || typeof copy.capturedAt !== 'string' || copy.owner !== null
      || !['bootstrap','session-change','sign-out'].includes(copy.reason) || !copy.entries || typeof copy.entries !== 'object'
      || Object.keys(copy).some(key => !['id','capturedAt','owner','reason','entries'].includes(key)) || ids.has(copy.id)) throw new RecoveryError();
    ids.add(copy.id);
    for (const [key, value] of Object.entries(copy.entries)) {
      if (!Object.prototype.hasOwnProperty.call(CACHE_FIELDS, key) || typeof value !== 'string') throw new RecoveryError();
    }
    contentOf(copy.entries); // Never trust a duplicate marker instead of its bytes.
  }
  return journal;
}

export function contentOf(entries: DeviceCopy['entries']) {
  const content: Record<string, unknown> = {};
  let hasContent = false;
  for (const key of Object.keys(CACHE_FIELDS) as CacheKey[]) {
    const raw = entries[key];
    if (raw === undefined) continue;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed.state !== 'object' || parsed.state === null || Array.isArray(parsed.state)
      || Object.keys(parsed).some(field => !['state','version'].includes(field))) throw new RecoveryError();
    if (key === 'do-calendar-store' && Object.keys(parsed.state).some(field =>
      !(CACHE_FIELDS[key] as readonly string[]).includes(field))) throw new RecoveryError();
    const arrayFields = new Set(['tasks','items','categories','completedEventIds','deletedEventIds',
      'customReasons','recentTips','goals']);
    for (const field of CACHE_FIELDS[key]) {
      if (!(field in parsed.state)) continue;
      const value = parsed.state[field];
      if (arrayFields.has(field) ? !Array.isArray(value)
        : value === null || typeof value !== 'object' || Array.isArray(value)) throw new RecoveryError();
    }
    content[key] = Object.fromEntries(CACHE_FIELDS[key].map(field => [field, parsed.state[field] ?? null]));
    hasContent ||= Object.values(content[key] as object).some(value =>
      Array.isArray(value) ? value.length > 0 : value !== null && typeof value === 'object' ? Object.keys(value).length > 0 : Boolean(value));
  }
  return { signature: JSON.stringify(content), hasContent };
}

/** Persist exact cache bytes before clearing anything; never overwrite older copies. */
export function preserveDeviceCache(storage: Storage, reason: DeviceCopy['reason'] = 'session-change'): RecoveryJournal {
  try {
    const journal = readJournal(storage);
    const entries: DeviceCopy['entries'] = {};
    for (const key of Object.keys(CACHE_FIELDS) as CacheKey[]) {
      const raw = storage.getItem(key);
      if (raw === null) continue;
      entries[key] = raw;
    }
    const { signature, hasContent } = contentOf(entries);
    if (hasContent && !journal.copies.some(copy => contentOf(copy.entries).signature === signature)) {
      if (journal.copies.length >= 16) throw new RecoveryError();
      journal.copies.push({ id: crypto.randomUUID(), capturedAt: new Date().toISOString(), owner: null, reason,
        entries });
      const next = JSON.stringify(journal);
      storage.setItem(RECOVERY_KEY, next);
      if (storage.getItem(RECOVERY_KEY) !== next) throw new RecoveryError();
    }
    return journal;
  } catch { throw new RecoveryError(); }
}

export function quarantineDeviceCache(storage: Storage): RecoveryJournal {
  const journal = preserveDeviceCache(storage, 'bootstrap');
  try {
    for (const key of Object.keys(CACHE_FIELDS)) storage.removeItem(key);
  } catch { throw new RecoveryError(); }
  return journal;
}

/** Explicit local download only. Never read session/password keys or send data. */
export function privateRecoveryFile(storage: Storage): string {
  const journal = readJournal(storage);
  const current: Record<string, string> = {};
  for (const key of Object.keys(CACHE_FIELDS)) {
    const raw = storage.getItem(key);
    // Only known calendar content shapes may enter the file.
    if (key === 'do-calendar-store' && raw !== null) {
      const parsed = JSON.parse(raw);
      if (!parsed?.state || Object.keys(parsed.state).some(field =>
        !(CACHE_FIELDS[key] as readonly string[]).includes(field))) throw new RecoveryError();
    }
    if (raw !== null) current[key] = raw;
  }
  return JSON.stringify({ format: 1, purpose: 'private device copy; ownership requires review', journal, current }, null, 2);
}
