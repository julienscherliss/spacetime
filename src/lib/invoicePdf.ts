import { jsPDF } from 'jspdf';
import html2canvas from 'html2canvas-pro';
import type { Invoice } from '@/store/billingStore';
import { snapshotInvoiceStylesheets } from './invoiceSnapshotStyles';

/**
 * Ensure the fonts we style the invoice with are actually loaded before we
 * snapshot. On the web the browser lazy-loads @fontsource CSS the first time
 * a glyph is requested, and html2canvas measures text with the fallback while
 * the browser paints with the real font once it arrives — producing the
 * "words with no spaces" desktop bug. Explicitly awaiting each face fixes it.
 */
async function preloadInvoiceFonts(doc: Document) {
  const fonts = doc.fonts;
  if (!fonts?.load) return;
  const faces = [
    '400 12px "Space Grotesk"',
    '500 12px "Space Grotesk"',
    '600 12px "Space Grotesk"',
    '700 12px "Space Grotesk"',
    '400 12px "JetBrains Mono"',
    '500 12px "JetBrains Mono"',
  ];
  try {
    await Promise.all(faces.map((f) => fonts.load(f).catch(() => null)));
    await fonts.ready;
  } catch {
    /* ignore — fall through to render */
  }
}

/**
 * Renders the given DOM node (an invoice template at US-Letter pixel size)
 * to a multi-page PDF and triggers a download.
 *
 * Quality strategy:
 * - Render at 3x device pixels for sharp text on retina + print
 * - Encode as high-quality JPEG (much smaller than PNG, no visible loss for invoices)
 * - Map canvas pixels 1:1 to US-Letter points so nothing is upscaled
 */
export async function downloadInvoicePdfFromNode(node: HTMLElement, invoice: Invoice, filename?: string) {
  const source = node.ownerDocument;
  await preloadInvoiceFonts(source);
  const installStyles = snapshotInvoiceStylesheets(source);

  // The offscreen invoice host can produce a black image with SVG
  // foreignObject rendering without throwing. Use the DOM renderer after
  // fonts have loaded so a successful download contains the actual invoice.
  const canvas = await html2canvas(node, {
    scale: 3,
    backgroundColor: '#ffffff',
    useCORS: true,
    allowTaint: false,
    logging: false,
    windowWidth: node.offsetWidth,
    windowHeight: node.offsetHeight,
    onclone: async clone => {
      installStyles(clone);
      // Font readiness in the app does not imply readiness in the PDF frame.
      await preloadInvoiceFonts(clone);
    },
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

  pdf.save(filename || `${invoice.invoiceNumber}.pdf`);
}
