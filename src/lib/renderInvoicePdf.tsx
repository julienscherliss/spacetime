import { createRoot } from 'react-dom/client';
import type { Invoice } from '@/store/billingStore';
import type { InvoiceStyle } from '@/store/invoiceStyleStore';
import { InvoiceRender } from '@/components/analytics/invoice-templates/InvoiceRender';
import { downloadInvoicePdfFromNode } from './invoicePdf';

/** Sanitize a string for use in a filename (no spaces, no path separators, no punctuation noise). */
function slugForFilename(s: string): string {
  return (s || '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')           // strip diacritics
    .replace(/[^A-Za-z0-9]+/g, '')              // collapse to alphanumerics (PascalCase-ish)
    .slice(0, 60);
}

/** Build "BusinessName_Invoice_2026-001_ClientName.pdf" — segments are skipped if empty. */
export function buildInvoiceFilename(invoice: Invoice, style: InvoiceStyle): string {
  const business = slugForFilename(style.businessName);
  // Strip a leading "INV-" / "INV_" so we end up with e.g. "2026-001"
  const numberPart = invoice.invoiceNumber.replace(/^INV[-_]?/i, '') || invoice.invoiceNumber;
  const client = slugForFilename(invoice.clientName);
  const parts = [business, 'Invoice', numberPart, client].filter(Boolean);
  return `${parts.join('_')}.pdf`;
}

/**
 * Renders an invoice template offscreen at US-Letter width, snapshots it,
 * and triggers a PDF download.
 */
export async function generateInvoicePdf(invoice: Invoice, style: InvoiceStyle): Promise<void> {
  const host = document.createElement('div');
  // Position offscreen but rendered (visibility hidden breaks html2canvas)
  host.style.position = 'fixed';
  host.style.top = '0';
  host.style.left = '-10000px';
  host.style.width = '816px'; // US Letter @ 96dpi
  host.style.background = '#ffffff';
  document.body.appendChild(host);

  const root = createRoot(host);
  await new Promise<void>((resolve) => {
    root.render(<InvoiceRender invoice={invoice} style={style} />);
    // Wait two frames for layout + fonts to settle
    requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
  });

  try {
    await (document as any).fonts?.ready;
  } catch { /* ignore */ }

  try {
    await downloadInvoicePdfFromNode(host, invoice, buildInvoiceFilename(invoice, style));
  } finally {
    root.unmount();
    host.remove();
  }
}