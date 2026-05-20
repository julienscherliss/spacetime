export function parseLocalDate(dateStr: string): Date {
  const [year, month, day] = dateStr.split('-').map(Number);
  return new Date(year, month - 1, day, 12, 0, 0, 0);
}

export function formatLocalDate(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function getLocalDayDiff(dateStr: string, baseDate = new Date()): number {
  const due = parseLocalDate(dateStr);
  const base = new Date(
    baseDate.getFullYear(),
    baseDate.getMonth(),
    baseDate.getDate(),
    12,
    0,
    0,
    0,
  );

  return Math.round((due.getTime() - base.getTime()) / 86400000);
}