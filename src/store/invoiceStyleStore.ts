import { create } from 'zustand';
import { supabase } from '@/integrations/supabase/client';

export type InvoiceTemplate = 'classic' | 'minimal' | 'bold' | 'compact' | 'editorial';
export type FontChoice = 'sans' | 'mono' | 'serif' | 'display';

export interface InvoiceStyle {
  template: InvoiceTemplate;
  accentColor: string;
  headingFont: FontChoice;
  bodyFont: FontChoice;
  businessName: string;
  businessAddress: string;
  businessEmail: string;
  paymentInstructions: string;
  termsText: string;
  footerNote: string;
}

export const DEFAULT_STYLE: InvoiceStyle = {
  template: 'classic',
  accentColor: '#D9531E',
  headingFont: 'sans',
  bodyFont: 'mono',
  businessName: '',
  businessAddress: '',
  businessEmail: '',
  paymentInstructions: '',
  termsText: '',
  footerNote: '',
};

interface State {
  style: InvoiceStyle;
  loaded: boolean;
  loading: boolean;
  load: () => Promise<void>;
  save: (patch: Partial<InvoiceStyle>) => Promise<void>;
  setLocal: (patch: Partial<InvoiceStyle>) => void;
}

function rowToStyle(r: any): InvoiceStyle {
  return {
    template: r.template,
    accentColor: r.accent_color,
    headingFont: r.heading_font,
    bodyFont: r.body_font,
    businessName: r.business_name || '',
    businessAddress: r.business_address || '',
    businessEmail: r.business_email || '',
    paymentInstructions: r.payment_instructions || '',
    termsText: r.terms_text || '',
    footerNote: r.footer_note || '',
  };
}

function styleToRow(style: InvoiceStyle, userId: string) {
  return {
    user_id: userId,
    template: style.template,
    accent_color: style.accentColor,
    heading_font: style.headingFont,
    body_font: style.bodyFont,
    business_name: style.businessName,
    business_address: style.businessAddress,
    business_email: style.businessEmail,
    payment_instructions: style.paymentInstructions,
    terms_text: style.termsText,
    footer_note: style.footerNote,
  };
}

export const useInvoiceStyleStore = create<State>((set, get) => ({
  style: DEFAULT_STYLE,
  loaded: false,
  loading: false,

  load: async () => {
    if (get().loading) return;
    set({ loading: true });
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { set({ loading: false, loaded: true }); return; }
    const { data } = await supabase
      .from('invoice_style_settings')
      .select('*')
      .eq('user_id', user.id)
      .maybeSingle();
    if (data) set({ style: rowToStyle(data), loaded: true, loading: false });
    else set({ loaded: true, loading: false });
  },

  setLocal: (patch) => set(s => ({ style: { ...s.style, ...patch } })),

  save: async (patch) => {
    const next = { ...get().style, ...patch };
    set({ style: next });
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    await supabase
      .from('invoice_style_settings')
      .upsert(styleToRow(next, user.id), { onConflict: 'user_id' });
  },
}));

export const FONT_FAMILIES: Record<FontChoice, string> = {
  sans: '"Space Grotesk", "Inter", system-ui, sans-serif',
  mono: '"JetBrains Mono", "SF Mono", Menlo, monospace',
  serif: '"Playfair Display", Georgia, serif',
  display: '"Space Grotesk", Impact, sans-serif',
};

export const FONT_LABELS: Record<FontChoice, string> = {
  sans: 'Sans (Space Grotesk)',
  mono: 'Mono (JetBrains)',
  serif: 'Serif (Playfair)',
  display: 'Display (Heavy Sans)',
};

export const TEMPLATE_LABELS: Record<InvoiceTemplate, string> = {
  classic: 'Classic',
  minimal: 'Minimal',
  bold: 'Bold',
  compact: 'Compact',
  editorial: 'Editorial',
};