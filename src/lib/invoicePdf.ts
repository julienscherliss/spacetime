import { jsPDF } from 'jspdf';
import html2canvas from 'html2canvas-pro';
import type { Invoice } from '@/store/billingStore';

/**
 * Ensure the fonts we style the invoice with are actually loaded before we
 * snapshot. On the web the browser lazy-loads @fontsource CSS the first time
 * a glyph is requested, and html2canvas measures text with the fallback while
 * the browser paints with the real font once it arrives — producing the
 * "words with no spaces" desktop bug. Explicitly awaiting each face fixes it.
 */
async function preloadInvoiceFonts() {
  const fonts = (document as any).fonts;
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
  await preloadInvoiceFonts();

  // Try SVG foreignObject rendering first — it delegates layout & font
  // rasterization to Chromium, which matches what the user sees in the
  // preview and avoids html2canvas's own text-measurement path (the source
  // of the desktop "no spaces between words" bug when fonts arrive late).
  // Fall back to the classic renderer if the browser refuses (e.g. tainted
  // canvas from a cross-origin resource).
  let canvas: HTMLCanvasElement;
  try {
    canvas = await html2canvas(node, {
      scale: 3,
      backgroundColor: '#ffffff',
      useCORS: true,
      allowTaint: false,
      logging: false,
      foreignObjectRendering: true,
      windowWidth: node.offsetWidth,
      windowHeight: node.offsetHeight,
    });
  } catch {
    canvas = await html2canvas(node, {
      scale: 3,
      backgroundColor: '#ffffff',
      useCORS: true,
      logging: false,
      windowWidth: node.offsetWidth,
      windowHeight: node.offsetHeight,
    });
  }

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