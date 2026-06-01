import { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Layers } from 'lucide-react';

interface GroupNamePromptProps {
  open: boolean;
  /** Optional context shown above the input (e.g. "Convert 'Deep work' into a Group"). */
  contextLabel?: string;
  /** Initial value for the input. */
  defaultName?: string;
  confirmLabel?: string;
  onConfirm: (name: string) => void;
  onCancel: () => void;
}

/**
 * Small naming dialog used whenever a Group is created (either by converting
 * an existing task or by creating an empty container from a timeline gesture).
 *
 * Visually aligns with AddTaskModal — same surface, same typography, same
 * single primary button.
 */
export function GroupNamePrompt({
  open,
  contextLabel,
  defaultName = '',
  confirmLabel = 'CREATE GROUP',
  onConfirm,
  onCancel,
}: GroupNamePromptProps) {
  const [name, setName] = useState(defaultName);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      setName(defaultName);
      // Defer focus until after the modal mounts.
      const id = window.setTimeout(() => inputRef.current?.focus(), 50);
      return () => window.clearTimeout(id);
    }
  }, [open, defaultName]);

  const handleConfirm = () => {
    const trimmed = name.trim();
    if (!trimmed) return;
    onConfirm(trimmed);
  };

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[10010] flex items-end sm:items-center justify-center bg-background/60 backdrop-blur-[2px] p-0 sm:p-4"
          onClick={onCancel}
        >
          <motion.div
            initial={{ opacity: 0, y: 40 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 40 }}
            transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
            className="bg-card border border-border rounded-t-lg sm:rounded-sm w-full max-w-sm shadow-lg"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header chip */}
            <div className="px-5 pt-4 pb-3 flex items-center gap-1.5">
              <span className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-full text-[10px] font-mono tracking-wide text-foreground/70 bg-muted/40">
                <Layers size={11} strokeWidth={1.5} />
                {contextLabel ?? 'NEW GROUP'}
              </span>
            </div>

            {/* Name input */}
            <div className="px-5 pb-2">
              <input
                ref={inputRef}
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Group name"
                className="w-full bg-transparent font-display font-bold text-foreground text-lg leading-tight focus:outline-none placeholder:text-muted-foreground/25"
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleConfirm();
                  if (e.key === 'Escape') onCancel();
                }}
              />
            </div>

            {/* Actions */}
            <div className="px-5 pb-5 pt-3 flex gap-2">
              <button
                onClick={onCancel}
                className="flex-1 py-3 rounded-sm border border-border text-foreground/60 hover:text-foreground hover:bg-muted/30 font-mono text-[11px] tracking-widest transition-colors"
              >
                CANCEL
              </button>
              <button
                onClick={handleConfirm}
                disabled={!name.trim()}
                className="flex-1 py-3 rounded-sm bg-primary text-primary-foreground font-mono text-[11px] tracking-widest hover:bg-primary/90 disabled:opacity-20 disabled:cursor-not-allowed transition-colors"
              >
                {confirmLabel}
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
