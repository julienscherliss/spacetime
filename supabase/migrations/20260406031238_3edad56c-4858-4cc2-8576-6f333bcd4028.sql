CREATE TABLE IF NOT EXISTS public.library_categories (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  value TEXT NOT NULL,
  label TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  CONSTRAINT library_categories_user_value_key UNIQUE (user_id, value)
);

ALTER TABLE public.library_categories ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own library categories"
ON public.library_categories
FOR SELECT
TO authenticated
USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own library categories"
ON public.library_categories
FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own library categories"
ON public.library_categories
FOR UPDATE
TO authenticated
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own library categories"
ON public.library_categories
FOR DELETE
TO authenticated
USING (auth.uid() = user_id);

CREATE OR REPLACE FUNCTION public.update_library_categories_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS update_library_categories_updated_at ON public.library_categories;
CREATE TRIGGER update_library_categories_updated_at
BEFORE UPDATE ON public.library_categories
FOR EACH ROW
EXECUTE FUNCTION public.update_library_categories_updated_at();

UPDATE public.library_items
SET category = ''
WHERE category = 'uncategorized';

INSERT INTO public.library_categories (user_id, value, label)
SELECT DISTINCT li.user_id,
  lower(regexp_replace(trim(li.category), '\s+', '-', 'g')) AS value,
  trim(li.category) AS label
FROM public.library_items li
WHERE li.category IS NOT NULL
  AND trim(li.category) <> ''
  AND trim(li.category) <> 'uncategorized'
ON CONFLICT (user_id, value) DO UPDATE
SET label = EXCLUDED.label;