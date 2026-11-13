-- F12: coach_drills could be read, inserted and deleted by anonymous callers.
DO $$
DECLARE p record;
BEGIN
  FOR p IN SELECT policyname FROM pg_policies WHERE schemaname='public' AND tablename='coach_drills' LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.coach_drills', p.policyname);
  END LOOP;
END $$;

REVOKE ALL ON public.coach_drills FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.coach_drills TO authenticated;

ALTER TABLE public.coach_drills ENABLE ROW LEVEL SECURITY;

CREATE POLICY "coach_drills_select_signed_in" ON public.coach_drills
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "coach_drills_insert_staff" ON public.coach_drills
  FOR INSERT TO authenticated WITH CHECK (public.is_staff());

CREATE POLICY "coach_drills_update_staff" ON public.coach_drills
  FOR UPDATE TO authenticated USING (public.is_staff()) WITH CHECK (public.is_staff());

CREATE POLICY "coach_drills_delete_staff" ON public.coach_drills
  FOR DELETE TO authenticated USING (public.is_staff());
