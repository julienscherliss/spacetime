import { useRef, useEffect, useState, useCallback } from 'react';

interface ScrollWheelPickerProps {
  items: { value: number; label: string }[];
  selectedValue: number;
  onChange: (value: number) => void;
  itemHeight?: number;
}

export function ScrollWheelPicker({ items, selectedValue, onChange, itemHeight = 40 }: ScrollWheelPickerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [isScrolling, setIsScrolling] = useState(false);
  const scrollTimeout = useRef<number>();
  const isUserScroll = useRef(false);

  const visibleItems = 3;
  const containerHeight = itemHeight * visibleItems;
  const padding = itemHeight; // one item above and below center

  const scrollToValue = useCallback((value: number, smooth = false) => {
    const idx = items.findIndex(i => i.value === value);
    if (idx === -1 || !containerRef.current) return;
    const scrollTop = idx * itemHeight;
    containerRef.current.scrollTo({ top: scrollTop, behavior: smooth ? 'smooth' : 'auto' });
  }, [items, itemHeight]);

  useEffect(() => {
    // Initial scroll without animation
    requestAnimationFrame(() => scrollToValue(selectedValue, false));
  }, []);

  const handleScroll = useCallback(() => {
    if (!containerRef.current) return;
    setIsScrolling(true);
    
    if (scrollTimeout.current) clearTimeout(scrollTimeout.current);
    scrollTimeout.current = window.setTimeout(() => {
      if (!containerRef.current) return;
      const scrollTop = containerRef.current.scrollTop;
      const idx = Math.round(scrollTop / itemHeight);
      const clampedIdx = Math.max(0, Math.min(items.length - 1, idx));
      
      // Snap
      containerRef.current.scrollTo({ top: clampedIdx * itemHeight, behavior: 'smooth' });
      
      const newValue = items[clampedIdx].value;
      if (newValue !== selectedValue) {
        onChange(newValue);
        if (navigator.vibrate) navigator.vibrate(5);
      }
      setIsScrolling(false);
    }, 80);
  }, [items, itemHeight, selectedValue, onChange]);

  return (
    <div className="relative" style={{ height: containerHeight }}>
      {/* Selection highlight */}
      <div 
        className="absolute left-0 right-0 pointer-events-none z-10 border-y border-primary/20 bg-primary/[0.04]"
        style={{ top: padding, height: itemHeight }}
      />
      {/* Fade edges */}
      <div className="absolute inset-x-0 top-0 h-10 bg-gradient-to-b from-card to-transparent pointer-events-none z-20" />
      <div className="absolute inset-x-0 bottom-0 h-10 bg-gradient-to-t from-card to-transparent pointer-events-none z-20" />
      
      <div
        ref={containerRef}
        onScroll={handleScroll}
        className="h-full overflow-y-auto scrollbar-hide snap-y snap-mandatory"
        style={{ 
          scrollSnapType: 'y mandatory',
          WebkitOverflowScrolling: 'touch',
        }}
      >
        {/* Top padding */}
        <div style={{ height: padding }} />
        
        {items.map((item, idx) => {
          return (
            <div
              key={item.value}
              className="flex items-center justify-center font-mono text-sm snap-center select-none"
              style={{ height: itemHeight }}
              onClick={() => {
                onChange(item.value);
                scrollToValue(item.value, true);
              }}
            >
              <span className="text-foreground/70">{item.label}</span>
            </div>
          );
        })}
        
        {/* Bottom padding */}
        <div style={{ height: padding }} />
      </div>
    </div>
  );
}

interface DurationPickerProps {
  duration: number; // in minutes
  onChange: (minutes: number) => void;
}

export function DurationPicker({ duration, onChange }: DurationPickerProps) {
  const hours = Math.floor(duration / 60);
  const minutes = duration % 60;
  // Snap minutes to nearest 15
  const snappedMinutes = Math.round(minutes / 15) * 15;

  const hourItems = Array.from({ length: 13 }, (_, i) => ({
    value: i,
    label: `${i}h`,
  }));

  const minuteItems = [0, 15, 30, 45].map(m => ({
    value: m,
    label: `${m.toString().padStart(2, '0')}m`,
  }));

  const handleHourChange = (h: number) => {
    const newDuration = h * 60 + (snappedMinutes >= 60 ? 0 : snappedMinutes);
    onChange(Math.max(15, newDuration));
  };

  const handleMinuteChange = (m: number) => {
    const newDuration = hours * 60 + m;
    onChange(Math.max(15, newDuration));
  };

  const displayText = hours > 0 
    ? `${hours}h ${snappedMinutes > 0 ? `${snappedMinutes}m` : ''}`.trim()
    : `${snappedMinutes || 15}m`;

  return (
    <div>
      <div className="flex items-center gap-3">
        <div className="flex-1">
          <ScrollWheelPicker
            items={hourItems}
            selectedValue={hours}
            onChange={handleHourChange}
          />
        </div>
        <div className="text-muted-foreground/30 font-mono text-lg select-none">:</div>
        <div className="flex-1">
          <ScrollWheelPicker
            items={minuteItems}
            selectedValue={snappedMinutes >= 60 ? 0 : snappedMinutes}
            onChange={handleMinuteChange}
          />
        </div>
      </div>
      <div className="text-center mt-1.5 text-[10px] font-mono text-muted-foreground/40 tracking-wider">
        {displayText}
      </div>
    </div>
  );
}
