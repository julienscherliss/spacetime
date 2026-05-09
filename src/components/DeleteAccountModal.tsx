import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { AlertTriangle, X } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

interface Props {
  open: boolean;
  onClose: () => void;
}

/**
 * Two-step destructive flow required for App Store compliance:
 * 1) Warning + scope of what gets deleted
 * 2) Type "DELETE" to confirm, then call the `delete-account` edge function
 * On success the user is signed out and redirected to /auth.
 */
export function DeleteAccountModal({ open, onClose }: Props) {
  const [step, setStep] = useState<1 | 2>(1);
  const [confirmText, setConfirmText] = useState('');
  const [loading, setLoading] = useState(false);

  const reset = () => {
    setStep(1);
    setConfirmText('');
    setLoading(false);
  };

  const handleClose = () => {
    if (loading) return;
    reset();
    onClose();
  };

  const handleDelete = async () => {
    if (confirmText !== 'DELETE') return;
    setLoading(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        toast.error('You are not signed in.');
        setLoading(false);
        return;
      }
      const projectId = import.meta.env.VITE_SUPABASE_PROJECT_ID;
      const res = await fetch(
        `https://${projectId}.supabase.co/functions/v1/delete-account`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${session.access_token}`,
          },
          body: JSON.stringify({ confirm: 'DELETE' }),
        }
      );
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(json?.message || json?.error || 'Failed to delete account.');
        setLoading(false);
        return;
      }
      // Clear local state and sign out, then navigate.
      try { await supabase.auth.signOut(); } catch (_) { /* noop */ }
      try { localStorage.clear(); } catch (_) { /* noop */ }
      window.location.replace('/auth');
    } catch (e) {
      toast.error('Failed to delete account. Please try again.');
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
          className="fixed inset-0 z-[120] bg-background/80 backdrop-blur-sm flex items-center justify-center p-4"
          onClick={handleClose}
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.96, y: 8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: 8 }}
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-sm bg-card border border-border/60 rounded-sm p-5"
          >
            <div className="flex items-start justify-between mb-3">
              <div className="flex items-center gap-2">
                <AlertTriangle size={14} className="text-destructive" strokeWidth={1.5} />
                <span className="text-[10px] font-mono tracking-[0.18em] text-destructive">
                  DELETE ACCOUNT
                </span>
              </div>
              <button
                onClick={handleClose}
                disabled={loading}
                className="p-1 text-muted-foreground/60 hover:text-foreground rounded disabled:opacity-40"
              >
                <X size={14} />
              </button>
            </div>

            {step === 1 ? (
              <>
                <div className="text-[14px] font-display text-foreground mb-2">
                  This permanently deletes your account.
                </div>
                <ul className="text-[11px] font-mono text-muted-foreground/80 leading-relaxed list-disc pl-4 mb-5 space-y-1">
                  <li>All tasks, routines, notes, and subtasks</li>
                  <li>Library items, tags, and clients</li>
                  <li>Invoices and billing settings</li>
                  <li>Your profile and sign-in credentials</li>
                </ul>
                <div className="text-[10px] font-mono text-muted-foreground/60 mb-4">
                  This cannot be undone. If you have an active subscription,
                  cancel it first to stop future billing.
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={handleClose}
                    className="flex-1 px-3 py-2 rounded-sm border border-border/50 text-[11px] font-mono tracking-[0.12em] text-muted-foreground hover:text-foreground hover:bg-muted/40"
                  >
                    CANCEL
                  </button>
                  <button
                    onClick={() => setStep(2)}
                    className="flex-1 px-3 py-2 rounded-sm bg-destructive text-destructive-foreground text-[11px] font-mono tracking-[0.12em] hover:bg-destructive/90"
                  >
                    CONTINUE
                  </button>
                </div>
              </>
            ) : (
              <>
                <div className="text-[12px] font-mono text-foreground mb-3 leading-relaxed">
                  Type <span className="text-destructive font-bold">DELETE</span> to confirm.
                </div>
                <input
                  type="text"
                  autoFocus
                  value={confirmText}
                  onChange={(e) => setConfirmText(e.target.value)}
                  disabled={loading}
                  placeholder="DELETE"
                  className="input-compact w-full bg-background border border-border/50 rounded-sm px-2 py-2 text-[12px] font-mono text-foreground focus:outline-none focus:border-destructive/60 mb-4"
                />
                <div className="flex gap-2">
                  <button
                    onClick={() => { setStep(1); setConfirmText(''); }}
                    disabled={loading}
                    className="flex-1 px-3 py-2 rounded-sm border border-border/50 text-[11px] font-mono tracking-[0.12em] text-muted-foreground hover:text-foreground hover:bg-muted/40 disabled:opacity-40"
                  >
                    BACK
                  </button>
                  <button
                    onClick={handleDelete}
                    disabled={loading || confirmText !== 'DELETE'}
                    className="flex-1 px-3 py-2 rounded-sm bg-destructive text-destructive-foreground text-[11px] font-mono tracking-[0.12em] hover:bg-destructive/90 disabled:opacity-40"
                  >
                    {loading ? 'DELETING…' : 'DELETE ACCOUNT'}
                  </button>
                </div>
              </>
            )}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}