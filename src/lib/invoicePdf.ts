import { jsPDF } from 'jspdf';
import html2canvas from 'html2canvas-pro';
import type { Invoice } from '@/store/billingStore';

/**
 * Renders the given DOM node (an invoice template at US-Letter pixel size)
 * to a multi-page PDF and triggers a download.
 *
 * Quality strategy:
 * - Render at 3x device pixels for sharp text on retina + print
 * - Encode as high-quality JPEG (much smaller than PNG, no visible loss for invoices)
 * - Map canvas pixels 1:1 to US-Letter points so nothing is upscaled
 */
export async function downloadInvoicePdfFromNode(node: HTMLElement, invoice: Invoice) {
  const canvas = await html2canvas(node, {
    scale: 3,
    backgroundColor: '#ffffff',
    useCORS: true,
    logging: false,
    windowWidth: node.offsetWidth,
    windowHeight: node.offsetHeight,
  });

  // JPEG at 0.95 quality — visually lossless for line art / text, ~10x smaller than PNG
  const imgData = canvas.toDataURL('image/jpeg', 0.95);

  const pdf = new jsPDF({ unit: 'pt', format: 'letter', compress: true });
  const pageWidth = pdf.internal.pageSize.getWidth();   // 612pt
  const pageHeight = pdf.internal.pageSize.getHeight(); // 792pt

  const imgWidth = pageWidth;
  const imgHeight = (canvas.height * imgWidth) / canvas.width;

  let heightLeft = imgHeight;
  let position = 0;

  pdf.addImage(imgData, 'JPEG', 0, position, imgWidth, imgHeight, undefined, 'FAST');
  heightLeft -= pageHeight;

  while (heightLeft > 0) {
    position = heightLeft - imgHeight;
    pdf.addPage();
    pdf.addImage(imgData, 'JPEG', 0, position, imgWidth, imgHeight, undefined, 'FAST');
    heightLeft -= pageHeight;
  }

  pdf.save(`${invoice.invoiceNumber}.pdf`);
}