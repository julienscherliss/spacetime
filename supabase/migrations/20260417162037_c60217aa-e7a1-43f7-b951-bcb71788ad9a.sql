-- Backfill invariant: every recurring task (parent or instance) must be linked.
-- Legacy rows where recurrence is set but linked=false led to "zombie" series
-- where the parent didn't propagate edits but instances kept generating.
UPDATE public.tasks
SET
  linked = true,
  linked_group_id = COALESCE(linked_group_id, series_id, id),
  detached_from_series = false
WHERE recurrence IS NOT NULL
  AND COALESCE(detached_from_series, false) = false
  AND COALESCE(linked, false) = false;