import { useState, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  useLibraryStore,
  LibraryTask,
} from '@/store/libraryStore';
import {
  X, Plus, Trash2, Clock, AlertTriangle,
  ArrowDownAZ, CalendarClock, Tag, ChevronDown, GripVertical,
} from 'lucide-react';
import { useIsMobile } from '@/hooks/use-mobile';
import { useCarryStore } from '@/store/carryStore';
import { useTaskStore } from '@/store/taskStore';
import { LibraryEditModal } from '@/components/LibraryEditModal';

function UrgencyIcons({ item }: { item: LibraryTask }) {
  return (
    <div className="flex items-center gap-1">
      {item.isUrgent && <Clock size={13} className="text-muted-foreground/70" strokeWidth={1.8} />}
      {item.isImportant && <AlertTriangle size={13} className="text-muted-foreground/70" strokeWidth={1.8} />}
    </div>
  );
}

function getDueBadge(dueDate?: string | null): { text: string; urgent: boolean } | null {
  if (!dueDate) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const due = new Date(dueDate + 'T12:00:00');
  due.setHours(0, 0, 0, 0);
  const diffMs = due.getTime() - today.getTime();
  const diffDays = Math.round(diffMs / (1000 * 60 * 60 * 24));
  if (diffDays < 0) return { text: 'Overdue', urgent: true };
  if (diffDays === 0) return { text: 'Due today', urgent: true };
  if (diffDays === 1) return { text: 'Tomorrow', urgent: false };
  return { text: `${diffDays}d`, urgent: false };
}

