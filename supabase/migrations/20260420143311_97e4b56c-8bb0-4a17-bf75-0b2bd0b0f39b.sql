ALTER TABLE public.tasks REPLICA IDENTITY FULL;
ALTER TABLE public.library_items REPLICA IDENTITY FULL;
ALTER TABLE public.library_categories REPLICA IDENTITY FULL;

DO $$
BEGIN
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.tasks;
  EXCEPTION WHEN duplicate_object THEN NULL; END;
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.library_items;
  EXCEPTION WHEN duplicate_object THEN NULL; END;
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.library_categories;
  EXCEPTION WHEN duplicate_object THEN NULL; END;
END $$;