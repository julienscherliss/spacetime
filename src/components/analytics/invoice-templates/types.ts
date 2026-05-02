import type { Invoice } from '@/store/billingStore';
import type { InvoiceStyle } from '@/store/invoiceStyleStore';

export interface TemplateProps {
  invoice: Invoice;
  style: InvoiceStyle;
  /** When true, render at smaller scale for in-app preview */
  scale?: number;
}