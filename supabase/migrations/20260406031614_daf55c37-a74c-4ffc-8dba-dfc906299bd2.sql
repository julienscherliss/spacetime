ALTER TABLE public.library_items
  ALTER COLUMN category SET DEFAULT '';

UPDATE public.library_items
SET category = ''
WHERE category IS NULL OR category = 'uncategorized';

ALTER TABLE public.library_items
  ADD COLUMN IF NOT EXISTS is_urgent BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS is_important BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS due_date TEXT,
  ADD COLUMN IF NOT EXISTS subtasks JSONB NOT NULL DEFAULT '[]'::jsonb;

ALTER TABLE public.tasks
  ADD COLUMN IF NOT EXISTS category TEXT;