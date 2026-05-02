import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Receipt, X } from 'lucide-react';
import { useBillingPromptStore } from '@/store/billingPromptStore';
import { useBillingStore } from '@/store/billingStore';

/**
 * Renders one prompt at a time from the queue. Asks the user to confirm the
 * billing rate for a freshly-created subtag whose parent is billable.
 * The user can: inherit parent rate, set a custom rate, or skip.
 */
export function SubtagBillingPrompt() {
  const current = useBillingPromptStore(s => s.queue[0]);
  const dismiss = useBillingPromptStore(s => s.dismissCurrent);
  const upsert = useBillingStore(s => s.upsertSettings);

  const [rateType, setRateType] = useState<'hourly' | 'flat'>('hourly');
  const [hourlyRate, setHourlyRate] = useState('');
  const [flatRate, setFlatRate] = useState('');

  // Reset state when prompt changes
  useEffect(() => {
    if (!current) return;
    setRateType(current.parentRateType);
    setHourlyRate(String(current.parentHourlyRate || ''));
    setFlatRate('');
  }, [current?.tagValue]);

  if (!current) return null;

  const inheritFromParent = () => {
    // Mark this subtag as billable with parent's rate inherited
    upsert(current.tagValue, {
      billable: true,
      rateType: current.parentRateType,
      hourlyRate: current.parentHourlyRate,
      flatRate: 0,
      flatItems: [],
      currency: current.parentCurrency,
    });
    dismiss();
  };

  const saveCustom = () => {
    const hr = parseFloat(hourlyRate) || 0;
    const fr = parseFloat(flatRate) || 0;
    upsert(current.tagValue, {
      billable: true,
      rateType,
      hourlyRate: rateType === 'hourly' ? hr : 0,
      flatRate: rateType === 'flat' ? fr : 0,
      flatItems: rateType === 'flat' && fr > 0 ? [{ description: current.tagLabel, amount: fr, quantity: 1 }] : [],
      currency: current.parentCurrency,
    });
    dismiss();
  };

  return (
    <AnimatePresence>
      <motion.div
        key={current.tagValue}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-[120] bg-background/80 backdrop-blur-sm flex items-center justify-center p-4"
      >
        <motion.div
          initial={{ scale: 0.95, y: 8 }}
          animate={{ scale: 1, y: 0 }}
          exit={{ scale: 0.95, y: 8 }}
          className="w-full max-w-md bg-card border border-border/50 rounded-md shadow-lg overflow-hidden"
        >
          <div className="px-4 py-3 border-b border-border/30 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Receipt size={14} className="text-primary" />
              <span className="text-[10px] font-mono tracking-[0.15em] text-muted-foreground/70">
                NEW BILLABLE SUBTAG
              </span>
            </div>
            <button
              onClick={dismiss}
              className="p-1 text-muted-foreground/50 hover:text-foreground"
              aria-label="Skip"
            >
              <X size={14} />
            </button>
          </div>

          <div className="p-4 space-y-4">
            <div>
              <div className="font-display text-base text-foreground">{current.tagLabel}</div>
              <p className="text-[10px] font-mono text-muted-foreground/60 mt-1 leading-relaxed">
                Inherits billing from a billable ancestor. Choose how this subtag is billed.
              </p>
            </div>

            {/* Rate type */}
            <div className="flex gap-1">
              {(['hourly', 'flat'] as const).map(rt => (
                <button
                  key={rt}
                  onClick={() => setRateType(rt)}
                  className={`flex-1 px-2.5 py-1.5 rounded text-[10px] font-mono tracking-wide border transition-colors ${
                    rateType === rt
                      ? 'border-primary/60 bg-primary/10 text-primary'
                      : 'border-border/30 text-muted-foreground hover:text-foreground'
                  }`}
                >
                  {rt.toUpperCase()}
                </button>
              ))}
            </div>

            {/* Rate */}
            {rateType === 'hourly' ? (
              <div>
                <label className="text-[9px] font-mono text-muted-foreground/50 tracking-wide block mb-1">
                  HOURLY RATE ({current.parentCurrency})
                </label>
                <input
                  type="number"
                  min={0}
                  step={1}
                  value={hourlyRate}
                  onChange={(e) => setHourlyRate(e.target.value)}
                  autoFocus
                  className="w-full bg-transparent border border-border/40 rounded px-2 py-1.5 text-[12px] font-mono text-foreground focus:outline-none focus:border-primary/60 tabular-nums"
                  placeholder="0"
                />
              </div>
            ) : (
              <div>
                <label className="text-[9px] font-mono text-muted-foreground/50 tracking-wide block mb-1">
                  FLAT FEE ({current.parentCurrency})
                </label>
                <input
                  type="number"
                  min={0}
                  step={10}
                  value={flatRate}
                  onChange={(e) => setFlatRate(e.target.value)}
                  autoFocus
                  className="w-full bg-transparent border border-border/40 rounded px-2 py-1.5 text-[12px] font-mono text-foreground focus:outline-none focus:border-primary/60 tabular-nums"
                  placeholder="0"
                />
              </div>
            )}
          </div>

          <div className="px-4 py-3 border-t border-border/30 flex items-center justify-between gap-2">
            <button
              onClick={inheritFromParent}
              className="text-[10px] font-mono text-muted-foreground hover:text-foreground tracking-wide"
            >
              Use parent rate ({current.parentRateType === 'hourly'
                ? `${current.parentHourlyRate}/h`
                : 'flat'})
            </button>
            <div className="flex gap-2">
              <button
                onClick={dismiss}
                className="px-3 py-1.5 rounded text-[10px] font-mono tracking-wide border border-border/40 text-muted-foreground hover:text-foreground"
              >
                SKIP
              </button>
              <button
                onClick={saveCustom}
                className="px-3 py-1.5 rounded text-[10px] font-mono tracking-wide bg-primary text-primary-foreground hover:bg-primary/90"
              >
                SAVE
              </button>
            </div>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}