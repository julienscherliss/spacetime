import { useState, useEffect, useRef } from 'react';
import { useLibraryStore, CategoryDef } from '@/store/libraryStore';

interface TagAutocompleteProps {
  inputValue: string;
  onSelectTag: (category: CategoryDef, cleanedValue: string) => void;
  onSubmitAfterSelect?: () => void;
  inputRef?: React.RefObject<HTMLInputElement>;
  anchorRef?: React.RefObject<HTMLElement>;
}

export function TagAutocomplete({ inputValue, onSelectTag, onSubmitAfterSelect, inputRef }: TagAutocompleteProps) {
  const categories = useLibraryStore((s) => s.categories);
  const [suggestions, setSuggestions] = useState<CategoryDef[]>([]);
  const [selectedIdx, setSelectedIdx] = useState(0);

  // Detect #tag or #tag/subtag pattern
  useEffect(() => {
    // Match #parent/subtag (subtag mode)
    const subMatch = inputValue.match(/#([^/\s]+)\/(\S*)$/);
    // Match #tag (tag mode)
    const match = inputValue.match(/#(\S*)$/);

    if (subMatch) {
      const parentQuery = subMatch[1].toLowerCase();
      const subQuery = subMatch[2].toLowerCase();
      
      // Find parent tag
      const parent = categories.find(c =>
        c.label.toLowerCase() === parentQuery || c.value === parentQuery
      );

      if (parent) {
        // Show existing subtags of this parent
        const subtags = categories.filter(c => isSubtagOf(c.value, parent.value));
        const filtered = subQuery
          ? subtags.filter(c =>
              getSubtagLabel(c.label).toLowerCase().includes(subQuery) ||
              c.value.split('/').pop()?.includes(subQuery)
            )
          : subtags;

        // Add "create new" option if query doesn't match existing
        if (subQuery && !filtered.some(c => getSubtagLabel(c.label).toLowerCase() === subQuery)) {
          const newValue = `${parent.value}/${subQuery.replace(/\s+/g, '-')}`;
          const newLabel = `${parent.label} / ${subQuery.charAt(0).toUpperCase() + subQuery.slice(1)}`;
          filtered.push({ value: newValue, label: newLabel });
        }

        setSuggestions(filtered.slice(0, 6));
        setSelectedIdx(0);
        return;
      }

      // Parent not found — offer to create both
      if (parentQuery) {
        const newParentValue = parentQuery.replace(/\s+/g, '-');
        const newSubValue = subQuery ? `${newParentValue}/${subQuery.replace(/\s+/g, '-')}` : newParentValue;
        const newSubLabel = subQuery
          ? `${parentQuery.charAt(0).toUpperCase() + parentQuery.slice(1)} / ${subQuery.charAt(0).toUpperCase() + subQuery.slice(1)}`
          : parentQuery.charAt(0).toUpperCase() + parentQuery.slice(1);
        setSuggestions([{ value: newSubValue, label: newSubLabel }]);
        setSelectedIdx(0);
        return;
      }

      setSuggestions([]);
    } else if (match) {
      const query = match[1].toLowerCase();
      // Don't show suggestions if we're mid-slash (handled above)
      if (query.includes('/')) {
        setSuggestions([]);
        return;
      }
      const filtered = query
        ? categories.filter((c) =>
            (c.label.toLowerCase().includes(query) || c.value.includes(query)) &&
            !c.value.includes('/')  // Only show top-level tags in # mode
          )
        : categories.filter(c => !c.value.includes('/'));  // Only top-level
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
      } else if (e.key === ' ' || e.key === 'Tab' || (e.key === 'Enter' && suggestions.length > 0)) {
        const tagMatch = inputValue.match(/#\S*$/);
        if (tagMatch && suggestions[selectedIdx]) {
          e.preventDefault();
          const cleaned = inputValue.replace(/#\S*$/, '').trim();
          onSelectTag(suggestions[selectedIdx], cleaned);
          setSuggestions([]);
          if (e.key === 'Enter' && onSubmitAfterSelect) {
            // Small delay so state updates before submit
            setTimeout(() => onSubmitAfterSelect(), 0);
          }
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
          <span className="text-primary/50">#</span>
          {cat.value.includes('/') ? (
            <>
              <span className="text-muted-foreground/40">{getParentLabel(cat.label)} / </span>
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

/** Extract parent part from "Parent / Subtag" label */
function getParentLabel(label: string): string {
  const parts = label.split(' / ');
  return parts[0] || label;
}

/** Extract subtag part from "Parent / Subtag" label */
function getSubtagLabel(label: string): string {
  const parts = label.split(' / ');
  return parts.length > 1 ? parts.slice(1).join(' / ') : label;
}

/** Check if a category value is a subtag of a parent value */
export function isSubtagOf(childValue: string, parentValue: string): boolean {
  return childValue.startsWith(parentValue + '/');
}

/** Get parent value from a subtag value */
export function getParentValue(value: string): string | null {
  const idx = value.indexOf('/');
  if (idx === -1) return null;
  return value.substring(0, idx);
}

/** Check if a value is a parent tag (has subtags) */
export function hasSubtags(value: string, categories: CategoryDef[]): boolean {
  return categories.some(c => isSubtagOf(c.value, value));
}
