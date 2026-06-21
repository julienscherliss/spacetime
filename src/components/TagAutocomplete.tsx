import { useState, useEffect, useMemo, useRef } from 'react';
import { useLibraryStore, CategoryDef } from '@/store/libraryStore';

interface TagAutocompleteProps {
  inputValue: string;
  onSelectTag: (category: CategoryDef, cleanedValue: string) => void;
  onSubmitAfterSelect?: () => void;
  inputRef?: React.RefObject<HTMLInputElement>;
  anchorRef?: React.RefObject<HTMLElement>;
}

export function TagAutocomplete({ inputValue, onSelectTag, onSubmitAfterSelect, inputRef }: TagAutocompleteProps) {
  const allCategories = useLibraryStore((s) => s.categories);
  // Memoize so the effect below doesn't see a new array on every render and
  // re-trigger setState → infinite update loop (would also wipe out parent
  // edit panels that listen for state changes).
  const categories = useMemo(
    () => allCategories.filter((c) => !c.archived),
    [allCategories],
  );
  const [suggestions, setSuggestions] = useState<CategoryDef[]>([]);
  const [selectedIdx, setSelectedIdx] = useState(0);

  // Detect #tag, #tag/subtag, #tag/sub/sub, or //subtag patterns
  useEffect(() => {
    // Check for // shortcut first — searches all subtags across all parents
    const doubleSlashMatch = inputValue.match(/\/\/(\S*)$/);
    if (doubleSlashMatch) {
      const subQuery = doubleSlashMatch[1].toLowerCase();
      if (!subQuery) {
        // Show all subtags (categories with /)
        const allSubtags = categories.filter(c => c.value.includes('/'));
        setSuggestions(allSubtags.slice(0, 6));
        setSelectedIdx(0);
        return;
      }
      // Filter all categories (including subtags) by the query matching last segment
      const filtered = categories.filter(c => {
        const lastSegmentValue = c.value.split('/').pop() || '';
        const lastSegmentLabel = c.label.split(' / ').pop()?.toLowerCase() || '';
        return lastSegmentValue.includes(subQuery) || lastSegmentLabel.includes(subQuery);
      });
      setSuggestions(filtered.slice(0, 6));
      setSelectedIdx(0);
      return;
    }

    const hashMatch = inputValue.match(/#(\S*)$/);
    if (!hashMatch) {
      setSuggestions([]);
      return;
    }

    const fullQuery = hashMatch[1].toLowerCase();

    if (fullQuery.includes('/')) {
      // Subtag mode: everything before last / is parent path, after is the query
      const lastSlash = fullQuery.lastIndexOf('/');
      const parentPath = fullQuery.substring(0, lastSlash);
      const subQuery = fullQuery.substring(lastSlash + 1);

      // Resolve parent: try exact value match, then label match for each segment
      const resolveParent = () => {
        // Try exact value match first
        const exact = categories.find(c => c.value === parentPath);
        if (exact) return exact;
        // Try building path segment by segment
        const segments = parentPath.split('/');
        let currentValue = '';
        for (const seg of segments) {
          const candidates = categories.filter(c =>
            currentValue
              ? c.value.startsWith(currentValue + '/') && !c.value.substring(currentValue.length + 1).includes('/')
              : !c.value.includes('/')
          );
          const match = candidates.find(c =>
            c.value === (currentValue ? `${currentValue}/${seg}` : seg) ||
            c.label.toLowerCase().split(' / ').pop() === seg
          );
          if (!match) return null;
          currentValue = match.value;
        }
        return categories.find(c => c.value === currentValue) || null;
      };

      const parent = resolveParent();

      if (parent) {
        // Show direct children of this parent
        const directChildren = categories.filter(c => {
          if (!c.value.startsWith(parent.value + '/')) return false;
          const remainder = c.value.slice(parent.value.length + 1);
          return !remainder.includes('/');
        });
        const filtered = subQuery
          ? directChildren.filter(c =>
              c.label.split(' / ').pop()?.toLowerCase().includes(subQuery) ||
              c.value.split('/').pop()?.includes(subQuery)
            )
          : directChildren;

        // Check depth (max 3 levels of subtags)
        const depth = parent.value.split('/').length;
        if (subQuery && depth < 3 && !filtered.some(c => c.value.split('/').pop() === subQuery)) {
          const newValue = `${parent.value}/${subQuery.replace(/\s+/g, '-')}`;
          const parts = parent.label.split(' / ');
          parts.push(subQuery.charAt(0).toUpperCase() + subQuery.slice(1));
          filtered.push({ value: newValue, label: parts.join(' / ') });
        }

        setSuggestions(filtered.slice(0, 6));
        setSelectedIdx(0);
        return;
      }

      // Parent path not found — offer to create the full path
      if (parentPath) {
        const segments = fullQuery.split('/').filter(Boolean);
        const newValue = segments.map(s => s.replace(/\s+/g, '-')).join('/');
        const newLabel = segments.map(s => s.charAt(0).toUpperCase() + s.slice(1)).join(' / ');
        setSuggestions([{ value: newValue, label: newLabel }]);
        setSelectedIdx(0);
        return;
      }

      setSuggestions([]);
    } else {
      // Simple #tag mode — only top-level tags
      const filtered = fullQuery
        ? categories.filter((c) =>
            (c.label.toLowerCase().includes(fullQuery) || c.value.includes(fullQuery)) &&
            !c.value.includes('/')
          )
        : categories.filter(c => !c.value.includes('/'));
      setSuggestions(filtered.slice(0, 6));
      setSelectedIdx(0);
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
        const tagMatch = inputValue.match(/#\S*$/) || inputValue.match(/\/\/\S*$/);
        if (tagMatch && suggestions[selectedIdx]) {
          e.preventDefault();
          e.stopPropagation();
          // Stop React's delegated onKeyDown (e.g. parent's Enter → submit) from
          // also firing for this same key — otherwise selecting a tag with Enter
          // both inserts the tag AND submits the form, creating a duplicate task.
          (e as any).stopImmediatePropagation?.();
          const cleaned = inputValue.replace(/#\S*$/, '').replace(/\/\/\S*$/, '').trim();
          onSelectTag(suggestions[selectedIdx], cleaned);
          setSuggestions([]);
          if (e.key === 'Enter' && onSubmitAfterSelect) {
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
    <div data-tag-autocomplete className="absolute left-0 right-0 top-full mt-1 z-[60] bg-card border border-border rounded-md shadow-lg py-1 max-h-48 overflow-y-auto">
      {suggestions.map((cat, i) => (
        <button
          key={cat.value}
          onPointerDown={(e) => {
            e.preventDefault(); // prevent blur
            const cleaned = inputValue.replace(/#\S*$/, '').replace(/\/\/\S*$/, '').trim();
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
