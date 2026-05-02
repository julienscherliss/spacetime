CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

CREATE TABLE public.tag_billing_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  tag_value text NOT NULL,
  billable boolean NOT NULL DEFAULT false,
  rate_type text NOT NULL DEFAULT 'hourly' CHECK (rate_type IN ('hourly','flat')),
  hourly_rate numeric(12,2) NOT NULL DEFAULT 0,
  flat_rate numeric(12,2) NOT NULL DEFAULT 0,
  client_name text NOT NULL DEFAULT '',
  currency text NOT NULL DEFAULT 'USD',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, tag_value)
);
ALTER TABLE public.tag_billing_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users view own tag billing" ON public.tag_billing_settings FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users insert own tag billing" ON public.tag_billing_settings FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users update own tag billing" ON public.tag_billing_settings FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users delete own tag billing" ON public.tag_billing_settings FOR DELETE TO authenticated USING (auth.uid() = user_id);
CREATE TRIGGER trg_tag_billing_settings_updated BEFORE UPDATE ON public.tag_billing_settings FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE public.invoices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  invoice_number text NOT NULL,
  client_name text NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT 'invoiced' CHECK (status IN ('invoiced','paid')),
  currency text NOT NULL DEFAULT 'USD',
  subtotal numeric(12,2) NOT NULL DEFAULT 0,
  total numeric(12,2) NOT NULL DEFAULT 0,
  notes text NOT NULL DEFAULT '',
  range_start date,
  range_end date,
  issued_at timestamptz NOT NULL DEFAULT now(),
  paid_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.invoices ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users view own invoices" ON public.invoices FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users insert own invoices" ON public.invoices FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users update own invoices" ON public.invoices FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users delete own invoices" ON public.invoices FOR DELETE TO authenticated USING (auth.uid() = user_id);
CREATE TRIGGER trg_invoices_updated BEFORE UPDATE ON public.invoices FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE public.invoice_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id uuid NOT NULL REFERENCES public.invoices(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  tag_value text NOT NULL,
  description text NOT NULL DEFAULT '',
  rate_type text NOT NULL CHECK (rate_type IN ('hourly','flat')),
  hours numeric(10,2) NOT NULL DEFAULT 0,
  rate numeric(12,2) NOT NULL DEFAULT 0,
  amount numeric(12,2) NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_invoice_items_invoice ON public.invoice_items(invoice_id);
CREATE INDEX idx_invoice_items_user_tag ON public.invoice_items(user_id, tag_value);
CREATE INDEX idx_invoices_user_status ON public.invoices(user_id, status);
ALTER TABLE public.invoice_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users view own invoice items" ON public.invoice_items FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users insert own invoice items" ON public.invoice_items FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users update own invoice items" ON public.invoice_items FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users delete own invoice items" ON public.invoice_items FOR DELETE TO authenticated USING (auth.uid() = user_id);