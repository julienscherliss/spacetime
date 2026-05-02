import { create } from 'zustand';
import { supabase } from '@/integrations/supabase/client';

export type RateType = 'hourly' | 'flat';
export type InvoiceStatus = 'invoiced' | 'paid';

export interface TagBillingSettings {
  id: string;
  tagValue: string;
  billable: boolean;
  rateType: RateType;
  hourlyRate: number;
  flatRate: number;
  clientName: string;
  currency: string;
}

export interface InvoiceItem {
  id: string;
  invoiceId: string;
  tagValue: string;
  description: string;
  rateType: RateType;
  hours: number;
  rate: number;
  amount: number;
}

export interface Invoice {
  id: string;
  invoiceNumber: string;
  clientName: string;
  status: InvoiceStatus;
  currency: string;
  subtotal: number;
  total: number;
  notes: string;
  rangeStart: string | null;
  rangeEnd: string | null;
  issuedAt: string;
  paidAt: string | null;
  items: InvoiceItem[];
}

interface BillingState {
  settings: TagBillingSettings[];
  invoices: Invoice[];
  loaded: boolean;
  loading: boolean;
  load: () => Promise<void>;
  upsertSettings: (tagValue: string, patch: Partial<Omit<TagBillingSettings, 'id' | 'tagValue'>>) => Promise<void>;
  getSettings: (tagValue: string) => TagBillingSettings | undefined;
  createInvoice: (invoice: {
    clientName: string;
    currency: string;
    notes: string;
    rangeStart: string | null;
    rangeEnd: string | null;
    items: Array<Omit<InvoiceItem, 'id' | 'invoiceId'>>;
  }) => Promise<Invoice | null>;
  setInvoiceStatus: (invoiceId: string, status: InvoiceStatus) => Promise<void>;
  deleteInvoice: (invoiceId: string) => Promise<void>;
}

function rowToSettings(r: any): TagBillingSettings {
  return {
    id: r.id,
    tagValue: r.tag_value,
    billable: !!r.billable,
    rateType: r.rate_type,
    hourlyRate: Number(r.hourly_rate),
    flatRate: Number(r.flat_rate),
    clientName: r.client_name || '',
    currency: r.currency || 'USD',
  };
}

function rowToInvoice(r: any, items: any[]): Invoice {
  return {
    id: r.id,
    invoiceNumber: r.invoice_number,
    clientName: r.client_name || '',
    status: r.status,
    currency: r.currency || 'USD',
    subtotal: Number(r.subtotal),
    total: Number(r.total),
    notes: r.notes || '',
    rangeStart: r.range_start,
    rangeEnd: r.range_end,
    issuedAt: r.issued_at,
    paidAt: r.paid_at,
    items: items.filter(it => it.invoice_id === r.id).map(it => ({
      id: it.id,
      invoiceId: it.invoice_id,
      tagValue: it.tag_value,
      description: it.description || '',
      rateType: it.rate_type,
      hours: Number(it.hours),
      rate: Number(it.rate),
      amount: Number(it.amount),
    })),
  };
}

export const useBillingStore = create<BillingState>((set, get) => ({
  settings: [],
  invoices: [],
  loaded: false,
  loading: false,

  load: async () => {
    if (get().loading) return;
    set({ loading: true });
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { set({ loading: false, loaded: true }); return; }

    const [settingsRes, invoicesRes, itemsRes] = await Promise.all([
      supabase.from('tag_billing_settings').select('*').eq('user_id', user.id),
      supabase.from('invoices').select('*').eq('user_id', user.id).order('issued_at', { ascending: false }),
      supabase.from('invoice_items').select('*').eq('user_id', user.id),
    ]);

    const settings = (settingsRes.data || []).map(rowToSettings);
    const items = itemsRes.data || [];
    const invoices = (invoicesRes.data || []).map(r => rowToInvoice(r, items));

    set({ settings, invoices, loaded: true, loading: false });
  },

  getSettings: (tagValue) => get().settings.find(s => s.tagValue === tagValue),

  upsertSettings: async (tagValue, patch) => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const existing = get().settings.find(s => s.tagValue === tagValue);
    const merged = {
      user_id: user.id,
      tag_value: tagValue,
      billable: patch.billable ?? existing?.billable ?? false,
      rate_type: patch.rateType ?? existing?.rateType ?? 'hourly',
      hourly_rate: patch.hourlyRate ?? existing?.hourlyRate ?? 0,
      flat_rate: patch.flatRate ?? existing?.flatRate ?? 0,
      client_name: patch.clientName ?? existing?.clientName ?? '',
      currency: patch.currency ?? existing?.currency ?? 'USD',
    };
    const { data, error } = await supabase
      .from('tag_billing_settings')
      .upsert(merged, { onConflict: 'user_id,tag_value' })
      .select()
      .single();
    if (error || !data) return;
    const row = rowToSettings(data);
    set(s => ({
      settings: s.settings.find(x => x.tagValue === tagValue)
        ? s.settings.map(x => x.tagValue === tagValue ? row : x)
        : [...s.settings, row],
    }));
  },

  createInvoice: async ({ clientName, currency, notes, rangeStart, rangeEnd, items }) => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return null;
    const subtotal = items.reduce((sum, it) => sum + it.amount, 0);
    const total = subtotal;
    const num = `INV-${new Date().getFullYear()}-${String(Date.now()).slice(-6)}`;

    const { data: invRow, error: invErr } = await supabase
      .from('invoices')
      .insert({
        user_id: user.id,
        invoice_number: num,
        client_name: clientName,
        currency,
        subtotal,
        total,
        notes,
        range_start: rangeStart,
        range_end: rangeEnd,
        status: 'invoiced',
      })
      .select()
      .single();
    if (invErr || !invRow) return null;

    const itemRows = items.map(it => ({
      invoice_id: invRow.id,
      user_id: user.id,
      tag_value: it.tagValue,
      description: it.description,
      rate_type: it.rateType,
      hours: it.hours,
      rate: it.rate,
      amount: it.amount,
    }));
    const { data: itemsData } = await supabase.from('invoice_items').insert(itemRows).select();
    const invoice = rowToInvoice(invRow, itemsData || []);
    set(s => ({ invoices: [invoice, ...s.invoices] }));
    return invoice;
  },

  setInvoiceStatus: async (invoiceId, status) => {
    const paidAt = status === 'paid' ? new Date().toISOString() : null;
    const { error } = await supabase
      .from('invoices')
      .update({ status, paid_at: paidAt })
      .eq('id', invoiceId);
    if (error) return;
    set(s => ({
      invoices: s.invoices.map(inv => inv.id === invoiceId ? { ...inv, status, paidAt } : inv),
    }));
  },

  deleteInvoice: async (invoiceId) => {
    const { error } = await supabase.from('invoices').delete().eq('id', invoiceId);
    if (error) return;
    set(s => ({ invoices: s.invoices.filter(inv => inv.id !== invoiceId) }));
  },
}));