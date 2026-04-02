import { motion, AnimatePresence } from 'framer-motion';
import { useTaskStore } from '@/store/taskStore';
import { Check, Trash2, Users } from 'lucide-react';

interface Props {
  taskId: string;
  open: boolean;
  onClose: () => void;
}

export function BlockedModal({ taskId, open, onClose }: Props) {
  const { completeTask, deleteTask } = useTaskStore();

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm p-4"
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.96 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.96 }}
            transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
            className="bg-card border border-priority-3/20 rounded-lg p-6 w-full max-w-sm text-center"
          >
            <div className="w-10 h-10 rounded-full bg-priority-3/10 flex items-center justify-center mx-auto mb-4">
              <div className="w-3 h-3 rounded-full bg-priority-3" />
            </div>
            <h3 className="font-display font-bold text-foreground text-lg mb-1.5">
              This task can't be delayed further.
            </h3>
            <p className="text-[11px] text-muted-foreground font-mono mb-6 tracking-wider">
              WHAT WOULD YOU LIKE TO DO?
            </p>

            {/* No cancel button — force a decision */}
            <div className="space-y-2">
              <button
                onClick={() => { completeTask(taskId); onClose(); }}
                className="w-full flex items-center justify-center gap-2 py-3 rounded bg-primary text-primary-foreground font-mono text-[11px] tracking-wider hover:bg-primary/90 transition-colors"
              >
                <Check size={14} />
                COMPLETE NOW
              </button>
              <button
                onClick={() => { onClose(); /* delegate placeholder */ }}
                className="w-full flex items-center justify-center gap-2 py-3 rounded bg-secondary text-secondary-foreground font-mono text-[11px] tracking-wider hover:bg-secondary/80 transition-colors"
              >
                <Users size={14} />
                DELEGATE
              </button>
              <button
                onClick={() => { deleteTask(taskId); onClose(); }}
                className="w-full flex items-center justify-center gap-2 py-3 rounded bg-destructive/10 text-destructive font-mono text-[11px] tracking-wider hover:bg-destructive/20 transition-colors"
              >
                <Trash2 size={14} />
                DELETE
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
