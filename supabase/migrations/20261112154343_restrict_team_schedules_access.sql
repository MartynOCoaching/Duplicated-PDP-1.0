-- F3: team_schedules was readable and writable by anonymous callers.
DO $$
DECLARE p record;
BEGIN
  FOR p IN SELECT policyname FROM pg_policies WHERE schemaname='public' AND tablename='team_schedules' LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.team_schedules', p.policyname);
  END LOOP;
END $$;

REVOKE ALL ON public.team_schedules FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.team_schedules TO authenticated;

ALTER TABLE public.team_schedules ENABLE ROW LEVEL SECURITY;

CREATE POLICY "team_schedules_select_signed_in" ON public.team_schedules
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "team_schedules_insert_staff" ON public.team_schedules
  FOR INSERT TO authenticated WITH CHECK (public.is_staff());

CREATE POLICY "team_schedules_update_staff" ON public.team_schedules
  FOR UPDATE TO authenticated USING (public.is_staff()) WITH CHECK (public.is_staff());

CREATE POLICY "team_schedules_delete_staff" ON public.team_schedules
  FOR DELETE TO authenticated USING (public.is_staff());
