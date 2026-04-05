import { motion } from 'framer-motion';

interface HoldToConfirmRingProps {
  progress: number; // 0 to 1
  size?: number;
  strokeWidth?: number;
  label?: string;
}

export function HoldToConfirmRing({ progress, size = 48, strokeWidth = 3, label }: HoldToConfirmRingProps) {
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference * (1 - Math.min(1, Math.max(0, progress)));

  return (
    <div className="flex flex-col items-center gap-1.5">
      <div className="relative" style={{ width: size, height: size }}>
        {/* Background ring */}
        <svg width={size} height={size} className="absolute inset-0 -rotate-90">
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            stroke="hsl(var(--muted-foreground) / 0.15)"
            strokeWidth={strokeWidth}
          />
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            stroke={progress >= 1 ? 'hsl(var(--primary))' : 'hsl(var(--primary) / 0.7)'}
            strokeWidth={strokeWidth}
            strokeDasharray={circumference}
            strokeDashoffset={offset}
            strokeLinecap="round"
            style={{ transition: 'none' }}
          />
        </svg>
        {/* Center icon pulse on complete */}
        {progress >= 1 && (
          <motion.div
            initial={{ scale: 0.5, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className="absolute inset-0 flex items-center justify-center"
          >
            <div className="w-3 h-3 rounded-full bg-primary" />
          </motion.div>
        )}
      </div>
      {label && (
        <span className="text-[9px] font-mono tracking-wider text-foreground/60 uppercase whitespace-nowrap">
          {label}
        </span>
      )}
    </div>
  );
}
