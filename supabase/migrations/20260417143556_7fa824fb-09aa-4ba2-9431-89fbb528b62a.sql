-- Add Group (compound task) support to tasks table
ALTER TABLE public.tasks
  ADD COLUMN IF NOT EXISTS group_id uuid NULL,
  ADD COLUMN IF NOT EXISTS preferred_duration integer NULL,
  ADD COLUMN IF NOT EXISTS group_order integer NULL;

-- Index for fast child lookups
CREATE INDEX IF NOT EXISTS idx_tasks_group_id
  ON public.tasks(group_id)
  WHERE group_id IS NOT NULL;

-- Validation trigger: prevent nested groups (a group cannot be inside another group)
CREATE OR REPLACE FUNCTION public.validate_no_nested_groups()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.type = 'group' AND NEW.group_id IS NOT NULL THEN
    RAISE EXCEPTION 'Groups cannot be nested inside other Groups';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_validate_no_nested_groups ON public.tasks;
CREATE TRIGGER trg_validate_no_nested_groups
  BEFORE INSERT OR UPDATE ON public.tasks
  FOR EACH ROW
  EXECUTE FUNCTION public.validate_no_nested_groups();