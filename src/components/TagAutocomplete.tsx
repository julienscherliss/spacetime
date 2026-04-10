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

  // Detect #tag or ##subtag pattern
  useEffect(() => {
    // Match ##subtag (subtag of current parent) or #tag
    const subMatch = inputValue.match(/##(\S*)$/);
    const match = inputValue.match(/#(\S*)$/);

    if (subMatch) {
      // Subtag mode: show categories that are subtags (contain --)
      // or suggest creating a new subtag under a parent
      const query = subMatch[1].toLowerCase();
      // Find parent tag from the existing category in the input context
      const parentMatch = inputValue.match(/#(\S+)##/);
      if (parentMatch) {
        const parentQuery = parentMatch[1].toLowerCase();
        const parent = categories.find(c => 
          c.label.toLowerCase() === parentQuery || c.value === parentQuery
        );
        if (parent) {
          // Show existing subtags of this parent
          const subtags = categories.filter(c => c.value.startsWith(parent.value + '--'));
          const filtered = query
            ? subtags.filter(c => c.label.toLowerCase().includes(query) || c.value.includes(query))
            : subtags;
          
          // Add "create new" option
          if (query && !filtered.some(c => getSubtagLabel(c.label).toLowerCase() === query)) {
            const newValue = `${parent.value}--${query.replace(/\s+/g, '-')}`;
            const newLabel = `${parent.label} – ${query.charAt(0).toUpperCase() + query.slice(1)}`;
            filtered.push({ value: newValue, label: newLabel });
          }
          
          setSuggestions(filtered.slice(0, 6));
          setSelectedIdx(0);
          return;
        }
      }
      setSuggestions([]);
    } else if (match) {
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
        // Check if we're in subtag mode or tag mode
        const subMatch = inputValue.match(/#\S+##\S*$/);
        const tagMatch = inputValue.match(/#\S*$/);
        if ((subMatch || tagMatch) && suggestions[selectedIdx]) {
          e.preventDefault();
          const cleaned = inputValue.replace(/#\S*(?:##\S*)?$/, '').trim();
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
            const cleaned = inputValue.replace(/#\S*(?:##\S*)?$/, '').trim();
            onSelectTag(cat, cleaned);
          }}
          className={`w-full text-left px-3 py-2 text-[12px] font-mono tracking-wider transition-colors ${
            i === selectedIdx
              ? 'bg-muted/50 text-foreground'
              : 'text-muted-foreground/70 hover:bg-muted/30 hover:text-foreground'
          }`}
        >
          <span className="text-primary/50">#</span>
          {cat.value.includes('--') ? (
            <>
              <span className="text-muted-foreground/40">{getParentLabel(cat.label)} – </span>
              {getSubtagLabel(cat.label)}
            </>
          ) : (
            cat.label
          )}
        </button>
      ))}
    </div>
  );
}

/** Extract parent part from "Parent – Subtag" label */
function getParentLabel(label: string): string {
  const parts = label.split(' – ');
  return parts[0] || label;
}

/** Extract subtag part from "Parent – Subtag" label */
function getSubtagLabel(label: string): string {
  const parts = label.split(' – ');
  return parts.length > 1 ? parts.slice(1).join(' – ') : label;
}

/** Check if a category value is a subtag of a parent value */
export function isSubtagOf(childValue: string, parentValue: string): boolean {
  return childValue.startsWith(parentValue + '--');
}

/** Get parent value from a subtag value */
export function getParentValue(value: string): string | null {
  const idx = value.indexOf('--');
  if (idx === -1) return null;
  return value.substring(0, idx);
}

/** Check if a value is a parent tag (has subtags) */
export function hasSubtags(value: string, categories: CategoryDef[]): boolean {
  return categories.some(c => isSubtagOf(c.value, value));
}
