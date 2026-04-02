import { useState, useEffect } from 'react';
import { Minus, Plus } from 'lucide-react';

interface ZoomControlProps {
  onZoomIn: () => void;
  onZoomOut: () => void;
  onReset: () => void;
  zoomPercent: number;
  isMin: boolean;
  isMax: boolean;
  isDefault: boolean;
}

export function ZoomControl({ onZoomIn, onZoomOut, onReset, zoomPercent, isMin, isMax, isDefault }: ZoomControlProps) {
  const [showHint, setShowHint] = useState(false);

  useEffect(() => {
    const key = 'do-zoom-hint-shown';
    if (!localStorage.getItem(key)) {
      setShowHint(true);
      localStorage.setItem(key, '1');
      const timer = setTimeout(() => setShowHint(false), 4000);
      return () => clearTimeout(timer);
    }
  }, []);

  return (
    <div className="flex flex-col items-center gap-0.5 relative">
      {/* Hint tooltip */}
      {showHint && (
        <div className="absolute -left-32 top-0 w-28 px-2 py-1.5 rounded-sm bg-card border border-border shadow-sm pointer-events-none animate-in fade-in duration-300">
          <p className="text-[7px] font-mono text-muted-foreground/60 leading-relaxed">
            Scale time axis
          </p>
          <p className="text-[7px] font-mono text-muted-foreground/40 mt-0.5">
            ⌥ + scroll also works
          </p>
        </div>
      )}

      {/* Zoom in */}
      <button
        onClick={onZoomIn}
        disabled={isMax}
        className="w-6 h-6 flex items-center justify-center rounded-sm border border-border/60 text-muted-foreground/50 hover:text-foreground hover:border-border transition-colors disabled:opacity-20 disabled:cursor-not-allowed"
        title="Zoom in"
      >
        <Plus size={10} strokeWidth={1.5} />
      </button>

      {/* Track */}
      <div
        className="w-[1px] h-12 bg-border/40 relative cursor-pointer group"
        onClick={onReset}
        title="Reset scale"
      >
        {/* Filled portion */}
        <div
          className="absolute bottom-0 left-0 w-full bg-muted-foreground/20 transition-all duration-150"
          style={{ height: `${zoomPercent}%` }}
        />
        {/* Thumb */}
        <div
          className="absolute left-1/2 -translate-x-1/2 w-2 h-[3px] rounded-full bg-muted-foreground/30 group-hover:bg-muted-foreground/50 transition-all duration-150"
          style={{ bottom: `calc(${zoomPercent}% - 1.5px)` }}
        />
        {/* Default marker */}
        {!isDefault && (
          <div
            className="absolute left-1/2 -translate-x-1/2 w-1 h-px bg-muted-foreground/15"
            style={{ bottom: `${((56 - 28) / (120 - 28)) * 100}%` }}
          />
        )}
      </div>

      {/* Zoom out */}
      <button
        onClick={onZoomOut}
        disabled={isMin}
        className="w-6 h-6 flex items-center justify-center rounded-sm border border-border/60 text-muted-foreground/50 hover:text-foreground hover:border-border transition-colors disabled:opacity-20 disabled:cursor-not-allowed"
        title="Zoom out"
      >
        <Minus size={10} strokeWidth={1.5} />
      </button>

      {/* Scale label */}
      <span className="text-[7px] font-mono text-muted-foreground/25 tracking-widest mt-0.5 select-none">
        SCALE
      </span>
    </div>
  );
}
