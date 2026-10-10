import { describe, expect, it } from 'vitest';
import { splitInlineLinks } from '@/lib/inlineLinks';

describe('inline checklist URLs', () => {
  it('preserves Outlook message IDs, encoded characters, query strings and fragments', () => {
    const url = 'https://outlook.cloud.microsoft/mail/inbox/id/SAMPLE%2BMessage%3D?view=Read&next=a,b;c#message';
    expect(splitInlineLinks(`Review Western Email: ${url}`)).toEqual([
      { text: 'Review Western Email: ' }, { text: url, href: url },
    ]);
  });
  it('links every occurrence of a repeated URL and preserves line breaks', () => {
    const url = 'https://example.com/mail';
    const text = `First ${url}\nThen ${url}`;
    const parts = splitInlineLinks(text);
    expect(parts.filter(p => p.href)).toHaveLength(2);
    expect(parts.map(p => p.text).join('')).toBe(text);
  });
  it('keeps sentence punctuation outside the link but balanced URL parentheses inside', () => {
    const text = '(https://example.com/a(b)). Next: https://example.com/mail, okay.';
    const parts = splitInlineLinks(text);
    expect(parts.filter(p => p.href).map(p => p.href)).toEqual([
      'https://example.com/a(b)', 'https://example.com/mail',
    ]);
    expect(parts.map(p => p.text).join('')).toBe(text);
  });
  it('leaves unsupported protocols and malformed addresses as text', () => {
    const text = 'javascript:alert(1) file:///tmp/mail https://';
    expect(splitInlineLinks(text)).toEqual([{ text }]);
  });
});
