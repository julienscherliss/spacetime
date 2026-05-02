import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Receipt, Plus } from 'lucide-react';
import { BillingModule } from '@/components/analytics/BillingModule';
import { useLibraryStore } from '@/store/libraryStore';
import { useBillingStore } from '@/store/billingStore';
import { TagBillingEditor } from '@/components/analytics/TagBillingEditor';
import { getBillableRoots } from '@/lib/billingInheritance';

interface Props {
  open: boolean;
  onClose: () => void;
}

export function BillingPanel({ open, onClose }: Props) {
  const categories = useLibraryStore(s => s.categories);
  const addCategory = useLibraryStore(s => s.addCategory);
  const settings = useBillingStore(s => s.settings);
  const upsertSettings = useBillingStore(s => s.upsertSettings);
  const loaded = useBillingStore(s => s.loaded);
  const load = useBillingStore(s => s.load);

  const [editingTag, setEditingTag] = useState<string | null>(null);
  const [showAddTag, setShowAddTag] = useState(false);
  const [newTagName, setNewTagName] = useState('');
  const [pickFromExisting, setPickFromExisting] = useState('');

  useEffect(() => { if (open && !loaded) load(); }, [open, loaded, load]);

  const billableRoots = getBillableRoots(settings);
  const nonBillableTopLevel = categories
    .filter(c => !c.archived && !c.value.includes('/'))
    .filter(c => !settings.find(s => s.tagValue === c.value && s.billable));

  const handleAddTag = () => {
    const trimmed = newTagName.trim();
    if (!trimmed) { setShowAddTag(false); return; }
    addCategory(trimmed);
    const value = trimmed.toLowerCase().replace(/\s+/g, '-');
    // Mark billable with sensible defaults
    upsertSettings(value, {
      billable: true,
      rateType: 'hourly',
      hourlyRate: 0,
      flatRate: 0,
      flatItems: [],
      currency: 'USD',
    });
    setNewTagName('');
    setShowAddTag(false);
    setEditingTag(value);
  };

  const markExistingBillable = (tagValue: string) => {
    if (!tagValue) return;
    upsertSettings(tagValue, {
      billable: true,
      rateType: 'hourly',
      hourlyRate: 0,
      flatRate: 0,
      flatItems: [],
      currency: 'USD',
    });
    setPickFromExisting('');
    setEditingTag(tagValue);
  };

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

            {/* Billable roots manager */}
            <div className="border border-border/30 rounded-md bg-card/40 overflow-hidden mb-4">
              <div className="px-3 py-2 border-b border-border/20 flex items-center justify-between">
                <span className="text-[9px] font-mono text-muted-foreground/50 tracking-[0.15em]">BILLABLE TAGS</span>
                <button
                  onClick={() => setShowAddTag(v => !v)}
                  className="flex items-center gap-1 text-[9px] font-mono text-primary/70 hover:text-primary tracking-wide"
                >
                  <Plus size={10} /> NEW
                </button>
              </div>
              <div className="p-3 space-y-2">
                {showAddTag && (
                  <div className="flex gap-2 mb-2">
                    <input
                      autoFocus
                      value={newTagName}
                      onChange={(e) => setNewTagName(e.target.value)}
                      onKeyDown={(e) => { if (e.key === 'Enter') handleAddTag(); if (e.key === 'Escape') setShowAddTag(false); }}
                      placeholder="New billable tag name"
                      className="flex-1 bg-transparent border border-border/40 rounded px-2 py-1 text-[11px] font-mono text-foreground focus:outline-none focus:border-primary/60"
                    />
                    <button
                      onClick={handleAddTag}
                      className="px-2 py-1 rounded text-[10px] font-mono bg-primary text-primary-foreground hover:bg-primary/90 tracking-wide"
                    >
                      ADD
                    </button>
                  </div>
                )}

                {/* Promote existing tag */}
                {nonBillableTopLevel.length > 0 && (
                  <div className="flex items-center gap-2 pb-2 border-b border-border/20">
                    <label className="text-[9px] font-mono text-muted-foreground/50 tracking-wide">MARK EXISTING</label>
                    <select
                      value={pickFromExisting}
                      onChange={(e) => markExistingBillable(e.target.value)}
                      className="flex-1 bg-transparent border border-border/30 rounded px-2 py-1 text-[11px] font-mono text-foreground focus:outline-none focus:border-primary/50"
                    >
                      <option value="">Select a tag…</option>
                      {nonBillableTopLevel.map(c => (
                        <option key={c.value} value={c.value}>{c.label}</option>
                      ))}
                    </select>
                  </div>
                )}

                {billableRoots.length === 0 ? (
                  <p className="text-[10px] font-mono text-muted-foreground/40 leading-relaxed py-2">
                    No billable tags yet. Mark a top-level tag as billable — every subtag under it
                    will inherit billing automatically.
                  </p>
                ) : (
                  billableRoots.map(s => {
                    const cat = categories.find(c => c.value === s.tagValue);
                    const label = cat?.label || s.tagValue;
                    const isOpen = editingTag === s.tagValue;
                    return (
                      <div key={s.tagValue}>
                        <button
                          onClick={() => setEditingTag(isOpen ? null : s.tagValue)}
                          className="w-full flex items-center justify-between px-2 py-1.5 rounded text-[11px] font-mono hover:bg-muted/30 text-left"
                        >
                          <span className="text-foreground">{label}</span>
                          <span className="text-[9px] text-muted-foreground/60 tracking-wide">
                            {s.rateType === 'hourly' ? `${s.hourlyRate} ${s.currency}/h` : `${s.flatRate} ${s.currency} flat`}
                          </span>
                        </button>
                        {isOpen && (
                          <div className="pt-2">
                            <TagBillingEditor tag={s.tagValue} tagLabel={label} />
                          </div>
                        )}
                      </div>
                    );
                  })
                )}
              </div>
            </div>

            {/* Reuse the existing billing module (unbilled, invoices, generator) */}
            <BillingModule />

            <div className="h-16" />
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}