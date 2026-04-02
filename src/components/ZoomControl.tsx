import { useRef, useCallback, useEffect, useState } from 'react';
import { Minus, Plus } from 'lucide-react';
import { SCALE_MIN, SCALE_MAX, SCALE_DEFAULT } from '@/hooks/useTimeScale';

interface ZoomControlProps {
  zoomPercent: number;
  isMin: boolean;
  isMax: boolean;
  isDefault: boolean;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onReset: () => void;
  onSetScale: (v: number) => void;
}

const TRACK_HEIGHT = 120;

export function ZoomControl({
  zoomPercent, isMin, isMax, isDefault,
  onZoomIn, onZoomOut, onReset, onSetScale,
}: ZoomControlProps) {
  const trackRef = useRef<HTMLDivElement>(null);
  const [dragging, setDragging] = useState(false);
  const [showHint, setShowHint] = useState(false);

  useEffect(() => {
    const key = 'do-zoom-hint-shown-v2';
    if (!localStorage.getItem(key)) {
      setShowHint(true);
      localStorage.setItem(key, '1');
      const timer = setTimeout(() => setShowHint(false), 4000);
      return () => clearTimeout(timer);
    }
  }, []);

  const getScaleFromY = useCallback((clientY: number) => {
    if (!trackRef.current) return SCALE_DEFAULT;
    const rect = trackRef.current.getBoundingClientRect();
    // Top = max zoom, bottom = min zoom
    const pct = 1 - Math.max(0, Math.min(1, (clientY - rect.top) / rect.height));
    return SCALE_MIN + pct * (SCALE_MAX - SCALE_MIN);
  }, []);

  const handleTrackMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    setDragging(true);
    onSetScale(getScaleFromY(e.clientY));
  }, [getScaleFromY, onSetScale]);

  useEffect(() => {
    if (!dragging) return;
    const onMove = (e: MouseEvent) => {
      onSetScale(getScaleFromY(e.clientY));
    };
    const onUp = () => setDragging(false);
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
  }, [dragging, getScaleFromY, onSetScale]);

  // Default marker position
  const defaultPct = ((SCALE_DEFAULT - SCALE_MIN) / (SCALE_MAX - SCALE_MIN)) * 100;

  return (
    <div className="flex flex-col items-center gap-1 relative select-none">
      {/* Hint */}
      {showHint && (
        <div className="absolute -left-28 top-0 w-24 px-2 py-1.5 rounded-sm bg-card border border-border shadow-sm pointer-events-none animate-in fade-in duration-300">
          <p className="text-[7px] font-mono text-muted-foreground/60 leading-relaxed">
            Drag to scale
          </p>
          <p className="text-[7px] font-mono text-muted-foreground/40 mt-0.5">
            ⌥ + scroll also works
          </p>
        </div>
      )}

      {/* + button */}
      <button
        onClick={onZoomIn}
        disabled={isMax}
        className="w-6 h-6 flex items-center justify-center rounded-sm border border-border/60 text-muted-foreground/40 hover:text-foreground hover:border-border transition-colors disabled:opacity-15 disabled:cursor-not-allowed"
      >
        <Plus size={9} strokeWidth={1.5} />
      </button>

      {/* Draggable track */}
      <div
        ref={trackRef}
        onMouseDown={handleTrackMouseDown}
        className="relative cursor-ns-resize group"
        style={{ width: 12, height: TRACK_HEIGHT }}
      >
        {/* Track background */}
        <div className="absolute left-1/2 -translate-x-1/2 w-px h-full bg-border/30" />

        {/* Tick marks — every 25% */}
        {[0, 25, 50, 75, 100].map((pct) => (
          <div
            key={pct}
            className="absolute left-1/2 -translate-x-1/2 w-1.5 h-px bg-border/20"
            style={{ bottom: `${pct}%` }}
          />
        ))}

        {/* Default marker */}
        {!isDefault && (
          <div
            className="absolute left-1/2 -translate-x-1/2 w-2 h-px bg-muted-foreground/20"
            style={{ bottom: `${defaultPct}%` }}
          />
        )}

        {/* Filled portion */}
        <div
          className="absolute left-1/2 -translate-x-1/2 w-px bg-muted-foreground/15 transition-all duration-75"
          style={{ bottom: 0, height: `${zoomPercent}%` }}
        />

        {/* Thumb — larger hit area */}
        <div
          className={`absolute left-1/2 -translate-x-1/2 transition-all duration-75 ${
            dragging ? 'scale-110' : ''
          }`}
          style={{ bottom: `calc(${zoomPercent}% - 5px)` }}
        >
          <div className={`w-3 h-2.5 rounded-[1px] border transition-colors ${
            dragging
              ? 'bg-foreground/10 border-foreground/30'
              : 'bg-card border-border/60 group-hover:border-foreground/20'
          }`}>
            {/* Grip lines */}
            <div className="flex flex-col items-center justify-center h-full gap-[1px]">
              <div className="w-1.5 h-px bg-muted-foreground/20" />
              <div className="w-1.5 h-px bg-muted-foreground/20" />
            </div>
          </div>
        </div>
      </div>

      {/* – button */}
      <button
        onClick={onZoomOut}
        disabled={isMin}
        className="w-6 h-6 flex items-center justify-center rounded-sm border border-border/60 text-muted-foreground/40 hover:text-foreground hover:border-border transition-colors disabled:opacity-15 disabled:cursor-not-allowed"
      >
        <Minus size={9} strokeWidth={1.5} />
      </button>

      {/* Label */}
      <span className="text-[6px] font-mono text-muted-foreground/20 tracking-[0.2em] mt-0.5 select-none">
        SCALE
      </span>
    </div>
  );
}
