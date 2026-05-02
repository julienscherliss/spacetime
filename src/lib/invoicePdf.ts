import { jsPDF } from 'jspdf';
import type { Invoice } from '@/store/billingStore';
import { formatCurrency } from './billingFormat';
import { format, parseISO } from 'date-fns';

export function downloadInvoicePdf(invoice: Invoice, tagLabels: Record<string, string>) {
  const doc = new jsPDF({ unit: 'pt', format: 'letter' });
  const pageWidth = doc.internal.pageSize.getWidth();
  const margin = 48;
  let y = 64;

  // Header
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(22);
  doc.text('INVOICE', margin, y);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.setTextColor(110);
  doc.text(invoice.invoiceNumber, pageWidth - margin, y, { align: 'right' });
  y += 28;

  // Meta block
  doc.setTextColor(40);
  doc.setFontSize(9);
  const issued = format(parseISO(invoice.issuedAt), 'MMM d, yyyy');
  doc.text(`Issued: ${issued}`, margin, y);
  if (invoice.rangeStart && invoice.rangeEnd) {
    doc.text(
      `Period: ${format(parseISO(invoice.rangeStart), 'MMM d, yyyy')} – ${format(parseISO(invoice.rangeEnd), 'MMM d, yyyy')}`,
      margin,
      y + 14
    );
    y += 14;
  }
  y += 14;
  doc.setFont('helvetica', 'bold');
  doc.text('BILL TO', margin, y);
  doc.setFont('helvetica', 'normal');
  doc.text(invoice.clientName || '—', margin, y + 14);
  y += 40;

  // Table header
  doc.setDrawColor(200);
  doc.line(margin, y, pageWidth - margin, y);
  y += 14;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.setTextColor(110);
  doc.text('DESCRIPTION', margin, y);
  doc.text('HOURS', pageWidth - margin - 200, y, { align: 'right' });
  doc.text('RATE', pageWidth - margin - 100, y, { align: 'right' });
  doc.text('AMOUNT', pageWidth - margin, y, { align: 'right' });
  y += 8;
  doc.line(margin, y, pageWidth - margin, y);
  y += 14;

  // Items
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.setTextColor(40);
  for (const it of invoice.items) {
    const label = tagLabels[it.tagValue] || it.tagValue;
    const desc = it.description || label;
    doc.text(desc, margin, y);
    if (it.rateType === 'hourly') {
      doc.text(it.hours.toFixed(2), pageWidth - margin - 200, y, { align: 'right' });
      doc.text(formatCurrency(it.rate, invoice.currency) + '/h', pageWidth - margin - 100, y, { align: 'right' });
    } else {
      doc.text('—', pageWidth - margin - 200, y, { align: 'right' });
      doc.text('flat', pageWidth - margin - 100, y, { align: 'right' });
    }
    doc.text(formatCurrency(it.amount, invoice.currency), pageWidth - margin, y, { align: 'right' });
    y += 18;
  }

  y += 8;
  doc.line(margin, y, pageWidth - margin, y);
  y += 18;

  // Total
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(12);
  doc.text('TOTAL', pageWidth - margin - 100, y, { align: 'right' });
  doc.text(formatCurrency(invoice.total, invoice.currency), pageWidth - margin, y, { align: 'right' });
  y += 28;

  // Notes
  if (invoice.notes) {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.setTextColor(110);
    const split = doc.splitTextToSize(invoice.notes, pageWidth - margin * 2);
    doc.text(split, margin, y);
  }

  doc.save(`${invoice.invoiceNumber}.pdf`);
}