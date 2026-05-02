import { format, parseISO } from 'date-fns';
import { formatCurrency } from '@/lib/billingFormat';
import { FONT_FAMILIES } from '@/store/invoiceStyleStore';
import type { TemplateProps } from './types';

export function ClassicTemplate({ invoice, style }: TemplateProps) {
  const headingFont = FONT_FAMILIES[style.headingFont];
  const bodyFont = FONT_FAMILIES[style.bodyFont];
  const accent = style.accentColor;
  const issued = format(parseISO(invoice.issuedAt), 'MMMM d, yyyy');

  return (
    <div className="bg-white text-neutral-900 p-12" style={{ fontFamily: bodyFont, minHeight: '100%' }}>
      {/* Header */}
      <div className="flex items-start justify-between mb-10">
        <div>
          <h1 style={{ fontFamily: headingFont, fontWeight: 900, fontSize: 64, lineHeight: 1, color: accent, letterSpacing: '-0.02em' }}>
            INVOICE
          </h1>
        </div>
        {style.businessName && (
          <div className="text-right">
            <div style={{ fontFamily: headingFont, fontWeight: 800, fontSize: 22, lineHeight: 1.1, color: accent }}>
              {style.businessName}
            </div>
          </div>
        )}
      </div>

      {/* Meta row */}
      <div className="grid grid-cols-2 gap-6 mb-10 text-[11px]" style={{ fontFamily: bodyFont }}>
        <div className="space-y-1 text-neutral-700">
          <div>INVOICE NUMBER: {invoice.invoiceNumber}</div>
          <div>DATE: {issued.toUpperCase()}</div>
          {invoice.rangeStart && invoice.rangeEnd && (
            <div>PERIOD: {format(parseISO(invoice.rangeStart), 'MMM d').toUpperCase()} – {format(parseISO(invoice.rangeEnd), 'MMM d, yyyy').toUpperCase()}</div>
          )}
        </div>
        {style.businessAddress && (
          <div className="text-right space-y-1 text-neutral-700 whitespace-pre-line">
            {style.businessAddress}
            {style.businessEmail && <div>{style.businessEmail}</div>}
          </div>
        )}
      </div>

      {/* Bill to + payment */}
      <div className="grid grid-cols-2 gap-6 mb-10">
        <div>
          <div style={{ fontFamily: headingFont, fontWeight: 700, fontSize: 13 }} className="mb-2">Bill To:</div>
          <div className="text-[12px] text-neutral-800">{invoice.clientName || '—'}</div>
        </div>
        {style.paymentInstructions && (
          <div className="text-right">
            <div style={{ fontFamily: headingFont, fontWeight: 700, fontSize: 13 }} className="mb-2">Payment</div>
            <div className="text-[12px] text-neutral-800 whitespace-pre-line">{style.paymentInstructions}</div>
          </div>
        )}
      </div>

      {/* Table */}
      <table className="w-full border-collapse mb-8" style={{ fontFamily: bodyFont }}>
        <thead>
          <tr style={{ borderTop: `1.5px solid ${accent}`, borderBottom: `1.5px solid ${accent}` }}>
            <th className="text-left py-2 px-2 text-[10px] tracking-[0.15em] font-semibold text-neutral-700">DESCRIPTION</th>
            <th className="text-right py-2 px-2 text-[10px] tracking-[0.15em] font-semibold text-neutral-700 w-20">QTY</th>
            <th className="text-right py-2 px-2 text-[10px] tracking-[0.15em] font-semibold text-neutral-700 w-24">RATE</th>
            <th className="text-right py-2 px-2 text-[10px] tracking-[0.15em] font-semibold text-neutral-700 w-28">AMOUNT</th>
          </tr>
        </thead>
        <tbody>
          {invoice.items.map(it => (
            <tr key={it.id} style={{ borderBottom: '1px solid #E5E5E5' }}>
              <td className="py-3 px-2 text-[12px]">{it.description}</td>
              <td className="py-3 px-2 text-[12px] text-right tabular-nums">{it.rateType === 'flat' ? '1' : it.hours.toFixed(2)}</td>
              <td className="py-3 px-2 text-[12px] text-right tabular-nums">
                {it.rateType === 'hourly' ? `${formatCurrency(it.rate, invoice.currency)}/h` : 'flat'}
              </td>
              <td className="py-3 px-2 text-[12px] text-right tabular-nums">{formatCurrency(it.amount, invoice.currency)}</td>
            </tr>
          ))}
        </tbody>
      </table>

      {/* Total */}
      <div className="flex justify-end mb-10">
        <div className="w-72" style={{ borderTop: `2px solid ${accent}` }}>
          <div className="flex justify-between py-3 px-2">
            <span style={{ fontFamily: headingFont, fontWeight: 700 }} className="text-[14px] tracking-wider">GRAND TOTAL</span>
            <span style={{ fontFamily: headingFont, fontWeight: 700, color: accent }} className="text-[18px] tabular-nums">
              {formatCurrency(invoice.total, invoice.currency)}
            </span>
          </div>
        </div>
      </div>

      {/* Footer: terms + notes */}
      <div className="grid grid-cols-2 gap-8 text-[10px] text-neutral-600">
        {style.termsText && (
          <div>
            <div style={{ fontFamily: headingFont, fontWeight: 700, fontSize: 11, color: '#171717' }} className="mb-1.5 tracking-wider">TERMS & CONDITIONS</div>
            <p className="leading-relaxed whitespace-pre-line">{style.termsText}</p>
          </div>
        )}
        {invoice.notes && (
          <div>
            <div style={{ fontFamily: headingFont, fontWeight: 700, fontSize: 11, color: '#171717' }} className="mb-1.5 tracking-wider">NOTES</div>
            <p className="leading-relaxed whitespace-pre-line">{invoice.notes}</p>
          </div>
        )}
      </div>

      {style.footerNote && (
        <div className="mt-8 pt-4 text-center text-[10px] text-neutral-500" style={{ borderTop: '1px solid #E5E5E5' }}>
          {style.footerNote}
        </div>
      )}
    </div>
  );
}