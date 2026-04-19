import { useEffect, useRef, useState } from 'react';
import { create } from 'zustand';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
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
}

interface PromptState {
  pending: PendingLibraryItem | null;
  request: (item: PendingLibraryItem) => void;
  clear: () => void;
}

export const useLibraryDuePrompt = create<PromptState>((set) => ({
  pending: null,
  request: (item) => {
    // If the source already has a due date, skip the prompt and add directly.
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
    set({ pending: item });
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
  const [date, setDate] = useState<Date | undefined>(undefined);
  const enterCountRef = useRef(0);
  const open = !!pending;

  useEffect(() => {
    if (open) {
      setDate(undefined);
      enterCountRef.current = 0;
    }
  }, [open]);

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
          commit(formatYMD(date));
        } else {
          enterCountRef.current += 1;
          if (enterCountRef.current >= 2) {
            commit(null);
          }
        }
      } else if (e.key === 'Escape') {
        e.preventDefault();
        clear();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [open, date, pending]);

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) clear(); }}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="font-mono text-sm tracking-wider">
            Add due date?
          </DialogTitle>
          <DialogDescription className="font-mono text-[11px] text-muted-foreground/70">
            "{pending?.title}" — pick a date, or press Enter twice to skip.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col items-center">
          <Calendar
            mode="single"
            selected={date}
            onSelect={(d) => setDate(d)}
            className="p-3 pointer-events-auto"
          />

          <div className="flex items-center gap-2 w-full mt-2">
            <button
              type="button"
              onClick={() => commit(null)}
              className="flex-1 py-2 rounded-md text-[11px] font-mono tracking-wider text-muted-foreground/70 hover:text-foreground hover:bg-muted/40 transition-colors border border-border/40"
            >
              No due date
            </button>
            <button
              type="button"
              disabled={!date}
              onClick={() => date && commit(formatYMD(date))}
              className="flex-1 py-2 rounded-md text-[11px] font-mono tracking-wider bg-foreground text-background hover:bg-foreground/90 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              Save
            </button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