function LibraryItem({ item, isMobile, onEdit }: { item: LibraryTask; isMobile: boolean; onEdit: () => void }) {
  const { deleteItem } = useLibraryStore();
  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const longPressFired = useRef(false);

  const handlePointerDown = useCallback(() => {
    longPressFired.current = false;
    longPressTimer.current = setTimeout(() => {
      longPressFired.current = true;
      useCarryStore.getState().pickup({
        taskId: item.id,
        title: item.title,
        duration: item.defaultDuration,
        fromDate: '',
        fromLibrary: true,
        libraryItemId: item.id,
        pickedUpAt: Date.now(),
      });
      useLibraryStore.getState().setPanelOpen(false);
    }, 400);
  }, [item]);

  const handlePointerUp = useCallback(() => {
    if (longPressTimer.current) { clearTimeout(longPressTimer.current); longPressTimer.current = null; }
    if (!longPressFired.current) onEdit();
  }, [onEdit]);

  const handlePointerMove = useCallback(() => {
    if (longPressTimer.current && !longPressFired.current) {
      clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
  }, []);

  const catLabel = useLibraryStore.getState().categories.find(c => c.value === item.category)?.label;
  const dueBadge = getDueBadge(item.dueDate);

  return (
    <div
      onContextMenu={(e) => e.preventDefault()}
      onPointerDown={handlePointerDown}
      onPointerUp={handlePointerUp}
      onPointerMove={handlePointerMove}
      className={`group flex items-center gap-3 rounded-md border border-border/30 bg-card/50 hover:border-border/60 hover:bg-card transition-all cursor-pointer select-none ${
        isMobile ? 'py-4 px-3.5 min-h-[56px]' : 'py-3 px-3 min-h-[48px]'
      }`}
    >
      <GripVertical size={14} className="text-muted-foreground/30 shrink-0" />

      <div className="flex-1 min-w-0">
        <div className={`font-mono text-foreground font-medium truncate leading-tight ${isMobile ? 'text-[15px]' : 'text-[13px]'}`}>
          {item.title}
        </div>
        <div className="flex items-center gap-2 mt-0.5">
          {catLabel && (
            <span className={`font-mono text-muted-foreground/60 tracking-wider ${isMobile ? 'text-[11px]' : 'text-[10px]'}`}>
              {catLabel}
            </span>
          )}
          {dueBadge && (
            <span className={`font-mono tracking-wider ${isMobile ? 'text-[10px]' : 'text-[9px]'} ${
              dueBadge.urgent ? 'text-destructive/70' : 'text-muted-foreground/50'
            }`}>
              {dueBadge.text}
            </span>
          )}
        </div>
      </div>

      {item.defaultDuration > 0 && (
        <span className={`font-mono text-muted-foreground/50 shrink-0 ${isMobile ? 'text-[11px]' : 'text-[10px]'}`}>
          {item.defaultDuration}m
        </span>
      )}

      <UrgencyIcons item={item} />

      <button
        onClick={(e) => { e.stopPropagation(); deleteItem(item.id); }}
        data-touch-ignore
        className={`p-1.5 text-muted-foreground/30 hover:text-destructive transition-colors ${isMobile ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'}`}
      >
        <Trash2 size={13} />
      </button>
    </div>
  );
}

/* ── Filter chip ── */
function Chip({ active, label, onClick }: { active: boolean; label: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={`shrink-0 px-3 py-1.5 rounded-full text-[10px] font-mono tracking-wider transition-colors min-h-[32px] border ${
        active
          ? 'border-foreground/25 bg-foreground/8 text-foreground font-medium'
          : 'border-border/50 text-muted-foreground/60 hover:text-foreground hover:border-border'
      }`}
    >
      {label}
    </button>
  );
}

export function LibraryPanel() {
  const {
    panelOpen, setPanelOpen,
    sortMode, setSortMode,
    filters, setFilter,
    addItem, getFilteredItems,
    categories, addCategory,
  } = useLibraryStore();

  const [input, setInput] = useState('');
  const [showSort, setShowSort] = useState(false);
  const [showNewCat, setShowNewCat] = useState(false);
  const [newCatName, setNewCatName] = useState('');
  const [editingItem, setEditingItem] = useState<LibraryTask | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const isMobile = useIsMobile();

  const items = getFilteredItems();
  const totalCount = useLibraryStore((s) => s.items.length);

  const activeFilterCount = [
    filters.category !== 'all',
    filters.urgency !== 'all',
    filters.hasDueDate !== null,
  ].filter(Boolean).length;

  const handleAdd = () => {
    if (!input.trim()) return;
    addItem(input.trim());
    setInput('');
    inputRef.current?.focus();
  };

  const handleAddCategory = () => {
    if (!newCatName.trim()) return;
    addCategory(newCatName.trim());
    setNewCatName('');
    setShowNewCat(false);
  };

  return (
    <>
      <AnimatePresence>
        {panelOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 z-50 bg-background flex flex-col"
          >
            {/* ── Top bar ── */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-border/50">
              <span className="text-[12px] font-mono tracking-[0.14em] text-foreground font-semibold">
                LIBRARY
              </span>
              <div className="flex items-center gap-3">
                <span className="text-[11px] font-mono text-muted-foreground/50">{totalCount}</span>
                <button
                  onClick={() => setPanelOpen(false)}
                  className="p-1.5 text-muted-foreground/60 hover:text-foreground transition-colors"
                >
                  <X size={18} strokeWidth={1.5} />
                </button>
              </div>
            </div>

            {/* ── Add input ── */}
            <div className="px-4 py-3 border-b border-border/40">
              <div className="flex items-center gap-2.5">
                <button onClick={handleAdd} className="p-1 text-muted-foreground/40 hover:text-foreground transition-colors shrink-0"><Plus size={16} /></button>
                <input
                  ref={inputRef}
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') handleAdd(); }}
                  placeholder="Add to library…"
                  className="flex-1 bg-transparent font-mono text-foreground placeholder:text-muted-foreground/40 focus:outline-none min-h-[44px] text-[14px]"
                />
              </div>
            </div>

            {/* ── Filter / Sort bar ── */}
            <div className="px-4 py-2.5 border-b border-border/30 space-y-2">
              {/* Sort selector */}
              <div className="flex items-center gap-2">
                <div className="relative">
                  <button
                    onClick={() => setShowSort(!showSort)}
                    className="flex items-center gap-1 text-[10px] font-mono tracking-widest text-muted-foreground/60 hover:text-foreground transition-colors px-2 py-1.5 min-h-[32px]"
                  >
                    <ArrowDownAZ size={12} />
                    {sortMode === 'recent' ? 'RECENT' : sortMode === 'alpha' ? 'A–Z' : sortMode === 'due' ? 'DUE DATE' : 'CATEGORY'}
                    <ChevronDown size={10} className={showSort ? 'rotate-180 transition-transform' : 'transition-transform'} />
                  </button>
                  {showSort && (
                    <div className="absolute left-0 top-full mt-1 z-50 bg-card border border-border rounded-sm shadow-md py-1 w-28">
                      {(['recent', 'alpha', 'category', 'due'] as const).map((m) => (
                        <button
                          key={m}
                          onClick={() => { setSortMode(m); setShowSort(false); }}
                          className={`w-full text-left px-3 py-2 text-[11px] font-mono tracking-wider min-h-[40px] ${
                            sortMode === m ? 'text-foreground bg-muted/50 font-medium' : 'text-muted-foreground/60 hover:text-foreground'
                          }`}
                        >
                          {m === 'recent' ? 'Recent' : m === 'alpha' ? 'A–Z' : m === 'due' ? 'Due date' : 'Category'}
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                {activeFilterCount > 0 && (
                  <button
                    onClick={() => setFilter({ category: 'all', urgency: 'all', hasDueDate: null })}
                    className="text-[9px] font-mono tracking-wider text-primary/70 hover:text-primary ml-auto"
                  >
                    CLEAR FILTERS
                  </button>
                )}
              </div>

              {/* Filter chips */}
              <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-hide">
                {/* Category chips */}
                <Chip
                  active={filters.category === 'all'}
                  label="All"
                  onClick={() => setFilter({ category: 'all' })}
                />
                {categories.map((cat) => (
                  <Chip
                    key={cat.value}
                    active={filters.category === cat.value}
                    label={cat.label}
                    onClick={() => setFilter({ category: filters.category === cat.value ? 'all' : cat.value })}
                  />
                ))}

                {/* Add category chip */}
                {showNewCat ? (
                  <input
                    value={newCatName}
                    onChange={(e) => setNewCatName(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter') handleAddCategory(); if (e.key === 'Escape') setShowNewCat(false); }}
                    onBlur={handleAddCategory}
                    placeholder="Name…"
                    className="shrink-0 w-20 bg-transparent text-[10px] font-mono text-foreground placeholder:text-muted-foreground/40 focus:outline-none border-b border-primary/40 px-1 py-1"
                    autoFocus
                  />
                ) : (
                  <button
                    onClick={() => setShowNewCat(true)}
                    className="shrink-0 flex items-center gap-1 px-2.5 py-1.5 rounded-full text-[10px] font-mono tracking-wider text-primary/50 hover:text-primary border border-dashed border-primary/25 hover:border-primary/50 transition-colors min-h-[32px]"
                  >
                    <Tag size={10} />
                    Add
                  </button>
                )}

                <div className="w-px h-4 bg-border/40 shrink-0" />

                {/* Urgency filters */}
                <Chip
                  active={filters.urgency === 'urgent'}
                  label="⏱ Urgent"
                  onClick={() => setFilter({ urgency: filters.urgency === 'urgent' ? 'all' : 'urgent' })}
                />
                <Chip
                  active={filters.urgency === 'important'}
                  label="! Important"
                  onClick={() => setFilter({ urgency: filters.urgency === 'important' ? 'all' : 'important' })}
                />

                <div className="w-px h-4 bg-border/40 shrink-0" />

                {/* Due date filter */}
                <Chip
                  active={filters.hasDueDate === true}
                  label="Has due"
                  onClick={() => setFilter({ hasDueDate: filters.hasDueDate === true ? null : true })}
                />
              </div>
            </div>

            {/* ── Items list ── */}
            <div className="flex-1 overflow-y-auto px-3 py-2" style={{ WebkitOverflowScrolling: 'touch' }}>
              {items.length === 0 ? (
                <div className="text-center py-16">
                  <CalendarClock size={28} className="mx-auto text-muted-foreground/20 mb-4" />
                  <p className="text-[12px] font-mono text-muted-foreground/40 tracking-wider">
                    {totalCount === 0 ? 'CAPTURE IDEAS HERE' : 'NO MATCHING ITEMS'}
                  </p>
                  <p className="text-[11px] font-mono text-muted-foreground/30 mt-1.5">
                    hold to pick up · tap to edit
                  </p>
                </div>
              ) : (
                <div className="space-y-1.5">
                  {items.map((item) => (
                    <LibraryItem key={item.id} item={item} isMobile={isMobile} onEdit={() => setEditingItem(item)} />
                  ))}
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {editingItem && (
        <LibraryEditModal
          item={editingItem}
          onClose={() => setEditingItem(null)}
        />
      )}
    </>
  );
}
