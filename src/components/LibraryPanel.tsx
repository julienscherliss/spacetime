import { useState, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  useLibraryStore,
  LibraryTask,
  LibraryCategory,
  LIBRARY_CATEGORIES,
} from '@/store/libraryStore';
import {
  X, Plus, GripVertical, Trash2, ChevronDown,
  ArrowDownAZ, Clock3, FolderOpen, Pencil,
} from 'lucide-react';

function CategoryDot({ category }: { category: LibraryCategory }) {
  const colors: Record<LibraryCategory, string> = {
    uncategorized: 'bg-muted-foreground/20',
    personal: 'bg-[hsl(var(--priority-0)/0.5)]',
    work: 'bg-[hsl(var(--priority-2)/0.5)]',
    admin: 'bg-[hsl(var(--priority-1)/0.5)]',
    errands: 'bg-[hsl(var(--primary)/0.4)]',
    ideas: 'bg-[hsl(210,60%,55%/0.5)]',
  };
  return <div className={`w-1.5 h-1.5 rounded-full ${colors[category]}`} />;
}

function LibraryItem({ item }: { item: LibraryTask }) {
  const { updateItem, deleteItem } = useLibraryStore();
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState(item.title);
  const [showCat, setShowCat] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleSave = () => {
    if (title.trim()) updateItem(item.id, { title: title.trim() });
    setEditing(false);
  };

  return (
    <div
      draggable
      onDragStart={(e) => {
        e.dataTransfer.setData('libraryTaskId', item.id);
        e.dataTransfer.setData('libraryTitle', item.title);
        e.dataTransfer.setData('libraryDuration', String(item.defaultDuration));
        e.dataTransfer.effectAllowed = 'move';
      }}
      className="group flex items-center gap-1.5 py-1.5 px-1.5 rounded-sm hover:bg-muted/40 transition-colors cursor-grab active:cursor-grabbing"
    >
      {/* Drag handle */}
      <GripVertical size={10} className="text-muted-foreground/15 group-hover:text-muted-foreground/35 shrink-0 transition-colors" />

      {/* Category dot */}
      <CategoryDot category={item.category} />

      {/* Title */}
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
          className="flex-1 bg-transparent text-[10px] font-mono text-foreground focus:outline-none border-b border-primary/30"
          autoFocus
        />
      ) : (
        <span className="flex-1 text-[10px] font-mono text-foreground/70 truncate leading-tight">
          {item.title}
        </span>
      )}

      {/* Duration badge */}
      <span className="text-[7px] font-mono text-muted-foreground/30 shrink-0">
        {item.defaultDuration}m
      </span>

      {/* Actions (visible on hover) */}
      <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
        <button
          onClick={(e) => { e.stopPropagation(); setEditing(true); }}
          className="p-0.5 text-muted-foreground/25 hover:text-foreground transition-colors"
        >
          <Pencil size={8} />
        </button>
        <div className="relative">
          <button
            onClick={(e) => { e.stopPropagation(); setShowCat(!showCat); }}
            className="p-0.5 text-muted-foreground/25 hover:text-foreground transition-colors"
          >
            <FolderOpen size={8} />
          </button>
          {showCat && (
            <div className="absolute right-0 top-5 z-50 bg-card border border-border rounded-sm shadow-md py-0.5 w-24">
              {LIBRARY_CATEGORIES.map((cat) => (
                <button
                  key={cat.value}
                  onClick={(e) => {
                    e.stopPropagation();
                    updateItem(item.id, { category: cat.value });
                    setShowCat(false);
                  }}
                  className={`w-full text-left px-2 py-1 text-[8px] font-mono tracking-wider transition-colors flex items-center gap-1.5 ${
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
          className="p-0.5 text-muted-foreground/25 hover:text-destructive transition-colors"
        >
          <Trash2 size={8} />
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
  } = useLibraryStore();

  const [input, setInput] = useState('');
  const [showSort, setShowSort] = useState(false);
  const [showFilter, setShowFilter] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const items = getFilteredItems();
  const totalCount = useLibraryStore((s) => s.items.length);

  const handleAdd = () => {
    if (!input.trim()) return;
    addItem(input.trim());
    setInput('');
    inputRef.current?.focus();
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
            className="fixed inset-0 z-40 bg-background/30 backdrop-blur-[1px] lg:hidden"
            onClick={() => setPanelOpen(false)}
          />

          {/* Panel */}
          <motion.div
            initial={{ x: -280, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            exit={{ x: -280, opacity: 0 }}
            transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
            className="fixed left-0 top-0 bottom-0 z-50 w-72 bg-card border-r border-border shadow-lg flex flex-col"
          >
            {/* Header */}
            <div className="flex items-center justify-between px-3 py-2.5 border-b border-border/50">
              <span className="text-[9px] font-mono tracking-[0.15em] text-foreground font-medium">
                LIBRARY
              </span>
              <div className="flex items-center gap-1">
                <span className="text-[8px] font-mono text-muted-foreground/30">{totalCount}</span>
                <button
                  onClick={() => setPanelOpen(false)}
                  className="p-0.5 text-muted-foreground/40 hover:text-foreground transition-colors"
                >
                  <X size={12} strokeWidth={1.5} />
                </button>
              </div>
            </div>

            {/* Quick input */}
            <div className="px-3 py-2 border-b border-border/30">
              <div className="flex items-center gap-1.5">
                <Plus size={11} className="text-muted-foreground/30 shrink-0" />
                <input
                  ref={inputRef}
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') handleAdd(); }}
                  placeholder="Add to library..."
                  className="flex-1 bg-transparent text-[10px] font-mono text-foreground placeholder:text-muted-foreground/25 focus:outline-none"
                />
              </div>
            </div>

            {/* Sort / Filter bar */}
            <div className="flex items-center gap-1 px-3 py-1.5 border-b border-border/20">
              {/* Sort */}
              <div className="relative">
                <button
                  onClick={() => { setShowSort(!showSort); setShowFilter(false); }}
                  className="flex items-center gap-0.5 text-[7px] font-mono tracking-widest text-muted-foreground/40 hover:text-foreground transition-colors px-1 py-0.5"
                >
                  <ArrowDownAZ size={9} />
                  {sortMode === 'recent' ? 'RECENT' : sortMode === 'alpha' ? 'A–Z' : 'CATEGORY'}
                  <ChevronDown size={7} className={showSort ? 'rotate-180' : ''} />
                </button>
                {showSort && (
                  <div className="absolute left-0 top-5 z-50 bg-card border border-border rounded-sm shadow-md py-0.5 w-20">
                    {(['recent', 'alpha', 'category'] as const).map((m) => (
                      <button
                        key={m}
                        onClick={() => { setSortMode(m); setShowSort(false); }}
                        className={`w-full text-left px-2 py-1 text-[8px] font-mono tracking-wider ${
                          sortMode === m ? 'text-foreground bg-muted/50' : 'text-muted-foreground/50 hover:text-foreground'
                        }`}
                      >
                        {m === 'recent' ? 'Recent' : m === 'alpha' ? 'A–Z' : 'Category'}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              <div className="w-px h-3 bg-border/30" />

              {/* Filter */}
              <div className="relative">
                <button
                  onClick={() => { setShowFilter(!showFilter); setShowSort(false); }}
                  className="flex items-center gap-0.5 text-[7px] font-mono tracking-widest text-muted-foreground/40 hover:text-foreground transition-colors px-1 py-0.5"
                >
                  <FolderOpen size={9} />
                  {filterCategory === 'all' ? 'ALL' : filterCategory.toUpperCase()}
                  <ChevronDown size={7} className={showFilter ? 'rotate-180' : ''} />
                </button>
                {showFilter && (
                  <div className="absolute left-0 top-5 z-50 bg-card border border-border rounded-sm shadow-md py-0.5 w-28">
                    <button
                      onClick={() => { setFilterCategory('all'); setShowFilter(false); }}
                      className={`w-full text-left px-2 py-1 text-[8px] font-mono tracking-wider ${
                        filterCategory === 'all' ? 'text-foreground bg-muted/50' : 'text-muted-foreground/50 hover:text-foreground'
                      }`}
                    >
                      All
                    </button>
                    {LIBRARY_CATEGORIES.map((cat) => (
                      <button
                        key={cat.value}
                        onClick={() => { setFilterCategory(cat.value); setShowFilter(false); }}
                        className={`w-full text-left px-2 py-1 text-[8px] font-mono tracking-wider flex items-center gap-1.5 ${
                          filterCategory === cat.value ? 'text-foreground bg-muted/50' : 'text-muted-foreground/50 hover:text-foreground'
                        }`}
                      >
                        <CategoryDot category={cat.value} />
                        {cat.label}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Items list */}
            <div className="flex-1 overflow-y-auto px-1.5 py-1">
              {items.length === 0 ? (
                <div className="text-center py-12">
                  <Clock3 size={16} className="mx-auto text-muted-foreground/15 mb-2" />
                  <p className="text-[8px] font-mono text-muted-foreground/25 tracking-wider">
                    {totalCount === 0 ? 'CAPTURE IDEAS HERE' : 'NO MATCHING ITEMS'}
                  </p>
                  <p className="text-[7px] font-mono text-muted-foreground/15 mt-1">
                    drag onto calendar to schedule
                  </p>
                </div>
              ) : (
                <div className="space-y-px">
                  {items.map((item) => (
                    <LibraryItem key={item.id} item={item} />
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
