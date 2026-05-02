import { useEffect, useState } from 'react';
import { useBillingStore, type FlatLineItem } from '@/store/billingStore';
import { Switch } from '@/components/ui/switch';
import { ClientPicker } from './ClientPicker';
import { Plus, X } from 'lucide-react';

interface Props {
  tag: string;
  tagLabel: string;
}

export function TagBillingEditor({ tag, tagLabel }: Props) {
  const settings = useBillingStore(s => s.settings.find(x => x.tagValue === tag));
  const upsertSettings = useBillingStore(s => s.upsertSettings);
  const loaded = useBillingStore(s => s.loaded);
  const load = useBillingStore(s => s.load);

  useEffect(() => { if (!loaded) load(); }, [loaded, load]);

  const [billable, setBillable] = useState(settings?.billable ?? false);
  const [rateType, setRateType] = useState<'hourly' | 'flat'>(settings?.rateType ?? 'hourly');
  const [hourlyRate, setHourlyRate] = useState<string>(String(settings?.hourlyRate ?? ''));
  const [flatRate, setFlatRate] = useState<string>(String(settings?.flatRate ?? ''));
  const [flatItems, setFlatItems] = useState<FlatLineItem[]>(settings?.flatItems ?? []);
  const [clientId, setClientId] = useState<string | null>(settings?.clientId ?? null);
  const [currency, setCurrency] = useState(settings?.currency ?? 'USD');

  // Sync local state when settings load
  useEffect(() => {
    if (settings) {
      setBillable(settings.billable);
      setRateType(settings.rateType);
      setHourlyRate(String(settings.hourlyRate || ''));
      setFlatRate(String(settings.flatRate || ''));
      setFlatItems(settings.flatItems ?? []);
      setClientId(settings.clientId);
      setCurrency(settings.currency);
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
            <ClientPicker
              clientId={clientId}
              onChange={(c) => {
                setClientId(c?.id ?? null);
                save({ clientId: c?.id ?? null, clientName: c?.name ?? '' });
              }}
              allowEdit
            />
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
            <div className="flex items-center gap-2">
              <label className="text-[9px] font-mono text-muted-foreground/50 tracking-wide w-16 shrink-0">
                PER HOUR
              </label>
              <div className="flex items-center gap-1.5 flex-1">
                <input
                  type="number"
                  min={0}
                  step={1}
                  value={hourlyRate}
                  onChange={(e) => setHourlyRate(e.target.value)}
                  onBlur={() => save({ hourlyRate: parseFloat(hourlyRate) || 0 })}
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
          ) : (
            <div className="space-y-1.5">
              <div className="flex items-center gap-2">
                <label className="text-[9px] font-mono text-muted-foreground/50 tracking-wide w-16 shrink-0">FLAT FEE</label>
                <div className="flex-1 flex items-center justify-between">
                  <span className="text-[10px] font-mono text-muted-foreground/60 tabular-nums">
                    {flatItems.length === 0 ? 'No items yet' : `${flatItems.length} item${flatItems.length === 1 ? '' : 's'} · ${flatTotal.toFixed(2)} ${currency}`}
                  </span>
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

              <div className="pl-[72px] space-y-1.5">
                {flatItems.map((it, idx) => (
                  <div key={idx} className="flex items-center gap-1.5">
                    <input
                      type="text"
                      placeholder="Description"
                      value={it.description}
                      onChange={(e) => updateItem(idx, { description: e.target.value })}
                      onBlur={() => commitFlatItems(flatItems)}
                      className="flex-1 bg-transparent border border-border/30 rounded px-2 py-1 text-[11px] font-mono text-foreground focus:outline-none focus:border-primary/50"
                    />
                    <input
                      type="number"
                      min={0}
                      step={10}
                      placeholder="0"
                      value={Number.isFinite(it.amount) ? it.amount : 0}
                      onChange={(e) => updateItem(idx, { amount: parseFloat(e.target.value) || 0 })}
                      onBlur={() => commitFlatItems(flatItems)}
                      className="w-24 bg-transparent border border-border/30 rounded px-2 py-1 text-[11px] font-mono text-foreground focus:outline-none focus:border-primary/50 tabular-nums text-right"
                    />
                    <button
                      type="button"
                      onClick={() => commitFlatItems(flatItems.filter((_, i) => i !== idx))}
                      className="p-1 text-muted-foreground/40 hover:text-foreground transition-colors"
                      aria-label="Remove line"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </div>
                ))}

                <button
                  type="button"
                  onClick={() => commitFlatItems([...flatItems, { description: '', amount: 0 }])}
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