-- F14: tactical_playbooks and team_formations were world-readable and writable
-- by any signed-in user.
DO $$
DECLARE p record; t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['tactical_playbooks','team_formations'] LOOP
    FOR p IN SELECT policyname FROM pg_policies WHERE schemaname='public' AND tablename=t LOOP
      EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', p.policyname, t);
    END LOOP;
  END LOOP;
END $$;

REVOKE ALL ON public.tactical_playbooks FROM anon;
REVOKE ALL ON public.team_formations FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.tactical_playbooks TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.team_formations TO authenticated;

ALTER TABLE public.tactical_playbooks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.team_formations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tactical_playbooks_select_signed_in" ON public.tactical_playbooks
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "tactical_playbooks_insert_staff" ON public.tactical_playbooks
  FOR INSERT TO authenticated WITH CHECK (public.is_staff());
CREATE POLICY "tactical_playbooks_update_staff" ON public.tactical_playbooks
  FOR UPDATE TO authenticated USING (public.is_staff()) WITH CHECK (public.is_staff());
CREATE POLICY "tactical_playbooks_delete_staff" ON public.tactical_playbooks
  FOR DELETE TO authenticated USING (public.is_staff());

CREATE POLICY "team_formations_select_signed_in" ON public.team_formations
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "team_formations_insert_staff" ON public.team_formations
  FOR INSERT TO authenticated WITH CHECK (public.is_staff());
CREATE POLICY "team_formations_update_staff" ON public.team_formations
  FOR UPDATE TO authenticated USING (public.is_staff()) WITH CHECK (public.is_staff());
CREATE POLICY "team_formations_delete_staff" ON public.team_formations
  FOR DELETE TO authenticated USING (public.is_staff());
