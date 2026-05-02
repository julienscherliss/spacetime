export function formatCurrency(amount: number, currency = 'USD'): string {
  try {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency,
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(amount);
  } catch {
    return `${currency} ${amount.toFixed(2)}`;
  }
}

export function formatHours(minutes: number): string {
  const h = minutes / 60;
  if (h === 0) return '0h';
  if (h < 1) return `${minutes}m`;
  const whole = Math.floor(h);
  const frac = Math.round((h - whole) * 60);
  return frac > 0 ? `${whole}h ${frac}m` : `${whole}h`;
}

export function decimalHours(minutes: number): number {
  return Math.round((minutes / 60) * 100) / 100;
}

/**
 * Format a hierarchical tag label for billing display.
 * Drops the top-level segment (e.g. "Projects") and joins remaining
 * segments with " | ". Single-segment labels are returned unchanged.
 *
 * Examples:
 *   "Projects / Color / Avalanche" -> "Color | Avalanche"
 *   "Projects / MBAKS"             -> "MBAKS"
 *   "MBAKS"                        -> "MBAKS"
 */
export function formatTagLabel(label: string): string {
  if (!label) return label;
  const parts = label.split(' / ').map(s => s.trim()).filter(Boolean);
  if (parts.length <= 1) return label;
  return parts.slice(1).reverse().join(' | ');
}