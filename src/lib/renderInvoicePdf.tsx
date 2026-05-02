import { createRoot } from 'react-dom/client';
import type { Invoice } from '@/store/billingStore';
import type { InvoiceStyle } from '@/store/invoiceStyleStore';
import { InvoiceRender } from '@/components/analytics/invoice-templates/InvoiceRender';
import { downloadInvoicePdfFromNode } from './invoicePdf';

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
    await downloadInvoicePdfFromNode(host, invoice);
  } finally {
    root.unmount();
    host.remove();
  }
}