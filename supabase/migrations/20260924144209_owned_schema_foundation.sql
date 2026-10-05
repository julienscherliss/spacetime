-- Lovable created this table outside the exported migration history.
-- Reconstructed from the checked-in generated types, CSV header, and auditLog.ts.
-- On a fresh project replay-owned-schema.py runs this idempotent foundation
-- before the historical policy migrations, then db push records it normally.
CREATE TABLE IF NOT EXISTS public.audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  action text NOT NULL,
  object_type text NOT NULL DEFAULT '',
  object_id text NOT NULL DEFAULT '',
  prev_state jsonb NOT NULL DEFAULT '{}'::jsonb,
  new_state jsonb NOT NULL DEFAULT '{}'::jsonb,
  platform text NOT NULL DEFAULT '',
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.audit_log ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS audit_log_user_created_idx
  ON public.audit_log (user_id, created_at DESC);
