import { format, parseISO } from 'date-fns';
import { formatCurrency } from '@/lib/billingFormat';
import { FONT_FAMILIES } from '@/store/invoiceStyleStore';
import type { TemplateProps } from './types';

export function EditorialTemplate({ invoice, style }: TemplateProps) {
  // Editorial overrides body to serif feel; honor user choice but default well
  const headingFont = FONT_FAMILIES[style.headingFont === 'sans' ? 'serif' : style.headingFont];
  const bodyFont = FONT_FAMILIES[style.bodyFont];
  const accent = style.accentColor;
  const issued = format(parseISO(invoice.issuedAt), 'MMMM d, yyyy');

  return (
    <div className="bg-white text-neutral-900 px-14 py-16" style={{ fontFamily: bodyFont, minHeight: '100%' }}>
      {/* Asymmetric masthead */}
      <div className="grid grid-cols-12 gap-4 items-end mb-12">
        <div className="col-span-7">
          <div className="text-[10px] tracking-[0.4em] text-neutral-500 mb-1">— STATEMENT NO. {invoice.invoiceNumber}</div>
          <h1 style={{ fontFamily: headingFont, fontWeight: 400, fontSize: 56, lineHeight: 1, letterSpacing: '-0.02em' }}>
            <span style={{ fontStyle: 'italic' }}>Invoice</span>
          </h1>
        </div>
        <div className="col-span-5 text-right text-[11px] text-neutral-600">
          <div>{issued}</div>
          {style.businessName && <div style={{ fontFamily: headingFont, fontStyle: 'italic' }} className="text-[16px] mt-1 text-neutral-900">{style.businessName}</div>}
          {style.businessAddress && <div className="whitespace-pre-line mt-0.5">{style.businessAddress}</div>}
        </div>
      </div>

      <div className="h-px w-full mb-10" style={{ background: accent }} />

      <div className="grid grid-cols-12 gap-4 mb-10">
        <div className="col-span-4">
          <div className="text-[9px] tracking-[0.3em] text-neutral-400 mb-2">PREPARED FOR</div>
          <div style={{ fontFamily: headingFont, fontStyle: 'italic', fontSize: 22 }}>{invoice.clientName || '—'}</div>
        </div>
        {style.paymentInstructions && (
          <div className="col-span-8 text-[11px] text-neutral-700">
            <div className="text-[9px] tracking-[0.3em] text-neutral-400 mb-2">REMITTANCE</div>
            <div className="whitespace-pre-line">{style.paymentInstructions}</div>
          </div>
        )}
      </div>

      <table className="w-full mb-8">
        <thead>
          <tr style={{ borderBottom: '1px solid #1A1A1A' }}>
            <th className="text-left py-2 text-[9px] tracking-[0.3em] font-normal text-neutral-500">Service</th>
            <th className="text-right py-2 text-[9px] tracking-[0.3em] font-normal text-neutral-500 w-20">Hrs</th>
            <th className="text-right py-2 text-[9px] tracking-[0.3em] font-normal text-neutral-500 w-24">Rate</th>
            <th className="text-right py-2 text-[9px] tracking-[0.3em] font-normal text-neutral-500 w-28">Amount</th>
          </tr>
        </thead>
        <tbody>
          {invoice.items.map(it => (
            <tr key={it.id} style={{ borderBottom: '1px solid #EEEEEE' }}>
              <td className="py-3.5 text-[13px]" style={{ fontFamily: headingFont }}>{it.description}</td>
              <td className="py-3.5 text-[12px] text-right tabular-nums text-neutral-600">{it.hours.toFixed(2)}</td>
              <td className="py-3.5 text-[12px] text-right tabular-nums text-neutral-600">
                {it.rateType === 'hourly' ? formatCurrency(it.rate, invoice.currency) : 'flat'}
              </td>
              <td className="py-3.5 text-[13px] text-right tabular-nums">{formatCurrency(it.amount, invoice.currency)}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <div className="flex items-baseline justify-between py-4 mb-12" style={{ borderTop: `2px solid ${accent}`, borderBottom: `2px solid ${accent}` }}>
        <span style={{ fontFamily: headingFont, fontStyle: 'italic', fontSize: 18 }}>Total due</span>
        <span style={{ fontFamily: headingFont, fontWeight: 500, fontSize: 28, color: accent }} className="tabular-nums">
          {formatCurrency(invoice.total, invoice.currency)}
        </span>
      </div>

      <div className="grid grid-cols-12 gap-4 text-[10px] text-neutral-600">
        {style.termsText && (
          <div className="col-span-6">
            <div className="text-[9px] tracking-[0.3em] text-neutral-400 mb-1">TERMS</div>
            <p className="leading-relaxed whitespace-pre-line">{style.termsText}</p>
          </div>
        )}
        {invoice.notes && (
          <div className="col-span-6">
            <div className="text-[9px] tracking-[0.3em] text-neutral-400 mb-1">NOTES</div>
            <p className="leading-relaxed whitespace-pre-line">{invoice.notes}</p>
          </div>
        )}
      </div>

      {style.footerNote && (
        <div className="mt-12 text-center text-[10px] text-neutral-500" style={{ fontFamily: headingFont, fontStyle: 'italic' }}>
          {style.footerNote}
        </div>
      )}
    </div>
  );
}