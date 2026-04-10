import { useState } from 'react';
import { useLibraryStore } from '@/store/libraryStore';
import { Plus, ChevronRight, ArrowLeft } from 'lucide-react';

/** Check if child is a DIRECT subtag of parent (one level only) */
function isDirectChild(childValue: string, parentValue: string): boolean {
  if (!childValue.startsWith(parentValue + '/')) return false;
  const remainder = childValue.slice(parentValue.length + 1);
  return !remainder.includes('/');
}

/** Check if any category is a direct child of parentValue */
function hasDirectChildren(parentValue: string, categories: { value: string }[]): boolean {
  return categories.some(c => isDirectChild(c.value, parentValue));
}

/** Get display label for a tag at the current drill level */
function getLastSegment(label: string): string {
  const parts = label.split(' / ');
  return parts[parts.length - 1] || label;
}

interface TagPickerMenuProps {
  value: string;
  onChange: (value: string) => void;
  onClose: () => void;
  showNewOption?: boolean;
}

export function TagPickerMenu({ value, onChange, onClose, showNewOption = true }: TagPickerMenuProps) {
  const categories = useLibraryStore((s) => s.categories);
  const addCategory = useLibraryStore((s) => s.addCategory);
  // Breadcrumb trail for drilling into subtags
  const [drillPath, setDrillPath] = useState<string[]>([]);
  const [newInput, setNewInput] = useState('');
  const [showNewInput, setShowNewInput] = useState(false);

  const currentParent = drillPath.length > 0 ? drillPath[drillPath.length - 1] : null;

  // Get items to display at current level
  const visibleItems = currentParent
    ? categories.filter(c => isDirectChild(c.value, currentParent))
    : categories.filter(c => !c.value.includes('/'));

  const handleAddNew = () => {
    if (!newInput.trim()) { setShowNewInput(false); return; }
    const trimmed = newInput.trim();
    if (currentParent) {
      const parentCat = categories.find(c => c.value === currentParent);
      const parentLabel = parentCat?.label || currentParent;
      const subValue = `${currentParent}/${trimmed.toLowerCase().replace(/\s+/g, '-')}`;
      const subLabel = `${parentLabel} / ${trimmed}`;
      addCategory(subLabel, subValue);
      onChange(subValue);
    } else {
      addCategory(trimmed);
      onChange(trimmed.toLowerCase().replace(/\s+/g, '-'));
    }
    setNewInput('');
    setShowNewInput(false);
    onClose();
  };

  const goBack = () => {
    setDrillPath(prev => prev.slice(0, -1));
    setShowNewInput(false);
  };

  const drillInto = (catValue: string) => {
    setDrillPath(prev => [...prev, catValue]);
    setShowNewInput(false);
  };

  // Check depth limit (max 3 levels of subtags means max depth = 3 slashes)
  const currentDepth = currentParent ? currentParent.split('/').length : 0;
  const canDrillDeeper = currentDepth < 3;

  return (
    <div>
      {/* Back button when drilled in */}
      {currentParent && (
        <button
          onClick={goBack}
          className="w-full text-left px-3 py-2 text-[11px] font-mono rounded-sm text-muted-foreground/60 hover:text-foreground hover:bg-muted/30 flex items-center gap-1.5"
        >
          <ArrowLeft size={10} /> Back
        </button>
      )}

      {/* Current parent as a selectable option when drilled in */}
      {currentParent && (
        <button
          onClick={() => { onChange(currentParent); onClose(); }}
          className={`w-full text-left px-3 py-2 text-[11px] font-mono rounded-sm font-medium ${
            value === currentParent ? 'text-foreground bg-muted/50' : 'text-foreground/80 hover:bg-muted/30'
          }`}
        >
          {categories.find(c => c.value === currentParent)?.label || currentParent}
        </button>
      )}

      {/* "No tag" option only at top level */}
      {!currentParent && (
        <button
          onClick={() => { onChange(''); onClose(); }}
          className={`w-full text-left px-3 py-2 text-[11px] font-mono rounded-sm ${!value ? 'text-foreground bg-muted/50' : 'text-muted-foreground/60 hover:text-foreground hover:bg-muted/30'}`}
        >
          No tag
        </button>
      )}

      {/* Items at this level */}
      {visibleItems.map((cat) => {
        const label = currentParent ? getLastSegment(cat.label) : cat.label;
        const hasChildren = hasDirectChildren(cat.value, categories);
        const canShowChevron = canDrillDeeper || hasChildren;

        return (
          <button
            key={cat.value}
            onClick={() => { onChange(cat.value); onClose(); }}
            className={`w-full text-left px-3 py-2 ${currentParent ? 'pl-5' : ''} text-[11px] font-mono rounded-sm flex items-center justify-between ${
              value === cat.value ? 'text-foreground bg-muted/50' : 'text-muted-foreground/60 hover:text-foreground hover:bg-muted/30'
            }`}
          >
            <span>{label}</span>
            {canShowChevron && (
              <button
                onClick={(e) => { e.stopPropagation(); drillInto(cat.value); }}
                className="p-0.5 text-muted-foreground/30 hover:text-foreground"
              >
                <ChevronRight size={12} />
              </button>
            )}
          </button>
        );
      })}

      {/* Add new option */}
      {(showNewOption || currentParent) && (
        <div className="border-t border-border/30 mt-1 pt-1">
          {showNewInput ? (
            <div className="px-3 py-1.5">
              <input
                value={newInput}
                onChange={(e) => setNewInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') handleAddNew(); if (e.key === 'Escape') setShowNewInput(false); }}
                onBlur={handleAddNew}
                placeholder={currentParent ? 'New subtag…' : 'New tag…'}
                className="w-full bg-transparent text-[11px] font-mono text-foreground placeholder:text-muted-foreground/30 focus:outline-none border-b border-primary/30"
                autoFocus
              />
            </div>
          ) : (
            <button
              onClick={() => setShowNewInput(true)}
              className="w-full text-left px-3 py-2 text-[11px] font-mono text-primary/60 hover:text-primary flex items-center gap-1.5"
            >
              <Plus size={10} /> {currentParent ? 'Add subtag…' : 'New…'}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
