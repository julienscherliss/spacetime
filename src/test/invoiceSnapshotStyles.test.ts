import { describe, expect, it } from 'vitest';
import { snapshotInvoiceStylesheets } from '@/lib/invoiceSnapshotStyles';

function sourceSheet(css: string, href = 'https://example.com/assets/invoice.css') {
  const source = document.implementation.createHTMLDocument('source');
  const link = source.createElement('link');
  link.rel = 'stylesheet';
  link.href = href;
  source.head.append(link);
  Object.defineProperty(link, 'sheet', { value: { disabled: false, cssRules: [{ cssText: css }] } });
  return { source, link };
}

describe('invoice PDF stylesheet snapshots', () => {
  it('restores layout even when the cloned external stylesheet never loads', () => {
    const { source, link } = sourceSheet('.invoice { padding: 48px; display: grid; grid-template-columns: 1fr 1fr; }');
    const install = snapshotInvoiceStylesheets(source);
    const cloneLink = link.cloneNode() as HTMLLinkElement;
    const invoice = document.createElement('div');
    invoice.className = 'invoice';
    document.head.append(cloneLink);
    document.body.append(invoice);
    try {
      expect(cloneLink.sheet).toBeNull();
      expect(getComputedStyle(invoice).display).not.toBe('grid');
      install(document);
      expect(getComputedStyle(invoice).padding).toBe('48px');
      expect(getComputedStyle(invoice).display).toBe('grid');
      expect(cloneLink.isConnected).toBe(false);
    } finally {
      document.head.querySelectorAll('style').forEach(style => style.remove());
      invoice.remove();
    }
  });

  it('preserves stylesheet order, media and nonce and rebases bundled font URLs', () => {
    const { source, link } = sourceSheet('@font-face { font-family: Demo; src: url("./fonts/demo.woff2"); } .invoice { color: red; background: url(data:image/png;base64,AAAA); filter: url(#mask); }');
    link.media = 'screen';
    link.nonce = 'existing-policy';
    const override = source.createElement('style');
    override.textContent = '.invoice { color: blue; }';
    source.head.append(override);
    const install = snapshotInvoiceStylesheets(source);
    const clone = document.implementation.createHTMLDocument('clone');
    clone.head.append(link.cloneNode(), override.cloneNode(true));
    install(clone);
    const styles = clone.querySelectorAll('style');
    expect(styles[0].textContent).toContain('https://example.com/assets/fonts/demo.woff2');
    expect(styles[0].textContent).toContain('url(data:image/png;base64,AAAA)');
    expect(styles[0].textContent).toContain('url(#mask)');
    expect(styles[0].media).toBe('screen');
    expect(styles[0].nonce).toBe('existing-policy');
    expect(styles[1].textContent).toContain('color: blue');
  });

  it('does not activate disabled styles or replace an inaccessible stylesheet', () => {
    const { source, link } = sourceSheet('.invoice { display: none; }');
    link.disabled = true;
    const foreign = source.createElement('link');
    foreign.rel = 'stylesheet';
    foreign.href = 'https://other.example.com/styles.css';
    Object.defineProperty(foreign, 'sheet', { value: { get cssRules() { throw new DOMException('Blocked', 'SecurityError'); } } });
    source.head.append(foreign);
    const install = snapshotInvoiceStylesheets(source);
    const clone = document.implementation.createHTMLDocument('clone');
    clone.head.append(link.cloneNode(), foreign.cloneNode());
    install(clone);
    expect(clone.querySelectorAll('link')).toHaveLength(2);
    expect(clone.querySelectorAll('style')).toHaveLength(0);
  });
});
