import { useState } from 'react';
import { useLibraryStore } from '@/store/libraryStore';
import { isSubtagOf } from '@/components/TagAutocomplete';
import { Plus, ChevronRight, ArrowLeft } from 'lucide-react';

interface TagPickerMenuProps {
  value: string;
  onChange: (value: string) => void;
  onClose: () => void;
  showNewOption?: boolean;
}

/**
 * Reusable tag picker with subtag drilldown.
 * Shows only top-level tags. Clicking a tag with a `>` icon drills into its subtags.
 * Back button returns to the top-level list. Always shows an "Add subtag" option in drilldown.
 */
export function TagPickerMenu({ value, onChange, onClose, showNewOption = true }: TagPickerMenuProps) {
  const categories = useLibraryStore((s) => s.categories);
  const addCategory = useLibraryStore((s) => s.addCategory);
  const [drillParent, setDrillParent] = useState<string | null>(null);
  const [newInput, setNewInput] = useState('');
  const [showNewInput, setShowNewInput] = useState(false);

  const topLevel = categories.filter(c => !c.value.includes('/'));

  const handleAddNew = () => {
    if (!newInput.trim()) { setShowNewInput(false); return; }
    const trimmed = newInput.trim();
    if (drillParent) {
      // Adding a subtag
      const parentCat = categories.find(c => c.value === drillParent);
      const parentLabel = parentCat?.label || drillParent;
      const subValue = `${drillParent}/${trimmed.toLowerCase().replace(/\s+/g, '-')}`;
      const subLabel = `${parentLabel} / ${trimmed}`;
      addCategory(subLabel, subValue);
      onChange(subValue);
    } else {
      // Adding a top-level tag
      addCategory(trimmed);
      onChange(trimmed.toLowerCase().replace(/\s+/g, '-'));
    }
    setNewInput('');
    setShowNewInput(false);
    onClose();
  };

  // Drilldown into a parent tag's subtags
  if (drillParent) {
    const parentCat = categories.find(c => c.value === drillParent);
    const subtags = categories.filter(c => isSubtagOf(c.value, drillParent));

    return (
      <div>
        {/* Back button */}
        <button
          onClick={() => setDrillParent(null)}
          className="w-full text-left px-3 py-2 text-[11px] font-mono rounded-sm text-muted-foreground/60 hover:text-foreground hover:bg-muted/30 flex items-center gap-1.5"
        >
          <ArrowLeft size={10} /> Back
        </button>

        {/* Parent tag itself */}
        <button
          onClick={() => { onChange(drillParent); onClose(); }}
          className={`w-full text-left px-3 py-2 text-[11px] font-mono rounded-sm font-medium ${
            value === drillParent ? 'text-foreground bg-muted/50' : 'text-foreground/80 hover:bg-muted/30'
          }`}
        >
          {parentCat?.label || drillParent}
        </button>

        {/* Subtags */}
        {subtags.map((sub) => {
          const subLabel = sub.label.includes(' / ') ? sub.label.split(' / ').slice(1).join(' / ') : sub.label;
          return (
            <button
              key={sub.value}
              onClick={() => { onChange(sub.value); onClose(); }}
              className={`w-full text-left px-3 py-2 pl-6 text-[11px] font-mono rounded-sm ${
                value === sub.value ? 'text-foreground bg-muted/50' : 'text-muted-foreground/60 hover:text-foreground hover:bg-muted/30'
              }`}
            >
              {subLabel}
            </button>
          );
        })}

        {/* Add subtag */}
        <div className="border-t border-border/30 mt-1 pt-1">
          {showNewInput ? (
            <div className="px-3 py-1.5">
              <input
                value={newInput}
                onChange={(e) => setNewInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') handleAddNew(); if (e.key === 'Escape') setShowNewInput(false); }}
                onBlur={handleAddNew}
                placeholder="New subtag…"
                className="w-full bg-transparent text-[11px] font-mono text-foreground placeholder:text-muted-foreground/30 focus:outline-none border-b border-primary/30"
                autoFocus
              />
            </div>
          ) : (
            <button
              onClick={() => setShowNewInput(true)}
              className="w-full text-left px-3 py-2 text-[11px] font-mono text-primary/60 hover:text-primary flex items-center gap-1.5"
            >
              <Plus size={10} /> Add subtag…
            </button>
          )}
        </div>
      </div>
    );
  }

  // Top-level view
  return (
    <div>
      <button
        onClick={() => { onChange(''); onClose(); }}
        className={`w-full text-left px-3 py-2 text-[11px] font-mono rounded-sm ${!value ? 'text-foreground bg-muted/50' : 'text-muted-foreground/60 hover:text-foreground hover:bg-muted/30'}`}
      >
        No tag
      </button>
      {topLevel.map((cat) => (
        <button
          key={cat.value}
          onClick={() => { onChange(cat.value); onClose(); }}
          className={`w-full text-left px-3 py-2 text-[11px] font-mono rounded-sm flex items-center justify-between ${
            value === cat.value ? 'text-foreground bg-muted/50' : 'text-muted-foreground/60 hover:text-foreground hover:bg-muted/30'
          }`}
        >
          <span>{cat.label}</span>
          <button
            onClick={(e) => { e.stopPropagation(); setDrillParent(cat.value); }}
            className="p-0.5 text-muted-foreground/30 hover:text-foreground"
          >
            <ChevronRight size={12} />
          </button>
        </button>
      ))}
      {showNewOption && (
        <div className="border-t border-border/30 mt-1 pt-1">
          {showNewInput ? (
            <div className="px-3 py-1.5">
              <input
                value={newInput}
                onChange={(e) => setNewInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') handleAddNew(); if (e.key === 'Escape') setShowNewInput(false); }}
                onBlur={handleAddNew}
                placeholder="New tag…"
                className="w-full bg-transparent text-[11px] font-mono text-foreground placeholder:text-muted-foreground/30 focus:outline-none border-b border-primary/30"
                autoFocus
              />
            </div>
          ) : (
            <button
              onClick={() => setShowNewInput(true)}
              className="w-full text-left px-3 py-2 text-[11px] font-mono text-primary/60 hover:text-primary flex items-center gap-1.5"
            >
              <Plus size={10} /> New…
            </button>
          )}
        </div>
      )}
    </div>
  );
}
