import { motion, AnimatePresence } from 'framer-motion';

interface UnsavedChangesDialogProps {
  open: boolean;
  message?: string;
  onSave: () => void;
  onDiscard: () => void;
  onCancel: () => void;
}

/**
 * Small confirmation shown when a window with unsaved edits is about to close.
 * Save → commit and close. Discard → close, losing edits. Keep editing → stay.
 */
export function UnsavedChangesDialog({
  open,
  message = 'You have unsaved changes. Save them before closing?',
  onSave,
  onDiscard,
  onCancel,
}: UnsavedChangesDialogProps) {
  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.12 }}
          className="fixed inset-0 z-[10050] flex items-center justify-center bg-background/70 backdrop-blur-[2px] p-4"
          onClick={(e) => { e.stopPropagation(); onCancel(); }}
        >
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 12 }}
            transition={{ duration: 0.16, ease: [0.22, 1, 0.36, 1] }}
            className="bg-card border border-border rounded-sm w-full max-w-xs shadow-lg"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-5 pt-4 pb-3">
              <div className="font-mono text-[10px] tracking-widest text-muted-foreground/50 mb-2">
                UNSAVED CHANGES
              </div>
              <p className="text-[12px] font-mono leading-relaxed text-foreground/75">
                {message}
              </p>
            </div>
            <div className="px-5 pb-4 flex items-center justify-end gap-2">
              <button
                onClick={onCancel}
                className="px-2.5 py-1.5 rounded-sm font-mono text-[10px] tracking-widest text-muted-foreground/60 hover:text-foreground hover:bg-muted/40 transition-colors"
              >
                KEEP EDITING
              </button>
              <button
                onClick={onDiscard}
                className="px-2.5 py-1.5 rounded-sm font-mono text-[10px] tracking-widest text-muted-foreground/60 hover:text-destructive transition-colors"
              >
                DISCARD
              </button>
              <button
                onClick={onSave}
                className="px-3 py-1.5 rounded-sm font-mono text-[10px] tracking-widest bg-foreground text-background hover:bg-foreground/90 transition-colors"
              >
                SAVE
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
