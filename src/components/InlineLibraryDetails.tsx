import { useId, useRef, useState } from 'react';
import { AlertTriangle, ChevronsDownUp, ChevronsUpDown, Clock, Plus } from 'lucide-react';
import { SubtaskList, type SubtaskListHandle } from '@/components/SubtaskList';
import type { LibrarySubtask } from '@/store/libraryStore';

const emptyDraft = () => ({ note: '', duration: 30, isUrgent: false, isImportant: false, subtasks: [] as LibrarySubtask[] });

// A draft stays local until Add. Collapsing it never creates a blank library item.
export function useInlineLibraryDraft() {
  const [expanded, setExpanded] = useState(false);
  const [draft, setDraft] = useState(emptyDraft);
  const subtaskRef = useRef<SubtaskListHandle>(null);
  const regionId = useId();
  const fields = () => ({ ...draft, subtasks: subtaskRef.current?.flushPendingInput() ?? draft.subtasks });
  return {
    expanded, draft, setDraft, subtaskRef, regionId, fields,
    toggle: () => {
      if (expanded) setDraft(fields());
      setExpanded(!expanded);
    },
    reset: () => { setDraft(emptyDraft()); setExpanded(false); },
  };
}

type DraftController = ReturnType<typeof useInlineLibraryDraft>;

export function LibraryExpandButton({ details }: { details: DraftController }) {
  const Icon = details.expanded ? ChevronsDownUp : ChevronsUpDown;
  return <button type="button" onClick={details.toggle}
    title={details.expanded ? 'Collapse details' : 'Expand details'}
    aria-label={details.expanded ? 'Collapse details' : 'Expand details'}
    aria-expanded={details.expanded} aria-controls={details.regionId}
    className="inline-flex items-center justify-center min-w-11 min-h-11 text-muted-foreground hover:text-foreground focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary rounded-sm transition-colors shrink-0">
    <Icon size={16} strokeWidth={1.5} />
  </button>;
}

export function InlineLibraryDetails({ details, canAdd, onAdd }: {
  details: DraftController; canAdd: boolean; onAdd: () => void;
}) {
  if (!details.expanded) return null;
  const { draft, setDraft } = details;
  return <div id={details.regionId} role="region" aria-label="New library item details"
    className="mt-2 space-y-3 max-h-[min(50dvh,24rem)] overflow-y-auto overscroll-contain pr-1">
    <textarea aria-label="Details" placeholder="Details…" rows={3} value={draft.note}
      onChange={event => setDraft(previous => ({ ...previous, note: event.target.value }))}
      className="block w-full resize-y min-h-20 max-h-48 bg-transparent py-2 font-mono text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus-visible:ring-1 focus-visible:ring-primary/40 rounded-sm" />
    <SubtaskList ref={details.subtaskRef} subtasks={draft.subtasks} inputPlaceholder="Add subtask…"
      onChange={subtasks => setDraft(previous => ({ ...previous, subtasks }))} />
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-border/30 pt-2 font-mono text-xs text-muted-foreground">
      <label className="flex min-h-11 items-center gap-1.5">
        <Clock size={14} strokeWidth={1.5} />
        <select aria-label="Duration" value={draft.duration}
          onChange={event => setDraft(previous => ({ ...previous, duration: Number(event.target.value) }))}
          className="min-h-11 bg-transparent text-foreground focus-visible:outline-primary">
          {[5, 10, 15, 20, 30, 45, 60, 90, 120, 180, 240].map(minutes => <option key={minutes} value={minutes}>{minutes}m</option>)}
        </select>
      </label>
      <button type="button" aria-pressed={draft.isUrgent} onClick={() => setDraft(previous => ({ ...previous, isUrgent: !previous.isUrgent }))}
        className={`flex min-h-11 items-center gap-1.5 ${draft.isUrgent ? 'text-primary' : 'hover:text-foreground'}`}><Clock size={14} strokeWidth={1.5} />Urgent</button>
      <button type="button" aria-pressed={draft.isImportant} onClick={() => setDraft(previous => ({ ...previous, isImportant: !previous.isImportant }))}
        className={`flex min-h-11 items-center gap-1.5 ${draft.isImportant ? 'text-primary' : 'hover:text-foreground'}`}><AlertTriangle size={14} strokeWidth={1.5} />Important</button>
      <button type="button" disabled={!canAdd} onClick={onAdd}
        className="ml-auto inline-flex min-h-11 items-center gap-1.5 px-2 text-primary hover:bg-primary/5 disabled:opacity-40 disabled:cursor-default rounded-sm"><Plus size={15} />Add</button>
    </div>
  </div>;
}
