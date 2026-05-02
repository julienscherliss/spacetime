import { useEffect, useMemo, useState } from 'react';
import { Receipt, Download, FileText, CheckCircle2, Trash2, ChevronLeft, ChevronRight } from 'lucide-react';
import { useBillingStore } from '@/store/billingStore';
import { useBillableTagRows } from '@/hooks/useBillingData';
import { formatCurrency, formatHours } from '@/lib/billingFormat';
import { useLibraryStore } from '@/store/libraryStore';
import { generateInvoicePdf } from '@/lib/renderInvoicePdf';
import { useInvoiceStyleStore } from '@/store/invoiceStyleStore';
import { InvoiceGenerator } from './InvoiceGenerator';
import { format, parseISO } from 'date-fns';

const STATUS_STYLE: Record<string, string> = {
  unbilled: 'border-muted-foreground/30 text-muted-foreground/70',
  invoiced: 'border-primary/40 text-primary/90',
  paid: 'border-green-500/40 text-green-600 dark:text-green-400',
};

export function BillingModule() {
  const load = useBillingStore(s => s.load);
  const loaded = useBillingStore(s => s.loaded);
  const invoices = useBillingStore(s => s.invoices);
  const setInvoiceStatus = useBillingStore(s => s.setInvoiceStatus);
  const deleteInvoice = useBillingStore(s => s.deleteInvoice);
  const categories = useLibraryStore(s => s.categories);
  const rows = useBillableTagRows();
  const style = useInvoiceStyleStore(s => s.style);
  const loadStyle = useInvoiceStyleStore(s => s.load);
  const styleLoaded = useInvoiceStyleStore(s => s.loaded);

  const [generatorOpen, setGeneratorOpen] = useState(false);
  const [preselected, setPreselected] = useState<string[]>([]);
  const [showBilled, setShowBilled] = useState(false);
  const [billedPage, setBilledPage] = useState(0);
  const PAGE_SIZE = 10;

  useEffect(() => { if (!loaded) load(); }, [loaded, load]);
  useEffect(() => { if (!styleLoaded) loadStyle(); }, [styleLoaded, loadStyle]);

  const openGenerator = (tags: string[]) => {
    setPreselected(tags);
    setGeneratorOpen(true);
  };

  const downloadPdf = (invoiceId: string) => {
    const inv = invoices.find(i => i.id === invoiceId);
    if (!inv) return;
    generateInvoicePdf(inv, style);
  };

  // Unbilled view: only tags that actually have something left to bill.
  // Hourly => unbilled minutes > 0. Flat => still unbilled (status === 'unbilled') AND not invoiced yet.
  const unbilledRows = useMemo(() => rows.filter(r => {
    if (r.settings.rateType === 'hourly') return r.unbilledMinutes > 0;
    return r.status === 'unbilled' && r.invoicedMinutes <= 0;
  }), [rows]);

  const billedRows = useMemo(
    () => rows.filter(r => r.invoicedMinutes > 0).sort((a, b) => b.invoicedMinutes - a.invoicedMinutes),
    [rows]
  );

  const totalUnbilled = unbilledRows.reduce((sum, r) => sum + r.unbilledAmount, 0);
  const allUnbilledTags = unbilledRows.map(r => r.tagValue);

  const visibleRows = showBilled ? billedRows : unbilledRows;
  const pageCount = Math.max(1, Math.ceil(visibleRows.length / PAGE_SIZE));
  const safePage = Math.min(billedPage, pageCount - 1);
  const pagedRows = showBilled ? visibleRows.slice(safePage * PAGE_SIZE, (safePage + 1) * PAGE_SIZE) : visibleRows;

  return (
    <div>
      {/* Summary bar */}
      <div className="flex items-baseline justify-between mb-3">
        <div className="flex items-baseline gap-3">
          <span className="text-[9px] font-mono text-muted-foreground/40 tracking-[0.15em]">UNBILLED</span>
          <span className="text-base font-display font-bold text-foreground tabular-nums">
            {formatCurrency(totalUnbilled, rows[0]?.settings.currency || 'USD')}
          </span>
        </div>
        <div className="flex items-center gap-3">
          <label className="flex items-center gap-1.5 cursor-pointer">
            <input
              type="checkbox"
              checked={showBilled}
              onChange={(e) => { setShowBilled(e.target.checked); setBilledPage(0); }}
              className="w-3 h-3"
            />
            <span className="text-[9px] font-mono text-muted-foreground/60 tracking-[0.12em]">SHOW BILLED</span>
          </label>
          <button
          onClick={() => openGenerator(allUnbilledTags)}
          disabled={allUnbilledTags.length === 0}
          className="px-2.5 py-1 rounded text-[10px] font-mono tracking-[0.12em] bg-primary text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-40 flex items-center gap-1.5"
        >
          <FileText size={11} /> NEW INVOICE
        </button>
        </div>
      </div>

      {/* Billable tags */}
      {visibleRows.length === 0 ? (
        <div className="py-6 text-center">
          <Receipt size={20} className="text-muted-foreground/20 mx-auto mb-2" />
          <p className="text-[10px] font-mono text-muted-foreground/50 tracking-wide">
            {showBilled ? 'NO BILLED TAGS YET' : 'NO UNBILLED TAGS'}
          </p>
          <p className="text-[9px] font-mono text-muted-foreground/30 mt-1 leading-relaxed">
            {showBilled ? 'Tags appear here once they are included on an invoice.' : 'Open a tag in TIME BY TAG and toggle BILLABLE to start.'}
          </p>
        </div>
      ) : (
        <div className="border border-border/20 rounded overflow-hidden">
          <div className="grid grid-cols-[1fr_70px_110px_90px_80px] gap-3 px-2.5 py-1.5 border-b border-border/20 bg-muted/20 text-[8px] font-mono text-muted-foreground/50 tracking-[0.12em]">
            <span>TAG · CLIENT</span>
            <span className="text-right">TIME</span>
            <span className="text-right">RATE</span>
            <span className="text-right">AMOUNT</span>
            <span className="text-right">STATUS</span>
          </div>
          {pagedRows.map(row => (
            <button
              key={row.tagValue}
              onClick={() => row.unbilledMinutes > 0 && openGenerator([row.tagValue])}
              disabled={row.unbilledMinutes <= 0}
              className="w-full grid grid-cols-[1fr_70px_110px_90px_80px] gap-3 px-2.5 py-2 border-b border-border/10 last:border-b-0 text-[10px] font-mono items-baseline hover:bg-muted/20 transition-colors disabled:cursor-default disabled:hover:bg-transparent text-left"
            >
              <div className="min-w-0">
                <div className="text-foreground/90 truncate">{row.label}</div>
                {row.settings.clientName && (
                  <div className="text-[9px] text-muted-foreground/50 truncate">{row.settings.clientName}</div>
                )}
              </div>
              <span className="text-muted-foreground/70 tabular-nums text-right">
                {formatHours(showBilled ? row.invoicedMinutes : row.unbilledMinutes)}
              </span>
              <span className="text-muted-foreground/60 tabular-nums text-right">
                {row.settings.rateType === 'hourly'
                  ? `${formatCurrency(row.settings.hourlyRate, row.settings.currency)}/h`
                  : `${formatCurrency(row.settings.flatRate, row.settings.currency)} flat`}
              </span>
              <span className="text-foreground tabular-nums text-right font-medium">
                {formatCurrency(row.unbilledAmount, row.settings.currency)}
              </span>
              <span className="flex justify-end">
                <span className={`text-[8px] tracking-[0.12em] px-1.5 py-0.5 border rounded ${STATUS_STYLE[row.status]}`}>
                  {row.status.toUpperCase()}
                </span>
              </span>
            </button>
          ))}
          {showBilled && pageCount > 1 && (
            <div className="flex items-center justify-between px-2.5 py-1.5 border-t border-border/20 bg-muted/10">
              <button
                onClick={() => setBilledPage(p => Math.max(0, p - 1))}
                disabled={safePage === 0}
                className="p-1 rounded text-muted-foreground/60 hover:text-foreground hover:bg-muted/40 transition-colors disabled:opacity-30"
              >
                <ChevronLeft size={12} />
              </button>
              <span className="text-[9px] font-mono text-muted-foreground/50 tabular-nums tracking-[0.12em]">
                {safePage + 1} / {pageCount}
              </span>
              <button
                onClick={() => setBilledPage(p => Math.min(pageCount - 1, p + 1))}
                disabled={safePage >= pageCount - 1}
                className="p-1 rounded text-muted-foreground/60 hover:text-foreground hover:bg-muted/40 transition-colors disabled:opacity-30"
              >
                <ChevronRight size={12} />
              </button>
            </div>
          )}
        </div>
      )}

      {/* Invoices list */}
      {invoices.length > 0 && (
        <div className="mt-5">
          <div className="text-[9px] font-mono text-muted-foreground/40 tracking-[0.15em] mb-2">INVOICES</div>
          <div className="border border-border/20 rounded overflow-hidden">
            {invoices.map(inv => (
              <div
                key={inv.id}
                className="flex items-center gap-2 px-2.5 py-2 border-b border-border/10 last:border-b-0 text-[10px] font-mono"
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-baseline gap-2">
                    <span className="text-foreground/90">{inv.invoiceNumber}</span>
                    <span className="text-muted-foreground/60 truncate">{inv.clientName || '—'}</span>
                  </div>
                  <div className="text-[9px] text-muted-foreground/40">
                    {format(parseISO(inv.issuedAt), 'MMM d, yyyy')} · {inv.items.length} item{inv.items.length === 1 ? '' : 's'}
                  </div>
                </div>
                <span className="text-foreground tabular-nums">{formatCurrency(inv.total, inv.currency)}</span>
                <span className={`text-[8px] tracking-[0.12em] px-1.5 py-0.5 border rounded ${STATUS_STYLE[inv.status]}`}>
                  {inv.status.toUpperCase()}
                </span>
                <button
                  onClick={() => downloadPdf(inv.id)}
                  title="Download PDF"
                  className="p-1 rounded text-muted-foreground/60 hover:text-foreground hover:bg-muted/40 transition-colors"
                >
                  <Download size={11} />
                </button>
                {inv.status !== 'paid' && (
                  <button
                    onClick={() => setInvoiceStatus(inv.id, 'paid')}
                    title="Mark as paid"
                    className="p-1 rounded text-muted-foreground/60 hover:text-green-600 dark:hover:text-green-400 hover:bg-muted/40 transition-colors"
                  >
                    <CheckCircle2 size={11} />
                  </button>
                )}
                <button
                  onClick={() => {
                    if (confirm(`Delete invoice ${inv.invoiceNumber}?`)) deleteInvoice(inv.id);
                  }}
                  title="Delete"
                  className="p-1 rounded text-muted-foreground/40 hover:text-destructive hover:bg-muted/40 transition-colors"
                >
                  <Trash2 size={11} />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      <InvoiceGenerator
        open={generatorOpen}
        onClose={() => setGeneratorOpen(false)}
        initialTags={preselected}
      />
    </div>
  );
}