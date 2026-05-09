import { useEffect, useState } from 'react';
import { useBillingStore, type FlatLineItem } from '@/store/billingStore';
import { useLibraryStore } from '@/store/libraryStore';
import { useInvoiceStyleStore } from '@/store/invoiceStyleStore';
import { currencySymbol } from '@/lib/billingFormat';
import { Switch } from '@/components/ui/switch';
import { Tooltip, TooltipContent, TooltipTrigger, TooltipProvider } from '@/components/ui/tooltip';
import { ClientPicker } from './ClientPicker';
import { Plus, X, Info } from 'lucide-react';

interface Props {
  tag: string;
  tagLabel: string;
}

export function TagBillingEditor({ tag, tagLabel }: Props) {
  const settings = useBillingStore(s => s.settings.find(x => x.tagValue === tag));
  const upsertSettings = useBillingStore(s => s.upsertSettings);
  const loaded = useBillingStore(s => s.loaded);
  const load = useBillingStore(s => s.load);
  const hasSubtags = useLibraryStore(s =>
    s.categories.some(c => !c.archived && c.value.startsWith(tag + '/'))
  );
  const styleLoaded = useInvoiceStyleStore(s => s.loaded);
  const loadStyle = useInvoiceStyleStore(s => s.load);
  const globalCurrency = useInvoiceStyleStore(s => s.style.defaultCurrency);

  useEffect(() => { if (!loaded) load(); }, [loaded, load]);
  useEffect(() => { if (!styleLoaded) loadStyle(); }, [styleLoaded, loadStyle]);

  const [billable, setBillable] = useState(settings?.billable ?? false);
  const [parentOnly, setParentOnly] = useState(settings?.parentOnly ?? false);
  const [rateType, setRateType] = useState<'hourly' | 'flat'>(settings?.rateType ?? 'hourly');
  const [hourlyRate, setHourlyRate] = useState<string>(String(settings?.hourlyRate ?? ''));
  const [flatRate, setFlatRate] = useState<string>(String(settings?.flatRate ?? ''));
  const [flatItems, setFlatItems] = useState<FlatLineItem[]>(settings?.flatItems ?? []);
  const [clientId, setClientId] = useState<string | null>(settings?.clientId ?? null);
  // Currency is now a global setting (see Billing panel header).
  const currency = globalCurrency || 'USD';
  const symbol = currencySymbol(currency);

  // Sync local state when settings load
  useEffect(() => {
    if (settings) {
      setBillable(settings.billable);
      setParentOnly(settings.parentOnly);
      setRateType(settings.rateType);
      setHourlyRate(String(settings.hourlyRate || ''));
      setFlatRate(String(settings.flatRate || ''));
      setFlatItems(settings.flatItems ?? []);
      setClientId(settings.clientId);
    }
  }, [settings]);

  const save = (patch: Parameters<typeof upsertSettings>[1]) => {
    upsertSettings(tag, patch);
  };

  const commitFlatItems = (next: FlatLineItem[]) => {
    setFlatItems(next);
    save({ flatItems: next });
  };

  const updateItem = (idx: number, patch: Partial<FlatLineItem>) => {
    const next = flatItems.map((it, i) => i === idx ? { ...it, ...patch } : it);
    setFlatItems(next);
  };

  const flatTotal = flatItems.reduce((sum, it) => sum + (Number(it.amount) || 0), 0);

  return (
    <div className="mb-6 border border-border/30 rounded-md bg-card/40 overflow-hidden">
      <div className="px-3 py-2 border-b border-border/20 flex items-center justify-between">
        <span className="text-[9px] font-mono text-muted-foreground/50 tracking-[0.15em]">BILLING</span>
        <div className="flex items-center gap-4">
          {hasSubtags && (
            <div className="flex items-center gap-2">
              <span className="text-[9px] font-mono text-muted-foreground/50 tracking-wide">PARENT</span>
              <TooltipProvider delayDuration={150}>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button
                      type="button"
                      onClick={(e) => e.preventDefault()}
                      className="inline-flex items-center justify-center text-muted-foreground/40 hover:text-muted-foreground cursor-help"
                      aria-label="What does PARENT do?"
                    >
                      <Info size={11} strokeWidth={2} />
                    </button>
                  </TooltipTrigger>
                  <TooltipContent side="top" className="max-w-[220px] text-[10px] font-mono leading-relaxed">
                    Marks this tag as a billing anchor: it isn't billable itself, but every subtag beneath it is treated as billable.
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
              <Switch
                checked={parentOnly}
                onCheckedChange={(v) => {
                  setParentOnly(v);
                  // Parent-only and Billable are mutually exclusive.
                  if (v && billable) setBillable(false);
                  save({ parentOnly: v, ...(v && billable ? { billable: false } : {}) });
                }}
              />
            </div>
          )}
          <div className="flex items-center gap-2">
            <span className="text-[9px] font-mono text-muted-foreground/50 tracking-wide">BILLABLE</span>
            <Switch
              checked={billable}
              onCheckedChange={(v) => {
                setBillable(v);
                if (v && parentOnly) setParentOnly(false);
                save({ billable: v, ...(v && parentOnly ? { parentOnly: false } : {}) });
              }}
            />
          </div>
        </div>
      </div>

      {billable && (
        <div className="p-3 space-y-3 min-w-0">
          {/* Client */}
          <div className="flex items-center gap-2 relative min-w-0">
            <label className="text-[9px] font-mono text-muted-foreground/50 tracking-wide w-16 shrink-0">CLIENT</label>
            <div className="flex-1 min-w-0">
              <ClientPicker
              clientId={clientId}
              onChange={(c) => {
                setClientId(c?.id ?? null);
                save({ clientId: c?.id ?? null, clientName: c?.name ?? '' });
              }}
              allowEdit
              />
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
          {rateType === 'hourly' ? (
            <div className="flex items-center gap-2 min-w-0">
              <label className="text-[9px] font-mono text-muted-foreground/50 tracking-wide w-16 shrink-0">
                PER HOUR
              </label>
              <div className="flex items-center gap-1.5 flex-1 min-w-0">
                <span className="text-[11px] font-mono text-muted-foreground/60 tabular-nums shrink-0">{symbol}</span>
                <input
                  type="number"
                  min={0}
                  step={1}
                  value={hourlyRate}
                  onChange={(e) => setHourlyRate(e.target.value)}
                  onBlur={() => save({ hourlyRate: parseFloat(hourlyRate) || 0 })}
                  className="input-compact flex-1 min-w-0 bg-transparent border border-border/30 rounded px-2 py-1 text-[11px] font-mono text-foreground focus:outline-none focus:border-primary/50 tabular-nums"
                />
              </div>
            </div>
          ) : (
            <div className="space-y-1.5 min-w-0">
              <div className="flex items-center gap-2 min-w-0">
                <label className="text-[9px] font-mono text-muted-foreground/50 tracking-wide w-16 shrink-0">FLAT FEE</label>
                <span className="flex-1 min-w-0 text-[10px] font-mono text-muted-foreground/60 tabular-nums">
                  {flatItems.length === 0 ? 'No items yet' : `${flatItems.length} item${flatItems.length === 1 ? '' : 's'} · ${symbol}${flatTotal.toFixed(2)}`}
                </span>
              </div>

              <div className="pl-0 sm:pl-[72px] space-y-1.5 min-w-0">
                <div className="hidden sm:flex items-center gap-1.5 px-1">
                  <span className="flex-1 text-[8px] font-mono text-muted-foreground/40 tracking-[0.15em]">DESCRIPTION</span>
                  <span className="w-14 text-[8px] font-mono text-muted-foreground/40 tracking-[0.15em] text-right">QTY</span>
                  <span className="w-24 text-[8px] font-mono text-muted-foreground/40 tracking-[0.15em] text-right">AMOUNT</span>
                  <span className="w-5" />
                </div>
                {flatItems.map((it, idx) => (
                  <div key={idx} className="flex flex-wrap sm:flex-nowrap items-center gap-1.5 min-w-0">
                    <input
                      type="text"
                      placeholder="Description"
                      value={it.description}
                      onChange={(e) => updateItem(idx, { description: e.target.value })}
                      onBlur={() => commitFlatItems(flatItems)}
                      className="input-compact w-full sm:flex-1 sm:w-auto min-w-0 bg-transparent border border-border/30 rounded px-2 py-1 text-[11px] font-mono text-foreground focus:outline-none focus:border-primary/50"
                    />
                    <input
                      type="number"
                      min={1}
                      step={1}
                      placeholder="QTY"
                      value={Number.isFinite(it.quantity) && it.quantity ? it.quantity : 1}
                      onChange={(e) => updateItem(idx, { quantity: Math.max(1, parseInt(e.target.value, 10) || 1) })}
                      onBlur={() => commitFlatItems(flatItems)}
                      className="input-compact w-12 sm:w-14 shrink-0 bg-transparent border border-border/30 rounded px-2 py-1 text-[11px] font-mono text-foreground focus:outline-none focus:border-primary/50 tabular-nums text-right"
                    />
                    <span className="text-[11px] font-mono text-muted-foreground/60 tabular-nums shrink-0">{symbol}</span>
                    <input
                      type="number"
                      min={0}
                      step={10}
                      placeholder="AMT"
                      value={Number.isFinite(it.amount) ? it.amount : 0}
                      onChange={(e) => updateItem(idx, { amount: parseFloat(e.target.value) || 0 })}
                      onBlur={() => commitFlatItems(flatItems)}
                      className="input-compact flex-1 sm:flex-none sm:w-24 min-w-0 bg-transparent border border-border/30 rounded px-2 py-1 text-[11px] font-mono text-foreground focus:outline-none focus:border-primary/50 tabular-nums text-right"
                    />
                    <button
                      type="button"
                      onClick={() => commitFlatItems(flatItems.filter((_, i) => i !== idx))}
                      className="p-1 shrink-0 text-muted-foreground/40 hover:text-foreground transition-colors"
                      aria-label="Remove line"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </div>
                ))}

                <button
                  type="button"
                  onClick={() => commitFlatItems([...flatItems, { description: '', amount: 0, quantity: 1 }])}
                  className="flex items-center gap-1 px-2 py-1 rounded border border-dashed border-border/40 text-[10px] font-mono text-muted-foreground hover:text-primary hover:border-primary/50 transition-colors"
                >
                  <Plus className="w-3 h-3" />
                  ADD LINE
                </button>
              </div>
            </div>
          )}

          <p className="text-[9px] font-mono text-muted-foreground/40 leading-relaxed pt-1">
            {tagLabel} time appears in the BILLING module on Analytics.
          </p>
        </div>
      )}
    </div>
  );
}