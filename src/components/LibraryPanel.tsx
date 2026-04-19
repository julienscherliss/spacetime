import { useState, useRef, useCallback, useEffect } from 'react';
import { useEntryHint, incrementEntryCount } from '@/hooks/useEntryHint';
import { motion, AnimatePresence } from 'framer-motion';
import {
  useLibraryStore,
  LibraryTask,
} from '@/store/libraryStore';
import {
  X, Plus, Check, Clock, AlertTriangle, Trash2,
  ArrowDownAZ, CalendarClock, Tag, ChevronDown, ChevronRight, GripVertical, CalendarDays,
  PanelRightClose, PanelRightOpen,
} from 'lucide-react';
import { TagAutocomplete, isSubtagOf, hasSubtags, getParentValue } from '@/components/TagAutocomplete';
import { DateAutocomplete } from '@/components/DateAutocomplete';
import { useIsMobile } from '@/hooks/use-mobile';
import { useCarryStore } from '@/store/carryStore';
import { useTaskStore } from '@/store/taskStore';
import { LibraryEditModal } from '@/components/LibraryEditModal';
import { LibraryDetailPane } from '@/components/LibraryDetailPane';
import { Calendar } from '@/components/ui/calendar';
import { TagManagerPanel } from '@/components/TagManagerPanel';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';

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

export function getPlaceCount(): number {
  return parseInt(localStorage.getItem('spacetime-place-count') || '0', 10);
}

export function incrementPlaceCount() {
  const count = getPlaceCount() + 1;
  localStorage.setItem('spacetime-place-count', String(count));
}

