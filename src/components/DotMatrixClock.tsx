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

const COLON_PATTERN: number[][] = [
  [0],
  [1],
  [0],
  [0],
  [0],
  [1],
  [0],
];

// Build a single horizontal row: D D : D D (all 7 rows tall)
function buildDotGrid(hours: string, minutes: string): boolean[][] {
  const blank: number[][] = Array(7).fill(null).map(() => Array(5).fill(0));
  const h1 = DIGIT_PATTERNS[hours[0]] || blank;
  const h2 = DIGIT_PATTERNS[hours[1]] || blank;
  const m1 = DIGIT_PATTERNS[minutes[0]] || blank;
  const m2 = DIGIT_PATTERNS[minutes[1]] || blank;

  const DIGIT_GAP = 1; // cols between digits in same group
  const COLON_PAD = 1; // cols on each side of colon
  // Layout: [5] gap [5] pad [1] pad [5] gap [5] = 5+1+5+1+1+1+5+1+5 = 25
  const width = 5 + DIGIT_GAP + 5 + COLON_PAD + 1 + COLON_PAD + 5 + DIGIT_GAP + 5;
  const height = 7;

  const grid: boolean[][] = [];

  for (let r = 0; r < height; r++) {
    const row: boolean[] = [];
    for (let c = 0; c < width; c++) {
      let active = false;

      if (c < 5) {
        active = h1[r][c] === 1;
      } else if (c >= 5 + DIGIT_GAP && c < 10 + DIGIT_GAP) {
        active = h2[r][c - 5 - DIGIT_GAP] === 1;
      } else if (c >= 10 + DIGIT_GAP + COLON_PAD && c < 10 + DIGIT_GAP + COLON_PAD + 1) {
        active = COLON_PATTERN[r][0] === 1;
      } else if (c >= 10 + DIGIT_GAP + COLON_PAD + 1 + COLON_PAD && c < 15 + DIGIT_GAP + COLON_PAD + 1 + COLON_PAD) {
        active = m1[r][c - (10 + DIGIT_GAP + COLON_PAD + 1 + COLON_PAD)] === 1;
      } else if (c >= 15 + DIGIT_GAP * 2 + COLON_PAD + 1 + COLON_PAD && c < 20 + DIGIT_GAP * 2 + COLON_PAD + 1 + COLON_PAD) {
        active = m2[r][c - (15 + DIGIT_GAP * 2 + COLON_PAD + 1 + COLON_PAD)] === 1;
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

  const cols = grid[0]?.length || 25;
  const rows = grid.length;

  return (
    <div
      className="grid pointer-events-none select-none"
      style={{
        gridTemplateColumns: `repeat(${cols}, 1fr)`,
        gridTemplateRows: `repeat(${rows}, 1fr)`,
        width: '92%',
        aspectRatio: `${cols} / ${rows}`,
        gap: 'clamp(3px, 1vw, 8px)',
      }}
    >
      {grid.flatMap((row, r) =>
        row.map((active, c) => (
          <motion.div
            key={`${r}-${c}`}
            className="rounded-full"
            animate={{
              backgroundColor: active
                ? 'hsl(var(--foreground) / 0.09)'
                : 'hsl(var(--muted-foreground) / 0.03)',
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
