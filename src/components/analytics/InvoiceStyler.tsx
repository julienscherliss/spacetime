import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { X, Check, Palette, Type, FileText, RotateCcw } from 'lucide-react';
import {
  useInvoiceStyleStore,
  DEFAULT_STYLE,
  TEMPLATE_LABELS,
  FONT_LABELS,
  type InvoiceTemplate,
  type FontChoice,
  type InvoiceStyle,
} from '@/store/invoiceStyleStore';
import { InvoiceRender } from './invoice-templates/InvoiceRender';
import type { Invoice } from '@/store/billingStore';

interface Props {
  open: boolean;
  onClose: () => void;
  /** A draft invoice used purely for live-preview while editing the style */
  previewInvoice: Invoice;
}

const TEMPLATES: InvoiceTemplate[] = ['classic', 'minimal', 'bold', 'compact', 'editorial'];
const FONTS: FontChoice[] = ['sans', 'mono', 'serif', 'display'];

const ACCENT_PRESETS = [
  '#D9531E', // burnt orange (site)
  '#0F172A', // near-black
  '#2563EB', // blue
  '#059669', // green
  '#DC2626', // red
  '#7C3AED', // purple
  '#EA580C', // bright orange
  '#0EA5E9', // sky
];

export function InvoiceStyler({ open, onClose, previewInvoice }: Props) {
  const style = useInvoiceStyleStore(s => s.style);
  const setLocal = useInvoiceStyleStore(s => s.setLocal);
  const save = useInvoiceStyleStore(s => s.save);
  const load = useInvoiceStyleStore(s => s.load);
  const loaded = useInvoiceStyleStore(s => s.loaded);

  const [draft, setDraft] = useState<InvoiceStyle>(style);

  useEffect(() => { if (!loaded) load(); }, [loaded, load]);
  useEffect(() => { if (open) setDraft(style); }, [open, style]);

  if (!open) return null;

  const update = (patch: Partial<InvoiceStyle>) => {
    const next = { ...draft, ...patch };
    setDraft(next);
    setLocal(patch); // live preview in generator too
  };

  const handleSave = async () => {
    await save(draft);
    onClose();
  };

  const handleReset = () => {
    setDraft(DEFAULT_STYLE);
    setLocal(DEFAULT_STYLE);
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="fixed inset-0 z-[80] bg-background"
    >
      {/* Top bar */}
      <div className="h-12 border-b border-border/30 flex items-center justify-between px-4 bg-card/40">
        <div className="flex items-center gap-2">
          <Palette size={14} className="text-muted-foreground/60" />
          <span className="text-[11px] font-mono tracking-[0.15em] text-foreground">INVOICE STYLER</span>
          <span className="text-[9px] font-mono text-muted-foreground/40 tracking-[0.12em] ml-2">
            CHANGES APPLY TO ALL FUTURE INVOICES
          </span>
        </div>
        <div className="flex items-center gap-1.5">
          <button
            onClick={handleReset}
            className="px-2.5 py-1 rounded text-[10px] font-mono tracking-[0.12em] border border-border/40 text-muted-foreground hover:text-foreground hover:bg-muted/40 transition-colors flex items-center gap-1.5"
          >
            <RotateCcw size={10} /> RESET
          </button>
          <button
            onClick={onClose}
            className="px-2.5 py-1 rounded text-[10px] font-mono tracking-[0.12em] border border-border/40 text-muted-foreground hover:text-foreground hover:bg-muted/40 transition-colors"
          >
            CANCEL
          </button>
          <button
            onClick={handleSave}
            className="px-3 py-1 rounded text-[10px] font-mono tracking-[0.12em] bg-primary text-primary-foreground hover:bg-primary/90 transition-colors flex items-center gap-1.5"
          >
            <Check size={11} /> SAVE
          </button>
          <button
            onClick={onClose}
            className="ml-1 p-1.5 rounded text-muted-foreground hover:text-foreground hover:bg-muted/40 transition-colors"
          >
            <X size={16} />
          </button>
        </div>
      </div>

      <div className="grid grid-cols-[340px_1fr] h-[calc(100vh-3rem)]">
        {/* Controls */}
        <div className="border-r border-border/30 overflow-y-auto bg-card/20">
          <Section icon={<FileText size={11} />} title="TEMPLATE">
            <div className="grid grid-cols-2 gap-1.5">
              {TEMPLATES.map(t => (
                <button
                  key={t}
                  onClick={() => update({ template: t })}
                  className={`px-2 py-2 rounded text-[10px] font-mono tracking-wide border transition-colors ${
                    draft.template === t
                      ? 'border-primary/60 bg-primary/10 text-primary'
                      : 'border-border/30 text-muted-foreground hover:text-foreground hover:border-border/60'
                  }`}
                >
                  {TEMPLATE_LABELS[t].toUpperCase()}
                </button>
              ))}
            </div>
          </Section>

          <Section icon={<Palette size={11} />} title="ACCENT COLOR">
            <div className="flex flex-wrap gap-1.5 mb-2">
              {ACCENT_PRESETS.map(c => (
                <button
                  key={c}
                  onClick={() => update({ accentColor: c })}
                  className={`w-7 h-7 rounded border-2 transition-transform ${
                    draft.accentColor.toUpperCase() === c.toUpperCase()
                      ? 'border-foreground scale-110'
                      : 'border-border/30 hover:scale-105'
                  }`}
                  style={{ background: c }}
                  title={c}
                />
              ))}
            </div>
            <div className="flex items-center gap-1.5">
              <input
                type="color"
                value={draft.accentColor}
                onChange={(e) => update({ accentColor: e.target.value })}
                className="w-8 h-7 rounded border border-border/30 bg-transparent cursor-pointer"
              />
              <input
                type="text"
                value={draft.accentColor}
                onChange={(e) => update({ accentColor: e.target.value })}
                className="flex-1 bg-transparent border border-border/30 rounded px-2 py-1 text-[11px] font-mono text-foreground focus:outline-none focus:border-primary/50 uppercase"
              />
            </div>
          </Section>

          <Section icon={<Type size={11} />} title="HEADING FONT">
            <div className="space-y-1">
              {FONTS.map(f => (
                <button
                  key={f}
                  onClick={() => update({ headingFont: f })}
                  className={`w-full px-2 py-1.5 rounded text-[10px] text-left border transition-colors ${
                    draft.headingFont === f
                      ? 'border-primary/60 bg-primary/10 text-primary'
                      : 'border-border/30 text-muted-foreground hover:text-foreground hover:border-border/60'
                  }`}
                >
                  {FONT_LABELS[f]}
                </button>
              ))}
            </div>
          </Section>

          <Section icon={<Type size={11} />} title="BODY FONT">
            <div className="space-y-1">
              {FONTS.map(f => (
                <button
                  key={f}
                  onClick={() => update({ bodyFont: f })}
                  className={`w-full px-2 py-1.5 rounded text-[10px] text-left border transition-colors ${
                    draft.bodyFont === f
                      ? 'border-primary/60 bg-primary/10 text-primary'
                      : 'border-border/30 text-muted-foreground hover:text-foreground hover:border-border/60'
                  }`}
                >
                  {FONT_LABELS[f]}
                </button>
              ))}
            </div>
          </Section>

          <Section title="BUSINESS DETAILS">
            <TextField label="Name" value={draft.businessName} onChange={(v) => update({ businessName: v })} />
            <TextArea label="Address" value={draft.businessAddress} onChange={(v) => update({ businessAddress: v })} rows={3} />
            <TextField label="Email" value={draft.businessEmail} onChange={(v) => update({ businessEmail: v })} />
          </Section>

          <Section title="CONTENT">
            <TextArea label="Payment instructions" value={draft.paymentInstructions} onChange={(v) => update({ paymentInstructions: v })} rows={3} />
            <TextArea label="Terms & conditions" value={draft.termsText} onChange={(v) => update({ termsText: v })} rows={3} />
            <TextField label="Footer note" value={draft.footerNote} onChange={(v) => update({ footerNote: v })} />
          </Section>

          <div className="h-8" />
        </div>

        {/* Preview */}
        <div className="overflow-y-auto bg-muted/30 p-8">
          <div className="mx-auto bg-white shadow-xl" style={{ width: 816, minHeight: 1056 }}>
            <InvoiceRender invoice={previewInvoice} style={draft} />
          </div>
        </div>
      </div>
    </motion.div>
  );
}

function Section({ title, icon, children }: { title: string; icon?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="px-4 py-3 border-b border-border/20">
      <div className="flex items-center gap-1.5 mb-2">
        {icon && <span className="text-muted-foreground/50">{icon}</span>}
        <span className="text-[9px] font-mono text-muted-foreground/50 tracking-[0.15em]">{title}</span>
      </div>
      {children}
    </div>
  );
}

function TextField({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <div className="mb-2">
      <label className="block text-[9px] font-mono text-muted-foreground/50 tracking-wide mb-1">{label.toUpperCase()}</label>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full bg-transparent border border-border/30 rounded px-2 py-1 text-[11px] font-mono text-foreground focus:outline-none focus:border-primary/50"
      />
    </div>
  );
}

function TextArea({ label, value, onChange, rows = 2 }: { label: string; value: string; onChange: (v: string) => void; rows?: number }) {
  return (
    <div className="mb-2">
      <label className="block text-[9px] font-mono text-muted-foreground/50 tracking-wide mb-1">{label.toUpperCase()}</label>
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        rows={rows}
        className="w-full bg-transparent border border-border/30 rounded px-2 py-1 text-[11px] font-mono text-foreground focus:outline-none focus:border-primary/50 resize-none"
      />
    </div>
  );
}