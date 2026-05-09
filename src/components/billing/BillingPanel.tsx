import { useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Receipt } from 'lucide-react';
import { BillingModule } from '@/components/analytics/BillingModule';
import { useBillingStore } from '@/store/billingStore';
import { useInvoiceStyleStore } from '@/store/invoiceStyleStore';
import { currencySymbol } from '@/lib/billingFormat';
import { BillableTimeBreakdown } from './BillableTimeBreakdown';

interface Props {
  open: boolean;
  onClose: () => void;
}

export function BillingPanel({ open, onClose }: Props) {
  const loaded = useBillingStore(s => s.loaded);
  const load = useBillingStore(s => s.load);
  const styleLoaded = useInvoiceStyleStore(s => s.loaded);
  const loadStyle = useInvoiceStyleStore(s => s.load);
  const defaultCurrency = useInvoiceStyleStore(s => s.style.defaultCurrency);
  const saveStyle = useInvoiceStyleStore(s => s.save);

  useEffect(() => { if (open && !loaded) load(); }, [open, loaded, load]);
  useEffect(() => { if (open && !styleLoaded) loadStyle(); }, [open, styleLoaded, loadStyle]);

  const CURRENCIES = ['USD','EUR','GBP','CAD','AUD','JPY','CHF','SEK','NOK','DKK','MXN','BRL','INR','SGD','HKD','NZD','ZAR','PLN','TRY'];

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          className="fixed inset-0 z-50 bg-background overflow-y-auto"
        >
          <div className="max-w-2xl mx-auto px-4 py-4" style={{ zoom: 1.25 }}>
            {/* Header */}
            <div className="flex items-start justify-between mb-4">
              <div>
                <div className="flex items-center gap-2 mb-0.5">
                  <Receipt size={16} className="text-muted-foreground/40" />
                  <h1 className="font-display text-xl font-bold text-foreground tracking-tight">Billing</h1>
                </div>
                <p className="text-[9px] font-mono text-muted-foreground/40 tracking-[0.1em] ml-6">
                  BILLABLE TAGS · INVOICES · CLIENTS
                </p>
              </div>
              <button
                onClick={onClose}
                className="p-2 rounded-md text-muted-foreground/50 hover:text-foreground hover:bg-muted/40 transition-colors"
              >
                <X size={18} />
              </button>
            </div>

            <div className="border-t border-dashed border-border/30 mb-4" />

            {/* Global settings */}
            <div className="mb-4 flex items-center justify-between gap-2 px-3 py-2 border border-border/30 rounded-md bg-card/40">
              <div className="flex flex-col">
                <span className="text-[9px] font-mono text-muted-foreground/50 tracking-[0.15em]">CURRENCY</span>
                <span className="text-[9px] font-mono text-muted-foreground/40">Used across all billable tags & invoices</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-[11px] font-mono text-muted-foreground tabular-nums">{currencySymbol(defaultCurrency)}</span>
                <select
                  value={defaultCurrency || 'USD'}
                  onChange={(e) => saveStyle({ defaultCurrency: e.target.value })}
                  className="bg-transparent border border-border/30 rounded px-2 py-1 text-[11px] font-mono text-foreground focus:outline-none focus:border-primary/50"
                >
                  {CURRENCIES.map(c => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                </select>
              </div>
            </div>

            {/* Time spent by billable tag — with date-range, staleness, archive & delete */}
            <BillableTimeBreakdown />

            {/* Reuse the existing billing module (unbilled, invoices, generator) */}
            <BillingModule />

            <div className="h-16" />
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}