function LibraryItem({ item, isMobile, onEdit }: { item: LibraryTask; isMobile: boolean; onEdit: () => void }) {
  const { deleteItem } = useLibraryStore();
  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const longPressFired = useRef(false);
  const [isHovered, setIsHovered] = useState(false);
  const showHoldHint = !isMobile && isHovered && getPlaceCount() < 10;

  const handlePointerDown = useCallback((e: React.PointerEvent) => {
    if ((e.target as HTMLElement).closest('[data-touch-ignore]')) return;
    longPressFired.current = false;
    longPressTimer.current = setTimeout(() => {
      longPressFired.current = true;
      incrementPlaceCount();
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

  const handlePointerUp = useCallback((e: React.PointerEvent) => {
    if ((e.target as HTMLElement).closest('[data-touch-ignore]')) return;
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

  const getDueBorderClass = () => {
    if (!item.dueDate) return 'border-border/30 opacity-60';
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const due = new Date(item.dueDate + 'T12:00:00');
    due.setHours(0, 0, 0, 0);
    const diffMs = due.getTime() - today.getTime();
    const diffDays = Math.round(diffMs / (1000 * 60 * 60 * 24));
    if (diffDays < 0) return 'border-destructive/60';
    let bizDays = 0;
    const d = new Date(today);
    while (d < due && bizDays < 4) {
      d.setDate(d.getDate() + 1);
      const dow = d.getDay();
      if (dow !== 0 && dow !== 6) bizDays++;
    }
    if (bizDays <= 3 && diffDays <= 7) return 'border-primary/50';
    return 'border-border/30';
  };

  return (
    <div
      onContextMenu={(e) => e.preventDefault()}
      onPointerDown={handlePointerDown}
      onPointerUp={handlePointerUp}
      onPointerMove={handlePointerMove}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      className={`group flex items-center gap-3 rounded-md border bg-card/50 hover:bg-card transition-all cursor-pointer select-none ${getDueBorderClass()} ${
        isMobile ? 'py-4 px-3.5 min-h-[56px]' : 'py-3 px-3 min-h-[48px]'
      }`}
    >
      <GripVertical size={14} className="text-muted-foreground/30 shrink-0" />

      <div className="flex-1 min-w-0">
        <div className={`font-mono text-foreground font-medium truncate leading-tight flex items-center gap-2 ${isMobile ? 'text-[15px]' : 'text-[13px]'}`}>
          <span className="truncate">{item.title}</span>
          <AnimatePresence>
            {showHoldHint && (
              <motion.span
                initial={{ opacity: 0, x: -4 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -4 }}
                transition={{ duration: 0.15 }}
                className="text-[9px] font-mono text-muted-foreground/40 tracking-wider whitespace-nowrap shrink-0"
              >
                hold to place
              </motion.span>
            )}
          </AnimatePresence>
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
        onPointerDown={(e) => e.stopPropagation()}
        onPointerUp={(e) => e.stopPropagation()}
        onClick={(e) => { e.stopPropagation(); deleteItem(item.id); }}
        data-touch-ignore
        className={`p-1.5 text-muted-foreground/30 hover:text-primary transition-colors ${isMobile ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'}`}
      >
        <Check size={13} strokeWidth={2} />
      </button>
    </div>
  );
}

/* ── Filter chip ── */
function Chip({ active, label, onClick, onLongPress }: { active: boolean; label: string; onClick: () => void; onLongPress?: () => void }) {
  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const longPressFired = useRef(false);

  const handlePointerDown = useCallback(() => {
    if (!onLongPress) return;
    longPressFired.current = false;
    longPressTimer.current = setTimeout(() => {
      longPressFired.current = true;
      onLongPress();
    }, 500);
  }, [onLongPress]);

  const handlePointerUp = useCallback(() => {
    if (longPressTimer.current) { clearTimeout(longPressTimer.current); longPressTimer.current = null; }
    if (!longPressFired.current) onClick();
  }, [onClick]);

  const handlePointerMove = useCallback(() => {
    if (longPressTimer.current) { clearTimeout(longPressTimer.current); longPressTimer.current = null; }
  }, []);

  return (
    <button
      onPointerDown={onLongPress ? handlePointerDown : undefined}
      onPointerUp={onLongPress ? handlePointerUp : undefined}
      onPointerMove={onLongPress ? handlePointerMove : undefined}
      onClick={onLongPress ? undefined : onClick}
      className={`shrink-0 px-3 py-1.5 rounded-full text-[10px] font-mono tracking-wider transition-colors min-h-[32px] border select-none ${
        active
          ? 'border-foreground/25 bg-foreground/8 text-foreground font-medium'
          : 'border-border/50 text-muted-foreground/60 hover:text-foreground hover:border-border'
      }`}
      style={{ WebkitUserSelect: 'none', userSelect: 'none', WebkitTouchCallout: 'none' } as React.CSSProperties}
    >
      {label}
    </button>
  );
}

/* ── Vertical tag chip (desktop sidebar) ── */
function VerticalTagChip({ active, label, onClick, onLongPress, hasChildren, onDrilldown }: { active: boolean; label: string; onClick: () => void; onLongPress?: () => void; hasChildren?: boolean; onDrilldown?: () => void }) {
  return (
    <button
      onClick={onClick}
      onContextMenu={onLongPress ? (e) => { e.preventDefault(); onLongPress(); } : undefined}
      className={`w-full text-left px-2.5 py-2 rounded-md text-[11px] font-mono tracking-wider transition-colors flex items-center justify-between gap-1 ${
        active
          ? 'bg-foreground/[0.06] text-foreground font-medium border border-foreground/10'
          : 'text-muted-foreground/60 hover:text-foreground hover:bg-muted/30 border border-transparent'
      }`}
    >
      <span className="truncate">{label}</span>
      {hasChildren && (
        <span
          onClick={(e) => { e.stopPropagation(); onDrilldown?.(); }}
          className={`p-0.5 hover:text-foreground transition-colors shrink-0 ${
            active ? 'text-foreground' : 'text-muted-foreground/40'
          }`}
        >
          <ChevronRight size={12} strokeWidth={1.5} />
        </span>
      )}
    </button>
  );
}

/* ── Jiggle chip for edit mode (drag to reorder) ── */
function JiggleChip({ label, catValue, onDelete, isDragging }: {
  label: string; catValue: string; onDelete: () => void;
  isDragging: boolean;
}) {
  return (
    <motion.div
      data-cat-value={catValue}
      animate={isDragging ? { scale: 1.12, rotate: 0, opacity: 0.6 } : { rotate: [0, -2, 2, -2, 0] }}
      transition={isDragging ? { duration: 0.15 } : { duration: 0.4, repeat: Infinity, repeatDelay: 0.1 }}
      className="relative shrink-0 select-none touch-none"
      style={{ WebkitUserSelect: 'none', WebkitTouchCallout: 'none' } as React.CSSProperties}
    >
      <div className={`px-3 py-1.5 rounded-full text-[10px] font-mono tracking-wider border text-muted-foreground/60 min-h-[32px] flex items-center ${
        isDragging ? 'border-primary/40 bg-primary/10' : 'border-border/50'
      }`}>
        {label}
      </div>
      <button
        data-delete-btn
        onClick={(e) => { e.stopPropagation(); onDelete(); }}
        className="absolute -top-1.5 -left-1.5 w-5 h-5 rounded-full bg-destructive flex items-center justify-center shadow-sm"
      >
        <X size={10} className="text-destructive-foreground" />
      </button>
    </motion.div>
  );
}

/* ── Quick due-date picker for add input ── */
function QuickDuePicker({ dueDate, setDueDate }: { dueDate: string; setDueDate: (d: string) => void }) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          data-touch-ignore
          onPointerDown={(e) => e.stopPropagation()}
          onPointerUp={(e) => e.stopPropagation()}
          className={`p-2 transition-colors shrink-0 ${
            dueDate ? 'text-primary' : 'text-muted-foreground/40 hover:text-muted-foreground'
          }`}
        >
          <CalendarDays size={16} />
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0 z-[60]" align="end" side="top">
        <Calendar
          mode="single"
          selected={dueDate ? new Date(dueDate + 'T12:00:00') : undefined}
          onSelect={(d) => {
            if (d) {
              const y = d.getFullYear();
              const m = String(d.getMonth() + 1).padStart(2, '0');
              const day = String(d.getDate()).padStart(2, '0');
              setDueDate(`${y}-${m}-${day}`);
            }
          }}
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
                const y = d.getFullYear();
                const m = String(d.getMonth() + 1).padStart(2, '0');
                const day = String(d.getDate()).padStart(2, '0');
                setDueDate(`${y}-${m}-${day}`);
              }}
              className="flex-1 py-1.5 text-[10px] font-mono tracking-wider text-muted-foreground/60 hover:text-foreground hover:bg-muted/30 rounded transition-colors"
            >
              {opt.label}
            </button>
          ))}
          {dueDate && (
            <button
              onClick={() => setDueDate('')}
              className="text-[10px] font-mono tracking-wider text-destructive/60 hover:text-destructive ml-auto px-2 py-1.5"
            >
              Clear
            </button>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}

export function LibraryPanel() {
  const {
    panelOpen, setPanelOpen, renameCategory,
    sortMode, setSortMode,
    filters, setFilter,
    addItem, getFilteredItems,
    categories, addCategory, removeCategory,
  } = useLibraryStore();

  const [input, setInput] = useState('');
  const [quickDueDate, setQuickDueDate] = useState('');
  const [quickCategory, setQuickCategory] = useState('');
  const [showSort, setShowSort] = useState(false);
  const [showNewCat, setShowNewCat] = useState(false);
  const [newCatName, setNewCatName] = useState('');
  const [editingItem, setEditingItem] = useState<LibraryTask | null>(null);
  const [tagEditMode, setTagEditMode] = useState(false);
  const [tagModalOpen, setTagModalOpen] = useState(false);
  const [draggingTag, setDraggingTag] = useState<string | null>(null);
  const [drilldownParent, setDrilldownParent] = useState<string | null>(null);
  
  const [deletingTag, setDeletingTag] = useState<{ value: string; label: string; count: number } | null>(null);
  const [editingTagValue, setEditingTagValue] = useState<string | null>(null);
  const [editingTagLabel, setEditingTagLabel] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const isMobile = useIsMobile();
  const { hint: entryHint } = useEntryHint();
  const viewMode = useTaskStore((s) => s.viewMode);
  const [sidebarMode, setSidebarMode] = useState(false);

  // When panel opens, default to sidebar mode in day/week views, full-screen in focus/calendar.
  const prevPanelOpen = useRef(false);
  useEffect(() => {
    if (panelOpen && !prevPanelOpen.current) {
      setSidebarMode(viewMode === 'day' || viewMode === 'week');
    }
    prevPanelOpen.current = panelOpen;
  }, [panelOpen, viewMode]);

  const items = getFilteredItems();
  const allItems = useLibraryStore((s) => s.items);
  const totalCount = allItems.length;

  const activeFilterCount = [
    filters.category !== 'all',
    filters.urgency !== 'all',
    filters.hasDueDate !== null,
  ].filter(Boolean).length;

  // Exit tag edit mode on tap outside
  useEffect(() => {
    if (!tagEditMode) return;
    const handler = (e: PointerEvent) => {
      const target = e.target as HTMLElement;
      if (!target.closest('[data-tag-edit-zone]')) {
        setTagEditMode(false);
      }
    };
    document.addEventListener('pointerdown', handler);
    return () => document.removeEventListener('pointerdown', handler);
  }, [tagEditMode]);

  // Handle tag drag via pointermove + elementFromPoint
  const lastDragTarget = useRef<string | null>(null);
  useEffect(() => {
    if (!draggingTag) { lastDragTarget.current = null; return; }
    let rafId = 0;
    let lastX = 0, lastY = 0;

    const handleMove = (e: PointerEvent) => {
      lastX = e.clientX;
      lastY = e.clientY;
      if (!rafId) {
        rafId = requestAnimationFrame(() => {
          rafId = 0;
          const el = document.elementFromPoint(lastX, lastY);
          const chip = el?.closest('[data-cat-value]') as HTMLElement | null;
          const targetVal = chip?.dataset.catValue || null;
          if (targetVal && targetVal !== draggingTag && targetVal !== lastDragTarget.current) {
            lastDragTarget.current = targetVal;
            useLibraryStore.getState().moveCategory(draggingTag, targetVal);
          }
        });
      }
    };
    const handleEnd = () => {
      if (rafId) cancelAnimationFrame(rafId);
      setDraggingTag(null);
    };
    document.addEventListener('pointermove', handleMove, { passive: true });
    document.addEventListener('pointerup', handleEnd);
    document.addEventListener('pointercancel', handleEnd);
    return () => {
      if (rafId) cancelAnimationFrame(rafId);
      document.removeEventListener('pointermove', handleMove);
      document.removeEventListener('pointerup', handleEnd);
      document.removeEventListener('pointercancel', handleEnd);
    };
  }, [draggingTag]);

  const handleAdd = () => {
    const titleText = input.replace(/#\S*$/, '').replace(/@\S*$/, '').replace(/\/\/\S*$/, '').trim();
    if (!titleText) return;
    const store = useLibraryStore.getState();
    const autoCategory = quickCategory || (filters.category !== 'all' && filters.category !== 'none' ? filters.category : '');
    store.addItem(titleText, autoCategory || undefined, quickDueDate || null);
    incrementEntryCount();
    setInput('');
    setQuickDueDate('');
    setQuickCategory('');
    inputRef.current?.focus();
  };

  const handleAddCategory = () => {
    if (!newCatName.trim()) return;
    addCategory(newCatName.trim());
    setNewCatName('');
    setShowNewCat(false);
  };

  const handleDeleteTag = (catValue: string) => {
    const cat = categories.find(c => c.value === catValue);
    if (!cat) return;
    const count = allItems.filter(i => i.category === catValue).length;
    if (count > 0) {
      setDeletingTag({ value: catValue, label: cat.label, count });
    } else {
      removeCategory(catValue);
    }
  };

  const confirmDeleteTag = () => {
    if (!deletingTag) return;
    removeCategory(deletingTag.value);
    setDeletingTag(null);
  };

  // Desktop 3-panel vs mobile full-screen
  const isDesktop = !isMobile;

  return (
    <>
      <AnimatePresence>
        {panelOpen && (
          <motion.div
            initial={{ opacity: 0, x: isDesktop && sidebarMode ? 40 : 0 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: isDesktop && sidebarMode ? 40 : 0 }}
            transition={{ duration: 0.2 }}
            className={
              isDesktop && sidebarMode
                ? 'fixed top-0 right-0 bottom-0 z-50 bg-background flex flex-col border-l border-border/50 shadow-xl w-[480px] max-w-[90vw]'
                : 'fixed inset-0 z-50 bg-background flex flex-col'
            }
          >
            {isDesktop ? (
              /* ═══ DESKTOP: 3-panel layout ═══ */
              <div className="flex flex-col h-full">
                {/* Top bar */}
                <div className="flex items-center justify-between px-4 py-3 border-b border-border/50">
                  <span className="text-[12px] font-mono tracking-[0.14em] text-foreground font-semibold">
                    LIBRARY
                  </span>
                  <div className="flex items-center gap-3">
                    <span className="text-[11px] font-mono text-muted-foreground/50">{totalCount}</span>
                    <button
                      onClick={() => setSidebarMode((s) => !s)}
                      className="p-1.5 text-muted-foreground/60 hover:text-foreground transition-colors"
                      title={sidebarMode ? 'Expand to full screen' : 'Collapse to sidebar'}
                    >
                      {sidebarMode ? <PanelRightOpen size={16} strokeWidth={1.5} /> : <PanelRightClose size={16} strokeWidth={1.5} />}
                    </button>
                    <button
                      onClick={() => setPanelOpen(false)}
                      className="p-1.5 text-muted-foreground/60 hover:text-foreground transition-colors"
                    >
                      <X size={18} strokeWidth={1.5} />
                    </button>
                  </div>
                </div>

                <div className="flex flex-1 min-h-0">
                  {/* ── LEFT: Tags / Sorting / Filters ── */}
                  {!sidebarMode && (
                  <div className="w-[220px] shrink-0 border-r border-border/30 flex flex-col overflow-y-auto">
                    {/* Sort selector */}
                    <div className="px-3 py-3 border-b border-border/20">
                      <div className="relative">
                        <button
                          onClick={() => setShowSort(!showSort)}
                          className="flex items-center gap-1 text-[10px] font-mono tracking-widest text-muted-foreground/60 hover:text-foreground transition-colors px-2 py-1.5 w-full"
                        >
                          <ArrowDownAZ size={12} />
                          {sortMode === 'recent' ? 'RECENT' : sortMode === 'alpha' ? 'A–Z' : sortMode === 'due' ? 'DUE DATE' : 'CATEGORY'}
                          <ChevronDown size={10} className={showSort ? 'rotate-180 transition-transform' : 'transition-transform'} />
                        </button>
                        {showSort && (
                          <div className="absolute left-0 top-full mt-1 z-50 bg-card border border-border rounded-sm shadow-md py-1 w-full">
                            {(['recent', 'alpha', 'category', 'due'] as const).map((m) => (
                              <button
                                key={m}
                                onClick={() => { setSortMode(m); setShowSort(false); }}
                                className={`w-full text-left px-3 py-2 text-[11px] font-mono tracking-wider ${
                                  sortMode === m ? 'text-foreground bg-muted/50 font-medium' : 'text-muted-foreground/60 hover:text-foreground'
                                }`}
                              >
                                {m === 'recent' ? 'Recent' : m === 'alpha' ? 'A–Z' : m === 'due' ? 'Due date' : 'Category'}
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Category tags — vertical list */}
                    <div className="px-3 py-2 flex-1 space-y-1" data-tag-edit-zone>
                      <span className="text-[9px] font-mono tracking-[0.15em] text-muted-foreground/40 px-2 mb-1 block">TAGS</span>

                      {tagEditMode ? (
                        <>
                          {categories.map((cat) => (
                            <JiggleChip
                              key={cat.value}
                              label={cat.label}
                              catValue={cat.value}
                              isDragging={draggingTag === cat.value}
                              onDelete={() => handleDeleteTag(cat.value)}
                            />
                          ))}
                        </>
                      ) : (
                        <>
                          {drilldownParent ? (
                            <>
                              <button
                                onClick={() => { setDrilldownParent(null); setFilter({ category: 'all' }); }}
                                className="w-full text-left px-2 py-1.5 text-[10px] font-mono tracking-wider text-muted-foreground/50 hover:text-foreground rounded transition-colors"
                              >
                                ← Back
                              </button>
                              <VerticalTagChip
                                active={filters.category === drilldownParent}
                                label={categories.find(c => c.value === drilldownParent)?.label || drilldownParent}
                                onClick={() => setFilter({ category: filters.category === drilldownParent ? 'all' : drilldownParent })}
                              />
                              {categories.filter(c => isSubtagOf(c.value, drilldownParent)).map((cat) => {
                                const subLabel = cat.label.includes(' / ') ? cat.label.split(' / ').slice(1).join(' / ') : cat.label;
                                return (
                                  <VerticalTagChip
                                    key={cat.value}
                                    active={filters.category === cat.value}
                                    label={subLabel}
                                    onClick={() => setFilter({ category: filters.category === cat.value ? 'all' : cat.value })}
                                  />
                                );
                              })}
                            </>
                          ) : (
                            <>
                              <VerticalTagChip
                                active={filters.category === 'all'}
                                label="All"
                                onClick={() => setFilter({ category: 'all' })}
                              />
                              <VerticalTagChip
                                active={filters.category === 'none'}
                                label="Untagged"
                                onClick={() => setFilter({ category: filters.category === 'none' ? 'all' : 'none' })}
                              />
                              {categories
                                .filter(c => !c.value.includes('/'))
                                .map((cat) => {
                                  const catHasChildren = categories.some(c => isSubtagOf(c.value, cat.value));
                                  return (
                                    <VerticalTagChip
                                      key={cat.value}
                                      active={filters.category === cat.value}
                                      label={cat.label}
                                      hasChildren={catHasChildren}
                                      onDrilldown={() => setDrilldownParent(cat.value)}
                                      onClick={() => {
                                        setFilter({ category: filters.category === cat.value ? 'all' : cat.value });
                                      }}
                                      onLongPress={() => setTagModalOpen(true)}
                                    />
                                  );
                                })}
                              {showNewCat ? (
                                <input
                                  value={newCatName}
                                  onChange={(e) => setNewCatName(e.target.value)}
                                  onKeyDown={(e) => { if (e.key === 'Enter') handleAddCategory(); if (e.key === 'Escape') setShowNewCat(false); }}
                                  onBlur={handleAddCategory}
                                  placeholder="Name…"
                                  className="w-full bg-transparent text-[10px] font-mono text-foreground placeholder:text-muted-foreground/40 focus:outline-none border-b border-primary/40 px-2 py-1.5"
                                  autoFocus
                                />
                              ) : (
                                <button
                                  onClick={() => setShowNewCat(true)}
                                  className="w-full text-left flex items-center gap-1 px-2 py-1.5 text-[10px] font-mono tracking-wider text-primary/50 hover:text-primary transition-colors"
                                >
                                  <Tag size={10} />
                                  Add tag
                                </button>
                              )}
                              <button
                                onClick={() => setTagModalOpen(true)}
                                className="w-full text-left flex items-center gap-1 px-2 py-1.5 text-[10px] font-mono tracking-wider text-muted-foreground/40 hover:text-foreground transition-colors"
                              >
                                <GripVertical size={10} />
                                Manage tags
                              </button>
                            </>
                          )}
                        </>
                      )}

                      {/* Urgency / Due filters */}
                      <div className="pt-3 mt-2 border-t border-border/20 space-y-1">
                        <span className="text-[9px] font-mono tracking-[0.15em] text-muted-foreground/40 px-2 mb-1 block">FILTERS</span>
                        <VerticalTagChip
                          active={filters.urgency === 'urgent'}
                          label="⏱ Urgent"
                          onClick={() => setFilter({ urgency: filters.urgency === 'urgent' ? 'all' : 'urgent' })}
                        />
                        <VerticalTagChip
                          active={filters.urgency === 'important'}
                          label="! Important"
                          onClick={() => setFilter({ urgency: filters.urgency === 'important' ? 'all' : 'important' })}
                        />
                        <VerticalTagChip
                          active={filters.hasDueDate === true}
                          label="Has due date"
                          onClick={() => setFilter({ hasDueDate: filters.hasDueDate === true ? null : true })}
                        />
                        {activeFilterCount > 0 && (
                          <button
                            onClick={() => setFilter({ category: 'all', urgency: 'all', hasDueDate: null })}
                            className="w-full text-left px-2 py-1.5 text-[9px] font-mono tracking-wider text-primary/60 hover:text-primary"
                          >
                            Clear all
                          </button>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* ── MIDDLE: Add input + Task list ── */}
                  <div className="flex-1 flex flex-col min-w-0">
                    {/* Add input */}
                    <div className="px-4 py-3 border-b border-border/40">
                      <div className="relative flex items-center gap-2.5">
                        <button onClick={handleAdd} className="p-1 text-muted-foreground/40 hover:text-foreground transition-colors shrink-0"><Plus size={16} /></button>
                        <div className="relative flex-1">
                          <input
                            ref={inputRef}
                            value={input}
                            onChange={(e) => setInput(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter' && !input.match(/#\S+$/) && !input.match(/@\S*$/)) handleAdd();
                            }}
                            placeholder={entryHint ? `Add to library… (${entryHint})` : 'Add to library…'}
                            className="w-full bg-transparent font-mono text-foreground placeholder:text-muted-foreground/40 focus:outline-none min-h-[44px] text-[14px]"
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
                            }}
                            onSubmitAfterSelect={handleAdd}
                          />
                        </div>
                        {quickCategory && (
                          <button
                            onClick={() => setQuickCategory('')}
                            className="flex items-center gap-1 px-2 py-1 rounded-full text-[9px] font-mono tracking-wider text-primary/70 bg-primary/10 border border-primary/20 shrink-0"
                          >
                            <Tag size={8} />
                            {categories.find(c => c.value === quickCategory)?.label || quickCategory}
                            <X size={8} />
                          </button>
                        )}
                        {quickDueDate && (
                          <button
                            onClick={() => setQuickDueDate('')}
                            className="flex items-center gap-1 px-2 py-1 rounded-full text-[9px] font-mono tracking-wider text-foreground/60 bg-muted/50 border border-border/40 shrink-0"
                          >
                            <CalendarDays size={8} />
                            {(() => {
                              const d = new Date(quickDueDate + 'T12:00:00');
                              const today = new Date(); today.setHours(0,0,0,0);
                              const diff = Math.round((d.getTime() - today.getTime()) / 86400000);
                              if (diff === 0) return 'Today';
                              if (diff === 1) return 'Tomorrow';
                              return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
                            })()}
                            <X size={8} />
                          </button>
                        )}
                        <QuickDuePicker dueDate={quickDueDate} setDueDate={setQuickDueDate} />
                      </div>
                    </div>

                    {/* Task list */}
                    <div className="flex-1 overflow-y-auto px-3 py-2" style={{ WebkitOverflowScrolling: 'touch' }}>
                      {items.length === 0 ? (
                        <div className="text-center py-16 px-6">
                          <CalendarClock size={28} className="mx-auto text-muted-foreground/15 mb-4" />
                          {totalCount === 0 ? (
                            <>
                              <p className="text-[13px] font-mono text-muted-foreground/30 leading-relaxed">
                                A place for tasks that don't need a time yet.
                              </p>
                              <p className="text-[12px] font-mono text-muted-foreground/25 mt-2 leading-relaxed">
                                Keep them here until you're ready to bring them into your schedule.
                              </p>
                            </>
                          ) : (
                            <p className="text-[12px] font-mono text-muted-foreground/40 tracking-wider">
                              NO MATCHING ITEMS
                            </p>
                          )}
                        </div>
                      ) : (
                        <div className="space-y-1.5">
                          {items.map((item) => (
                            <LibraryItem
                              key={item.id}
                              item={item}
                              isMobile={false}
                              onEdit={() => setEditingItem(item)}
                            />
                          ))}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* ── RIGHT: Detail pane ── */}
                  {editingItem && (
                    <div className="w-1/2 shrink-0 border-l border-border/30 bg-card/30">
                      <LibraryDetailPane
                        item={editingItem}
                        onClose={() => setEditingItem(null)}
                      />
                    </div>
                  )}
                </div>
              </div>
            ) : (
              /* ═══ MOBILE: original full-screen layout ═══ */
              <>
                {/* Top bar */}
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

                {/* Add input */}
                <div className="px-4 py-3 border-b border-border/40">
                  <div className="relative flex items-center gap-2.5">
                    <button onClick={handleAdd} className="p-1 text-muted-foreground/40 hover:text-foreground transition-colors shrink-0"><Plus size={16} /></button>
                    <div className="relative flex-1">
                      <input
                        ref={inputRef}
                        value={input}
                        onChange={(e) => setInput(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' && !input.match(/#\S+$/) && !input.match(/@\S*$/)) handleAdd();
                        }}
                        placeholder={entryHint ? `Add to library… (${entryHint})` : 'Add to library…'}
                        className="w-full bg-transparent font-mono text-foreground placeholder:text-muted-foreground/40 focus:outline-none min-h-[44px] text-[14px]"
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
                        }}
                        onSubmitAfterSelect={handleAdd}
                      />
                    </div>
                    {quickCategory && (
                      <button
                        onClick={() => setQuickCategory('')}
                        className="flex items-center gap-1 px-2 py-1 rounded-full text-[9px] font-mono tracking-wider text-primary/70 bg-primary/10 border border-primary/20 shrink-0"
                      >
                        <Tag size={8} />
                        {categories.find(c => c.value === quickCategory)?.label || quickCategory}
                        <X size={8} />
                      </button>
                    )}
                    {quickDueDate && (
                      <button
                        onClick={() => setQuickDueDate('')}
                        className="flex items-center gap-1 px-2 py-1 rounded-full text-[9px] font-mono tracking-wider text-foreground/60 bg-muted/50 border border-border/40 shrink-0"
                      >
                        <CalendarDays size={8} />
                        {(() => {
                          const d = new Date(quickDueDate + 'T12:00:00');
                          const today = new Date(); today.setHours(0,0,0,0);
                          const diff = Math.round((d.getTime() - today.getTime()) / 86400000);
                          if (diff === 0) return 'Today';
                          if (diff === 1) return 'Tomorrow';
                          return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
                        })()}
                        <X size={8} />
                      </button>
                    )}
                    <QuickDuePicker dueDate={quickDueDate} setDueDate={setQuickDueDate} />
                  </div>
                </div>

                {/* Filter / Sort bar */}
                <div className="px-4 py-2.5 border-b border-border/30 space-y-2">
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
                    {tagEditMode && (
                      <button
                        onClick={() => setTagEditMode(false)}
                        className="text-[9px] font-mono tracking-wider text-foreground/60 hover:text-foreground ml-auto"
                      >
                        DONE
                      </button>
                    )}
                  </div>

                  <div data-tag-edit-zone className="space-y-2">
                    <div
                      className="flex items-center gap-2 overflow-x-auto pb-0.5 scrollbar-hide"
                      onPointerDown={tagEditMode ? (e) => {
                        const target = e.target as HTMLElement;
                        if (target.closest('[data-delete-btn]')) return;
                        const chip = target.closest('[data-cat-value]') as HTMLElement | null;
                        if (chip?.dataset.catValue) {
                          e.preventDefault();
                          setDraggingTag(chip.dataset.catValue);
                        }
                      } : undefined}
                    >
                      {tagEditMode ? (
                        <>
                          {categories.map((cat) => (
                            <JiggleChip
                              key={cat.value}
                              label={cat.label}
                              catValue={cat.value}
                              isDragging={draggingTag === cat.value}
                              onDelete={() => handleDeleteTag(cat.value)}
                            />
                          ))}
                        </>
                      ) : (
                        <>
                          {drilldownParent ? (
                            <>
                              <Chip active={false} label="← Back" onClick={() => { setDrilldownParent(null); setFilter({ category: 'all' }); }} />
                              <Chip
                                active={filters.category === drilldownParent}
                                label={categories.find(c => c.value === drilldownParent)?.label || drilldownParent}
                                onClick={() => setFilter({ category: filters.category === drilldownParent ? 'all' : drilldownParent })}
                              />
                              {categories.filter(c => isSubtagOf(c.value, drilldownParent)).map((cat) => {
                                const subLabel = cat.label.includes(' / ') ? cat.label.split(' / ').slice(1).join(' / ') : cat.label;
                                return (
                                  <Chip
                                    key={cat.value}
                                    active={filters.category === cat.value}
                                    label={subLabel}
                                    onClick={() => setFilter({ category: filters.category === cat.value ? 'all' : cat.value })}
                                    onLongPress={() => setTagModalOpen(true)}
                                  />
                                );
                              })}
                              {showNewCat ? (
                                <input
                                  value={newCatName}
                                  onChange={(e) => setNewCatName(e.target.value)}
                                  onKeyDown={(e) => {
                                    if (e.key === 'Enter') {
                                      if (newCatName.trim()) {
                                        const parentCat = categories.find(c => c.value === drilldownParent);
                                        const parentLabel = parentCat?.label || drilldownParent;
                                        const subValue = `${drilldownParent}/${newCatName.trim().toLowerCase().replace(/\s+/g, '-')}`;
                                        const subLabel = `${parentLabel} / ${newCatName.trim()}`;
                                        addCategory(subLabel, subValue);
                                      }
                                      setNewCatName('');
                                      setShowNewCat(false);
                                    }
                                    if (e.key === 'Escape') setShowNewCat(false);
                                  }}
                                  onBlur={() => {
                                    if (newCatName.trim()) {
                                      const parentCat = categories.find(c => c.value === drilldownParent);
                                      const parentLabel = parentCat?.label || drilldownParent;
                                      const subValue = `${drilldownParent}/${newCatName.trim().toLowerCase().replace(/\s+/g, '-')}`;
                                      const subLabel = `${parentLabel} / ${newCatName.trim()}`;
                                      addCategory(subLabel, subValue);
                                    }
                                    setNewCatName('');
                                    setShowNewCat(false);
                                  }}
                                  placeholder="Subtag…"
                                  className="shrink-0 w-20 bg-transparent text-[10px] font-mono text-foreground placeholder:text-muted-foreground/40 focus:outline-none border-b border-primary/40 px-1 py-1"
                                  autoFocus
                                />
                              ) : (
                                <button
                                  onClick={() => setShowNewCat(true)}
                                  className="shrink-0 flex items-center gap-1 px-2.5 py-1.5 rounded-full text-[10px] font-mono tracking-wider text-primary/50 hover:text-primary border border-dashed border-primary/25 hover:border-primary/50 transition-colors min-h-[32px]"
                                >
                                  <Plus size={10} />
                                  Add
                                </button>
                              )}
                            </>
                          ) : (
                            <>
                              <Chip active={filters.category === 'all'} label="All" onClick={() => setFilter({ category: 'all' })} />
                              <Chip
                                active={filters.category === 'none'}
                                label="Untagged"
                                onClick={() => setFilter({ category: filters.category === 'none' ? 'all' : 'none' })}
                              />
                              {categories
                                .filter(c => !c.value.includes('/'))
                                .map((cat) => (
                                  <Chip
                                    key={cat.value}
                                    active={filters.category === cat.value}
                                    label={cat.label}
                                    onClick={() => {
                                      if (filters.category === cat.value) {
                                        setDrilldownParent(cat.value);
                                      } else {
                                        setFilter({ category: cat.value });
                                      }
                                    }}
                                    onLongPress={() => setTagModalOpen(true)}
                                  />
                                ))}
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
                            </>
                          )}
                        </>
                      )}
                    </div>

                    <div className="flex items-center gap-2 overflow-x-auto pb-0.5 scrollbar-hide">
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
                      <Chip
                        active={filters.hasDueDate === true}
                        label="Has due"
                        onClick={() => setFilter({ hasDueDate: filters.hasDueDate === true ? null : true })}
                      />
                    </div>
                  </div>
                </div>

                {/* Items list */}
                <div className="flex-1 overflow-y-auto px-3 py-2" style={{ WebkitOverflowScrolling: 'touch' }}>
                  {items.length === 0 ? (
                    <div className="text-center py-16 px-6">
                      <CalendarClock size={28} className="mx-auto text-muted-foreground/15 mb-4" />
                      {totalCount === 0 ? (
                        <>
                          <p className="text-[13px] font-mono text-muted-foreground/30 leading-relaxed">
                            A place for tasks that don't need a time yet.
                          </p>
                          <p className="text-[12px] font-mono text-muted-foreground/25 mt-2 leading-relaxed">
                            Keep them here until you're ready to bring them into your schedule.
                          </p>
                        </>
                      ) : (
                        <p className="text-[12px] font-mono text-muted-foreground/40 tracking-wider">
                          NO MATCHING ITEMS
                        </p>
                      )}
                    </div>
                  ) : (
                    <div className="space-y-1.5">
                      {items.map((item) => (
                        <LibraryItem key={item.id} item={item} isMobile={isMobile} onEdit={() => setEditingItem(item)} />
                      ))}
                    </div>
                  )}
                </div>
              </>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Modal edit — mobile only */}
      {isMobile && editingItem && (
        <LibraryEditModal
          item={editingItem}
          onClose={() => setEditingItem(null)}
        />
      )}

      {/* Delete tag confirmation dialog */}
      <Dialog open={!!deletingTag} onOpenChange={() => setDeletingTag(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="font-mono text-sm">Delete tag "{deletingTag?.label}"?</DialogTitle>
            <DialogDescription className="text-xs font-mono text-muted-foreground/60">
              {deletingTag?.count} item{deletingTag?.count !== 1 ? 's' : ''} will lose this tag.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => setDeletingTag(null)} className="font-mono text-xs">Cancel</Button>
            <Button variant="destructive" size="sm" onClick={confirmDeleteTag} className="font-mono text-xs">Delete</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <TagManagerPanel open={tagModalOpen} onClose={() => setTagModalOpen(false)} />
    </>
  );
}
