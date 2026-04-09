import { useState, useEffect, useRef } from 'react';
import { useLibraryStore, CategoryDef } from '@/store/libraryStore';

interface TagAutocompleteProps {
  inputValue: string;
  onSelectTag: (category: CategoryDef, cleanedValue: string) => void;
  inputRef?: React.RefObject<HTMLInputElement>;
  anchorRef?: React.RefObject<HTMLElement>;
}

export function TagAutocomplete({ inputValue, onSelectTag, inputRef }: TagAutocompleteProps) {
  const categories = useLibraryStore((s) => s.categories);
  const [suggestions, setSuggestions] = useState<CategoryDef[]>([]);
  const [selectedIdx, setSelectedIdx] = useState(0);

  // Detect #tag pattern
  useEffect(() => {
    const match = inputValue.match(/#(\S*)$/);
    if (match) {
      const query = match[1].toLowerCase();
      const filtered = query
        ? categories.filter((c) => c.label.toLowerCase().includes(query) || c.value.includes(query))
        : categories;
      setSuggestions(filtered.slice(0, 6));
      setSelectedIdx(0);
    } else {
      setSuggestions([]);
    }
  }, [inputValue, categories]);

  // Handle keyboard nav
  useEffect(() => {
    if (suggestions.length === 0) return;
    const el = inputRef?.current;
    if (!el) return;

    const handler = (e: KeyboardEvent) => {
      if (suggestions.length === 0) return;
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSelectedIdx((i) => Math.min(i + 1, suggestions.length - 1));
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSelectedIdx((i) => Math.max(i - 1, 0));
      } else if (e.key === 'Tab' || (e.key === 'Enter' && suggestions.length > 0)) {
        const match = inputValue.match(/#(\S*)$/);
        if (match && suggestions[selectedIdx]) {
          e.preventDefault();
          const cleaned = inputValue.replace(/#\S*$/, '').trim();
          onSelectTag(suggestions[selectedIdx], cleaned);
          setSuggestions([]);
        }
      } else if (e.key === 'Escape') {
        setSuggestions([]);
      }
    };
    el.addEventListener('keydown', handler);
    return () => el.removeEventListener('keydown', handler);
  }, [suggestions, selectedIdx, inputValue, onSelectTag, inputRef]);

  if (suggestions.length === 0) return null;

  return (
    <div className="absolute left-0 right-0 top-full mt-1 z-[60] bg-card border border-border rounded-md shadow-lg py-1 max-h-48 overflow-y-auto">
      {suggestions.map((cat, i) => (
        <button
          key={cat.value}
          onPointerDown={(e) => {
            e.preventDefault(); // prevent blur
            const cleaned = inputValue.replace(/#\S*$/, '').trim();
            onSelectTag(cat, cleaned);
          }}
          className={`w-full text-left px-3 py-2 text-[12px] font-mono tracking-wider transition-colors ${
            i === selectedIdx
              ? 'bg-muted/50 text-foreground'
              : 'text-muted-foreground/70 hover:bg-muted/30 hover:text-foreground'
          }`}
        >
          <span className="text-primary/50">#</span>{cat.label}
        </button>
      ))}
    </div>
  );
}
