import { format, parseISO } from 'date-fns';
import { formatCurrency } from '@/lib/billingFormat';
import { FONT_FAMILIES } from '@/store/invoiceStyleStore';
import { useClientStore } from '@/store/clientStore';
import type { TemplateProps } from './types';

export function CompactTemplate({ invoice, style }: TemplateProps) {
  const headingFont = FONT_FAMILIES[style.headingFont];
  const bodyFont = FONT_FAMILIES[style.bodyFont];
  const accent = style.accentColor;
  const issued = format(parseISO(invoice.issuedAt), 'yyyy-MM-dd');
  const clientAddress = useClientStore(s => invoice.clientId ? s.clients.find(c => c.id === invoice.clientId)?.address || '' : '');

  return (
    <div className="bg-white text-neutral-900 p-10" style={{ fontFamily: bodyFont, minHeight: '100%' }}>
      {/* Tight header bar */}
      <div className="flex items-center justify-between pb-3 mb-6" style={{ borderBottom: `2px solid ${accent}` }}>
        <div className="flex items-baseline gap-4">
          <h1 style={{ fontFamily: headingFont, fontWeight: 800, fontSize: 22, color: accent, letterSpacing: '-0.01em' }}>INVOICE</h1>
          <span className="text-[12px] text-neutral-600 tabular-nums">{invoice.invoiceNumber}</span>
        </div>
        <div className="text-[11px] text-neutral-600 tabular-nums">{issued}</div>
      </div>

      {/* Two-column meta */}
      <div className="grid grid-cols-3 gap-4 mb-6 text-[10px]">
        <div>
          <div className="text-neutral-400 tracking-[0.15em] mb-0.5">FROM</div>
          {style.businessName && <div style={{ fontFamily: headingFont, fontWeight: 700 }} className="text-[12px]">{style.businessName}</div>}
          {style.businessAddress && <div className="text-neutral-700 whitespace-pre-line">{style.businessAddress}</div>}
          {style.businessEmail && <div className="text-neutral-700">{style.businessEmail}</div>}
        </div>
        <div>
          <div className="text-neutral-400 tracking-[0.15em] mb-0.5">BILL TO</div>
          <div style={{ fontFamily: headingFont, fontWeight: 700 }} className="text-[12px]">{invoice.clientName || '—'}</div>
          {clientAddress && (
            <div className="text-neutral-700 whitespace-pre-line">{clientAddress}</div>
          )}
        </div>
        {invoice.rangeStart && invoice.rangeEnd && (
          <div>
            <div className="text-neutral-400 tracking-[0.15em] mb-0.5">PERIOD</div>
            <div className="text-[11px] text-neutral-700">
              {format(parseISO(invoice.rangeStart), 'MMM d')} – {format(parseISO(invoice.rangeEnd), 'MMM d, yyyy')}
            </div>
          </div>
        )}
      </div>

      {/* Dense table */}
      <table className="w-full mb-4">
        <thead>
          <tr style={{ background: '#FAFAFA', borderTop: '1px solid #E5E5E5', borderBottom: '1px solid #E5E5E5' }}>
            <th className="text-left py-1.5 px-2 text-[9px] tracking-[0.15em] font-semibold text-neutral-600">DESC</th>
            <th className="text-right py-1.5 px-2 text-[9px] tracking-[0.15em] font-semibold text-neutral-600 w-16">QTY</th>
            <th className="text-right py-1.5 px-2 text-[9px] tracking-[0.15em] font-semibold text-neutral-600 w-20">RATE</th>
            <th className="text-right py-1.5 px-2 text-[9px] tracking-[0.15em] font-semibold text-neutral-600 w-24">AMOUNT</th>
          </tr>
        </thead>
        <tbody>
          {invoice.items.map(it => (
            <tr key={it.id} style={{ borderBottom: '1px solid #F5F5F5' }}>
              <td className="py-1.5 px-2 text-[11px]">{it.description}</td>
              <td className="py-1.5 px-2 text-[11px] text-right tabular-nums">{it.rateType === 'flat' ? '1' : it.hours.toFixed(2)}</td>
              <td className="py-1.5 px-2 text-[11px] text-right tabular-nums text-neutral-600">
                {it.rateType === 'hourly' ? formatCurrency(it.rate, invoice.currency) : 'flat'}
              </td>
              <td className="py-1.5 px-2 text-[11px] text-right tabular-nums">{formatCurrency(it.amount, invoice.currency)}</td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr style={{ borderTop: `2px solid ${accent}` }}>
            <td colSpan={3} className="py-2 px-2 text-right text-[11px] tracking-[0.15em] font-semibold text-neutral-700">TOTAL</td>
            <td className="py-2 px-2 text-right text-[14px] font-bold tabular-nums" style={{ color: accent }}>
              {formatCurrency(invoice.total, invoice.currency)}
            </td>
          </tr>
        </tfoot>
      </table>

      <div className="grid grid-cols-3 gap-4 text-[9px] text-neutral-600 mt-6">
        {style.paymentInstructions && (
          <div>
            <div className="text-neutral-400 tracking-[0.15em] mb-0.5">PAYMENT</div>
            <div className="whitespace-pre-line leading-relaxed">{style.paymentInstructions}</div>
          </div>
        )}
        {style.termsText && (
          <div>
            <div className="text-neutral-400 tracking-[0.15em] mb-0.5">TERMS</div>
            <div className="whitespace-pre-line leading-relaxed">{style.termsText}</div>
          </div>
        )}
        {invoice.notes && (
          <div>
            <div className="text-neutral-400 tracking-[0.15em] mb-0.5">NOTES</div>
            <div className="whitespace-pre-line leading-relaxed">{invoice.notes}</div>
          </div>
        )}
      </div>
      {style.footerNote && (
        <div className="mt-6 text-[9px] text-neutral-400 text-center tracking-[0.15em]">{style.footerNote}</div>
      )}
    </div>
  );
}