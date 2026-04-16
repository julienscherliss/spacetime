import { useCallback } from 'react';

const STORAGE_KEY = 'spacetime_entry_count';

function getEntryCount(): number {
  try {
    return parseInt(localStorage.getItem(STORAGE_KEY) || '0', 10) || 0;
  } catch {
    return 0;
  }
}

export function incrementEntryCount() {
  try {
    const count = getEntryCount() + 1;
    localStorage.setItem(STORAGE_KEY, String(count));
  } catch { /* noop */ }
}

export function useEntryHint(): { hint: string; increment: () => void } {
  const count = getEntryCount();
  let hint = '';
  if (count < 30) {
    hint = '# for tags';
  } else if (count < 60) {
    hint = '@ for due date';
  } else if (count < 90) {
    hint = '// for subtags';
  }

  return { hint, increment: useCallback(incrementEntryCount, []) };
}
