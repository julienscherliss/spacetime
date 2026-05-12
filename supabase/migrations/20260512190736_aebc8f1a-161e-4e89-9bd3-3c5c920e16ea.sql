
ALTER TABLE public.subscriptions
  ADD COLUMN IF NOT EXISTS payment_source TEXT,
  ADD COLUMN IF NOT EXISTS apple_original_transaction_id TEXT,
  ADD COLUMN IF NOT EXISTS apple_product_id TEXT,
  ADD COLUMN IF NOT EXISTS apple_environment TEXT,
  ADD COLUMN IF NOT EXISTS apple_latest_transaction_id TEXT,
  ADD COLUMN IF NOT EXISTS apple_expires_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS apple_auto_renew BOOLEAN;

CREATE UNIQUE INDEX IF NOT EXISTS subscriptions_apple_original_tx_idx
  ON public.subscriptions (apple_original_transaction_id)
  WHERE apple_original_transaction_id IS NOT NULL;

ALTER TABLE public.subscriptions
  DROP CONSTRAINT IF EXISTS subscriptions_payment_source_check;
ALTER TABLE public.subscriptions
  ADD CONSTRAINT subscriptions_payment_source_check
  CHECK (payment_source IS NULL OR payment_source IN ('stripe','apple_iap','promo','admin'));

UPDATE public.subscriptions
   SET payment_source = 'stripe'
 WHERE payment_source IS NULL AND stripe_subscription_id IS NOT NULL;

UPDATE public.subscriptions
   SET payment_source = 'admin'
 WHERE payment_source IS NULL AND lifetime_access = true;
