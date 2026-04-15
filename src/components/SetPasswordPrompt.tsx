import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Lock, ArrowRight, X } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

interface SetPasswordPromptProps {
  open: boolean;
  onClose: () => void;
}

export function SetPasswordPrompt({ open, onClose }: SetPasswordPromptProps) {
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSet = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password.length < 6) {
      toast.error('Password must be at least 6 characters');
      return;
    }
    if (password !== confirm) {
      toast.error('Passwords do not match');
      return;
    }
    setLoading(true);
    try {
      const { error } = await supabase.auth.updateUser({ password });
      if (error) throw error;
      toast.success('Password set successfully');
      onClose();
    } catch (err: any) {
      toast.error(err.message || 'Failed to set password');
    } finally {
      setLoading(false);
    }
  };

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 bg-background/95 flex items-center justify-center px-4"
        >
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 30 }}
            transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
            className="w-full max-w-xs"
          >
            <div className="text-center mb-6">
              <h2 className="text-lg font-display font-bold text-foreground tracking-tight">
                SET A PASSWORD?
              </h2>
              <p className="text-[10px] font-mono text-muted-foreground/50 tracking-wide mt-2 leading-relaxed">
                Add a password so you can log in faster next time (optional).
              </p>
            </div>

            <form onSubmit={handleSet} className="space-y-3">
              <div className="relative">
                <Lock size={12} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground/40" />
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Password"
                  minLength={6}
                  className="w-full bg-muted/40 border border-border rounded-sm pl-8 pr-3 py-2.5 text-sm font-mono text-foreground placeholder:text-muted-foreground/30 focus:outline-none focus:ring-1 focus:ring-primary/30"
                />
              </div>
              <div className="relative">
                <Lock size={12} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground/40" />
                <input
                  type="password"
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                  placeholder="Confirm password"
                  minLength={6}
                  className="w-full bg-muted/40 border border-border rounded-sm pl-8 pr-3 py-2.5 text-sm font-mono text-foreground placeholder:text-muted-foreground/30 focus:outline-none focus:ring-1 focus:ring-primary/30"
                />
              </div>

              <button
                type="submit"
                disabled={loading || !password || !confirm}
                className="w-full flex items-center justify-center gap-2 py-2.5 rounded-sm bg-primary text-primary-foreground font-mono text-[11px] tracking-widest hover:bg-primary/90 disabled:opacity-50 transition-colors"
              >
                SET PASSWORD
                <ArrowRight size={12} />
              </button>
            </form>

            <button
              onClick={onClose}
              className="w-full mt-3 py-2.5 rounded-sm border border-border text-muted-foreground font-mono text-[10px] tracking-widest hover:bg-muted/30 transition-colors"
            >
              SKIP FOR NOW
            </button>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
