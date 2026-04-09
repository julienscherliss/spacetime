import { motion } from 'framer-motion';

interface SegmentedProgressRingProps {
  progress: number; // 0 to 1
  size: number;
  segments?: number;
  strokeWidth?: number;
  gap?: number; // degrees between segments
}

export function SegmentedProgressRing({
  progress,
  size,
  segments = 60,
  strokeWidth = 3,
  gap = 2,
}: SegmentedProgressRingProps) {
  const radius = (size - strokeWidth) / 2;
  const cx = size / 2;
  const cy = size / 2;
  const filledCount = Math.floor(progress * segments);
  const segmentAngle = 360 / segments;
  const barAngle = segmentAngle - gap;
  const barLength = (barAngle / 360) * 2 * Math.PI * radius;

  return (
    <svg
      width={size}
      height={size}
      className="absolute inset-0 m-auto pointer-events-none"
      style={{ width: size, height: size }}
    >
      {Array.from({ length: segments }).map((_, i) => {
        const startAngle = -90 + i * segmentAngle;
        const rad = (startAngle * Math.PI) / 180;
        const x1 = cx + radius * Math.cos(rad);
        const y1 = cy + radius * Math.sin(rad);
        const endRad = ((startAngle + barAngle) * Math.PI) / 180;
        const x2 = cx + radius * Math.cos(endRad);
        const y2 = cy + radius * Math.sin(endRad);
        const largeArc = barAngle > 180 ? 1 : 0;
        const d = `M ${x1} ${y1} A ${radius} ${radius} 0 ${largeArc} 1 ${x2} ${y2}`;
        const isFilled = i < filledCount;

        return (
          <motion.path
            key={i}
            d={d}
            fill="none"
            stroke="currentColor"
            strokeWidth={strokeWidth}
            strokeLinecap="butt"
            className="text-foreground"
            initial={false}
            animate={{
              opacity: isFilled ? 0.5 : 0.1,
            }}
            transition={{ duration: 0.15, ease: 'easeOut' }}
          />
        );
      })}
    </svg>
  );
}
