export interface InlineTextPart {
  text: string;
  href?: string;
}

/** Keep encoded paths/query strings intact; surrounding prose stays plain text. */
export function splitInlineLinks(text: string): InlineTextPart[] {
  const parts: InlineTextPart[] = [];
  let offset = 0;
  for (const match of text.matchAll(/https?:\/\/[^\s<>"']+/gi)) {
    let url = match[0].replace(/[.,!?;:]+$/, '');
    for (const [open, close] of [['(', ')'], ['[', ']'], ['{', '}']]) {
      while (url.endsWith(close) && url.split(close).length > url.split(open).length) {
        url = url.slice(0, -1);
      }
    }
    try {
      const parsed = new URL(url);
      if (!parsed.hostname) continue;
    } catch { continue; }
    const start = match.index!;
    if (start > offset) parts.push({ text: text.slice(offset, start) });
    parts.push({ text: url, href: url });
    offset = start + url.length;
  }
  if (offset < text.length) parts.push({ text: text.slice(offset) });
  return parts;
}

export function inlineLinkLabel(href: string): string {
  const url = new URL(href);
  const path = url.pathname === '/' ? '' : url.pathname;
  const suffix = path + url.search + url.hash;
  return url.hostname.replace(/^www\./, '') + (suffix.length > 24 ? suffix.slice(0, 22) + '…' : suffix);
}
