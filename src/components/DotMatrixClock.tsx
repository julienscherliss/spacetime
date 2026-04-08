import { memo, useMemo } from 'react';
import { motion } from 'framer-motion';

// 5x7 dot patterns for digits 0-9 and colon
const DIGIT_PATTERNS: Record<string, number[][]> = {
  '0': [
    [0,1,1,1,0],
    [1,0,0,0,1],
    [1,0,0,1,1],
    [1,0,1,0,1],
    [1,1,0,0,1],
    [1,0,0,0,1],
    [0,1,1,1,0],
  ],
  '1': [
    [0,0,1,0,0],
    [0,1,1,0,0],
    [1,0,1,0,0],
    [0,0,1,0,0],
    [0,0,1,0,0],
    [0,0,1,0,0],
    [1,1,1,1,1],
  ],
  '2': [
    [0,1,1,1,0],
    [1,0,0,0,1],
    [0,0,0,0,1],
    [0,0,1,1,0],
    [0,1,0,0,0],
    [1,0,0,0,0],
    [1,1,1,1,1],
  ],
  '3': [
    [0,1,1,1,0],
    [1,0,0,0,1],
    [0,0,0,0,1],
    [0,0,1,1,0],
    [0,0,0,0,1],
    [1,0,0,0,1],
    [0,1,1,1,0],
  ],
  '4': [
    [0,0,0,1,0],
    [0,0,1,1,0],
    [0,1,0,1,0],
    [1,0,0,1,0],
    [1,1,1,1,1],
    [0,0,0,1,0],
    [0,0,0,1,0],
  ],
  '5': [
    [1,1,1,1,1],
    [1,0,0,0,0],
    [1,1,1,1,0],
    [0,0,0,0,1],
    [0,0,0,0,1],
    [1,0,0,0,1],
    [0,1,1,1,0],
  ],
  '6': [
    [0,1,1,1,0],
    [1,0,0,0,0],
    [1,0,0,0,0],
    [1,1,1,1,0],
    [1,0,0,0,1],
    [1,0,0,0,1],
    [0,1,1,1,0],
  ],
  '7': [
    [1,1,1,1,1],
    [0,0,0,0,1],
    [0,0,0,1,0],
    [0,0,1,0,0],
    [0,0,1,0,0],
    [0,0,1,0,0],
    [0,0,1,0,0],
  ],
  '8': [
    [0,1,1,1,0],
    [1,0,0,0,1],
    [1,0,0,0,1],
    [0,1,1,1,0],
    [1,0,0,0,1],
    [1,0,0,0,1],
    [0,1,1,1,0],
  ],
  '9': [
    [0,1,1,1,0],
    [1,0,0,0,1],
    [1,0,0,0,1],
    [0,1,1,1,1],
    [0,0,0,0,1],
    [0,0,0,0,1],
    [0,1,1,1,0],
  ],
};

// Build a full grid: HH on top, MM on bottom, each digit 5 cols wide with 2-col gap
function buildDotGrid(hours: string, minutes: string): boolean[][] {
  const h1 = DIGIT_PATTERNS[hours[0]] || DIGIT_PATTERNS['0'];
  const h2 = DIGIT_PATTERNS[hours[1]] || DIGIT_PATTERNS['0'];
  const m1 = DIGIT_PATTERNS[minutes[0]] || DIGIT_PATTERNS['0'];
  const m2 = DIGIT_PATTERNS[minutes[1]] || DIGIT_PATTERNS['0'];

  const GAP = 2; // columns between digits
  const ROW_GAP = 2; // rows between hours and minutes
  const width = 5 + GAP + 5; // 12 cols total
  const height = 7 + ROW_GAP + 7; // 16 rows total

  const grid: boolean[][] = [];

  for (let r = 0; r < height; r++) {
    const row: boolean[] = [];
    for (let c = 0; c < width; c++) {
      let active = false;

      if (r < 7) {
        // Hours row
        if (c < 5) active = h1[r][c] === 1;
        else if (c >= 5 + GAP) active = h2[r][c - 5 - GAP] === 1;
      } else if (r >= 7 + ROW_GAP) {
        // Minutes row
        const mr = r - 7 - ROW_GAP;
        if (c < 5) active = m1[mr][c] === 1;
        else if (c >= 5 + GAP) active = m2[mr][c - 5 - GAP] === 1;
      }

      row.push(active);
    }
    grid.push(row);
  }

  return grid;
}

interface DotMatrixClockProps {
  hours: string;
  minutes: string;
}

export const DotMatrixClock = memo(function DotMatrixClock({ hours, minutes }: DotMatrixClockProps) {
  const grid = useMemo(() => buildDotGrid(hours, minutes), [hours, minutes]);

  const cols = grid[0]?.length || 12;
  const rows = grid.length;

  return (
    <div
      className="grid pointer-events-none select-none"
      style={{
        gridTemplateColumns: `repeat(${cols}, 1fr)`,
        gridTemplateRows: `repeat(${rows}, 1fr)`,
        width: '70%',
        aspectRatio: `${cols} / ${rows}`,
        gap: 'clamp(4px, 1.2vw, 10px)',
      }}
    >
      {grid.flatMap((row, r) =>
        row.map((active, c) => (
          <motion.div
            key={`${r}-${c}`}
            className="rounded-full"
            animate={{
              backgroundColor: active
                ? 'hsl(var(--foreground) / 0.32)'
                : 'hsl(var(--muted-foreground) / 0.1)',
            }}
            transition={{ duration: 0.5, ease: 'easeInOut' }}
            style={{
              width: '100%',
              aspectRatio: '1',
            }}
          />
        ))
      )}
    </div>
  );
});
