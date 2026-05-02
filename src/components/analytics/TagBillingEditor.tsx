import { useEffect, useMemo, useRef, useState } from 'react';
import { useBillingStore } from '@/store/billingStore';
import { Switch } from '@/components/ui/switch';

interface Props {
  tag: string;
  tagLabel: string;
}

export function TagBillingEditor({ tag, tagLabel }: Props) {
  const settings = useBillingStore(s => s.settings.find(x => x.tagValue === tag));
  const upsertSettings = useBillingStore(s => s.upsertSettings);
  const allSettings = useBillingStore(s => s.settings);
  const allInvoices = useBillingStore(s => s.invoices);
  const loaded = useBillingStore(s => s.loaded);
  const load = useBillingStore(s => s.load);

  useEffect(() => { if (!loaded) load(); }, [loaded, load]);

  const [billable, setBillable] = useState(settings?.billable ?? false);
  const [rateType, setRateType] = useState<'hourly' | 'flat'>(settings?.rateType ?? 'hourly');
  const [hourlyRate, setHourlyRate] = useState<string>(String(settings?.hourlyRate ?? ''));
  const [flatRate, setFlatRate] = useState<string>(String(settings?.flatRate ?? ''));
  const [clientName, setClientName] = useState(settings?.clientName ?? '');
  const [currency, setCurrency] = useState(settings?.currency ?? 'USD');
  const [clientFocused, setClientFocused] = useState(false);
  const [highlightIdx, setHighlightIdx] = useState(0);
  const clientWrapRef = useRef<HTMLDivElement>(null);

  const pastClients = useMemo(() => {
    const set = new Set<string>();
    allSettings.forEach(s => { if (s.clientName?.trim()) set.add(s.clientName.trim()); });
    allInvoices.forEach(i => { if (i.clientName?.trim()) set.add(i.clientName.trim()); });
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [allSettings, allInvoices]);

  const clientSuggestions = useMemo(() => {
    const q = clientName.trim().toLowerCase();
    return pastClients
      .filter(c => c.toLowerCase() !== q)
      .filter(c => !q || c.toLowerCase().includes(q))
      .slice(0, 8);
  }, [pastClients, clientName]);

  useEffect(() => { setHighlightIdx(0); }, [clientName, clientFocused]);

  useEffect(() => {
    if (!clientFocused) return;
    const handler = (e: MouseEvent) => {
      if (clientWrapRef.current && !clientWrapRef.current.contains(e.target as Node)) {
        setClientFocused(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [clientFocused]);

  // Sync local state when settings load
  useEffect(() => {
    if (settings) {
      setBillable(settings.billable);
      setRateType(settings.rateType);
      setHourlyRate(String(settings.hourlyRate || ''));
      setFlatRate(String(settings.flatRate || ''));
      setClientName(settings.clientName);
      setCurrency(settings.currency);
    }
  }, [settings]);

  const save = (patch: Parameters<typeof upsertSettings>[1]) => {
    upsertSettings(tag, patch);
  };

  return (
    <div className="mb-6 border border-border/30 rounded-md bg-card/40 overflow-hidden">
      <div className="px-3 py-2 border-b border-border/20 flex items-center justify-between">
        <span className="text-[9px] font-mono text-muted-foreground/50 tracking-[0.15em]">BILLING</span>
        <div className="flex items-center gap-2">
          <span className="text-[9px] font-mono text-muted-foreground/50 tracking-wide">BILLABLE</span>
          <Switch
            checked={billable}
            onCheckedChange={(v) => { setBillable(v); save({ billable: v }); }}
          />
        </div>
      </div>

      {billable && (
        <div className="p-3 space-y-3">
          {/* Client */}
          <div className="flex items-center gap-2 relative">
            <label className="text-[9px] font-mono text-muted-foreground/50 tracking-wide w-16 shrink-0">CLIENT</label>
            <div ref={clientWrapRef} className="flex-1 relative">
              <input
                type="text"
                value={clientName}
                onChange={(e) => setClientName(e.target.value)}
                onFocus={() => setClientFocused(true)}
                onBlur={() => save({ clientName })}
                onKeyDown={(e) => {
                  if (!clientFocused || clientSuggestions.length === 0) return;
                  if (e.key === 'ArrowDown') {
                    e.preventDefault();
                    setHighlightIdx(i => Math.min(i + 1, clientSuggestions.length - 1));
                  } else if (e.key === 'ArrowUp') {
                    e.preventDefault();
                    setHighlightIdx(i => Math.max(i - 1, 0));
                  } else if (e.key === 'Enter' || e.key === 'Tab') {
                    const pick = clientSuggestions[highlightIdx];
                    if (pick) {
                      e.preventDefault();
                      setClientName(pick);
                      save({ clientName: pick });
                      setClientFocused(false);
                    }
                  } else if (e.key === 'Escape') {
                    setClientFocused(false);
                  }
                }}
                placeholder="Client name"
                className="w-full bg-transparent border border-border/30 rounded px-2 py-1 text-[11px] font-mono text-foreground focus:outline-none focus:border-primary/50"
              />
              {clientFocused && clientSuggestions.length > 0 && (
                <div className="absolute left-0 right-0 top-full mt-1 z-50 bg-card border border-border/50 rounded-md shadow-lg py-1 max-h-48 overflow-y-auto">
                  {clientSuggestions.map((c, i) => (
                    <button
                      key={c}
                      type="button"
                      onMouseEnter={() => setHighlightIdx(i)}
                      onPointerDown={(e) => {
                        e.preventDefault();
                        setClientName(c);
                        save({ clientName: c });
                        setClientFocused(false);
                      }}
                      className={`w-full text-left px-2.5 py-1.5 text-[11px] font-mono transition-colors ${
                        i === highlightIdx
                          ? 'bg-muted/50 text-foreground'
                          : 'text-muted-foreground/80 hover:bg-muted/30 hover:text-foreground'
                      }`}
                    >
                      {c}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Rate type */}
          <div className="flex items-center gap-2">
            <label className="text-[9px] font-mono text-muted-foreground/50 tracking-wide w-16 shrink-0">TYPE</label>
            <div className="flex gap-1">
              {(['hourly', 'flat'] as const).map(rt => (
                <button
                  key={rt}
                  onClick={() => { setRateType(rt); save({ rateType: rt }); }}
                  className={`px-2.5 py-1 rounded text-[10px] font-mono tracking-wide border transition-colors ${
                    rateType === rt
                      ? 'border-primary/60 bg-primary/10 text-primary'
                      : 'border-border/30 text-muted-foreground hover:text-foreground'
                  }`}
                >
                  {rt.toUpperCase()}
                </button>
              ))}
            </div>
          </div>

          {/* Rate */}
          <div className="flex items-center gap-2">
            <label className="text-[9px] font-mono text-muted-foreground/50 tracking-wide w-16 shrink-0">
              {rateType === 'hourly' ? 'PER HOUR' : 'FLAT FEE'}
            </label>
            <div className="flex items-center gap-1.5 flex-1">
              <input
                type="number"
                min={0}
                step={rateType === 'hourly' ? 1 : 10}
                value={rateType === 'hourly' ? hourlyRate : flatRate}
                onChange={(e) => rateType === 'hourly' ? setHourlyRate(e.target.value) : setFlatRate(e.target.value)}
                onBlur={() => save(rateType === 'hourly'
                  ? { hourlyRate: parseFloat(hourlyRate) || 0 }
                  : { flatRate: parseFloat(flatRate) || 0 })}
                className="w-24 bg-transparent border border-border/30 rounded px-2 py-1 text-[11px] font-mono text-foreground focus:outline-none focus:border-primary/50 tabular-nums"
              />
              <input
                type="text"
                value={currency}
                onChange={(e) => setCurrency(e.target.value.toUpperCase().slice(0, 3))}
                onBlur={() => save({ currency: currency || 'USD' })}
                maxLength={3}
                className="w-14 bg-transparent border border-border/30 rounded px-2 py-1 text-[11px] font-mono text-foreground focus:outline-none focus:border-primary/50 uppercase"
              />
            </div>
          </div>

          <p className="text-[9px] font-mono text-muted-foreground/40 leading-relaxed pt-1">
            {tagLabel} time appears in the BILLING module on Analytics.
          </p>
        </div>
      )}
    </div>
  );
}