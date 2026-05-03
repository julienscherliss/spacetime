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

const getHourWidth = (size: number) => size * 0.3;
const getRemainderWidth = (mins: number, size: number) => (mins === 45 ? size * 0.85 : size * 0.45);

export function DurationGlyph({ minutes, size = 13, className = '' }: DurationGlyphProps) {
  if (!minutes || minutes <= 0) return null;

  const hours = Math.floor(minutes / 60);
  const remainder = minutes % 60; // 0, 15, 30, or 45 (rounded to nearest 15)
  const roundedRem = remainder === 0 ? 0 : [15, 30, 45].reduce((p, c) =>
    Math.abs(c - remainder) < Math.abs(p - remainder) ? c : p, 15
  );

  const gap = 2;
  const unitWidths = [
    ...Array.from({ length: hours }, () => getHourWidth(size)),
    ...(roundedRem > 0 ? [getRemainderWidth(roundedRem, size)] : []),
  ];
  const totalWidth = unitWidths.reduce((sum, width) => sum + width, 0) + Math.max(unitWidths.length - 1, 0) * gap;

  const midY = size * 0.5;
  const spread = size * 0.18;
  const topY = midY - spread;
  const botY = midY + spread;
  const barH = size * 0.72;
  const barY = (size - barH) / 2;

  let cursorX = 0;
  const shapes: React.ReactNode[] = [];

  for (let i = 0; i < hours; i += 1) {
    const width = getHourWidth(size);
    shapes.push(
      <rect
        key={`h-${i}`}
        x={cursorX}
        y={barY}
        width={width}
        height={barH}
        rx={0.8}
        fill="currentColor"
      />
    );
    cursorX += width + gap;
  }

  if (roundedRem > 0) {
    const width = getRemainderWidth(roundedRem, size);
    const cx = cursorX + width / 2;

    if (roundedRem === 15) {
      shapes.push(<circle key="r-15" cx={cx} cy={midY} r={DOT_R} fill="currentColor" />);
    }

    if (roundedRem === 30) {
      shapes.push(
        <React.Fragment key="r-30">
          <circle cx={cx} cy={topY} r={DOT_R} fill="currentColor" />
          <circle cx={cx} cy={botY} r={DOT_R} fill="currentColor" />
        </React.Fragment>
      );
    }

    if (roundedRem === 45) {
      shapes.push(
        <React.Fragment key="r-45">
          <circle cx={cursorX + width * 0.32} cy={topY} r={DOT_R} fill="currentColor" />
          <circle cx={cursorX + width * 0.32} cy={botY} r={DOT_R} fill="currentColor" />
          <circle cx={cursorX + width * 0.72} cy={midY} r={DOT_R} fill="currentColor" />
        </React.Fragment>
      );
    }
  }

  return (
    <svg
      width={totalWidth}
      height={size}
      viewBox={`0 0 ${totalWidth} ${size}`}
      className={`inline-block text-foreground ${className}`}
      style={{ overflow: 'visible', verticalAlign: 'middle' }}
      role="img"
      aria-label={`${minutes} minutes`}
    >
      {shapes}
    </svg>
  );
}