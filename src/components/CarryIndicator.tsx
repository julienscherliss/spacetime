import { useCarryStore } from '@/store/carryStore';
import { X } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

export function CarryIndicator() {
  const carried = useCarryStore((s) => s.carried);

  return (
    <AnimatePresence>
      {carried && (
        <motion.div
          initial={{ y: 20, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: 20, opacity: 0 }}
          transition={{ duration: 0.2 }}
          className="fixed bottom-20 left-1/2 -translate-x-1/2 z-[200] flex items-center gap-2 px-3 py-2 rounded-sm bg-card border border-primary/30 shadow-lg"
        >
          <div className="w-2 h-2 rounded-full bg-primary animate-pulse" />
          <span className="text-[11px] font-mono text-foreground truncate max-w-[200px]">
            {carried.title}
          </span>
          <span className="text-[9px] font-mono text-muted-foreground/50">
            {carried.duration}m
          </span>
          <button
            onClick={() => useCarryStore.getState().cancel()}
            className="p-0.5 rounded-sm text-muted-foreground/40 hover:text-foreground transition-colors ml-1"
          >
            <X size={12} />
          </button>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
