import { format, parseISO } from 'date-fns';
import { formatCurrency } from '@/lib/billingFormat';
import { FONT_FAMILIES } from '@/store/invoiceStyleStore';
import type { TemplateProps } from './types';

export function MinimalTemplate({ invoice, style }: TemplateProps) {
  const headingFont = FONT_FAMILIES[style.headingFont];
  const bodyFont = FONT_FAMILIES[style.bodyFont];
  const accent = style.accentColor;
  const issued = format(parseISO(invoice.issuedAt), 'MMM d, yyyy');

  return (
    <div className="bg-white text-neutral-900 px-16 py-20" style={{ fontFamily: bodyFont, minHeight: '100%' }}>
      <div className="mb-16">
        <div className="text-[10px] tracking-[0.3em] text-neutral-500 mb-2">INVOICE</div>
        <div className="flex items-baseline justify-between">
          <h1 style={{ fontFamily: headingFont, fontWeight: 400, fontSize: 28, letterSpacing: '-0.01em' }}>
            {invoice.invoiceNumber}
          </h1>
          <div className="text-[12px] text-neutral-500">{issued}</div>
        </div>
        <div className="h-px w-full mt-6" style={{ background: accent }} />
      </div>

      <div className="grid grid-cols-2 gap-12 mb-16 text-[12px]">
        <div>
          <div className="text-[9px] tracking-[0.25em] text-neutral-400 mb-2">FROM</div>
          {style.businessName && <div style={{ fontFamily: headingFont, fontWeight: 500 }} className="text-[14px] mb-1">{style.businessName}</div>}
          {style.businessAddress && <div className="text-neutral-600 whitespace-pre-line">{style.businessAddress}</div>}
          {style.businessEmail && <div className="text-neutral-600 mt-1">{style.businessEmail}</div>}
        </div>
        <div>
          <div className="text-[9px] tracking-[0.25em] text-neutral-400 mb-2">TO</div>
          <div style={{ fontFamily: headingFont, fontWeight: 500 }} className="text-[14px]">{invoice.clientName || '—'}</div>
        </div>
      </div>

      <table className="w-full mb-12">
        <thead>
          <tr>
            <th className="text-left pb-3 text-[9px] tracking-[0.25em] font-normal text-neutral-400">DESCRIPTION</th>
            <th className="text-right pb-3 text-[9px] tracking-[0.25em] font-normal text-neutral-400 w-20">QTY</th>
            <th className="text-right pb-3 text-[9px] tracking-[0.25em] font-normal text-neutral-400 w-32">AMOUNT</th>
          </tr>
        </thead>
        <tbody>
          {invoice.items.map(it => (
            <tr key={it.id} style={{ borderTop: '1px solid #F0F0F0' }}>
              <td className="py-4 text-[13px]">{it.description}</td>
              <td className="py-4 text-[12px] text-right text-neutral-500 tabular-nums">{it.hours.toFixed(2)}</td>
              <td className="py-4 text-[13px] text-right tabular-nums">{formatCurrency(it.amount, invoice.currency)}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <div className="flex justify-end mb-16">
        <div className="text-right">
          <div className="text-[9px] tracking-[0.25em] text-neutral-400 mb-1">TOTAL DUE</div>
          <div style={{ fontFamily: headingFont, fontWeight: 300, fontSize: 36, color: accent, letterSpacing: '-0.02em' }} className="tabular-nums">
            {formatCurrency(invoice.total, invoice.currency)}
          </div>
        </div>
      </div>

      {(style.paymentInstructions || style.termsText || invoice.notes) && (
        <div className="grid grid-cols-3 gap-8 text-[10px] text-neutral-500 pt-6" style={{ borderTop: '1px solid #F0F0F0' }}>
          {style.paymentInstructions && (
            <div>
              <div className="tracking-[0.25em] text-neutral-400 mb-1">PAYMENT</div>
              <div className="whitespace-pre-line">{style.paymentInstructions}</div>
            </div>
          )}
          {style.termsText && (
            <div>
              <div className="tracking-[0.25em] text-neutral-400 mb-1">TERMS</div>
              <div className="whitespace-pre-line">{style.termsText}</div>
            </div>
          )}
          {invoice.notes && (
            <div>
              <div className="tracking-[0.25em] text-neutral-400 mb-1">NOTES</div>
              <div className="whitespace-pre-line">{invoice.notes}</div>
            </div>
          )}
        </div>
      )}
      {style.footerNote && (
        <div className="mt-12 text-center text-[10px] text-neutral-400 tracking-[0.2em]">{style.footerNote}</div>
      )}
    </div>
  );
}