import { useRef, useEffect, useState, useCallback } from 'react';
import { extractUrls, generateDisplayName, extractDomain } from '@/utils/linkDetection';
import { ExternalLink } from 'lucide-react';

interface DescriptionWithLinksProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}

/** Shorten a URL for display: "docs.google.com/d/1x…" */
function shortenUrl(url: string): string {
  const label = generateDisplayName(url);
  const domain = extractDomain(url);
  // If we have a nice label (not just the domain), use it
  if (label !== domain.replace(/\.\w{2,3}$/, '').split('.').map(p => p.charAt(0).toUpperCase() + p.slice(1)).join(' ')) {
    return label;
  }
  // Otherwise shorten: domain + truncated path
  try {
    const u = new URL(url);
    const path = u.pathname.length > 20 ? u.pathname.slice(0, 18) + '…' : u.pathname;
    return u.hostname.replace(/^www\./, '') + (path !== '/' ? path : '');
  } catch {
    return url.length > 40 ? url.slice(0, 38) + '…' : url;
  }
}

/**
 * Textarea that keeps URLs inline but renders a read-mode overlay
 * showing shortened, clickable links when not focused.
 */
export function DescriptionWithLinks({ value, onChange, placeholder }: DescriptionWithLinksProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [isFocused, setIsFocused] = useState(false);

  const autoResize = useCallback(() => {
    const el = textareaRef.current;
    if (el) {
      el.style.height = 'auto';
      el.style.height = el.scrollHeight + 'px';
    }
  }, []);

  useEffect(() => { autoResize(); }, [value, autoResize]);

  const urls = extractUrls(value);
  const hasLinks = urls.length > 0;

  // Build rendered segments: text + link chips
  const renderSegments = () => {
    if (!hasLinks) return <span className="whitespace-pre-wrap">{value || <span className="text-muted-foreground/20">{placeholder}</span>}</span>;

    const parts: React.ReactNode[] = [];
    let remaining = value;
    let key = 0;

    for (const url of urls) {
      const idx = remaining.indexOf(url);
      if (idx === -1) continue;

      // Text before URL
      if (idx > 0) {
        parts.push(<span key={key++} className="whitespace-pre-wrap">{remaining.slice(0, idx)}</span>);
      }

      // Shortened link chip
      parts.push(
        <a
          key={key++}
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          onClick={(e) => e.stopPropagation()}
          className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded bg-primary/[0.06] text-primary/70 hover:text-primary hover:bg-primary/[0.12] transition-colors text-[11px] font-mono no-underline align-baseline mx-0.5"
        >
          <ExternalLink size={8} strokeWidth={1.5} className="shrink-0 opacity-50" />
          {shortenUrl(url)}
        </a>
      );

      remaining = remaining.slice(idx + url.length);
    }

    // Trailing text
    if (remaining) {
      parts.push(<span key={key++} className="whitespace-pre-wrap">{remaining}</span>);
    }

    return <>{parts}</>;
  };

  return (
    <div className="relative mb-2">
      {/* Read mode: shows shortened links */}
      {!isFocused && (
        <div
          onClick={() => {
            setIsFocused(true);
            setTimeout(() => textareaRef.current?.focus(), 0);
          }}
          className="w-full text-[13px] font-mono text-foreground/60 leading-relaxed cursor-text min-h-[2.6em]"
        >
          {value ? renderSegments() : <span className="text-muted-foreground/20">{placeholder}</span>}
        </div>
      )}

      {/* Edit mode: raw textarea */}
      <textarea
        ref={textareaRef}
        value={value}
        onChange={(e) => {
          onChange(e.target.value);
        }}
        onFocus={() => setIsFocused(true)}
        onBlur={() => setIsFocused(false)}
        placeholder={placeholder}
        rows={2}
        className={`w-full bg-transparent text-[13px] font-mono text-foreground/60 placeholder:text-muted-foreground/20 focus:outline-none resize-none leading-relaxed ${
          isFocused ? '' : 'absolute inset-0 opacity-0 pointer-events-none'
        }`}
      />
    </div>
  );
}
