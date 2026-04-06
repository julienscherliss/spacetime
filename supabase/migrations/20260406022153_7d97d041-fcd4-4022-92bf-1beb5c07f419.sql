ALTER TABLE public.tasks ADD COLUMN IF NOT EXISTS archived_at timestamptz DEFAULT NULL;
ALTER TABLE public.tasks ADD COLUMN IF NOT EXISTS archive_reason text DEFAULT NULL;