import { useEffect, useState } from 'react';
import { Receipt, Download, FileText, CheckCircle2, Trash2 } from 'lucide-react';
import { useBillingStore } from '@/store/billingStore';
import { useBillableTagRows } from '@/hooks/useBillingData';
import { formatCurrency, formatHours } from '@/lib/billingFormat';
import { useLibraryStore } from '@/store/libraryStore';
import { downloadInvoicePdf } from '@/lib/invoicePdf';
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

  const [generatorOpen, setGeneratorOpen] = useState(false);
  const [preselected, setPreselected] = useState<string[]>([]);

  useEffect(() => { if (!loaded) load(); }, [loaded, load]);

  const openGenerator = (tags: string[]) => {
    setPreselected(tags);
    setGeneratorOpen(true);
  };

  const downloadPdf = (invoiceId: string) => {
    const inv = invoices.find(i => i.id === invoiceId);
    if (!inv) return;
    const labels: Record<string, string> = {};
    inv.items.forEach(it => {
      labels[it.tagValue] = categories.find(c => c.value === it.tagValue)?.label || it.tagValue;
    });
    downloadInvoicePdf(inv, labels);
  };

  const totalUnbilled = rows.reduce((sum, r) => sum + r.unbilledAmount, 0);
  const allUnbilledTags = rows.filter(r => r.unbilledMinutes > 0).map(r => r.tagValue);

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
        <button
          onClick={() => openGenerator(allUnbilledTags)}
          disabled={allUnbilledTags.length === 0}
          className="px-2.5 py-1 rounded text-[10px] font-mono tracking-[0.12em] bg-primary text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-40 flex items-center gap-1.5"
        >
          <FileText size={11} /> NEW INVOICE
        </button>
      </div>

      {/* Billable tags */}
      {rows.length === 0 ? (
        <div className="py-6 text-center">
          <Receipt size={20} className="text-muted-foreground/20 mx-auto mb-2" />
          <p className="text-[10px] font-mono text-muted-foreground/50 tracking-wide">NO BILLABLE TAGS</p>
          <p className="text-[9px] font-mono text-muted-foreground/30 mt-1 leading-relaxed">
            Open a tag in TIME BY TAG and toggle BILLABLE to start.
          </p>
        </div>
      ) : (
        <div className="border border-border/20 rounded overflow-hidden">
          <div className="grid grid-cols-[1fr_auto_auto_auto_auto] gap-3 px-2.5 py-1.5 border-b border-border/20 bg-muted/20 text-[8px] font-mono text-muted-foreground/50 tracking-[0.12em]">
            <span>TAG · CLIENT</span>
            <span className="text-right">TIME</span>
            <span className="text-right">RATE</span>
            <span className="text-right">AMOUNT</span>
            <span className="text-right">STATUS</span>
          </div>
          {rows.map(row => (
            <button
              key={row.tagValue}
              onClick={() => row.unbilledMinutes > 0 && openGenerator([row.tagValue])}
              disabled={row.unbilledMinutes <= 0}
              className="w-full grid grid-cols-[1fr_auto_auto_auto_auto] gap-3 px-2.5 py-2 border-b border-border/10 last:border-b-0 text-[10px] font-mono items-baseline hover:bg-muted/20 transition-colors disabled:cursor-default disabled:hover:bg-transparent text-left"
            >
              <div className="min-w-0">
                <div className="text-foreground/90 truncate">{row.label}</div>
                {row.settings.clientName && (
                  <div className="text-[9px] text-muted-foreground/50 truncate">{row.settings.clientName}</div>
                )}
              </div>
              <span className="text-muted-foreground/70 tabular-nums text-right">
                {formatHours(row.unbilledMinutes)}
              </span>
              <span className="text-muted-foreground/60 tabular-nums text-right">
                {row.settings.rateType === 'hourly'
                  ? `${formatCurrency(row.settings.hourlyRate, row.settings.currency)}/h`
                  : `${formatCurrency(row.settings.flatRate, row.settings.currency)} flat`}
              </span>
              <span className="text-foreground tabular-nums text-right font-medium">
                {formatCurrency(row.unbilledAmount, row.settings.currency)}
              </span>
              <span className={`text-[8px] tracking-[0.12em] px-1.5 py-0.5 border rounded ${STATUS_STYLE[row.status]}`}>
                {row.status.toUpperCase()}
              </span>
            </button>
          ))}
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