-- Preserve consumed recurrence slots across reloads and devices.
ALTER TABLE public.tasks
  ADD COLUMN IF NOT EXISTS original_date text,
  ADD COLUMN IF NOT EXISTS recurrence_exceptions text[] NOT NULL DEFAULT '{}';
-- Do not guess original dates for already moved legacy rows.
