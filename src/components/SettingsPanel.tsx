import { useState, useMemo } from 'react';
import { useTimezoneStore, getTzAbbr, TIMEZONES } from '@/store/timezoneStore';
import { X, Search, Globe, Repeat, MapPin } from 'lucide-react';

interface SettingsPanelProps {
  open: boolean;
  onClose: () => void;
}

export function SettingsPanel({ open, onClose }: SettingsPanelProps) {
  const { timezone, setTimezone, routinesFixedTime, setRoutinesFixedTime, autoDetect, setAutoDetect } = useTimezoneStore();
  const [search, setSearch] = useState('');

  const filtered = useMemo(() => {
    if (!search) return TIMEZONES.slice(0, 50);
    const q = search.toLowerCase();
    return TIMEZONES.filter(tz => tz.toLowerCase().includes(q)).slice(0, 50);
  }, [search]);

  if (!open) return null;

  const detectedTz = Intl.DateTimeFormat().resolvedOptions().timeZone;

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
          {/* Auto-detect toggle */}
          <div>
            <div className="flex items-center gap-1.5 mb-2">
              <MapPin size={12} strokeWidth={1.5} className="text-muted-foreground" />
              <span className="text-[11px] font-mono tracking-[0.12em] text-muted-foreground">LOCATION</span>
            </div>
            <button
              onClick={() => {
                const newVal = !autoDetect;
                setAutoDetect(newVal);
                if (newVal) {
                  setTimezone(detectedTz);
                }
              }}
              className="w-full flex items-center justify-between bg-muted/30 border border-border/50 rounded-sm p-3 min-h-[48px]"
            >
              <div className="text-left">
                <div className="text-[12px] font-mono text-foreground">Use current time zone</div>
                <div className="text-[10px] font-mono text-muted-foreground/50 mt-0.5">
                  Auto-detect from device location
                </div>
              </div>
              <div className={`w-9 h-5 rounded-full transition-colors flex items-center px-0.5 ${
                autoDetect ? 'bg-primary justify-end' : 'bg-border justify-start'
              }`}>
                <div className="w-4 h-4 rounded-full bg-white shadow-sm" />
              </div>
            </button>
          </div>

          {/* Timezone section */}
          <div>
            <div className="flex items-center gap-1.5 mb-2">
              <Globe size={12} strokeWidth={1.5} className="text-muted-foreground" />
              <span className="text-[11px] font-mono tracking-[0.12em] text-muted-foreground">TIMEZONE</span>
            </div>

            <div className="bg-muted/30 border border-border/50 rounded-sm p-3 mb-2 min-h-[48px] flex items-center justify-between">
              <div>
                <div className="text-[12px] font-mono text-foreground">{timezone.replace(/_/g, ' ')}</div>
                <div className="text-[10px] font-mono text-muted-foreground/60 mt-0.5">{getTzAbbr(timezone)}</div>
              </div>
              {autoDetect && (
                <span className="text-[9px] font-mono text-primary/60 tracking-wider">AUTO</span>
              )}
            </div>

            {!autoDetect && (
              <>
                {/* Search */}
                <div className="relative mb-2">
                  <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground/40" />
                  <input
                    type="text"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Search timezones..."
                    className="w-full bg-background border border-border/50 rounded-sm pl-8 pr-3 py-2.5 text-[12px] font-mono text-foreground placeholder:text-muted-foreground/30 focus:outline-none focus:border-primary/30 min-h-[44px]"
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
                      className={`w-full text-left px-3 py-2.5 text-[12px] font-mono transition-colors flex items-center justify-between min-h-[44px] ${
                        tz === timezone
                          ? 'bg-primary/8 text-primary'
                          : 'text-foreground/60 hover:bg-muted/40 hover:text-foreground'
                      }`}
                    >
                      <span className="truncate">{tz.replace(/_/g, ' ')}</span>
                      <span className="text-[10px] text-muted-foreground/40 ml-2 shrink-0">{getTzAbbr(tz)}</span>
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>

          {/* Routines timezone behavior */}
          <div className="border-t border-border/30 pt-4">
            <div className="flex items-center gap-1.5 mb-2">
              <Repeat size={12} strokeWidth={1.5} className="text-muted-foreground" />
              <span className="text-[11px] font-mono tracking-[0.12em] text-muted-foreground">ROUTINES</span>
            </div>
            <button
              onClick={() => setRoutinesFixedTime(!routinesFixedTime)}
              className="w-full flex items-center justify-between bg-muted/30 border border-border/50 rounded-sm p-3 min-h-[48px]"
            >
              <div className="text-left">
                <div className="text-[12px] font-mono text-foreground">Keep routine times fixed</div>
                <div className="text-[10px] font-mono text-muted-foreground/50 mt-0.5">
                  Routines stay at the same clock time regardless of timezone
                </div>
              </div>
              <div className={`w-9 h-5 rounded-full transition-colors flex items-center px-0.5 ${
                routinesFixedTime ? 'bg-primary justify-end' : 'bg-border justify-start'
              }`}>
                <div className="w-4 h-4 rounded-full bg-white shadow-sm" />
              </div>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
