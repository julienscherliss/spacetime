import { useEffect, useRef, useState } from 'react';
import { create } from 'zustand';
import { Popover, PopoverContent, PopoverAnchor } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { useLibraryStore, LibrarySubtask, LibraryCategory } from '@/store/libraryStore';

export interface PendingLibraryItem {
  title: string;
  duration?: number;
  category?: LibraryCategory;
  note?: string;
  isUrgent?: boolean;
  isImportant?: boolean;
  subtasks?: LibrarySubtask[];
  dueDate?: string | null;
  /** DOM element to anchor the popover to (e.g. the "Send to library" button or quick-add input). */
  anchor?: HTMLElement | null;
  /** Popover side relative to anchor. */
  side?: 'top' | 'bottom' | 'left' | 'right';
  /** Popover alignment. */
  align?: 'start' | 'center' | 'end';
}

interface PromptState {
  pending: PendingLibraryItem | null;
  request: (item: PendingLibraryItem) => void;
  clear: () => void;
}

export const useLibraryDuePrompt = create<PromptState>((set) => ({
  pending: null,
  request: (item) => {
    // If the source already has a due date, skip the prompt entirely.
    if (item.dueDate) {
      useLibraryStore.getState().addFromSchedule({
        title: item.title,
        duration: item.duration,
        category: item.category,
        note: item.note,
        isUrgent: item.isUrgent,
        isImportant: item.isImportant,
        dueDate: item.dueDate,
        subtasks: item.subtasks,
      });
      return;
    }
    // Close any in-flight prompt first so a stale window-level Enter handler
    // can't commit the new item with the previous task's selected date. The
    // null → item transition forces the prompt to remount with fresh state.
    set({ pending: null });
    queueMicrotask(() => set({ pending: item }));
  },
  clear: () => set({ pending: null }),
}));

function formatYMD(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function LibraryDueDatePrompt() {
  const { pending, clear } = useLibraryDuePrompt();
  const [date, setDate] = useState<string>('');
  const [rect, setRect] = useState<DOMRect | null>(null);
  const enterCountRef = useRef(0);
  const open = !!pending;

  // Track anchor element rect (re-measure on scroll/resize while open).
  useEffect(() => {
    if (!open || !pending?.anchor) { setRect(null); return; }
    const update = () => setRect(pending.anchor!.getBoundingClientRect());
    update();
    window.addEventListener('scroll', update, true);
    window.addEventListener('resize', update);
    return () => {
      window.removeEventListener('scroll', update, true);
      window.removeEventListener('resize', update);
    };
  }, [open, pending]);

  useEffect(() => {
    // Reset whenever the pending request changes (including from one item to
    // the next while the prompt is still open) so the next task never
    // inherits the previous task's selected date.
    setDate('');
    enterCountRef.current = 0;
  }, [pending]);

  const commit = (dueDate: string | null) => {
    if (!pending) return;
    useLibraryStore.getState().addFromSchedule({
      title: pending.title,
      duration: pending.duration,
      category: pending.category,
      note: pending.note,
      isUrgent: pending.isUrgent,
      isImportant: pending.isImportant,
      dueDate,
      subtasks: pending.subtasks,
    });
    clear();
  };

  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        if (date) {
          commit(date);
        } else {
          enterCountRef.current += 1;
          if (enterCountRef.current >= 2) commit(null);
        }
      } else if (e.key === 'Escape') {
        e.preventDefault();
        clear();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [open, date, pending]);

  if (!open) return null;

  return (
    <Popover open={open} onOpenChange={(o) => { if (!o) clear(); }}>
      {rect && (
        <PopoverAnchor asChild>
          <div
            style={{
              position: 'fixed',
              top: rect.top,
              left: rect.left,
              width: rect.width,
              height: rect.height,
              pointerEvents: 'none',
            }}
          />
        </PopoverAnchor>
      )}
      <PopoverContent
        className="w-auto p-0 z-[9999]"
        data-date-autocomplete
        align={pending?.align ?? 'end'}
        side={pending?.side ?? 'top'}
      >
        <Calendar
          mode="single"
          selected={date ? new Date(date + 'T12:00:00') : undefined}
          onSelect={(d) => { if (d) commit(formatYMD(d)); }}
          className="p-3 pointer-events-auto"
        />
        <div className="flex items-center gap-1.5 px-3 pb-2">
          {[
            { label: '1w', days: 7 },
            { label: '1m', days: 30 },
            { label: '6m', days: 182 },
            { label: '1y', days: 365 },
          ].map((opt) => (
            <button
              key={opt.label}
              onClick={() => {
                const d = new Date();
                d.setDate(d.getDate() + opt.days);
                commit(formatYMD(d));
              }}
              className="flex-1 py-1.5 text-[10px] font-mono tracking-wider text-muted-foreground/60 hover:text-foreground hover:bg-muted/30 rounded transition-colors"
            >
              {opt.label}
            </button>
          ))}
          <button
            onClick={() => commit(null)}
            className="text-[10px] font-mono tracking-wider text-muted-foreground/60 hover:text-foreground ml-auto px-2 py-1.5 rounded transition-colors"
          >
            None
          </button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
