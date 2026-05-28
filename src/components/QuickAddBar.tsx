import { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Plus, Tag, CalendarDays, Pencil, X } from 'lucide-react';
import { useLibraryStore, LibraryTask } from '@/store/libraryStore';
import { useQuickAddStore } from '@/store/quickAddStore';
import { TagAutocomplete } from '@/components/TagAutocomplete';
import { DateAutocomplete } from '@/components/DateAutocomplete';
import { useLibraryDuePrompt } from '@/components/LibraryDueDatePrompt';
import { LibraryEditModal } from '@/components/LibraryEditModal';
import { QuickDuePicker, getRelativeQuickDueLabel } from '@/components/LibraryPanel';
import { incrementEntryCount } from '@/hooks/useEntryHint';

export function QuickAddBar() {
  const { open, initialText, close } = useQuickAddStore();
  const categories = useLibraryStore((s) => s.categories);
  const addItem = useLibraryStore((s) => s.addItem);

  const [input, setInput] = useState('');
  const [quickDueDate, setQuickDueDate] = useState('');
  const [quickCategory, setQuickCategory] = useState('');
  const [editingItem, setEditingItem] = useState<LibraryTask | null>(null);
  const pendingShortcutDueDate = useRef<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const awaitingPromptRef = useRef(false);

  // When we hand off to the date prompt we keep the bar mounted so its input
  // stays a valid popover anchor. Close the bar once the prompt resolves.
  useEffect(() => {
    if (!open) return;
    let sawPending = false;
    const unsub = useLibraryDuePrompt.subscribe((state) => {
      if (!awaitingPromptRef.current) return;
      if (state.pending) {
        sawPending = true;
      } else if (sawPending) {
        awaitingPromptRef.current = false;
        close();
      }
    });
    return () => unsub();
  }, [open, close]);

  // Sync local input with the keystroke that opened the bar.
  useEffect(() => {
    if (open) {
      setInput(initialText);
      setQuickDueDate('');
      setQuickCategory('');
      awaitingPromptRef.current = false;
      // Focus and move caret to the end after the bar mounts.
      requestAnimationFrame(() => {
        const el = inputRef.current;
        if (el) {
          el.focus();
          const len = el.value.length;
          el.setSelectionRange(len, len);
        }
      });
    }
  }, [open, initialText]);

  const cleanTitle = (text: string) =>
    text.replace(/#\S*$/, '').replace(/@\S*$/, '').replace(/\/\/\S*$/, '').trim();

  const handleAdd = (overrides?: { dueDate?: string; category?: string; title?: string }) => {
    // Already handed off to the date prompt — let it own confirmation.
    if (awaitingPromptRef.current) return;
    const titleText = cleanTitle(overrides?.title ?? input);
    if (!titleText) return;
    const autoCategory = overrides?.category ?? quickCategory;
    const dueDate = overrides?.dueDate ?? pendingShortcutDueDate.current ?? quickDueDate;
    pendingShortcutDueDate.current = null;

    if (dueDate) {
      addItem(titleText, autoCategory || undefined, dueDate);
      incrementEntryCount();
      close();
    } else {
      awaitingPromptRef.current = true;
      useLibraryDuePrompt.getState().request({
        title: titleText,
        category: autoCategory || undefined,
        duration: 30,
        anchor: inputRef.current,
        side: 'bottom',
        align: 'start',
      });
      incrementEntryCount();
    }
  };

  // Create the item now and open the full edit modal for details/tags/subtasks.
  const handleEditAdd = () => {
    const titleText = cleanTitle(input);
    const id = addItem(titleText, quickCategory || undefined, quickDueDate || null);
    const created = useLibraryStore.getState().items.find((i) => i.id === id);
    incrementEntryCount();
    if (created) setEditingItem(created);
  };

  return (
    <>
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            className="fixed inset-0 z-[90] bg-background/60 backdrop-blur-[2px] flex items-start justify-center pt-[18vh] px-4"
            onMouseDown={() => close()}
          >
            <motion.div
              initial={{ opacity: 0, y: -12, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -12, scale: 0.98 }}
              transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
              onMouseDown={(e) => e.stopPropagation()}
              className="w-full max-w-lg rounded-xl border border-border/50 bg-card shadow-2xl"
            >
              <div className="flex items-center gap-2 px-4 py-2 border-b border-border/30">
                <span className="text-[9px] font-mono tracking-[0.18em] text-muted-foreground/50">QUICK ADD TO LIBRARY</span>
                <button onClick={() => close()} className="ml-auto p-1 text-muted-foreground/40 hover:text-foreground transition-colors">
                  <X size={13} />
                </button>
              </div>
              <div className="px-4 py-3">
                <div className="relative flex items-center gap-2.5">
                  <button onClick={() => handleAdd()} className="p-1 text-muted-foreground/40 hover:text-foreground transition-colors shrink-0">
                    <Plus size={16} />
                  </button>
                  <div className="relative flex-1">
                    <input
                      ref={inputRef}
                      value={input}
                      onChange={(e) => setInput(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && !input.match(/#\S+$/) && !input.match(/@\S*$/)) handleAdd();
                        if (e.key === 'Escape') close();
                      }}
                      placeholder="Add to library…"
                      className="w-full bg-transparent font-mono text-foreground placeholder:text-muted-foreground/40 focus:outline-none min-h-[40px] text-[14px] placeholder:text-[12px]"
                    />
                    <TagAutocomplete
                      inputValue={input}
                      inputRef={inputRef as React.RefObject<HTMLInputElement>}
                      onSelectTag={(cat, cleaned) => {
                        setInput(cleaned);
                        setQuickCategory(cat.value);
                      }}
                      onSubmitAfterSelect={handleAdd}
                    />
                    <DateAutocomplete
                      inputValue={input}
                      inputRef={inputRef as React.RefObject<HTMLInputElement>}
                      onSelectDate={(dateStr, cleaned) => {
                        setInput(cleaned);
                        setQuickDueDate(dateStr);
                        pendingShortcutDueDate.current = dateStr;
                      }}
                      onSubmitAfterSelect={(dateStr) => handleAdd({ dueDate: dateStr })}
                    />
                  </div>
                  {quickCategory && (
                    <button
                      onClick={() => setQuickCategory('')}
                      className="flex items-center gap-1 px-2 py-1 rounded-full text-[9px] font-mono tracking-wider text-primary/70 bg-primary/10 border border-primary/20 shrink-0"
                    >
                      <Tag size={8} />
                      {categories.find((c) => c.value === quickCategory)?.label || quickCategory}
                      <X size={8} />
                    </button>
                  )}
                  {quickDueDate && (
                    <button
                      onClick={() => setQuickDueDate('')}
                      className="flex items-center gap-1 px-2 py-1 rounded-full text-[9px] font-mono tracking-wider text-foreground/60 bg-muted/50 border border-border/40 shrink-0"
                    >
                      <CalendarDays size={8} />
                      {getRelativeQuickDueLabel(quickDueDate)}
                      <X size={8} />
                    </button>
                  )}
                  <button
                    onClick={handleEditAdd}
                    title="Add details"
                    className="p-2 text-muted-foreground/40 hover:text-foreground transition-colors shrink-0"
                  >
                    <Pencil size={15} />
                  </button>
                  <QuickDuePicker dueDate={quickDueDate} setDueDate={setQuickDueDate} />
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {editingItem && (
        <LibraryEditModal
          item={editingItem}
          onClose={() => {
            setEditingItem(null);
            close();
          }}
        />
      )}
    </>
  );
}