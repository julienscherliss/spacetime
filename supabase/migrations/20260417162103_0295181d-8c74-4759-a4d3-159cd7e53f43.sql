-- Re-attach orphaned instances. If a task is a generated recurrence_instance
-- whose parent (or series root) is itself recurring and linked, the instance
-- should be linked too. Older code paths flipped detached_from_series=true
-- as a side-effect of unlinking, leaving real series members orphaned.
UPDATE public.tasks AS t
SET
  linked = true,
  linked_group_id = COALESCE(p.linked_group_id, p.series_id, p.id),
  detached_from_series = false
FROM public.tasks AS p
WHERE t.is_recurrence_instance = true
  AND t.recurrence_parent_id IS NOT NULL
  AND p.id::text = t.recurrence_parent_id
  AND p.recurrence IS NOT NULL
  AND COALESCE(p.linked, false) = true
  AND (COALESCE(t.linked, false) = false OR t.linked_group_id IS NULL);