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
          className="fixed inset-0 z-50 flex items-center justify-center bg-background/60 backdrop-blur-[2px]"
          onClick={dismissCompletionStats}
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
            className="text-center px-8"
            onClick={(e) => e.stopPropagation()}
          >
            <CheckCircle size={36} className="text-primary mx-auto mb-5" strokeWidth={1.5} />
            <h2 className="font-display text-2xl font-bold text-foreground mb-2">Day Complete</h2>
            <div className="font-mono text-3xl text-primary tabular-nums mb-1.5">{pct}%</div>
            <p className="font-mono text-xs text-muted-foreground/50 mb-1">
              {dailyStats.completed}/{dailyStats.total} tasks
            </p>
            {dailyStats.pushed > 0 && (
              <p className="font-mono text-[10px] text-[hsl(var(--priority-2))]">
                {dailyStats.pushed} escalated
              </p>
            )}
            <button
              onClick={dismissCompletionStats}
              className="mt-6 px-5 py-2 rounded-sm border border-border text-foreground/60 font-mono text-[9px] tracking-widest hover:bg-muted/40 transition-colors"
            >
              DISMISS
            </button>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
