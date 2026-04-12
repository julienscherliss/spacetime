interface SegmentedProgressRingProps {
  progress: number; // 0 to 1
  size: number;
  segments?: number;
  barWidth?: number;
  barLength?: number;
  holdProgress?: number; // 0 to 1, orange overlay
  color?: 'default' | 'destructive'; // ring color theme
}

export function SegmentedProgressRing({
  progress,
  size,
  segments = 60,
  barWidth = 4,
  barLength = 14,
  holdProgress = 0,
  color = 'default',
}: SegmentedProgressRingProps) {
  const cx = size / 2;
  const cy = size / 2;
  const radius = (size - barLength) / 2;
  const filledCount = Math.round(progress * segments);
  const holdFilledCount = Math.round(holdProgress * segments);

  const holdColor = color === 'destructive' ? 'hsl(var(--foreground))' : 'hsl(var(--primary))';
  const barColor = color === 'destructive' ? 'hsl(0 72% 51%)' : undefined; // red-500 equivalent

  return (
    <svg
      width={size}
      height={size}
      className="absolute inset-0 m-auto pointer-events-none"
    >
      {Array.from({ length: segments }).map((_, i) => {
        const angle = (i / segments) * 360 - 90;
        const rad = (angle * Math.PI) / 180;
        const isHoldFilled = i < holdFilledCount;
        const isFilled = i < filledCount;
        const x1 = cx + (radius - barLength / 2) * Math.cos(rad);
        const y1 = cy + (radius - barLength / 2) * Math.sin(rad);
        const x2 = cx + (radius + barLength / 2) * Math.cos(rad);
        const y2 = cy + (radius + barLength / 2) * Math.sin(rad);

        return (
          <line
            key={i}
            x1={x1}
            y1={y1}
            x2={x2}
            y2={y2}
            stroke={isHoldFilled ? holdColor : barColor || 'currentColor'}
            strokeWidth={barWidth}
            strokeLinecap="butt"
            className={isHoldFilled || barColor ? '' : 'text-foreground'}
            style={{
              opacity: isHoldFilled ? 0.75 : isFilled ? 0.55 : 0.08,
              transition: 'opacity 100ms ease, stroke 100ms ease',
            }}
          />
        );
      })}
    </svg>
  );
}
