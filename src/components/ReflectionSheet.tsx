import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { toast } from 'sonner';
import { useReflectionStore } from '@/store/reflectionStore';
import { useTaskStore } from '@/store/taskStore';
import { REASON_LABELS, type ReflectionReason } from '@/utils/reflectionTips';
import { X } from 'lucide-react';

const BASE_REASONS: ReflectionReason[] = [
  'too_ambitious',
  'avoiding',
  'more_important',
  'timing_off',
  'low_energy',
  'other',
];

export function ReflectionSheet() {
  const activePrompt = useReflectionStore((s) => s.activePrompt);
  const customReasons = useReflectionStore((s) => s.customReasons);
  const dismissPrompt = useReflectionStore((s) => s.dismissPrompt);
  const selectReason = useReflectionStore((s) => s.selectReason);
  const [otherMode, setOtherMode] = useState(false);
  const [otherText, setOtherText] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  // Reset local UI state every time a fresh prompt opens
  useEffect(() => {
    if (activePrompt) {
      setOtherMode(false);
      setOtherText('');
    }
  }, [activePrompt?.openedAt]);

  useEffect(() => {
    if (otherMode) {
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [otherMode]);

  const handlePick = (reasonKey: ReflectionReason, customText?: string) => {
    const tip = selectReason(reasonKey, customText, (move) => {
      // Commit the held move using the unrestricted path.
      useTaskStore.getState().forceMoveTask(move.taskId, move.newDate, move.newTime);
    });
    if (tip) {
      toast(tip, { duration: 2800 });
    }
  };

  const handlePickCustomChip = (chip: string) => {
    handlePick('other', chip);
  };

  const submitOther = () => {
    const trimmed = otherText.trim();
    if (!trimmed) {
      handlePick('other');
      return;
    }
    handlePick('other', trimmed);
  };

  const taskTitle = activePrompt
    ? useTaskStore.getState().tasks.find((t) => t.id === activePrompt.taskId)?.title
    : undefined;

  return (
    <AnimatePresence>
      {activePrompt && (
        <>
          <motion.div
            initial={{ y: 80, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 80, opacity: 0 }}
            transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
            className="fixed bottom-16 sm:bottom-4 left-2 right-2 sm:left-auto sm:right-4 sm:w-[380px] z-[95]
                       bg-card border border-border rounded-lg shadow-lg p-3"
            style={{ pointerEvents: 'auto' }}
          >
            <div className="flex items-start justify-between mb-2">
              <div className="min-w-0 pr-2">
                <div className="text-[11px] font-mono uppercase tracking-wider text-foreground truncate">
                  {activePrompt.violation}
                </div>
                <div className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground mt-0.5">
                  {taskTitle ? `“${taskTitle}” — why move it anyway?` : 'Why move it anyway?'}
                </div>
              </div>
              <button
                onClick={dismissPrompt}
                className="text-muted-foreground hover:text-foreground transition-colors -mt-0.5 -mr-1 p-1 shrink-0"
                aria-label="Dismiss reflection prompt and revert move"
              >
                <X size={14} />
              </button>
            </div>

            {!otherMode ? (
              <div className="flex flex-wrap gap-1.5">
                {BASE_REASONS.map((r) => (
                  <button
                    key={r}
                    onClick={() => {
                      if (r === 'other') {
                        setOtherMode(true);
                      } else {
                        handlePick(r);
                      }
                    }}
                    className="text-[10px] font-mono uppercase tracking-wider px-2.5 py-1.5
                               border border-border rounded
                               text-foreground hover:bg-muted hover:border-foreground/30
                               active:bg-muted/80 transition-colors"
                  >
                    {REASON_LABELS[r]}
                  </button>
                ))}
                {customReasons.slice(0, 4).map((chip) => (
                  <button
                    key={`custom-${chip}`}
                    onClick={() => handlePickCustomChip(chip)}
                    className="text-[10px] font-mono uppercase tracking-wider px-2.5 py-1.5
                               border border-dashed border-border rounded
                               text-muted-foreground hover:text-foreground hover:border-foreground/30
                               transition-colors"
                    title="Saved custom reason"
                  >
                    {chip}
                  </button>
                ))}
              </div>
            ) : (
              <div className="flex gap-1.5">
                <input
                  ref={inputRef}
                  type="text"
                  value={otherText}
                  onChange={(e) => setOtherText(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') submitOther();
                    if (e.key === 'Escape') setOtherMode(false);
                  }}
                  placeholder="Your reason…"
                  maxLength={48}
                  className="flex-1 text-[11px] font-mono px-2 py-1.5 bg-background
                             border border-border rounded
                             text-foreground placeholder:text-muted-foreground
                             focus:outline-none focus:border-foreground/40"
                />
                <button
                  onClick={submitOther}
                  className="text-[10px] font-mono uppercase tracking-wider px-2.5 py-1.5
                             bg-foreground text-background rounded hover:opacity-90 transition-opacity"
                >
                  Save
                </button>
              </div>
            )}
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
