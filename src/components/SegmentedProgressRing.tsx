interface SegmentedProgressRingProps {
  progress: number; // 0 to 1
  size: number;
  segments?: number;
  barWidth?: number;
  barLength?: number;
}

export function SegmentedProgressRing({
  progress,
  size,
  segments = 60,
  barWidth = 4,
  barLength = 14,
}: SegmentedProgressRingProps) {
  const cx = size / 2;
  const cy = size / 2;
  const radius = (size - barLength) / 2;
  const filledCount = Math.round(progress * segments);

  return (
    <svg
      width={size}
      height={size}
      className="absolute inset-0 m-auto pointer-events-none"
    >
      {Array.from({ length: segments }).map((_, i) => {
        const angle = (i / segments) * 360 - 90;
        const rad = (angle * Math.PI) / 180;
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
            stroke="currentColor"
            strokeWidth={barWidth}
            strokeLinecap="butt"
            className="text-foreground transition-opacity duration-150"
            style={{ opacity: isFilled ? 0.55 : 0.08 }}
          />
        );
      })}
    </svg>
  );
}
