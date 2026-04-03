import { useState, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  useLibraryStore,
  LibraryTask,
  LibraryCategory,
  LIBRARY_CATEGORIES,
} from '@/store/libraryStore';
import {
  X, Plus, GripVertical, Trash2, ChevronDown,
  ArrowDownAZ, Clock3, FolderOpen, Pencil, Tag,
} from 'lucide-react';
import { useIsMobile } from '@/hooks/use-mobile';
import { useTouchDragStore } from '@/store/touchDragStore';

function CategoryDot({ category }: { category: string }) {
  const builtInColors: Record<string, string> = {
    uncategorized: 'bg-muted-foreground/20',
    personal: 'bg-[hsl(var(--priority-0)/0.5)]',
    work: 'bg-[hsl(var(--priority-2)/0.5)]',
    admin: 'bg-[hsl(var(--priority-1)/0.5)]',
    errands: 'bg-[hsl(var(--primary)/0.4)]',
    ideas: 'bg-[hsl(210,60%,55%/0.5)]',
  };
  return <div className={`w-2 h-2 rounded-full ${builtInColors[category] || 'bg-primary/40'}`} />;
}

function LibraryItem({ item, isMobile }: { item: LibraryTask; isMobile: boolean }) {
  const { updateItem, deleteItem } = useLibraryStore();
  const categories = useLibraryStore((s) => s.categories);
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState(item.title);
  const [showCat, setShowCat] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const touchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleSave = () => {
    if (title.trim()) updateItem(item.id, { title: title.trim() });
    setEditing(false);
  };

  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    const touch = e.touches[0];
    const startPos = { x: touch.clientX, y: touch.clientY };
    // Long-press to start drag (300ms)
    touchTimerRef.current = setTimeout(() => {
      useTouchDragStore.getState().startDrag(
        { type: 'library', id: item.id, title: item.title, duration: item.defaultDuration },
        startPos,
      );
    }, 300);
  }, [item]);

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    const { dragging } = useTouchDragStore.getState();
    if (dragging) {
      e.preventDefault();
      const touch = e.touches[0];
      useTouchDragStore.getState().moveGhost({ x: touch.clientX, y: touch.clientY });
    } else if (touchTimerRef.current) {
      // Cancel long-press if finger moves before activation
      clearTimeout(touchTimerRef.current);
      touchTimerRef.current = null;
    }
  }, []);

  const handleTouchEnd = useCallback(() => {
    if (touchTimerRef.current) {
      clearTimeout(touchTimerRef.current);
      touchTimerRef.current = null;
    }
    // Touch end on the ghost is handled by TimelineColumn
  }, []);

  return (
    <div
      draggable={!isMobile}
      onDragStart={(e) => {
        e.dataTransfer.setData('libraryTaskId', item.id);
        e.dataTransfer.setData('libraryTitle', item.title);
        e.dataTransfer.setData('libraryDuration', String(item.defaultDuration));
        e.dataTransfer.effectAllowed = 'move';
      }}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
      className={`group flex items-center gap-2 rounded-sm hover:bg-muted/40 transition-colors cursor-grab active:cursor-grabbing ${
        isMobile ? 'py-3 px-3' : 'py-2 px-2'
      }`}
    >
      <GripVertical size={isMobile ? 14 : 11} className="text-muted-foreground/20 group-hover:text-muted-foreground/40 shrink-0 transition-colors" />

      <CategoryDot category={item.category} />

      {editing ? (
        <input
          ref={inputRef}
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') handleSave();
            if (e.key === 'Escape') { setTitle(item.title); setEditing(false); }
          }}
          onBlur={handleSave}
          className={`flex-1 bg-transparent font-mono text-foreground focus:outline-none border-b border-primary/30 ${
            isMobile ? 'text-[13px]' : 'text-[11px]'
          }`}
          autoFocus
        />
      ) : (
        <span className={`flex-1 font-mono text-foreground/70 truncate leading-tight ${
          isMobile ? 'text-[13px]' : 'text-[11px]'
        }`}>
          {item.title}
        </span>
      )}

      <span className={`font-mono text-muted-foreground/30 shrink-0 ${isMobile ? 'text-[10px]' : 'text-[9px]'}`}>
        {item.defaultDuration}m
      </span>

      {/* Actions — always visible on mobile, hover on desktop */}
      <div className={`flex items-center gap-1 ${isMobile ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'} transition-opacity`}>
        <button
          onClick={(e) => { e.stopPropagation(); setEditing(true); }}
          className="p-1 text-muted-foreground/30 hover:text-foreground transition-colors"
        >
          <Pencil size={isMobile ? 12 : 10} />
        </button>
        <div className="relative">
          <button
            onClick={(e) => { e.stopPropagation(); setShowCat(!showCat); }}
            className="p-1 text-muted-foreground/30 hover:text-foreground transition-colors"
          >
            <FolderOpen size={isMobile ? 12 : 10} />
          </button>
          {showCat && (
            <div className="absolute right-0 top-7 z-50 bg-card border border-border rounded-sm shadow-md py-1 w-28">
              {categories.map((cat) => (
                <button
                  key={cat.value}
                  onClick={(e) => {
                    e.stopPropagation();
                    updateItem(item.id, { category: cat.value });
                    setShowCat(false);
                  }}
                  className={`w-full text-left px-2.5 py-1.5 text-[10px] font-mono tracking-wider transition-colors flex items-center gap-2 ${
                    item.category === cat.value
                      ? 'text-foreground bg-muted/50'
                      : 'text-muted-foreground/50 hover:text-foreground hover:bg-muted/30'
                  }`}
                >
                  <CategoryDot category={cat.value} />
                  {cat.label}
                </button>
              ))}
            </div>
          )}
        </div>
        <button
          onClick={(e) => { e.stopPropagation(); deleteItem(item.id); }}
          className="p-1 text-muted-foreground/30 hover:text-destructive transition-colors"
        >
          <Trash2 size={isMobile ? 12 : 10} />
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
    <AnimatePresence>
      {panelOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-40 bg-background/40 backdrop-blur-[2px]"
            onClick={() => setPanelOpen(false)}
          />

          {/* Panel — bottom sheet on mobile, left sidebar on desktop */}
          <motion.div
            initial={isMobile ? { y: '100%' } : { x: -320, opacity: 0 }}
            animate={isMobile ? { y: 0 } : { x: 0, opacity: 1 }}
            exit={isMobile ? { y: '100%' } : { x: -320, opacity: 0 }}
            transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
            className={`fixed z-50 bg-card shadow-lg flex flex-col ${
              isMobile
                ? 'left-0 right-0 bottom-0 top-[45%] border-t border-border rounded-t-lg'
                : 'left-0 top-0 bottom-0 w-80 border-r border-border'
            }`}
          >
            {/* Header */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-border/50">
              <span className="text-[11px] font-mono tracking-[0.12em] text-foreground font-medium">
                LIBRARY
              </span>
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-mono text-muted-foreground/30">{totalCount}</span>
                <button
                  onClick={() => setPanelOpen(false)}
                  className="p-1 text-muted-foreground/40 hover:text-foreground transition-colors"
                >
                  <X size={14} strokeWidth={1.5} />
                </button>
              </div>
            </div>

            {/* Quick input */}
            <div className="px-4 py-3 border-b border-border/30">
              <div className="flex items-center gap-2">
                <Plus size={14} className="text-muted-foreground/30 shrink-0" />
                <input
                  ref={inputRef}
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') handleAdd(); }}
                  placeholder="Add to library..."
                  className={`flex-1 bg-transparent font-mono text-foreground placeholder:text-muted-foreground/25 focus:outline-none ${
                    isMobile ? 'text-[14px]' : 'text-[12px]'
                  }`}
                />
              </div>
            </div>

            {/* Sort / Filter bar */}
            <div className="flex items-center gap-2 px-4 py-2 border-b border-border/20 flex-wrap">
              {/* Sort */}
              <div className="relative">
                <button
                  onClick={() => { setShowSort(!showSort); setShowFilter(false); }}
                  className="flex items-center gap-1 text-[9px] font-mono tracking-widest text-muted-foreground/40 hover:text-foreground transition-colors px-1.5 py-1"
                >
                  <ArrowDownAZ size={11} />
                  {sortMode === 'recent' ? 'RECENT' : sortMode === 'alpha' ? 'A–Z' : 'CATEGORY'}
                  <ChevronDown size={9} className={showSort ? 'rotate-180' : ''} />
                </button>
                {showSort && (
                  <div className="absolute left-0 top-7 z-50 bg-card border border-border rounded-sm shadow-md py-1 w-24">
                    {(['recent', 'alpha', 'category'] as const).map((m) => (
                      <button
                        key={m}
                        onClick={() => { setSortMode(m); setShowSort(false); }}
                        className={`w-full text-left px-2.5 py-1.5 text-[10px] font-mono tracking-wider ${
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

              {/* Filter */}
              <div className="relative">
                <button
                  onClick={() => { setShowFilter(!showFilter); setShowSort(false); }}
                  className="flex items-center gap-1 text-[9px] font-mono tracking-widest text-muted-foreground/40 hover:text-foreground transition-colors px-1.5 py-1"
                >
                  <FolderOpen size={11} />
                  {filterCategory === 'all' ? 'ALL' : filterCategory.toUpperCase()}
                  <ChevronDown size={9} className={showFilter ? 'rotate-180' : ''} />
                </button>
                {showFilter && (
                  <div className="absolute left-0 top-7 z-50 bg-card border border-border rounded-sm shadow-md py-1 w-32">
                    <button
                      onClick={() => { setFilterCategory('all'); setShowFilter(false); }}
                      className={`w-full text-left px-2.5 py-1.5 text-[10px] font-mono tracking-wider ${
                        filterCategory === 'all' ? 'text-foreground bg-muted/50' : 'text-muted-foreground/50 hover:text-foreground'
                      }`}
                    >
                      All
                    </button>
                    {categories.map((cat) => (
                      <button
                        key={cat.value}
                        onClick={() => { setFilterCategory(cat.value); setShowFilter(false); }}
                        className={`w-full text-left px-2.5 py-1.5 text-[10px] font-mono tracking-wider flex items-center gap-2 ${
                          filterCategory === cat.value ? 'text-foreground bg-muted/50' : 'text-muted-foreground/50 hover:text-foreground'
                        }`}
                      >
                        <CategoryDot category={cat.value} />
                        {cat.label}
                      </button>
                    ))}
                    {/* Add category */}
                    <div className="border-t border-border/30 mt-1 pt-1">
                      {showNewCat ? (
                        <div className="px-2 py-1">
                          <input
                            value={newCatName}
                            onChange={(e) => setNewCatName(e.target.value)}
                            onKeyDown={(e) => { if (e.key === 'Enter') handleAddCategory(); if (e.key === 'Escape') setShowNewCat(false); }}
                            onBlur={handleAddCategory}
                            placeholder="Category name..."
                            className="w-full bg-transparent text-[10px] font-mono text-foreground placeholder:text-muted-foreground/30 focus:outline-none border-b border-primary/30"
                            autoFocus
                          />
                        </div>
                      ) : (
                        <button
                          onClick={() => setShowNewCat(true)}
                          className="w-full text-left px-2.5 py-1.5 text-[10px] font-mono tracking-wider text-primary/60 hover:text-primary flex items-center gap-2"
                        >
                          <Tag size={9} />
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
                  <Clock3 size={20} className="mx-auto text-muted-foreground/15 mb-2" />
                  <p className="text-[10px] font-mono text-muted-foreground/25 tracking-wider">
                    {totalCount === 0 ? 'CAPTURE IDEAS HERE' : 'NO MATCHING ITEMS'}
                  </p>
                  <p className="text-[9px] font-mono text-muted-foreground/15 mt-1">
                    drag onto calendar to schedule
                  </p>
                </div>
              ) : (
                <div className="space-y-px">
                  {items.map((item) => (
                    <LibraryItem key={item.id} item={item} isMobile={isMobile} />
                  ))}
                </div>
              )}
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
