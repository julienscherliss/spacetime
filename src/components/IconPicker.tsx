import { useMemo, useState } from 'react';
import { Search, X, type LucideIcon } from 'lucide-react';
import { ICON_LIBRARY, searchIcons, suggestIcons, getIconByName } from '@/lib/iconLibrary';

interface IconPickerProps {
  /** Currently selected icon name, or empty/undefined for "no icon / inherit". */
  value?: string | null;
  /** Free-form context (task title, tag label) used to seed suggestions. */
  suggestFor?: string;
  /** Label shown for the "clear" option. e.g. "No icon" or "Inherit from tag". */
  clearLabel?: string;
  onChange: (iconName: string | null) => void;
  onClose?: () => void;
}

export function IconPicker({
  value,
  suggestFor = '',
  clearLabel = 'No icon',
  onChange,
  onClose,
}: IconPickerProps) {
  const [query, setQuery] = useState('');

  const suggestions = useMemo(
    () => (query.trim() ? [] : suggestIcons(suggestFor, 6)),
    [suggestFor, query]
  );

  const results = useMemo(() => {
    if (query.trim()) return searchIcons(query, 200);
    // No query: show full library minus suggestion duplicates
    const sugNames = new Set(suggestions.map(s => s.name));
    return ICON_LIBRARY.filter(e => !sugNames.has(e.name));
  }, [query, suggestions]);

  const pick = (name: string | null) => {
    onChange(name);
    onClose?.();
  };

  return (
    <div className="w-[280px] flex flex-col" onClick={(e) => e.stopPropagation()}>
      {/* Search */}
      <div className="flex items-center gap-2 px-2 py-1.5 border-b border-border/40">
        <Search size={11} strokeWidth={1.5} className="text-muted-foreground/50 shrink-0" />
        <input
          autoFocus
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search icons…"
          className="flex-1 bg-transparent text-[11px] font-mono text-foreground placeholder:text-muted-foreground/30 focus:outline-none"
        />
        {query && (
          <button
            type="button"
            onClick={() => setQuery('')}
            className="text-muted-foreground/40 hover:text-foreground"
          >
            <X size={11} strokeWidth={1.5} />
          </button>
        )}
      </div>

      <div className="max-h-[260px] overflow-y-auto py-1.5">
        {/* Clear / inherit row */}
        <button
          type="button"
          onClick={() => pick(null)}
          className={`w-full text-left px-3 py-1.5 text-[10px] font-mono tracking-wide rounded-sm transition-colors ${
            !value
              ? 'text-foreground bg-muted/50'
              : 'text-muted-foreground/60 hover:text-foreground hover:bg-muted/30'
          }`}
        >
          {clearLabel}
        </button>

        {/* Suggested */}
        {suggestions.length > 0 && (
          <>
            <div className="px-3 pt-2 pb-1 text-[9px] font-mono tracking-[0.18em] text-muted-foreground/40">
              SUGGESTED
            </div>
            <IconGrid entries={suggestions} value={value} onPick={pick} />
          </>
        )}

        {/* All / search results */}
        <div className="px-3 pt-2 pb-1 text-[9px] font-mono tracking-[0.18em] text-muted-foreground/40">
          {query.trim() ? `${results.length} RESULT${results.length === 1 ? '' : 'S'}` : 'ALL'}
        </div>
        {results.length === 0 ? (
          <div className="px-3 py-3 text-[11px] font-mono text-muted-foreground/40 text-center">
            No icons match
          </div>
        ) : (
          <IconGrid entries={results} value={value} onPick={pick} />
        )}
      </div>
    </div>
  );
}

function IconGrid({
  entries,
  value,
  onPick,
}: {
  entries: ReadonlyArray<{ name: string; Icon: LucideIcon }>;
  value?: string | null;
  onPick: (name: string) => void;
}) {
  return (
    <div className="grid grid-cols-6 gap-0.5 px-2">
      {entries.map(({ name, Icon }) => {
        const selected = value === name;
        return (
          <button
            key={name}
            type="button"
            onClick={() => onPick(name)}
            title={name}
            className={`aspect-square flex items-center justify-center rounded-sm transition-colors ${
              selected
                ? 'bg-primary/15 text-primary'
                : 'text-foreground/70 hover:bg-muted/50 hover:text-foreground'
            }`}
          >
            <Icon size={15} strokeWidth={1.5} />
          </button>
        );
      })}
    </div>
  );
}

/** Small convenience: render an icon name inline, falling back to `Fallback`. */
export function NamedIcon({
  name,
  Fallback,
  ...props
}: {
  name?: string | null;
  Fallback?: React.ComponentType<{ size?: number; strokeWidth?: number; className?: string }>;
  size?: number;
  strokeWidth?: number;
  className?: string;
}) {
  const Resolved = getIconByName(name);
  if (Resolved) return <Resolved {...props} />;
  if (Fallback) return <Fallback {...props} />;
  return null;
}
