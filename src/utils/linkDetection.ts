// ── URL detection, extraction, and smart labeling ──

export interface LinkAttachment {
  id: string;
  url: string;
  displayName: string;
  domain: string;
  createdAt: string;
}

// Robust URL regex — matches http(s) URLs in text
const URL_REGEX = /https?:\/\/[^\s<>"')\]},;]+/gi;

// Known domain → friendly name mapping
const DOMAIN_LABELS: Record<string, string> = {
  'nytimes.com': 'New York Times',
  'youtube.com': 'YouTube Video',
  'youtu.be': 'YouTube Video',
  'docs.google.com': 'Google Doc',
  'drive.google.com': 'Google Drive',
  'sheets.google.com': 'Google Sheet',
  'slides.google.com': 'Google Slides',
  'github.com': 'GitHub',
  'twitter.com': 'Twitter',
  'x.com': 'X (Twitter)',
  'reddit.com': 'Reddit',
  'stackoverflow.com': 'Stack Overflow',
  'medium.com': 'Medium',
  'notion.so': 'Notion',
  'figma.com': 'Figma',
  'linkedin.com': 'LinkedIn',
  'instagram.com': 'Instagram',
  'wikipedia.org': 'Wikipedia',
  'amazon.com': 'Amazon',
  'spotify.com': 'Spotify',
  'apple.com': 'Apple',
  'netflix.com': 'Netflix',
  'slack.com': 'Slack',
  'trello.com': 'Trello',
  'dropbox.com': 'Dropbox',
  'zoom.us': 'Zoom',
};

export function extractDomain(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return url;
  }
}

export function generateDisplayName(url: string): string {
  const domain = extractDomain(url);

  // Check known domains (including subdomains like docs.google.com)
  for (const [key, label] of Object.entries(DOMAIN_LABELS)) {
    if (domain === key || domain.endsWith('.' + key)) {
      return label;
    }
  }

  // Fallback: capitalize domain parts
  const parts = domain.replace(/\.\w{2,3}$/, '').split('.');
  return parts
    .map(p => p.charAt(0).toUpperCase() + p.slice(1))
    .join(' ');
}

export function extractUrls(text: string): string[] {
  const matches = text.match(URL_REGEX);
  if (!matches) return [];
  // Deduplicate
  return [...new Set(matches)];
}

export function isValidUrl(str: string): boolean {
  try {
    const url = new URL(str);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
}

export function removeUrlsFromText(text: string, urls: string[]): string {
  let result = text;
  for (const url of urls) {
    result = result.replace(url, '').trim();
  }
  // Clean up double spaces
  return result.replace(/\s{2,}/g, ' ').trim();
}

export function createLinkAttachment(url: string): LinkAttachment {
  return {
    id: crypto.randomUUID(),
    url,
    displayName: generateDisplayName(url),
    domain: extractDomain(url),
    createdAt: new Date().toISOString(),
  };
}

/**
 * Given existing links and new text, detect new URLs and return
 * new LinkAttachments (skipping URLs already tracked).
 */
export function detectNewLinks(
  text: string,
  existingLinks: LinkAttachment[]
): LinkAttachment[] {
  const urls = extractUrls(text);
  const existingUrls = new Set(existingLinks.map(l => l.url));
  return urls
    .filter(u => !existingUrls.has(u))
    .map(createLinkAttachment);
}
