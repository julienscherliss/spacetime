ALTER TABLE public.tasks
  ADD COLUMN IF NOT EXISTS original_date text,
  ADD COLUMN IF NOT EXISTS recurrence_exceptions text[] NOT NULL DEFAULT '{}';