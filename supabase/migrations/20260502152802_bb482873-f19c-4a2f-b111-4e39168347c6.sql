ALTER TABLE public.tag_billing_settings
ADD COLUMN IF NOT EXISTS parent_only boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.tag_billing_settings.parent_only IS 'When true, this tag itself is not billable but acts as an inheritance anchor — subtags inherit billability and prompt for rate on creation.';