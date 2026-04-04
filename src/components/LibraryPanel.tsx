import { useState, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  useLibraryStore,
  LibraryTask,
} from '@/store/libraryStore';
import {
  X, Plus, Trash2, ChevronDown,
  ArrowDownAZ, Clock3, FolderOpen, Tag, Inbox,
} from 'lucide-react';
import { useIsMobile } from '@/hooks/use-mobile';
import { useCarryStore } from '@/store/carryStore';
import { useTaskStore } from '@/store/taskStore';
import { LibraryEditModal } from '@/components/LibraryEditModal';

function CategoryDot({ category }: { category: string }) {
  const builtInColors: Record<string, string> = {
    uncategorized: 'bg-muted-foreground/20',
    personal: 'bg-[hsl(var(--priority-0)/0.5)]',
    work: 'bg-[hsl(var(--priority-2)/0.5)]',
    admin: 'bg-[hsl(var(--priority-1)/0.5)]',
    errands: 'bg-[hsl(var(--primary)/0.4)]',
    ideas: 'bg-[hsl(210,60%,55%/0.5)]',
  };
  return <div className={`w-2.5 h-2.5 rounded-full ${builtInColors[category] || 'bg-primary/40'}`} />;
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
    }, 250);
  }, [item]);

  const handlePointerUp = useCallback(() => {
    if (longPressTimer.current) { clearTimeout(longPressTimer.current); longPressTimer.current = null; }
    if (!longPressFired.current) {
      onEdit();
    }
  }, [onEdit]);

  const handlePointerMove = useCallback(() => {
    if (longPressTimer.current && !longPressFired.current) {
      clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
  }, []);

  const handleMoveToWaiting = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    // Create a task in waiting room from library item
    useTaskStore.getState().addTask({
      title: item.title,
      description: item.note || undefined,
      date: new Date().toISOString().split('T')[0],
      priority: 0,
      duration: item.defaultDuration,
      inWaitingRoom: true,
    });
    deleteItem(item.id);
  }, [item, deleteItem]);

  return (
    <div
      onContextMenu={(e) => e.preventDefault()}
      onPointerDown={handlePointerDown}
      onPointerUp={handlePointerUp}
      onPointerMove={handlePointerMove}
      className={`group flex items-center gap-3 rounded-sm hover:bg-muted/40 transition-colors cursor-pointer select-none ${
        isMobile ? 'py-3.5 px-3' : 'py-3 px-3'
      } min-h-[48px]`}
    >
      <CategoryDot category={item.category} />

      <div className="flex-1 min-w-0">
        <div className={`font-mono text-foreground/80 truncate leading-tight ${
          isMobile ? 'text-[14px]' : 'text-[13px]'
        }`}>
          {item.title}
        </div>
        {item.note && (
          <div className={`font-mono text-muted-foreground/40 truncate mt-0.5 ${
            isMobile ? 'text-[11px]' : 'text-[10px]'
          }`}>
            {item.note}
          </div>
        )}
      </div>

      <span className={`font-mono text-muted-foreground/40 shrink-0 ${isMobile ? 'text-[11px]' : 'text-[10px]'}`}>
        {item.defaultDuration}m
      </span>

      {/* Actions */}
      <div className={`flex items-center gap-1.5 ${isMobile ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'} transition-opacity`}>
        <button
          onClick={handleMoveToWaiting}
          data-touch-ignore
          className="p-1.5 text-muted-foreground/30 hover:text-foreground transition-colors"
          title="Move to Waiting Room"
        >
          <Inbox size={isMobile ? 14 : 12} />
        </button>
        <button
          onClick={(e) => { e.stopPropagation(); deleteItem(item.id); }}
          data-touch-ignore
          className="p-1.5 text-muted-foreground/30 hover:text-destructive transition-colors"
        >
          <Trash2 size={isMobile ? 14 : 12} />
        </button>
      </div>
    </div>
  );
}

