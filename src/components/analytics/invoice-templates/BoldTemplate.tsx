import { format, parseISO } from 'date-fns';
import { formatCurrency } from '@/lib/billingFormat';
import { FONT_FAMILIES } from '@/store/invoiceStyleStore';
import { useClientStore } from '@/store/clientStore';
import type { TemplateProps } from './types';

export function BoldTemplate({ invoice, style }: TemplateProps) {
  const headingFont = FONT_FAMILIES[style.headingFont];
  const bodyFont = FONT_FAMILIES[style.bodyFont];
  const accent = style.accentColor;
  const issued = format(parseISO(invoice.issuedAt), 'MMM d, yyyy');
  const clientAddress = useClientStore(s => invoice.clientId ? s.clients.find(c => c.id === invoice.clientId)?.address || '' : '');

  return (
    <div className="bg-white text-neutral-900" style={{ fontFamily: bodyFont, minHeight: '100%' }}>
      {/* Big accent header */}
      <div className="px-12 py-10" style={{ background: accent, color: '#fff' }}>
        <div className="flex items-end justify-between">
          <h1 style={{ fontFamily: headingFont, fontWeight: 900, fontSize: 96, lineHeight: 0.9, letterSpacing: '-0.04em' }}>
            INVOICE
          </h1>
          <div className="text-right space-y-1">
            <div className="text-[10px] tracking-[0.2em] opacity-80">NUMBER</div>
            <div style={{ fontFamily: headingFont, fontWeight: 700, fontSize: 22 }}>{invoice.invoiceNumber}</div>
            <div className="text-[10px] mt-2 opacity-90">{issued}</div>
          </div>
        </div>
      </div>

      <div className="px-12 py-10">
        <div className="grid grid-cols-2 gap-8 mb-10">
          <div>
            <div className="text-[9px] tracking-[0.25em] text-neutral-500 mb-1">FROM</div>
            {style.businessName && <div style={{ fontFamily: headingFont, fontWeight: 800, fontSize: 18 }}>{style.businessName}</div>}
            {style.businessAddress && <div className="text-[12px] text-neutral-700 whitespace-pre-line mt-1">{style.businessAddress}</div>}
            {style.businessEmail && <div className="text-[12px] text-neutral-700">{style.businessEmail}</div>}
          </div>
          <div>
            <div className="text-[9px] tracking-[0.25em] text-neutral-500 mb-1">BILL TO</div>
            <div style={{ fontFamily: headingFont, fontWeight: 800, fontSize: 18 }}>{invoice.clientName || '—'}</div>
            {clientAddress && (
              <div className="text-[12px] text-neutral-700 whitespace-pre-line mt-1">{clientAddress}</div>
            )}
          </div>
        </div>

        <table className="w-full mb-8">
          <thead>
            <tr>
              <th className="text-left py-3 text-[10px] tracking-[0.2em] font-bold text-neutral-900" style={{ borderBottom: `3px solid ${accent}` }}>ITEM</th>
              <th className="text-right py-3 text-[10px] tracking-[0.2em] font-bold text-neutral-900 w-20" style={{ borderBottom: `3px solid ${accent}` }}>QTY</th>
              <th className="text-right py-3 text-[10px] tracking-[0.2em] font-bold text-neutral-900 w-24" style={{ borderBottom: `3px solid ${accent}` }}>RATE</th>
              <th className="text-right py-3 text-[10px] tracking-[0.2em] font-bold text-neutral-900 w-32" style={{ borderBottom: `3px solid ${accent}` }}>TOTAL</th>
            </tr>
          </thead>
          <tbody>
            {invoice.items.map(it => (
              <tr key={it.id} style={{ borderBottom: '1px solid #EEEEEE' }}>
                <td className="py-4 text-[13px] font-medium">{it.description}</td>
                <td className="py-4 text-[13px] text-right tabular-nums">{it.rateType === 'flat' ? '1' : it.hours.toFixed(2)}</td>
                <td className="py-4 text-[13px] text-right tabular-nums">
                  {it.rateType === 'hourly' ? formatCurrency(it.rate, invoice.currency) : 'flat'}
                </td>
                <td className="py-4 text-[14px] text-right tabular-nums font-semibold">{formatCurrency(it.amount, invoice.currency)}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <div className="flex justify-end mb-10">
          <div className="px-6 py-4 text-right" style={{ background: accent, color: '#fff' }}>
            <div className="text-[10px] tracking-[0.25em] opacity-80">TOTAL DUE</div>
            <div style={{ fontFamily: headingFont, fontWeight: 900, fontSize: 36, lineHeight: 1.1, letterSpacing: '-0.02em' }} className="tabular-nums">
              {formatCurrency(invoice.total, invoice.currency)}
            </div>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-8 text-[11px] text-neutral-700">
          {style.paymentInstructions && (
            <div>
              <div style={{ fontFamily: headingFont, fontWeight: 800 }} className="text-[12px] mb-1">PAYMENT</div>
              <div className="whitespace-pre-line">{style.paymentInstructions}</div>
            </div>
          )}
          {style.termsText && (
            <div>
              <div style={{ fontFamily: headingFont, fontWeight: 800 }} className="text-[12px] mb-1">TERMS</div>
              <div className="whitespace-pre-line">{style.termsText}</div>
            </div>
          )}
        </div>
        {invoice.notes && (
          <div className="mt-6 text-[11px] text-neutral-700">
            <div style={{ fontFamily: headingFont, fontWeight: 800 }} className="text-[12px] mb-1">NOTES</div>
            <div className="whitespace-pre-line">{invoice.notes}</div>
          </div>
        )}
        {style.footerNote && (
          <div className="mt-10 pt-4 text-[10px] text-neutral-500 text-center" style={{ borderTop: `1px solid ${accent}` }}>
            {style.footerNote}
          </div>
        )}
      </div>
    </div>
  );
}