import { useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { X, FileText, Download } from 'lucide-react';
import { useBillingStore } from '@/store/billingStore';
import { useCompletedMinutesByTag } from '@/hooks/useBillingData';
import { useLibraryStore } from '@/store/libraryStore';
import { formatCurrency, decimalHours } from '@/lib/billingFormat';
import { downloadInvoicePdf } from '@/lib/invoicePdf';
import { parseISO, format } from 'date-fns';
import { toast } from '@/hooks/use-toast';

interface Props {
  open: boolean;
  onClose: () => void;
  /** Pre-selected tag values from the billing module */
  initialTags: string[];
}

export function InvoiceGenerator({ open, onClose, initialTags }: Props) {
  const settings = useBillingStore(s => s.settings);
  const invoices = useBillingStore(s => s.invoices);
  const createInvoice = useBillingStore(s => s.createInvoice);
  const categories = useLibraryStore(s => s.categories);

  const [selected, setSelected] = useState<Set<string>>(new Set(initialTags));
  const [useRange, setUseRange] = useState(false);
  const [rangeStart, setRangeStart] = useState('');
  const [rangeEnd, setRangeEnd] = useState('');
  const [clientOverride, setClientOverride] = useState('');
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const start = useRange && rangeStart ? parseISO(rangeStart) : undefined;
  const end = useRange && rangeEnd ? parseISO(rangeEnd) : undefined;
  const minutesByTag = useCompletedMinutesByTag(start, end);

  const billable = useMemo(() => settings.filter(s => s.billable), [settings]);

  const items = useMemo(() => {
    return [...selected].map(tag => {
      const cfg = settings.find(s => s.tagValue === tag);
      if (!cfg) return null;
      const totalMinutes = minutesByTag.get(tag) || 0;
      // Subtract already-invoiced hours (only when using all-time, not custom range)
      let hoursToBill = totalMinutes / 60;
      if (!useRange) {
        const invoicedMinutes = invoices
          .flatMap(inv => inv.items)
          .filter(it => it.tagValue === tag)
          .reduce((sum, it) => sum + it.hours * 60, 0);
        hoursToBill = Math.max(0, totalMinutes - invoicedMinutes) / 60;
      }
      const hours = decimalHours(hoursToBill * 60);
      const amount = cfg.rateType === 'hourly'
        ? hours * cfg.hourlyRate
        : (hours > 0 ? cfg.flatRate : 0);
      const label = categories.find(c => c.value === tag)?.label || tag;
      return { tag, label, cfg, hours, amount };
    }).filter(Boolean) as Array<{ tag: string; label: string; cfg: typeof settings[number]; hours: number; amount: number }>;
  }, [selected, settings, minutesByTag, useRange, invoices, categories]);

  const total = items.reduce((sum, it) => sum + it.amount, 0);
  const currency = items[0]?.cfg.currency || 'USD';
  const inferredClient = items.find(it => it.cfg.clientName)?.cfg.clientName || '';
  const clientName = clientOverride || inferredClient;

  const handleGenerate = async (alsoDownload: boolean) => {
    if (items.length === 0 || total <= 0) {
      toast({ title: 'Nothing to invoice', description: 'Select tags with billable time.' });
      return;
    }
    setSubmitting(true);
    const invoice = await createInvoice({
      clientName,
      currency,
      notes,
      rangeStart: useRange && rangeStart ? rangeStart : null,
      rangeEnd: useRange && rangeEnd ? rangeEnd : null,
      items: items.map(it => ({
        tagValue: it.tag,
        description: it.label,
        rateType: it.cfg.rateType,
        hours: it.hours,
        rate: it.cfg.rateType === 'hourly' ? it.cfg.hourlyRate : it.cfg.flatRate,
        amount: it.amount,
      })),
    });
    setSubmitting(false);
    if (!invoice) {
      toast({ title: 'Could not create invoice', description: 'Try again.' });
      return;
    }
    if (alsoDownload) {
      const labels: Record<string, string> = {};
      items.forEach(it => { labels[it.tag] = it.label; });
      downloadInvoicePdf(invoice, labels);
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
          <button onClick={onClose} className="p-2 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted/40 transition-colors">
            <X size={18} />
          </button>
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
            <label className="text-[9px] font-mono text-muted-foreground/50 tracking-wide w-16 shrink-0">CLIENT</label>
            <input
              type="text"
              value={clientName}
              onChange={(e) => setClientOverride(e.target.value)}
              placeholder={inferredClient || 'Client name'}
              className="flex-1 bg-transparent border border-border/30 rounded px-2 py-1 text-[11px] font-mono text-foreground focus:outline-none focus:border-primary/50"
            />
          </div>
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
            {items.length === 0 ? (
              <p className="text-[10px] font-mono text-muted-foreground/40 py-2 text-center">SELECT TAGS TO PREVIEW</p>
            ) : (
              <>
                <div className="space-y-1.5">
                  {items.map(it => (
                    <div key={it.tag} className="flex items-baseline gap-2 text-[11px] font-mono">
                      <span className="text-foreground/80 flex-1 truncate">{it.label}</span>
                      <span className="text-muted-foreground/60 tabular-nums w-20 text-right">
                        {it.cfg.rateType === 'hourly' ? `${it.hours.toFixed(2)}h` : 'flat'}
                      </span>
                      <span className="text-foreground tabular-nums w-24 text-right">
                        {formatCurrency(it.amount, it.cfg.currency)}
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
    </motion.div>
  );
}