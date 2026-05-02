import { useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { X, Plus, Trash2, Save } from 'lucide-react';
import { useBillingStore, type Invoice, type InvoiceItem } from '@/store/billingStore';
import { formatCurrency } from '@/lib/billingFormat';
import { toast } from '@/hooks/use-toast';

interface Props {
  open: boolean;
  onClose: () => void;
  invoice: Invoice | null;
}

interface EditableItem extends Omit<InvoiceItem, 'id' | 'invoiceId'> {
  key: string;
}

export function InvoiceEditor({ open, onClose, invoice }: Props) {
  const updateInvoice = useBillingStore(s => s.updateInvoice);
  const [invoiceNumber, setInvoiceNumber] = useState('');
  const [clientName, setClientName] = useState('');
  const [notes, setNotes] = useState('');
  const [items, setItems] = useState<EditableItem[]>([]);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!invoice) return;
    setInvoiceNumber(invoice.invoiceNumber);
    setClientName(invoice.clientName);
    setNotes(invoice.notes);
    setItems(invoice.items.map(it => ({
      key: it.id,
      tagValue: it.tagValue,
      description: it.description,
      rateType: it.rateType,
      hours: it.hours,
      rate: it.rate,
      amount: it.amount,
    })));
  }, [invoice]);

  const recompute = (it: EditableItem): EditableItem => ({
    ...it,
    amount: it.rateType === 'hourly' ? it.hours * it.rate : it.rate * (it.hours > 0 ? it.hours : 1),
  });

  const updateItem = (key: string, patch: Partial<EditableItem>) => {
    setItems(prev => prev.map(it => it.key === key ? recompute({ ...it, ...patch }) : it));
  };

  const addItem = () => {
    setItems(prev => [...prev, {
      key: Math.random().toString(36).slice(2, 10),
      tagValue: prev[0]?.tagValue || '',
      description: '',
      rateType: 'hourly',
      hours: 1,
      rate: 0,
      amount: 0,
    }]);
  };

  const removeItem = (key: string) => setItems(prev => prev.filter(it => it.key !== key));

  const total = useMemo(() => items.reduce((sum, it) => sum + it.amount, 0), [items]);

  const save = async () => {
    if (!invoice) return;
    setSubmitting(true);
    await updateInvoice(invoice.id, {
      invoiceNumber: invoiceNumber.trim() || invoice.invoiceNumber,
      clientName,
      notes,
      items: items.map(it => ({
        tagValue: it.tagValue,
        description: it.description,
        rateType: it.rateType,
        hours: it.hours,
        rate: it.rate,
        amount: it.amount,
      })),
    });
    setSubmitting(false);
    toast({ title: 'Invoice updated' });
    onClose();
  };

  if (!open || !invoice) return null;

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
        <div className="flex items-start justify-between mb-5">
          <div>
            <h2 className="font-display text-lg font-bold tracking-tight">Edit Invoice</h2>
            <p className="text-[9px] font-mono text-muted-foreground/40 tracking-[0.12em] mt-0.5">
              {invoice.invoiceNumber}
            </p>
          </div>
          <button onClick={onClose} className="p-2 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted/40 transition-colors">
            <X size={18} />
          </button>
        </div>

        <div className="mb-4 border border-border/30 rounded-md bg-card/40 p-3 space-y-2">
          <div className="grid grid-cols-2 gap-2">
            <label className="block">
              <span className="text-[9px] font-mono text-muted-foreground/50 tracking-[0.15em]">INVOICE #</span>
              <input
                value={invoiceNumber}
                onChange={(e) => setInvoiceNumber(e.target.value)}
                className="w-full mt-1 px-2 py-1 text-[11px] font-mono bg-background border border-border/30 rounded"
              />
            </label>
            <label className="block">
              <span className="text-[9px] font-mono text-muted-foreground/50 tracking-[0.15em]">CLIENT</span>
              <input
                value={clientName}
                onChange={(e) => setClientName(e.target.value)}
                className="w-full mt-1 px-2 py-1 text-[11px] font-mono bg-background border border-border/30 rounded"
              />
            </label>
          </div>
          <label className="block">
            <span className="text-[9px] font-mono text-muted-foreground/50 tracking-[0.15em]">NOTES</span>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              className="w-full mt-1 px-2 py-1 text-[11px] font-mono bg-background border border-border/30 rounded resize-none"
            />
          </label>
        </div>

        <div className="mb-4 border border-border/30 rounded-md bg-card/40 overflow-hidden">
          <div className="px-3 py-2 border-b border-border/20 flex items-center justify-between">
            <span className="text-[9px] font-mono text-muted-foreground/50 tracking-[0.15em]">LINE ITEMS</span>
            <button
              onClick={addItem}
              className="p-1 rounded text-muted-foreground/60 hover:text-foreground hover:bg-muted/40 transition-colors"
              title="Add line"
            >
              <Plus size={12} />
            </button>
          </div>
          <div className="p-3 space-y-2">
            {items.length === 0 && (
              <p className="text-[10px] font-mono text-muted-foreground/40 py-2 text-center">No line items.</p>
            )}
            {items.map(it => (
              <div key={it.key} className="grid grid-cols-[1fr_60px_70px_80px_24px] gap-2 items-center">
                <input
                  value={it.description}
                  onChange={(e) => updateItem(it.key, { description: e.target.value })}
                  placeholder="Description"
                  className="px-2 py-1 text-[11px] font-mono bg-background border border-border/30 rounded"
                />
                <input
                  type="number"
                  step="0.25"
                  value={it.hours}
                  onChange={(e) => updateItem(it.key, { hours: parseFloat(e.target.value) || 0 })}
                  className="px-2 py-1 text-[11px] font-mono bg-background border border-border/30 rounded text-right tabular-nums"
                  title={it.rateType === 'hourly' ? 'Hours' : 'Quantity'}
                />
                <input
                  type="number"
                  step="0.01"
                  value={it.rate}
                  onChange={(e) => updateItem(it.key, { rate: parseFloat(e.target.value) || 0 })}
                  className="px-2 py-1 text-[11px] font-mono bg-background border border-border/30 rounded text-right tabular-nums"
                  title="Rate"
                />
                <span className="text-[11px] font-mono tabular-nums text-right text-foreground">
                  {formatCurrency(it.amount, invoice.currency)}
                </span>
                <button
                  onClick={() => removeItem(it.key)}
                  className="p-1 rounded text-muted-foreground/40 hover:text-destructive hover:bg-muted/40 transition-colors"
                >
                  <Trash2 size={11} />
                </button>
              </div>
            ))}
          </div>
          <div className="px-3 py-2 border-t border-border/20 flex items-center justify-between bg-muted/10">
            <span className="text-[9px] font-mono text-muted-foreground/50 tracking-[0.15em]">TOTAL</span>
            <span className="text-[12px] font-mono font-bold tabular-nums">{formatCurrency(total, invoice.currency)}</span>
          </div>
        </div>

        <div className="flex justify-end gap-2">
          <button
            onClick={onClose}
            className="px-3 py-1.5 rounded-md text-[10px] font-mono tracking-[0.12em] border border-border/40 text-foreground hover:bg-muted/40 transition-colors"
          >
            CANCEL
          </button>
          <button
            onClick={save}
            disabled={submitting}
            className="px-3 py-1.5 rounded-md text-[10px] font-mono tracking-[0.12em] bg-primary text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-40 flex items-center gap-1.5"
          >
            <Save size={11} /> SAVE
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
}