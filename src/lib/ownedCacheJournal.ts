import type { CACHE_FIELDS } from './migrationRecovery';

export type Entries = Partial<Record<keyof typeof CACHE_FIELDS, string>>;
export type SyncBaseline = { tasks: string; library: string; categories: string };
export type RestartCopy = { entries: Entries; baseline: SyncBaseline | null };
export interface Workspace extends RestartCopy {
  format: 1; owner: string; project: string;
  review: Array<RestartCopy & { capturedAt: string }>;
}
interface StringChange { length: number; start: number; remove: number; text: string }
type Change =
  | { kind: 'entry'; name: keyof Entries; patch: StringChange | null }
  | { kind: 'baseline'; patches: Record<keyof SyncBaseline, StringChange> | null }
  | { kind: 'review'; encoded: string };
export interface CacheJournal {
  format: 2; owner: string; project: string; checkpoint: string; changes: Change[];
}
export const MAX_JOURNAL_CHANGES = 64;
export const MAX_JOURNAL_CHARS = 512 * 1024;
const MAX_VALUE_CHARS = 32 * 1024 * 1024;

/** A change is relative to the preceding durable value, never to runtime state. */
function difference(before: string, after: string): StringChange {
  let start = 0;
  const common = Math.min(before.length, after.length);
  while (start < common && before.charCodeAt(start) === after.charCodeAt(start)) start++;
  let suffix = 0;
  while (suffix < common - start && before.charCodeAt(before.length - suffix - 1) === after.charCodeAt(after.length - suffix - 1)) suffix++;
  return { length: before.length, start, remove: before.length - start - suffix,
    text: after.slice(start, after.length - suffix) };
}
function apply(before: string, patch: StringChange): string {
  if (!patch || Object.keys(patch).sort().join(',') !== 'length,remove,start,text'
    || ![patch.length, patch.start, patch.remove].every(Number.isSafeInteger)
    || patch.length !== before.length || patch.start < 0 || patch.remove < 0
    || patch.start + patch.remove > before.length || typeof patch.text !== 'string'
    || before.length - patch.remove + patch.text.length > MAX_VALUE_CHARS) throw new Error('Invalid device cache change.');
  return before.slice(0, patch.start) + patch.text + before.slice(patch.start + patch.remove);
}
export function journalChanges(before: Workspace, after: Workspace, encode: (raw: string) => string): Change[] {
  const changes: Change[] = [];
  for (const name of new Set([...Object.keys(before.entries), ...Object.keys(after.entries)]) as Set<keyof Entries>) {
    if (before.entries[name] !== after.entries[name]) changes.push({ kind: 'entry', name,
      patch: after.entries[name] === undefined ? null : difference(before.entries[name] ?? '', after.entries[name]!) });
  }
  if (before.baseline?.tasks !== after.baseline?.tasks || before.baseline?.library !== after.baseline?.library
    || before.baseline?.categories !== after.baseline?.categories || Boolean(before.baseline) !== Boolean(after.baseline)) {
    changes.push({ kind: 'baseline', patches: after.baseline === null ? null : {
      tasks: difference(before.baseline?.tasks ?? '', after.baseline.tasks),
      library: difference(before.baseline?.library ?? '', after.baseline.library),
      categories: difference(before.baseline?.categories ?? '', after.baseline.categories),
    } });
  }
  // Conflict archives change rarely; keep their complete, compressed evidence.
  if (before.review.length !== after.review.length) changes.push({ kind: 'review', encoded: encode(JSON.stringify(after.review)) });
  return changes;
}
export function replayJournal(journal: CacheJournal, checkpoint: Workspace, fields: object,
  decode: (encoded: string) => string): Workspace {
  if (Object.keys(journal).sort().join(',') !== 'changes,checkpoint,format,owner,project'
    || journal.format !== 2 || journal.owner !== checkpoint.owner || journal.project !== checkpoint.project
    || !Array.isArray(journal.changes) || journal.changes.length > MAX_JOURNAL_CHANGES) throw new Error('Invalid device cache journal.');
  const value: Workspace = { ...checkpoint, entries: { ...checkpoint.entries }, baseline: checkpoint.baseline && { ...checkpoint.baseline }, review: [...checkpoint.review] };
  for (const change of journal.changes) {
    if (!change || typeof change !== 'object') throw new Error('Invalid device cache change.');
    if (change.kind === 'entry' && Object.keys(change).sort().join(',') === 'kind,name,patch'
      && Object.prototype.hasOwnProperty.call(fields, change.name)) {
      if (change.patch === null) delete value.entries[change.name];
      else value.entries[change.name] = apply(value.entries[change.name] ?? '', change.patch);
    } else if (change.kind === 'baseline' && Object.keys(change).sort().join(',') === 'kind,patches') {
      if (change.patches === null) value.baseline = null;
      else {
        if (!change.patches || Object.keys(change.patches).sort().join(',') !== 'categories,library,tasks') throw new Error('Invalid device cache baseline.');
        value.baseline = {
          tasks: apply(value.baseline?.tasks ?? '', change.patches.tasks),
          library: apply(value.baseline?.library ?? '', change.patches.library),
          categories: apply(value.baseline?.categories ?? '', change.patches.categories),
        };
      }
    } else if (change.kind === 'review' && Object.keys(change).sort().join(',') === 'encoded,kind' && typeof change.encoded === 'string') {
      value.review = JSON.parse(decode(change.encoded));
    } else throw new Error('Invalid device cache change.');
  }
  return value;
}
