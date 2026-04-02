import { motion, AnimatePresence } from 'framer-motion';
import { useTaskStore } from '@/store/taskStore';
import { AlertTriangle, Check, Trash2, Users } from 'lucide-react';

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
          onClick={onClose}
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            className="bg-card border border-priority-3/30 rounded-xl p-6 w-full max-w-sm text-center"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="w-12 h-12 rounded-full bg-priority-3/10 flex items-center justify-center mx-auto mb-4">
              <AlertTriangle className="text-priority-3" size={24} />
            </div>
            <h3 className="font-display font-bold text-foreground text-lg mb-2">
              This task can't be delayed further.
            </h3>
            <p className="text-sm text-muted-foreground font-mono mb-6">
              What would you like to do?
            </p>

            <div className="space-y-2">
              <button
                onClick={() => { completeTask(taskId); onClose(); }}
                className="w-full flex items-center justify-center gap-2 py-3 rounded-lg bg-primary text-primary-foreground font-mono text-sm tracking-wider hover:bg-primary/90 transition-colors"
              >
                <Check size={16} />
                COMPLETE NOW
              </button>
              <button
                onClick={() => { deleteTask(taskId); onClose(); }}
                className="w-full flex items-center justify-center gap-2 py-3 rounded-lg bg-destructive/10 text-destructive font-mono text-sm tracking-wider hover:bg-destructive/20 transition-colors"
              >
                <Trash2 size={16} />
                DELETE
              </button>
              <button
                onClick={onClose}
                className="w-full flex items-center justify-center gap-2 py-3 rounded-lg bg-secondary text-secondary-foreground font-mono text-sm tracking-wider hover:bg-secondary/80 transition-colors"
              >
                <Users size={16} />
                DELEGATE
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
