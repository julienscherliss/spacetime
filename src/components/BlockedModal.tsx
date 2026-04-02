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
          className="fixed inset-0 z-50 flex items-center justify-center bg-background/60 backdrop-blur-[2px] p-4"
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.97 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.97 }}
            transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
            className="bg-card border border-[hsl(var(--priority-3)/0.2)] rounded-sm p-5 w-full max-w-xs text-center shadow-lg"
          >
            <div className="w-2 h-2 rounded-full bg-[hsl(var(--priority-3))] mx-auto mb-4" />
            <h3 className="font-display font-bold text-foreground text-sm mb-1">
              This task can't be delayed further.
            </h3>
            <p className="text-[8px] text-muted-foreground font-mono mb-5 tracking-widest">
              WHAT WOULD YOU LIKE TO DO?
            </p>

            <div className="space-y-1.5">
              <button
                onClick={() => { completeTask(taskId); onClose(); }}
                className="w-full flex items-center justify-center gap-1.5 py-2.5 rounded-sm bg-primary text-primary-foreground font-mono text-[9px] tracking-widest hover:bg-primary/90 transition-colors"
              >
                <Check size={12} strokeWidth={1.5} />
                COMPLETE NOW
              </button>
              <button
                onClick={() => { onClose(); }}
                className="w-full flex items-center justify-center gap-1.5 py-2.5 rounded-sm border border-border text-foreground/60 font-mono text-[9px] tracking-widest hover:bg-muted/50 transition-colors"
              >
                <Users size={12} strokeWidth={1.5} />
                DELEGATE
              </button>
              <button
                onClick={() => { deleteTask(taskId); onClose(); }}
                className="w-full flex items-center justify-center gap-1.5 py-2.5 rounded-sm text-destructive font-mono text-[9px] tracking-widest hover:bg-destructive/5 transition-colors"
              >
                <Trash2 size={12} strokeWidth={1.5} />
                DELETE
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
