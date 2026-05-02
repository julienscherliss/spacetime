CREATE TABLE public.invoice_style_settings (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL UNIQUE,
  template TEXT NOT NULL DEFAULT 'classic',
  accent_color TEXT NOT NULL DEFAULT '#D9531E',
  heading_font TEXT NOT NULL DEFAULT 'sans',
  body_font TEXT NOT NULL DEFAULT 'mono',
  business_name TEXT NOT NULL DEFAULT '',
  business_address TEXT NOT NULL DEFAULT '',
  business_email TEXT NOT NULL DEFAULT '',
  payment_instructions TEXT NOT NULL DEFAULT '',
  terms_text TEXT NOT NULL DEFAULT '',
  footer_note TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.invoice_style_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view own invoice style"
  ON public.invoice_style_settings FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users insert own invoice style"
  ON public.invoice_style_settings FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users update own invoice style"
  ON public.invoice_style_settings FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users delete own invoice style"
  ON public.invoice_style_settings FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

CREATE TRIGGER update_invoice_style_settings_updated_at
  BEFORE UPDATE ON public.invoice_style_settings
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();