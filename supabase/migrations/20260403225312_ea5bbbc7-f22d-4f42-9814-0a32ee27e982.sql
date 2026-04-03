ALTER TABLE public.tasks
ADD COLUMN IF NOT EXISTS series_id uuid,
ADD COLUMN IF NOT EXISTS linked_group_id uuid,
ADD COLUMN IF NOT EXISTS detached_from_series boolean NOT NULL DEFAULT false;

UPDATE public.tasks
SET series_id = CASE
  WHEN recurrence_parent_id IS NOT NULL AND recurrence_parent_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN recurrence_parent_id::uuid
  ELSE id
END
WHERE series_id IS NULL;

UPDATE public.tasks
SET linked_group_id = series_id
WHERE linked = true
  AND linked_group_id IS NULL;

UPDATE public.tasks
SET detached_from_series = true
WHERE linked = false
  AND recurrence_parent_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_tasks_user_series_id ON public.tasks(user_id, series_id);
CREATE INDEX IF NOT EXISTS idx_tasks_user_linked_group_id ON public.tasks(user_id, linked_group_id);

CREATE OR REPLACE FUNCTION public.normalize_task_repeat_fields()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.series_id IS NULL THEN
    IF NEW.recurrence_parent_id IS NOT NULL AND NEW.recurrence_parent_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
      NEW.series_id := NEW.recurrence_parent_id::uuid;
    ELSE
      NEW.series_id := NEW.id;
    END IF;
  END IF;

  IF COALESCE(NEW.linked, false) THEN
    IF NEW.linked_group_id IS NULL THEN
      NEW.linked_group_id := NEW.series_id;
    END IF;
    NEW.detached_from_series := false;
  ELSE
    NEW.linked_group_id := NULL;
    IF NEW.recurrence_parent_id IS NOT NULL THEN
      NEW.detached_from_series := true;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS normalize_task_repeat_fields_trigger ON public.tasks;
CREATE TRIGGER normalize_task_repeat_fields_trigger
BEFORE INSERT OR UPDATE ON public.tasks
FOR EACH ROW
EXECUTE FUNCTION public.normalize_task_repeat_fields();