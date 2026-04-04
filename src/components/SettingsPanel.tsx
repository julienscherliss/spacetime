import { useState, useMemo } from 'react';
import { useTimezoneStore, getTzAbbr, TIMEZONES } from '@/store/timezoneStore';
import { X, Search, Globe } from 'lucide-react';

interface SettingsPanelProps {
  open: boolean;
  onClose: () => void;
}

export function SettingsPanel({ open, onClose }: SettingsPanelProps) {
  const { timezone, setTimezone } = useTimezoneStore();
  const [search, setSearch] = useState('');

  const filtered = useMemo(() => {
    if (!search) return TIMEZONES.slice(0, 50);
    const q = search.toLowerCase();
    return TIMEZONES.filter(tz => tz.toLowerCase().includes(q)).slice(0, 50);
  }, [search]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center">
      <div className="absolute inset-0 bg-black/20" onClick={onClose} />
      <div className="relative bg-card border border-border rounded-t-lg sm:rounded-lg shadow-lg w-full sm:max-w-sm max-h-[80vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-border/50">
          <h2 className="text-sm font-display font-bold text-foreground tracking-tight">SETTINGS</h2>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground transition-colors">
            <X size={16} strokeWidth={1.5} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {/* Timezone section */}
          <div>
            <div className="flex items-center gap-1.5 mb-2">
              <Globe size={12} strokeWidth={1.5} className="text-muted-foreground" />
              <span className="text-[10px] font-mono tracking-[0.15em] text-muted-foreground">TIMEZONE</span>
            </div>

            <div className="bg-muted/30 border border-border/50 rounded-sm p-2.5 mb-2">
              <div className="text-xs font-mono text-foreground">{timezone}</div>
              <div className="text-[10px] font-mono text-muted-foreground/60 mt-0.5">{getTzAbbr(timezone)}</div>
            </div>

            {/* Search */}
            <div className="relative mb-2">
              <Search size={12} className="absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground/40" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search timezones..."
                className="w-full bg-background border border-border/50 rounded-sm pl-7 pr-2 py-1.5 text-[11px] font-mono text-foreground placeholder:text-muted-foreground/30 focus:outline-none focus:border-primary/30"
              />
            </div>

            {/* Timezone list */}
            <div className="max-h-48 overflow-y-auto border border-border/30 rounded-sm">
              {filtered.map((tz) => (
                <button
                  key={tz}
                  onClick={() => {
                    setTimezone(tz);
                    setSearch('');
                  }}
                  className={`w-full text-left px-2.5 py-1.5 text-[11px] font-mono transition-colors flex items-center justify-between ${
                    tz === timezone
                      ? 'bg-primary/8 text-primary'
                      : 'text-foreground/60 hover:bg-muted/40 hover:text-foreground'
                  }`}
                >
                  <span className="truncate">{tz.replace(/_/g, ' ')}</span>
                  <span className="text-[9px] text-muted-foreground/40 ml-2 shrink-0">{getTzAbbr(tz)}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
