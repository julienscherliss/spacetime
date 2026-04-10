import { useState, useEffect, useRef } from 'react';
import { Calendar } from '@/components/ui/calendar';

interface DateOption {
  label: string;
  date: string;
}

function getQuickDates(): DateOption[] {
  const today = new Date();
  const fmt = (d: Date) => {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  };
  const add = (days: number) => {
    const d = new Date(today);
    d.setDate(d.getDate() + days);
    return d;
  };
  return [
    { label: 'Today', date: fmt(today) },
    { label: 'Tomorrow', date: fmt(add(1)) },
    { label: 'In 3 days', date: fmt(add(3)) },
    { label: 'In 1 week', date: fmt(add(7)) },
    { label: 'In 2 weeks', date: fmt(add(14)) },
    { label: 'In 1 month', date: fmt(add(30)) },
  ];
}

interface DateAutocompleteProps {
  inputValue: string;
  inputRef?: React.RefObject<HTMLInputElement>;
  onSelectDate: (dateStr: string, cleanedValue: string) => void;
}

export function DateAutocomplete({ inputValue, inputRef, onSelectDate }: DateAutocompleteProps) {
  const [showMenu, setShowMenu] = useState(false);
  const [showCalendar, setShowCalendar] = useState(false);
  const [selectedIdx, setSelectedIdx] = useState(0);
  const [query, setQuery] = useState('');
  const menuRef = useRef<HTMLDivElement>(null);

  const quickDates = getQuickDates();

  // Detect @query pattern
  useEffect(() => {
    const match = inputValue.match(/@(\S*)$/);
    if (match) {
      setQuery(match[1].toLowerCase());
      setShowMenu(true);
      setSelectedIdx(0);
    } else {
      setShowMenu(false);
      setShowCalendar(false);
      setQuery('');
    }
  }, [inputValue]);

  const filtered = query
    ? quickDates.filter(d => d.label.toLowerCase().includes(query))
    : quickDates;

  // Add "Pick from calendar" option
  const options = [...filtered, { label: 'Pick from calendar…', date: '__calendar__' }];

  // Handle keyboard nav
  useEffect(() => {
    if (!showMenu || showCalendar) return;
    const el = inputRef?.current;
    if (!el) return;

    const handler = (e: KeyboardEvent) => {
      if (!showMenu) return;
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSelectedIdx(i => Math.min(i + 1, options.length - 1));
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSelectedIdx(i => Math.max(i - 1, 0));
      } else if (e.key === 'Enter' || e.key === 'Tab') {
        if (options[selectedIdx]) {
          e.preventDefault();
          const opt = options[selectedIdx];
          if (opt.date === '__calendar__') {
            setShowCalendar(true);
          } else {
            const cleaned = inputValue.replace(/@\S*$/, '').trim();
            onSelectDate(opt.date, cleaned);
            setShowMenu(false);
          }
        }
      } else if (e.key === 'Escape') {
        setShowMenu(false);
        setShowCalendar(false);
      }
    };
    el.addEventListener('keydown', handler);
    return () => el.removeEventListener('keydown', handler);
  }, [showMenu, showCalendar, selectedIdx, options, inputValue, onSelectDate, inputRef]);

  if (!showMenu) return null;

  if (showCalendar) {
    return (
      <div ref={menuRef} className="absolute left-0 right-0 top-full mt-1 z-[60] bg-card border border-border rounded-md shadow-lg">
        <Calendar
          mode="single"
          onSelect={(d) => {
            if (d) {
              const y = d.getFullYear();
              const m = String(d.getMonth() + 1).padStart(2, '0');
              const day = String(d.getDate()).padStart(2, '0');
              const dateStr = `${y}-${m}-${day}`;
              const cleaned = inputValue.replace(/@\S*$/, '').trim();
              onSelectDate(dateStr, cleaned);
              setShowMenu(false);
              setShowCalendar(false);
            }
          }}
          className="p-3 pointer-events-auto"
        />
      </div>
    );
  }

  return (
    <div ref={menuRef} className="absolute left-0 right-0 top-full mt-1 z-[60] bg-card border border-border rounded-md shadow-lg py-1 max-h-64 overflow-y-auto">
      {options.map((opt, i) => (
        <button
          key={opt.date}
          onPointerDown={(e) => {
            e.preventDefault();
            if (opt.date === '__calendar__') {
              setShowCalendar(true);
            } else {
              const cleaned = inputValue.replace(/@\S*$/, '').trim();
              onSelectDate(opt.date, cleaned);
              setShowMenu(false);
            }
          }}
          className={`w-full text-left px-3 py-2 text-[12px] font-mono tracking-wider transition-colors ${
            i === selectedIdx
              ? 'bg-muted/50 text-foreground'
              : 'text-muted-foreground/70 hover:bg-muted/30 hover:text-foreground'
          }`}
        >
          <span className="text-muted-foreground/40 mr-1">@</span>
          {opt.label}
          {opt.date !== '__calendar__' && (
            <span className="text-muted-foreground/40 ml-2 text-[10px]">{opt.date}</span>
          )}
        </button>
      ))}
    </div>
  );
}
