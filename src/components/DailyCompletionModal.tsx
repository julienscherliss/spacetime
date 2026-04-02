import { motion, AnimatePresence } from 'framer-motion';
import { useTaskStore } from '@/store/taskStore';
import { CheckCircle } from 'lucide-react';

export function DailyCompletionModal() {
  const { showCompletionStats, dailyStats, dismissCompletionStats } = useTaskStore();

  if (!dailyStats) return null;

  const pct = dailyStats.total > 0 ? Math.round((dailyStats.completed / dailyStats.total) * 100) : 0;

  return (
    <AnimatePresence>
      {showCompletionStats && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm"
          onClick={dismissCompletionStats}
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.9 }}
            transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
            className="text-center px-8"
            onClick={(e) => e.stopPropagation()}
          >
            <motion.div
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              transition={{ delay: 0.2, type: 'spring', bounce: 0.3 }}
            >
              <CheckCircle size={48} className="text-primary mx-auto mb-6" />
            </motion.div>
            <h2 className="font-display text-3xl font-bold text-foreground mb-3">Day Complete</h2>
            <div className="font-mono text-4xl text-primary tabular-nums mb-2">{pct}%</div>
            <p className="font-mono text-sm text-muted-foreground mb-1">
              {dailyStats.completed}/{dailyStats.total} tasks completed
            </p>
            {dailyStats.pushed > 0 && (
              <p className="font-mono text-xs text-priority-2">
                {dailyStats.pushed} task{dailyStats.pushed > 1 ? 's' : ''} escalated
              </p>
            )}
            <button
              onClick={dismissCompletionStats}
              className="mt-8 px-6 py-2.5 rounded bg-secondary text-secondary-foreground font-mono text-xs tracking-wider hover:bg-secondary/80 transition-colors"
            >
              DISMISS
            </button>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
