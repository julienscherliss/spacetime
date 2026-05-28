const LIST_PREFIX_PATTERN = /^(?:[-*•]\s+|\d+[.)]\s+)/;
const INLINE_LIST_PREFIX_PATTERN = /(?:\s{2,}|\s(?=[-*•]\s)|\s(?=\d+[.)]\s))/g;

function splitInlineListItems(segment: string): string[] {
  const trimmed = segment.trim();
  if (!trimmed) return [];

  if (/(?:^|\s)(?:[-*•]\s+|\d+[.)]\s+)/.test(trimmed)) {
    return trimmed
      .replace(INLINE_LIST_PREFIX_PATTERN, '\n')
      .split(/\n+/)
      .map((part) => part.replace(LIST_PREFIX_PATTERN, '').trim())
      .filter(Boolean);
  }

  if (!/[\n\r]/.test(trimmed) && /\s{2,}/.test(trimmed)) {
    return trimmed
      .split(/\s{2,}/)
      .map((part) => part.trim())
      .filter(Boolean);
  }

  return [trimmed];
}

export function parseSubtaskText(text: string): string[] {
  const normalized = text
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .replace(/\u00a0/g, ' ')
    .trim();

  if (!normalized) return [];

  return normalized
    .split(/\n+/)
    .flatMap((segment) => splitInlineListItems(segment))
    .map((part) => part.replace(LIST_PREFIX_PATTERN, '').trim())
    .filter(Boolean);
}