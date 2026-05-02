import React from 'react';

/**
 * Visual notation for task duration, built from 15-minute units.
 *
 *   15m  → single centered dot
 *   30m  → two dots stacked (colon)
 *   45m  → colon + a third centered dot to the right
 *   60m  → vertical rectangle (one "hour" block)
 *
 * Longer durations are composed left-to-right by chaining hour rectangles
 * followed by the remainder glyph (15 / 30 / 45). E.g. 1h30 = rectangle + colon.
 */

interface DurationGlyphProps {
  minutes: number;
  /** Pixel size of one "unit" cell (height of a rectangle / colon). */
  size?: number;
  className?: string;
}

const DOT_R = 1.5;

function RemainderGlyph({ mins, size }: { mins: number; size: number }) {
  // Width of cell scales with remainder so 45m gets a touch more room.
  const w = mins === 45 ? size * 0.85 : size * 0.45;
  const h = size;
  const cx = w / 2;
  // Nudge everything down slightly — SVG center sits above text optical
  // middle when inline with capitals + descenders, so bias toward bottom.
  const topY = h * 0.42;
  const botY = h * 0.78;
  const midY = h * 0.6;

  return (
    <svg
      width={w}
      height={h}
      viewBox={`0 0 ${w} ${h}`}
      className="inline-block align-middle"
      style={{ overflow: 'visible' }}
    >
      {mins === 15 && <circle cx={cx} cy={midY} r={DOT_R} fill="currentColor" />}
      {mins === 30 && (
        <>
          <circle cx={cx} cy={topY} r={DOT_R} fill="currentColor" />
          <circle cx={cx} cy={botY} r={DOT_R} fill="currentColor" />
        </>
      )}
      {mins === 45 && (
        <>
          <circle cx={w * 0.32} cy={topY} r={DOT_R} fill="currentColor" />
          <circle cx={w * 0.32} cy={botY} r={DOT_R} fill="currentColor" />
          <circle cx={w * 0.72} cy={midY} r={DOT_R} fill="currentColor" />
        </>
      )}
    </svg>
  );
}

function HourGlyph({ size }: { size: number }) {
  // Bar should match cap-height of the surrounding text, not full line-box.
  const w = size * 0.3;
  const h = size * 0.72;
  return (
    <svg
      width={w}
      height={h}
      viewBox={`0 0 ${w} ${h}`}
      className="inline-block"
      style={{ overflow: 'visible', verticalAlign: '-0.08em' }}
    >
      <rect
        x={0}
        y={0}
        width={w}
        height={h}
        rx={0.8}
        fill="currentColor"
      />
    </svg>
  );
}
      style={{ overflow: 'visible' }}
    >
      <rect
        x={0.5}
        y={h * 0.05}
        width={w - 1}
        height={h * 0.9}
        rx={0.6}
        fill="currentColor"
      />
    </svg>
  );
}

export function DurationGlyph({ minutes, size = 13, className = '' }: DurationGlyphProps) {
  if (!minutes || minutes <= 0) return null;
  const hours = Math.floor(minutes / 60);
  const remainder = minutes % 60; // 0, 15, 30, or 45 (rounded to nearest 15)
  const roundedRem = remainder === 0 ? 0 : [15, 30, 45].reduce((p, c) =>
    Math.abs(c - remainder) < Math.abs(p - remainder) ? c : p, 15
  );

  return (
    <span
      className={`inline-flex items-center gap-[2px] text-foreground ${className}`}
      style={{ lineHeight: 0 }}
      aria-label={`${minutes} minutes`}
    >
      {Array.from({ length: hours }).map((_, i) => (
        <HourGlyph key={`h-${i}`} size={size} />
      ))}
      {roundedRem > 0 && <RemainderGlyph mins={roundedRem} size={size} />}
    </span>
  );
}