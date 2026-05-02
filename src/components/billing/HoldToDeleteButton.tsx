import { useEffect, useRef, useState } from 'react';
import { Trash2 } from 'lucide-react';

interface Props {
  onConfirm: () => void;
  durationMs?: number;
  label?: string;
  className?: string;
}

/**
 * Press-and-hold (default 2s) button. Releases early = cancels.
 * Uses an animated fill to indicate progress.
 */
export function HoldToDeleteButton({
  onConfirm,
  durationMs = 2000,
  label = 'DELETE',
  className = '',
}: Props) {
  const [progress, setProgress] = useState(0);
  const [holding, setHolding] = useState(false);
  const startRef = useRef<number | null>(null);
  const rafRef = useRef<number | null>(null);
  const firedRef = useRef(false);

  const cancel = () => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    rafRef.current = null;
    startRef.current = null;
    setHolding(false);
    if (!firedRef.current) setProgress(0);
  };

  const start = () => {
    if (holding) return;
    firedRef.current = false;
    setHolding(true);
    startRef.current = performance.now();
    const tick = (now: number) => {
      if (startRef.current == null) return;
      const p = Math.min(1, (now - startRef.current) / durationMs);
      setProgress(p);
      if (p >= 1) {
        firedRef.current = true;
        cancel();
        onConfirm();
        // brief flash then reset
        setTimeout(() => setProgress(0), 200);
        return;
      }
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
  };

  useEffect(() => () => { if (rafRef.current) cancelAnimationFrame(rafRef.current); }, []);

  return (
    <button
      onMouseDown={start}
      onMouseUp={cancel}
      onMouseLeave={cancel}
      onTouchStart={(e) => { e.preventDefault(); start(); }}
      onTouchEnd={cancel}
      onTouchCancel={cancel}
      onContextMenu={(e) => e.preventDefault()}
      className={`relative overflow-hidden flex items-center gap-1 px-2 py-1 rounded text-[9px] font-mono tracking-wide border border-destructive/30 text-destructive/80 hover:text-destructive hover:border-destructive/60 transition-colors select-none ${className}`}
      title="Hold to delete"
    >
      <span
        aria-hidden
        className="absolute inset-0 bg-destructive/20 origin-left"
        style={{ transform: `scaleX(${progress})`, transition: holding ? 'none' : 'transform 0.2s ease-out' }}
      />
      <Trash2 size={10} className="relative z-10" />
      <span className="relative z-10">{holding ? `HOLD… ${Math.round(progress * 100)}%` : label}</span>
    </button>
  );
}