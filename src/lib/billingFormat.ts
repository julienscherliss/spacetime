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