import { useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { X, FileText, Download, Plus, Trash2, Split, Palette, Clock } from 'lucide-react';
import { useBillingStore, type Invoice } from '@/store/billingStore';
import { useCompletedMinutesByTag } from '@/hooks/useBillingData';
import { useLibraryStore } from '@/store/libraryStore';
import { formatCurrency, decimalHours } from '@/lib/billingFormat';
import { generateInvoicePdf } from '@/lib/renderInvoicePdf';
import { useInvoiceStyleStore, TEMPLATE_LABELS } from '@/store/invoiceStyleStore';
import { InvoiceStyler } from './InvoiceStyler';
import { ClientPicker } from './ClientPicker';
import { useClientStore } from '@/store/clientStore';
import { parseISO, format } from 'date-fns';
import { toast } from '@/hooks/use-toast';

interface Props {
  open: boolean;
  onClose: () => void;
  /** Pre-selected tag values from the billing module */
  initialTags: string[];
}

interface LineItem {
  id: string;
  tag: string;
  description: string;
  hours: number;
}

export function InvoiceGenerator({ open, onClose, initialTags }: Props) {
  const settings = useBillingStore(s => s.settings);
  const invoices = useBillingStore(s => s.invoices);
  const createInvoice = useBillingStore(s => s.createInvoice);
  const nextInvoiceNumber = useBillingStore(s => s.nextInvoiceNumber);
  const categories = useLibraryStore(s => s.categories);
  const invoiceStyle = useInvoiceStyleStore(s => s.style);
  const loadStyle = useInvoiceStyleStore(s => s.load);
  const styleLoaded = useInvoiceStyleStore(s => s.loaded);
  const clients = useClientStore(s => s.clients);
  const loadClients = useClientStore(s => s.load);
  const clientsLoaded = useClientStore(s => s.loaded);

  const [selected, setSelected] = useState<Set<string>>(new Set(initialTags));
  const [useRange, setUseRange] = useState(false);
  const [rangeStart, setRangeStart] = useState('');
  const [rangeEnd, setRangeEnd] = useState('');
  const [clientId, setClientId] = useState<string | null>(null);
  const [clientNameOverride, setClientNameOverride] = useState<string | null>(null);
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [lineItems, setLineItems] = useState<LineItem[]>([]);
  const [stylerOpen, setStylerOpen] = useState(false);
  const [invoiceNumber, setInvoiceNumber] = useState('');
  const [invoiceNumberEdited, setInvoiceNumberEdited] = useState(false);
  // Track which tags the user has manually edited so we don't overwrite their splits
  const [customizedTags, setCustomizedTags] = useState<Set<string>>(new Set());

  useEffect(() => { if (!styleLoaded) loadStyle(); }, [styleLoaded, loadStyle]);
  useEffect(() => { if (!clientsLoaded) loadClients(); }, [clientsLoaded, loadClients]);

  const start = useRange && rangeStart ? parseISO(rangeStart) : undefined;
  const end = useRange && rangeEnd ? parseISO(rangeEnd) : undefined;
  const minutesByTag = useCompletedMinutesByTag(start, end);

  const billable = useMemo(() => settings.filter(s => s.billable), [settings]);

  // Compute the available billable hours for a given tag
  const availableHoursForTag = (tag: string): number => {
    const totalMinutes = minutesByTag.get(tag) || 0;
    let hoursToBill = totalMinutes / 60;
    if (!useRange) {
      const invoicedMinutes = invoices
        .flatMap(inv => inv.items)
        .filter(it => it.tagValue === tag)
        .reduce((sum, it) => sum + it.hours * 60, 0);
      hoursToBill = Math.max(0, totalMinutes - invoicedMinutes) / 60;
    }
    return decimalHours(hoursToBill * 60);
  };

  // Sync line items when selection or available hours change (preserves user customizations)
  useEffect(() => {
    setLineItems(prev => {
      const next: LineItem[] = [];
      const selectedArr = [...selected];
      for (const tag of selectedArr) {
        const cfg = settings.find(s => s.tagValue === tag);
        if (!cfg) continue;
        const existing = prev.filter(li => li.tag === tag);
        if (customizedTags.has(tag) && existing.length > 0) {
          next.push(...existing);
        } else {
          const label = categories.find(c => c.value === tag)?.label || tag;
          next.push({
            id: `${tag}-${Math.random().toString(36).slice(2, 8)}`,
            tag,
            description: label,
            hours: availableHoursForTag(tag),
          });
        }
      }
      return next;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected, minutesByTag, useRange, settings, categories]);

  const updateLine = (id: string, patch: Partial<LineItem>) => {
    setLineItems(prev => prev.map(li => li.id === id ? { ...li, ...patch } : li));
    const tag = lineItems.find(li => li.id === id)?.tag;
    if (tag) setCustomizedTags(prev => new Set(prev).add(tag));
  };

  const splitLine = (id: string) => {
    setLineItems(prev => {
      const idx = prev.findIndex(li => li.id === id);
      if (idx < 0) return prev;
      const orig = prev[idx];
      const half = decimalHours((orig.hours / 2) * 60);
      const remainder = decimalHours((orig.hours - half) * 60);
      const cfg = settings.find(s => s.tagValue === orig.tag);
      const baseLabel = categories.find(c => c.value === orig.tag)?.label || orig.tag;
      const next = [...prev];
      next[idx] = { ...orig, hours: half };
      next.splice(idx + 1, 0, {
        id: `${orig.tag}-${Math.random().toString(36).slice(2, 8)}`,
        tag: orig.tag,
        description: orig.description === baseLabel ? `${baseLabel} (cont.)` : orig.description,
        hours: remainder,
      });
      return next;
    });
    const tag = lineItems.find(li => li.id === id)?.tag;
    if (tag) setCustomizedTags(prev => new Set(prev).add(tag));
  };

  const removeLine = (id: string) => {
    const tag = lineItems.find(li => li.id === id)?.tag;
    setLineItems(prev => prev.filter(li => li.id !== id));
    if (tag) setCustomizedTags(prev => new Set(prev).add(tag));
  };

  // Compute amounts per line. Flat-rate tags split their flat fee proportionally across their lines.
  const itemsWithAmounts = useMemo(() => {
    const totalHoursByTag = new Map<string, number>();
    lineItems.forEach(li => {
      totalHoursByTag.set(li.tag, (totalHoursByTag.get(li.tag) || 0) + li.hours);
    });
    return lineItems.map(li => {
      const cfg = settings.find(s => s.tagValue === li.tag);
      if (!cfg) return { ...li, cfg: undefined, amount: 0, rateType: 'hourly' as const, rate: 0 };
      let amount = 0;
      if (cfg.rateType === 'hourly') {
        amount = li.hours * cfg.hourlyRate;
      } else {
        const totalForTag = totalHoursByTag.get(li.tag) || 0;
        const share = totalForTag > 0 ? li.hours / totalForTag : 0;
        amount = (totalForTag > 0 ? cfg.flatRate : 0) * share;
      }
      return {
        ...li,
        cfg,
        amount,
        rateType: cfg.rateType,
        rate: cfg.rateType === 'hourly' ? cfg.hourlyRate : cfg.flatRate,
      };
    });
  }, [lineItems, settings]);

  const total = itemsWithAmounts.reduce((sum, it) => sum + it.amount, 0);
  const currency = itemsWithAmounts.find(it => it.cfg)?.cfg?.currency || 'USD';

  // Infer client from the first selected tag's billing settings (clientId preferred, fallback to clientName)
  const inferredClientId = useMemo(() => {
    return itemsWithAmounts.find(it => it.cfg?.clientId)?.cfg?.clientId || null;
  }, [itemsWithAmounts]);
  const inferredClientName = itemsWithAmounts.find(it => it.cfg?.clientName)?.cfg?.clientName || '';

  // Auto-pick the inferred client if user hasn't chosen one yet
  useEffect(() => {
    if (clientId === null && inferredClientId) setClientId(inferredClientId);
  }, [inferredClientId, clientId]);

  const selectedClient = useMemo(() => clients.find(c => c.id === clientId) || null, [clients, clientId]);
  const clientName = clientNameOverride ?? (selectedClient?.name || inferredClientName || '');

  // Auto-suggest invoice number based on the current client (until the user edits it manually)
  useEffect(() => {
    if (invoiceNumberEdited) return;
    setInvoiceNumber(nextInvoiceNumber({ clientId, clientName }));
  }, [clientId, clientName, invoices, invoiceNumberEdited, nextInvoiceNumber]);

  // Past invoices for the currently-selected client (shown as a small history strip)
  const clientHistory = useMemo(() => {
    if (!clientId) return [];
    return invoices
      .filter(inv => inv.clientId === clientId)
      .slice(0, 5);
  }, [invoices, clientId]);

  const handleGenerate = async (alsoDownload: boolean) => {
    if (itemsWithAmounts.length === 0 || total <= 0) {
      toast({ title: 'Nothing to invoice', description: 'Select tags with billable time.' });
      return;
    }
    setSubmitting(true);
    const invoice = await createInvoice({
      clientName,
      clientId,
      currency,
      notes,
      invoiceNumber: invoiceNumber.trim() || undefined,
      rangeStart: useRange && rangeStart ? rangeStart : null,
      rangeEnd: useRange && rangeEnd ? rangeEnd : null,
      items: itemsWithAmounts
        .filter(it => it.cfg)
        .map(it => ({
          tagValue: it.tag,
          description: it.description,
          rateType: it.rateType,
          hours: it.hours,
          rate: it.rate,
          amount: it.amount,
        })),
    });
    setSubmitting(false);
    if (!invoice) {
      toast({ title: 'Could not create invoice', description: 'Try again.' });
      return;
    }
    if (alsoDownload) {
      await generateInvoicePdf(invoice, invoiceStyle);
    }
    toast({ title: `Invoice ${invoice.invoiceNumber} created` });
    onClose();
  };

  const toggle = (tag: string) =>
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(tag)) next.delete(tag); else next.add(tag);
      return next;
    });

  if (!open) return null;

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[60] bg-background/95 backdrop-blur-sm overflow-y-auto"
      onClick={onClose}
    >
      <motion.div
        initial={{ y: 16, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        className="max-w-xl mx-auto px-4 py-6"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-start justify-between mb-5">
          <div>
            <div className="flex items-center gap-2">
              <FileText size={16} className="text-muted-foreground/50" />
              <h2 className="font-display text-lg font-bold tracking-tight">Generate Invoice</h2>
            </div>
            <p className="text-[9px] font-mono text-muted-foreground/40 tracking-[0.12em] mt-0.5 ml-6">
              REVIEW · CONFIRM · DOWNLOAD
            </p>
          </div>
          <div className="flex items-center gap-1.5">
            <button
              onClick={() => setStylerOpen(true)}
              className="px-2.5 py-1.5 rounded-md text-[10px] font-mono tracking-[0.12em] border border-border/40 text-foreground hover:bg-muted/40 transition-colors flex items-center gap-1.5"
              title="Customize invoice template & style"
            >
              <Palette size={11} />
              <span>{TEMPLATE_LABELS[invoiceStyle.template].toUpperCase()}</span>
              <span className="w-2.5 h-2.5 rounded-sm border border-border/40" style={{ background: invoiceStyle.accentColor }} />
            </button>
            <button onClick={onClose} className="p-2 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted/40 transition-colors">
              <X size={18} />
            </button>
          </div>
        </div>

        {/* Tag selector */}
        <div className="mb-4 border border-border/30 rounded-md bg-card/40 p-3">
          <span className="text-[9px] font-mono text-muted-foreground/50 tracking-[0.15em] block mb-2">TAGS TO INCLUDE</span>
          <div className="space-y-1">
            {billable.length === 0 && (
              <p className="text-[10px] font-mono text-muted-foreground/40 py-2">No billable tags configured.</p>
            )}
            {billable.map(s => {
              const label = categories.find(c => c.value === s.tagValue)?.label || s.tagValue;
              const checked = selected.has(s.tagValue);
              return (
                <label key={s.tagValue} className="flex items-center gap-2 py-1 cursor-pointer group">
                  <div
                    className={`w-3 h-3 rounded-sm border shrink-0 flex items-center justify-center ${
                      checked ? 'bg-primary border-primary' : 'border-muted-foreground/40 group-hover:border-foreground/60'
                    }`}
                    onClick={() => toggle(s.tagValue)}
                  >
                    {checked && <div className="w-1.5 h-1.5 bg-primary-foreground rounded-[1px]" />}
                  </div>
                  <span className="text-[11px] font-mono text-foreground/80 flex-1" onClick={() => toggle(s.tagValue)}>{label}</span>
                  {s.clientName && <span className="text-[9px] font-mono text-muted-foreground/50">{s.clientName}</span>}
                </label>
              );
            })}
          </div>
        </div>

        {/* Line items editor */}
        {lineItems.length > 0 && (
          <div className="mb-4 border border-border/30 rounded-md bg-card/40 overflow-hidden">
            <div className="px-3 py-2 border-b border-border/20 flex items-center justify-between">
              <span className="text-[9px] font-mono text-muted-foreground/50 tracking-[0.15em]">LINE ITEMS</span>
              <span className="text-[9px] font-mono text-muted-foreground/40 tracking-wide">RENAME · SPLIT · ADJUST HOURS</span>
            </div>
            <div className="p-3 space-y-2">
              {[...selected].map(tag => {
                const cfg = settings.find(s => s.tagValue === tag);
                if (!cfg) return null;
                const tagLines = itemsWithAmounts.filter(li => li.tag === tag);
                const totalTagHours = tagLines.reduce((sum, li) => sum + li.hours, 0);
                const available = availableHoursForTag(tag);
                const baseLabel = categories.find(c => c.value === tag)?.label || tag;
                const overAllocated = totalTagHours > available + 0.01;
                return (
                  <div key={tag} className="border border-border/20 rounded bg-background/40">
                    <div className="flex items-center justify-between px-2 py-1.5 border-b border-border/20">
                      <span className="text-[10px] font-mono text-muted-foreground/70 tracking-wide">
                        {baseLabel.toUpperCase()}
                      </span>
                      <div className="flex items-center gap-2">
                        <span className={`text-[9px] font-mono tabular-nums ${overAllocated ? 'text-destructive' : 'text-muted-foreground/50'}`}>
                          {totalTagHours.toFixed(2)} / {available.toFixed(2)}h
                        </span>
                        <button
                          onClick={() => {
                            const newId = `${tag}-${Math.random().toString(36).slice(2, 8)}`;
                            setLineItems(prev => {
                              const lastIdx = [...prev].map((li, i) => ({ li, i })).filter(x => x.li.tag === tag).pop()?.i ?? -1;
                              const insert = { id: newId, tag, description: baseLabel, hours: 0 };
                              if (lastIdx < 0) return [...prev, insert];
                              const next = [...prev];
                              next.splice(lastIdx + 1, 0, insert);
                              return next;
                            });
                            setCustomizedTags(prev => new Set(prev).add(tag));
                          }}
                          className="p-1 rounded text-muted-foreground/60 hover:text-foreground hover:bg-muted/40 transition-colors"
                          title="Add line"
                        >
                          <Plus size={11} />
                        </button>
                      </div>
                    </div>
                    <div className="p-2 space-y-1.5">
                      {tagLines.map(li => (
                        <div key={li.id} className="flex items-center gap-1.5">
                          <input
                            type="text"
                            value={li.description}
                            onChange={(e) => updateLine(li.id, { description: e.target.value })}
                            placeholder="Description"
                            className="flex-1 min-w-0 bg-transparent border border-border/30 rounded px-2 py-1 text-[11px] font-mono text-foreground focus:outline-none focus:border-primary/50"
                          />
                          <div className="flex items-center gap-1">
                            <input
                              type="number"
                              min={0}
                              step={0.25}
                              value={li.hours}
                              onChange={(e) => updateLine(li.id, { hours: Math.max(0, parseFloat(e.target.value) || 0) })}
                              className="w-16 bg-transparent border border-border/30 rounded px-1.5 py-1 text-[11px] font-mono text-foreground focus:outline-none focus:border-primary/50 tabular-nums text-right"
                            />
                            <span className="text-[9px] font-mono text-muted-foreground/50">h</span>
                          </div>
                          <span className="text-[10px] font-mono text-foreground/70 tabular-nums w-20 text-right shrink-0">
                            {formatCurrency(li.amount, cfg.currency)}
                          </span>
                          <button
                            onClick={() => splitLine(li.id)}
                            className="p-1 rounded text-muted-foreground/50 hover:text-foreground hover:bg-muted/40 transition-colors"
                            title="Split this line in half"
                          >
                            <Split size={10} />
                          </button>
                          <button
                            onClick={() => removeLine(li.id)}
                            disabled={tagLines.length === 1}
                            className="p-1 rounded text-muted-foreground/50 hover:text-destructive hover:bg-muted/40 transition-colors disabled:opacity-30 disabled:hover:text-muted-foreground/50"
                            title="Remove line"
                          >
                            <Trash2 size={10} />
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Date range */}
        <div className="mb-4 border border-border/30 rounded-md bg-card/40 p-3">
          <label className="flex items-center gap-2 cursor-pointer mb-2">
            <input
              type="checkbox"
              checked={useRange}
              onChange={(e) => setUseRange(e.target.checked)}
              className="w-3 h-3"
            />
            <span className="text-[10px] font-mono text-foreground/80 tracking-wide">RESTRICT TO DATE RANGE</span>
          </label>
          {useRange && (
            <div className="flex items-center gap-2 mt-2">
              <input
                type="date"
                value={rangeStart}
                onChange={(e) => setRangeStart(e.target.value)}
                className="flex-1 bg-transparent border border-border/30 rounded px-2 py-1 text-[11px] font-mono text-foreground focus:outline-none focus:border-primary/50"
              />
              <span className="text-[10px] font-mono text-muted-foreground/50">→</span>
              <input
                type="date"
                value={rangeEnd}
                onChange={(e) => setRangeEnd(e.target.value)}
                className="flex-1 bg-transparent border border-border/30 rounded px-2 py-1 text-[11px] font-mono text-foreground focus:outline-none focus:border-primary/50"
              />
            </div>
          )}
          {!useRange && (
            <p className="text-[9px] font-mono text-muted-foreground/40 mt-1 leading-relaxed">
              All unbilled completed time will be invoiced.
            </p>
          )}
        </div>

        {/* Client + notes */}
        <div className="mb-4 border border-border/30 rounded-md bg-card/40 p-3 space-y-2">
          <div className="flex items-center gap-2">
            <label className="text-[9px] font-mono text-muted-foreground/50 tracking-wide w-16 shrink-0">INVOICE #</label>
            <input
              type="text"
              value={invoiceNumber}
              onChange={(e) => { setInvoiceNumber(e.target.value); setInvoiceNumberEdited(true); }}
              placeholder="INV-2026-001"
              className="flex-1 bg-transparent border border-border/30 rounded px-2 py-1 text-[11px] font-mono text-foreground focus:outline-none focus:border-primary/50"
            />
            {invoiceNumberEdited && (
              <button
                type="button"
                onClick={() => { setInvoiceNumberEdited(false); setInvoiceNumber(nextInvoiceNumber({ clientId, clientName })); }}
                className="text-[9px] font-mono text-muted-foreground/50 hover:text-foreground tracking-wide"
                title="Reset to auto-suggested number"
              >
                AUTO
              </button>
            )}
          </div>
          <div className="flex items-center gap-2">
            <label className="text-[9px] font-mono text-muted-foreground/50 tracking-wide w-16 shrink-0">CLIENT</label>
            <ClientPicker
              clientId={clientId}
              onChange={(c) => { setClientId(c?.id ?? null); setClientNameOverride(null); }}
              allowEdit
            />
          </div>
          {clientHistory.length > 0 && (
            <div className="flex items-start gap-2">
              <label className="text-[9px] font-mono text-muted-foreground/50 tracking-wide w-16 shrink-0 pt-1 flex items-center gap-1">
                <Clock size={9} /> HISTORY
              </label>
              <div className="flex-1 flex flex-wrap gap-1.5">
                {clientHistory.map(inv => (
                  <div
                    key={inv.id}
                    className="inline-flex items-baseline gap-1.5 px-2 py-0.5 rounded border border-border/30 bg-background/40"
                    title={`${inv.invoiceNumber} · ${formatCurrency(inv.total, inv.currency)} · ${format(parseISO(inv.issuedAt), 'MMM d, yyyy')}`}
                  >
                    <span className="text-[10px] font-mono text-foreground/70">{inv.invoiceNumber.replace(/^INV-/, '')}</span>
                    <span className="text-[9px] font-mono text-muted-foreground/50 tabular-nums">{formatCurrency(inv.total, inv.currency)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
          <div className="flex items-start gap-2">
            <label className="text-[9px] font-mono text-muted-foreground/50 tracking-wide w-16 shrink-0 pt-1">NOTES</label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Optional notes for the invoice"
              rows={2}
              className="flex-1 bg-transparent border border-border/30 rounded px-2 py-1 text-[11px] font-mono text-foreground focus:outline-none focus:border-primary/50 resize-none"
            />
          </div>
        </div>

        {/* Preview */}
        <div className="mb-4 border border-border/30 rounded-md bg-card/40 overflow-hidden">
          <div className="px-3 py-2 border-b border-border/20">
            <span className="text-[9px] font-mono text-muted-foreground/50 tracking-[0.15em]">PREVIEW</span>
          </div>
          <div className="p-3">
            {itemsWithAmounts.length === 0 ? (
              <p className="text-[10px] font-mono text-muted-foreground/40 py-2 text-center">SELECT TAGS TO PREVIEW</p>
            ) : (
              <>
                <div className="space-y-1.5">
                  {itemsWithAmounts.map(it => (
                    <div key={it.id} className="flex items-baseline gap-2 text-[11px] font-mono">
                      <span className="text-foreground/80 flex-1 truncate">{it.description}</span>
                      <span className="text-muted-foreground/60 tabular-nums w-20 text-right">
                        {it.rateType === 'hourly' ? `${it.hours.toFixed(2)}h` : `${it.hours.toFixed(2)}h flat`}
                      </span>
                      <span className="text-foreground tabular-nums w-24 text-right">
                        {formatCurrency(it.amount, it.cfg?.currency || currency)}
                      </span>
                    </div>
                  ))}
                </div>
                <div className="border-t border-border/30 mt-3 pt-2 flex items-baseline justify-between">
                  <span className="text-[10px] font-mono text-muted-foreground/60 tracking-[0.15em]">TOTAL</span>
                  <span className="text-base font-display font-bold text-foreground tabular-nums">
                    {formatCurrency(total, currency)}
                  </span>
                </div>
              </>
            )}
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-2">
          <button
            onClick={() => handleGenerate(false)}
            disabled={submitting || total <= 0}
            className="flex-1 px-3 py-2 rounded-md text-[10px] font-mono tracking-[0.12em] border border-border/40 text-foreground hover:bg-muted/40 transition-colors disabled:opacity-40"
          >
            CREATE INVOICE
          </button>
          <button
            onClick={() => handleGenerate(true)}
            disabled={submitting || total <= 0}
            className="flex-1 px-3 py-2 rounded-md text-[10px] font-mono tracking-[0.12em] bg-primary text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-40 flex items-center justify-center gap-1.5"
          >
            <Download size={11} /> CREATE & DOWNLOAD PDF
          </button>
        </div>
      </motion.div>

      {/* Style editor — draft preview from current line items */}
      <InvoiceStyler
        open={stylerOpen}
        onClose={() => setStylerOpen(false)}
        previewInvoice={{
          id: 'preview',
          invoiceNumber: 'INV-PREVIEW',
          clientName: clientName || 'Sample Client',
          status: 'invoiced',
          currency,
          subtotal: total,
          total,
          notes,
          rangeStart: useRange && rangeStart ? rangeStart : null,
          rangeEnd: useRange && rangeEnd ? rangeEnd : null,
          issuedAt: new Date().toISOString(),
          paidAt: null,
          items: itemsWithAmounts.length > 0
            ? itemsWithAmounts.map((it, i) => ({
                id: `prev-${i}`,
                invoiceId: 'preview',
                tagValue: it.tag,
                description: it.description,
                rateType: it.rateType,
                hours: it.hours,
                rate: it.rate,
                amount: it.amount,
              }))
            : [
                { id: 'p1', invoiceId: 'preview', tagValue: 'sample', description: 'Design work', rateType: 'hourly' as const, hours: 8, rate: 120, amount: 960 },
                { id: 'p2', invoiceId: 'preview', tagValue: 'sample', description: 'Development', rateType: 'hourly' as const, hours: 12, rate: 150, amount: 1800 },
                { id: 'p3', invoiceId: 'preview', tagValue: 'sample', description: 'Consultation', rateType: 'hourly' as const, hours: 4, rate: 200, amount: 800 },
              ],
        } as Invoice}
      />
    </motion.div>
  );
}