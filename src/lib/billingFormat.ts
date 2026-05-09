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

/**
 * Return the symbol for a given ISO currency code, e.g. "USD" → "$".
 * Falls back to the code itself for unknown currencies.
 */
export function currencySymbol(code = 'USD'): string {
  const cc = (code || 'USD').toUpperCase();
  const map: Record<string, string> = {
    USD: '$', CAD: 'CA$', AUD: 'A$', NZD: 'NZ$',
    EUR: '€', GBP: '£', JPY: '¥', CNY: '¥', KRW: '₩',
    INR: '₹', CHF: 'CHF', SEK: 'kr', NOK: 'kr', DKK: 'kr',
    MXN: 'MX$', BRL: 'R$', ZAR: 'R', SGD: 'S$', HKD: 'HK$',
    PLN: 'zł', TRY: '₺', RUB: '₽', AED: 'د.إ',
  };
  if (map[cc]) return map[cc];
  try {
    const parts = new Intl.NumberFormat('en-US', { style: 'currency', currency: cc })
      .formatToParts(0);
    const sym = parts.find(p => p.type === 'currency')?.value;
    if (sym) return sym;
  } catch { /* ignore */ }
  return cc;
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