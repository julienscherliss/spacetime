import { useState, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useLibraryStore, CategoryDef } from '@/store/libraryStore';
import {
  X, Plus, Trash2, Tag, ChevronRight, ArrowUpRight, ArrowDownLeft,
  GripVertical,
} from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';

/** Check if child is a DIRECT subtag of parent (one level only) */
function isDirectChild(childValue: string, parentValue: string): boolean {
  if (!childValue.startsWith(parentValue + '/')) return false;
  const remainder = childValue.slice(parentValue.length + 1);
  return !remainder.includes('/');
}

/** Get leaf label */
function getLeafLabel(label: string): string {
  const parts = label.split(' / ');
  return parts[parts.length - 1] || label;
}

interface TagManagerPanelProps {
  open: boolean;
  onClose: () => void;
}

export function TagManagerPanel({ open, onClose }: TagManagerPanelProps) {
  const categories = useLibraryStore((s) => s.categories);
  const allItems = useLibraryStore((s) => s.items);
  const removeCategory = useLibraryStore((s) => s.removeCategory);
  const renameCategory = useLibraryStore((s) => s.renameCategory);
  const addCategory = useLibraryStore((s) => s.addCategory);
  const moveCategory = useLibraryStore((s) => s.moveCategory);
  const reparentTag = useLibraryStore((s) => s.reparentTag);

  // Column path: each entry is a parent value (null = root)
  const [columnPath, setColumnPath] = useState<(string | null)[]>([null]);
  const [editingTag, setEditingTag] = useState<string | null>(null);
  const [editingLabel, setEditingLabel] = useState('');
  const [newTagInput, setNewTagInput] = useState<{ columnParent: string | null } | null>(null);
  const [newTagValue, setNewTagValue] = useState('');
  const [deletingTag, setDeletingTag] = useState<{ value: string; label: string; count: number } | null>(null);
  const [dragTag, setDragTag] = useState<string | null>(null);
  const [dropTarget, setDropTarget] = useState<string | null>(null);
  const [dropAction, setDropAction] = useState<'into' | 'reorder' | null>(null);

  // Get items for a column
  const getColumnItems = (parentValue: string | null): CategoryDef[] => {
    if (parentValue === null) {
      return categories.filter(c => !c.value.includes('/'));
    }
    return categories.filter(c => isDirectChild(c.value, parentValue));
  };

  // Count items for a tag (including subtags)
  const getItemCount = (catValue: string): number => {
    return allItems.filter(
      i => i.category === catValue || (i.category && i.category.startsWith(catValue + '/'))
    ).length;
  };

  // Has children?
  const hasChildren = (catValue: string): boolean => {
    return categories.some(c => isDirectChild(c.value, catValue));
  };

  // Drill into a tag
  const drillInto = (catValue: string) => {
    const currentIdx = columnPath.findIndex(p => {
      const items = getColumnItems(p);
      return items.some(c => c.value === catValue);
    });
    // Trim columns after the one containing this tag, then add the new column
    const newPath = [...columnPath.slice(0, currentIdx + 1), catValue];
    setColumnPath(newPath);
  };

  // Navigate to column
  const navigateToColumn = (colIndex: number) => {
    setColumnPath(prev => prev.slice(0, colIndex + 1));
  };

  // Delete tag
  const handleDeleteTag = (catValue: string) => {
    const cat = categories.find(c => c.value === catValue);
    if (!cat) return;
    const count = getItemCount(catValue);
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

  // Add new tag
  const handleAddNew = (parentValue: string | null) => {
    if (!newTagValue.trim()) {
      setNewTagInput(null);
      setNewTagValue('');
      return;
    }
    const trimmed = newTagValue.trim();
    if (parentValue) {
      const parentCat = categories.find(c => c.value === parentValue);
      const parentLabel = parentCat?.label || parentValue;
      const subValue = `${parentValue}/${trimmed.toLowerCase().replace(/\s+/g, '-')}`;
      const subLabel = `${parentLabel} / ${trimmed}`;
      addCategory(subLabel, subValue);
    } else {
      addCategory(trimmed);
    }
    setNewTagInput(null);
    setNewTagValue('');
  };

  // Promote tag (move to parent's parent, making it a top-level or one level up)
  const promoteTag = (catValue: string) => {
    const segments = catValue.split('/');
    if (segments.length <= 1) return; // Already top level
    const grandParent = segments.length > 2 ? segments.slice(0, -2).join('/') : null;
    reparentTag(catValue, grandParent);
    // Clean up column path if needed
    setColumnPath(prev => prev.filter(p => p !== catValue));
  };

  // Demote tag (make it a subtag of the tag above it in the list)
  const demoteTag = (catValue: string, parentValue: string | null) => {
    const siblings = getColumnItems(parentValue);
    const idx = siblings.findIndex(c => c.value === catValue);
    if (idx <= 0) return; // No sibling above to nest into
    const targetParent = siblings[idx - 1].value;
    // Check depth limit
    if (targetParent.split('/').length >= 4) return;
    reparentTag(catValue, targetParent);
  };

  // Drop handler for drag reparenting
  const handleDrop = (targetValue: string | null) => {
    if (!dragTag || dragTag === targetValue) {
      setDragTag(null);
      setDropTarget(null);
      setDropAction(null);
      return;
    }
    if (targetValue && dropAction === 'into') {
      // Don't allow dropping into itself or its children
      if (targetValue.startsWith(dragTag + '/')) return;
      reparentTag(dragTag, targetValue);
    } else if (dropAction === 'reorder' && targetValue) {
      moveCategory(dragTag, targetValue);
    }
    setDragTag(null);
    setDropTarget(null);
    setDropAction(null);
  };

  if (!open) return null;

  // Build breadcrumb
  const breadcrumbs = columnPath.map((p, i) => {
    if (p === null) return { label: 'All Tags', value: null, index: i };
    const cat = categories.find(c => c.value === p);
    return { label: cat ? getLeafLabel(cat.label) : p, value: p, index: i };
  });

  return (
    <>
      <div className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center">
        <div className="absolute inset-0 bg-black/20 backdrop-blur-[2px]" onClick={onClose} />
        <motion.div
          initial={{ y: '100%', opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: '100%', opacity: 0 }}
          transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
          className="relative bg-card border border-border rounded-t-xl sm:rounded-xl w-full sm:max-w-2xl max-h-[80vh] flex flex-col shadow-lg"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="flex items-center justify-between px-5 py-3 border-b border-border/40">
            <span className="text-[12px] font-mono tracking-[0.14em] text-foreground font-semibold">MANAGE TAGS</span>
            <button onClick={onClose} className="text-muted-foreground hover:text-foreground transition-colors">
              <X size={16} strokeWidth={1.5} />
            </button>
          </div>

          {/* Breadcrumb */}
          <div className="flex items-center gap-1 px-5 py-2 border-b border-border/20 overflow-x-auto">
            {breadcrumbs.map((bc, i) => (
              <div key={bc.index} className="flex items-center gap-1 shrink-0">
                {i > 0 && <ChevronRight size={10} className="text-muted-foreground/30" />}
                <button
                  onClick={() => navigateToColumn(bc.index)}
                  className={`text-[11px] font-mono px-1.5 py-0.5 rounded-sm transition-colors ${
                    i === breadcrumbs.length - 1
                      ? 'text-foreground font-medium'
                      : 'text-muted-foreground/50 hover:text-foreground'
                  }`}
                >
                  {bc.label}
                </button>
              </div>
            ))}
          </div>

          {/* Column view */}
          <div className="flex-1 overflow-hidden flex">
            <div className="flex overflow-x-auto flex-1">
              {columnPath.map((parentValue, colIndex) => {
                const items = getColumnItems(parentValue);
                const isLastColumn = colIndex === columnPath.length - 1;
                const depth = parentValue ? parentValue.split('/').length : 0;
                const canAddSubtag = depth < 4;

                return (
                  <div
                    key={`col-${colIndex}-${parentValue || 'root'}`}
                    className={`flex-shrink-0 border-r border-border/20 flex flex-col ${
                      isLastColumn ? 'flex-1 min-w-[240px]' : 'w-[220px]'
                    }`}
                  >
                    <div className="flex-1 overflow-y-auto py-2 px-2 space-y-0.5">
                      {items.length === 0 && !newTagInput ? (
                        <p className="text-center text-[11px] font-mono text-muted-foreground/30 py-6">
                          {parentValue ? 'No subtags' : 'No tags yet'}
                        </p>
                      ) : (
                        items.map((cat) => {
                          const count = getItemCount(cat.value);
                          const hasSubs = hasChildren(cat.value);
                          const isSelected = columnPath.includes(cat.value);
                          const isDragOver = dropTarget === cat.value;
                          const isDragging = dragTag === cat.value;

                          return (
                            <div
                              key={cat.value}
                              draggable
                              onDragStart={(e) => {
                                setDragTag(cat.value);
                                e.dataTransfer.effectAllowed = 'move';
                              }}
                              onDragEnd={() => {
                                setDragTag(null);
                                setDropTarget(null);
                                setDropAction(null);
                              }}
                              onDragOver={(e) => {
                                e.preventDefault();
                                if (dragTag && dragTag !== cat.value) {
                                  setDropTarget(cat.value);
                                  // Hold over = nest into; quick pass = reorder
                                  setDropAction('into');
                                }
                              }}
                              onDragLeave={() => {
                                if (dropTarget === cat.value) {
                                  setDropTarget(null);
                                  setDropAction(null);
                                }
                              }}
                              onDrop={(e) => {
                                e.preventDefault();
                                handleDrop(cat.value);
                              }}
                              className={`group flex items-center gap-2 px-2.5 py-2 rounded-md cursor-pointer select-none transition-all duration-100 ${
                                isSelected
                                  ? 'bg-primary/8 text-foreground'
                                  : 'hover:bg-muted/40 text-foreground/80'
                              } ${isDragOver ? 'ring-1 ring-primary/40 bg-primary/5' : ''} ${
                                isDragging ? 'opacity-40' : ''
                              }`}
                              onClick={() => {
                                if (hasSubs || canAddSubtag) drillInto(cat.value);
                              }}
                            >
                              <GripVertical
                                size={12}
                                className="text-muted-foreground/20 shrink-0 cursor-grab opacity-0 group-hover:opacity-100 transition-opacity"
                              />
                              <Tag size={11} className="text-muted-foreground/30 shrink-0" />

                              {editingTag === cat.value ? (
                                <input
                                  autoFocus
                                  value={editingLabel}
                                  onChange={(e) => setEditingLabel(e.target.value)}
                                  onKeyDown={(e) => {
                                    if (e.key === 'Enter') {
                                      if (editingLabel.trim()) renameCategory(cat.value, editingLabel.trim());
                                      setEditingTag(null);
                                    }
                                    if (e.key === 'Escape') setEditingTag(null);
                                  }}
                                  onBlur={() => {
                                    if (editingLabel.trim()) renameCategory(cat.value, editingLabel.trim());
                                    setEditingTag(null);
                                  }}
                                  onClick={(e) => e.stopPropagation()}
                                  className="flex-1 font-mono text-[12px] text-foreground bg-transparent border-b border-primary/40 focus:outline-none py-0.5 min-w-0"
                                />
                              ) : (
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setEditingTag(cat.value);
                                    setEditingLabel(getLeafLabel(cat.label));
                                  }}
                                  className="flex-1 text-left font-mono text-[12px] hover:text-primary transition-colors truncate min-w-0"
                                >
                                  {getLeafLabel(cat.label)}
                                </button>
                              )}

                              <span className="text-[10px] font-mono text-muted-foreground/30 shrink-0 tabular-nums">
                                {count}
                              </span>

                              {/* Action buttons - visible on hover */}
                              <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                                {/* Promote (move up one level) */}
                                {parentValue && (
                                  <button
                                    onClick={(e) => { e.stopPropagation(); promoteTag(cat.value); }}
                                    className="p-1 text-muted-foreground/30 hover:text-foreground transition-colors"
                                    title="Promote to parent level"
                                  >
                                    <ArrowUpRight size={12} />
                                  </button>
                                )}
                                {/* Demote (nest into sibling above) */}
                                {items.indexOf(cat) > 0 && cat.value.split('/').length < 4 && (
                                  <button
                                    onClick={(e) => { e.stopPropagation(); demoteTag(cat.value, parentValue); }}
                                    className="p-1 text-muted-foreground/30 hover:text-foreground transition-colors"
                                    title="Nest into tag above"
                                  >
                                    <ArrowDownLeft size={12} />
                                  </button>
                                )}
                                <button
                                  onClick={(e) => { e.stopPropagation(); handleDeleteTag(cat.value); }}
                                  className="p-1 text-muted-foreground/30 hover:text-destructive transition-colors"
                                >
                                  <Trash2 size={12} />
                                </button>
                              </div>

                              {(hasSubs || canAddSubtag) && (
                                <ChevronRight size={12} className={`shrink-0 transition-colors ${
                                  isSelected ? 'text-foreground/50' : 'text-muted-foreground/20'
                                }`} />
                              )}
                            </div>
                          );
                        })
                      )}

                      {/* New tag input */}
                      {newTagInput && newTagInput.columnParent === parentValue ? (
                        <div className="px-2.5 py-1.5">
                          <input
                            autoFocus
                            value={newTagValue}
                            onChange={(e) => setNewTagValue(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') handleAddNew(parentValue);
                              if (e.key === 'Escape') { setNewTagInput(null); setNewTagValue(''); }
                            }}
                            onBlur={() => handleAddNew(parentValue)}
                            placeholder={parentValue ? 'New subtag…' : 'New tag…'}
                            className="w-full bg-transparent text-[12px] font-mono text-foreground placeholder:text-muted-foreground/30 focus:outline-none border-b border-primary/30 py-1"
                          />
                        </div>
                      ) : (
                        <button
                          onClick={() => { setNewTagInput({ columnParent: parentValue }); setNewTagValue(''); }}
                          className="w-full text-left px-2.5 py-2 text-[11px] font-mono text-primary/50 hover:text-primary flex items-center gap-1.5 rounded-md hover:bg-muted/30 transition-colors"
                        >
                          <Plus size={11} />
                          {parentValue ? 'Add subtag' : 'New tag'}
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Hint */}
          <div className="px-5 py-2.5 border-t border-border/20">
            <p className="text-[10px] font-mono text-muted-foreground/30 text-center">
              Click tag to drill in · Drag to reorder · ↗ promote · ↙ nest · Drop onto tag to make subtag
            </p>
          </div>
        </motion.div>
      </div>

      {/* Delete confirmation */}
      <Dialog open={!!deletingTag} onOpenChange={(o) => { if (!o) setDeletingTag(null); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="font-mono text-[14px]">Delete "{deletingTag?.label}"?</DialogTitle>
            <DialogDescription className="font-mono text-[12px]">
              {deletingTag?.count} item{deletingTag?.count !== 1 ? 's' : ''} use{deletingTag?.count === 1 ? 's' : ''} this tag. They will be set to uncategorized.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2">
            <Button variant="outline" size="sm" onClick={() => setDeletingTag(null)} className="font-mono text-[11px]">
              Cancel
            </Button>
            <Button variant="destructive" size="sm" onClick={confirmDeleteTag} className="font-mono text-[11px]">
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