export function LibraryPanel() {
  const {
    panelOpen, setPanelOpen,
    sortMode, setSortMode,
    filterCategory, setFilterCategory,
    addItem, getFilteredItems,
    categories, addCategory,
  } = useLibraryStore();

  const [input, setInput] = useState('');
  const [showSort, setShowSort] = useState(false);
  const [showFilter, setShowFilter] = useState(false);
  const [showNewCat, setShowNewCat] = useState(false);
  const [newCatName, setNewCatName] = useState('');
  const [editingItem, setEditingItem] = useState<LibraryTask | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const isMobile = useIsMobile();

  const items = getFilteredItems();
  const totalCount = useLibraryStore((s) => s.items.length);

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
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-40 bg-background/40 backdrop-blur-[2px]"
              onClick={() => setPanelOpen(false)}
            />

            <motion.div
              initial={isMobile ? { y: '100%' } : { x: -320, opacity: 0 }}
              animate={isMobile ? { y: 0 } : { x: 0, opacity: 1 }}
              exit={isMobile ? { y: '100%' } : { x: -320, opacity: 0 }}
              transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
              className={`fixed z-50 bg-card shadow-lg flex flex-col ${
                isMobile
                  ? 'left-0 right-0 bottom-0 top-[40%] border-t border-border rounded-t-lg'
                  : 'left-0 top-0 bottom-0 w-80 border-r border-border'
              }`}
            >
              {/* Header */}
              <div className="flex items-center justify-between px-4 py-3 border-b border-border/50">
                <span className="text-[12px] font-mono tracking-[0.12em] text-foreground font-medium">
                  LIBRARY
                </span>
                <div className="flex items-center gap-2">
                  <span className="text-[11px] font-mono text-muted-foreground/40">{totalCount}</span>
                  <button
                    onClick={() => setPanelOpen(false)}
                    className="p-1.5 text-muted-foreground/40 hover:text-foreground transition-colors"
                  >
                    <X size={16} strokeWidth={1.5} />
                  </button>
                </div>
              </div>

              {/* Quick input */}
              <div className="px-4 py-3 border-b border-border/30">
                <div className="flex items-center gap-2.5">
                  <Plus size={16} className="text-muted-foreground/30 shrink-0" />
                  <input
                    ref={inputRef}
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter') handleAdd(); }}
                    placeholder="Add to library..."
                    className={`flex-1 bg-transparent font-mono text-foreground placeholder:text-muted-foreground/25 focus:outline-none min-h-[44px] ${
                      isMobile ? 'text-[15px]' : 'text-[13px]'
                    }`}
                  />
                </div>
              </div>

              {/* Sort / Filter bar */}
              <div className="flex items-center gap-2 px-4 py-2.5 border-b border-border/20 flex-wrap">
                <div className="relative">
                  <button
                    onClick={() => { setShowSort(!showSort); setShowFilter(false); }}
                    className="flex items-center gap-1 text-[10px] font-mono tracking-widest text-muted-foreground/40 hover:text-foreground transition-colors px-2 py-1.5 min-h-[36px]"
                  >
                    <ArrowDownAZ size={12} />
                    {sortMode === 'recent' ? 'RECENT' : sortMode === 'alpha' ? 'A–Z' : 'CATEGORY'}
                    <ChevronDown size={10} className={showSort ? 'rotate-180' : ''} />
                  </button>
                  {showSort && (
                    <div className="absolute left-0 top-9 z-50 bg-card border border-border rounded-sm shadow-md py-1 w-28">
                      {(['recent', 'alpha', 'category'] as const).map((m) => (
                        <button
                          key={m}
                          onClick={() => { setSortMode(m); setShowSort(false); }}
                          className={`w-full text-left px-3 py-2 text-[11px] font-mono tracking-wider min-h-[40px] ${
                            sortMode === m ? 'text-foreground bg-muted/50' : 'text-muted-foreground/50 hover:text-foreground'
                          }`}
                        >
                          {m === 'recent' ? 'Recent' : m === 'alpha' ? 'A–Z' : 'Category'}
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                <div className="w-px h-4 bg-border/30" />

                <div className="relative">
                  <button
                    onClick={() => { setShowFilter(!showFilter); setShowSort(false); }}
                    className="flex items-center gap-1 text-[10px] font-mono tracking-widest text-muted-foreground/40 hover:text-foreground transition-colors px-2 py-1.5 min-h-[36px]"
                  >
                    <FolderOpen size={12} />
                    {filterCategory === 'all' ? 'ALL' : filterCategory.toUpperCase()}
                    <ChevronDown size={10} className={showFilter ? 'rotate-180' : ''} />
                  </button>
                  {showFilter && (
                    <div className="absolute left-0 top-9 z-50 bg-card border border-border rounded-sm shadow-md py-1 w-36">
                      <button
                        onClick={() => { setFilterCategory('all'); setShowFilter(false); }}
                        className={`w-full text-left px-3 py-2 text-[11px] font-mono tracking-wider min-h-[40px] ${
                          filterCategory === 'all' ? 'text-foreground bg-muted/50' : 'text-muted-foreground/50 hover:text-foreground'
                        }`}
                      >
                        All
                      </button>
                      {categories.map((cat) => (
                        <button
                          key={cat.value}
                          onClick={() => { setFilterCategory(cat.value); setShowFilter(false); }}
                          className={`w-full text-left px-3 py-2 text-[11px] font-mono tracking-wider flex items-center gap-2 min-h-[40px] ${
                            filterCategory === cat.value ? 'text-foreground bg-muted/50' : 'text-muted-foreground/50 hover:text-foreground'
                          }`}
                        >
                          <CategoryDot category={cat.value} />
                          {cat.label}
                        </button>
                      ))}
                      <div className="border-t border-border/30 mt-1 pt-1">
                        {showNewCat ? (
                          <div className="px-3 py-2">
                            <input
                              value={newCatName}
                              onChange={(e) => setNewCatName(e.target.value)}
                              onKeyDown={(e) => { if (e.key === 'Enter') handleAddCategory(); if (e.key === 'Escape') setShowNewCat(false); }}
                              onBlur={handleAddCategory}
                              placeholder="Category name..."
                              className="w-full bg-transparent text-[11px] font-mono text-foreground placeholder:text-muted-foreground/30 focus:outline-none border-b border-primary/30"
                              autoFocus
                            />
                          </div>
                        ) : (
                          <button
                            onClick={() => setShowNewCat(true)}
                            className="w-full text-left px-3 py-2 text-[11px] font-mono tracking-wider text-primary/60 hover:text-primary flex items-center gap-2 min-h-[40px]"
                          >
                            <Tag size={10} />
                            New category...
                          </button>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Items list */}
              <div className="flex-1 overflow-y-auto px-2 py-1" style={{ WebkitOverflowScrolling: 'touch' }}>
                {items.length === 0 ? (
                  <div className="text-center py-12">
                    <Clock3 size={24} className="mx-auto text-muted-foreground/15 mb-3" />
                    <p className="text-[12px] font-mono text-muted-foreground/30 tracking-wider">
                      {totalCount === 0 ? 'CAPTURE IDEAS HERE' : 'NO MATCHING ITEMS'}
                    </p>
                    <p className="text-[11px] font-mono text-muted-foreground/20 mt-1">
                      long press to pick up · tap to edit
                    </p>
                  </div>
                ) : (
                  <div className="space-y-px">
                    {items.map((item) => (
                      <LibraryItem key={item.id} item={item} isMobile={isMobile} onEdit={() => setEditingItem(item)} />
                    ))}
                  </div>
                )}
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* Library item edit modal */}
      {editingItem && (
        <LibraryEditModal
          item={editingItem}
          onClose={() => setEditingItem(null)}
        />
      )}
    </>
  );
}
