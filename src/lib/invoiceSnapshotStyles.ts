/** Keep PDF layout and bundled font rules independent of a cloned frame's CSS requests. */
export function snapshotInvoiceStylesheets(source: Document): (clone: Document) => void {
  const snapshots = new Map<string, string>();
  for (const link of source.querySelectorAll<HTMLLinkElement>('link[rel="stylesheet"]')) {
    if (!link.sheet || link.disabled || link.sheet.disabled) continue;
    try {
      const css = Array.from(link.sheet.cssRules, rule => rule.cssText).join('\n');
      // Moving rules from an external sheet to <style> changes the base for
      // relative font/image URLs. Preserve the original sheet's asset base.
      snapshots.set(link.href, css.replace(
        /url\(\s*(?:"([^"]*)"|'([^']*)'|([^\s)]*))\s*\)/gi,
        (match, doubleQuoted, singleQuoted, unquoted) => {
          const value = doubleQuoted ?? singleQuoted ?? unquoted;
          if (!value || value.startsWith('#') || /^[a-z][a-z\d+.-]*:/i.test(value) || value.includes('\\')) return match;
          try { return `url(${JSON.stringify(new URL(value, link.href).href)})`; }
          catch { return match; }
        },
      ));
    } catch {
      // Cross-origin sheets can deny CSSOM access; leave their cloned link intact.
    }
  }

  return clone => {
    for (const link of clone.querySelectorAll<HTMLLinkElement>('link[rel="stylesheet"]')) {
      const css = snapshots.get(link.href);
      if (css === undefined) continue;
      const style = clone.createElement('style');
      style.textContent = css;
      style.media = link.media;
      if (link.nonce) style.nonce = link.nonce;
      link.replaceWith(style);
    }
  };
}
