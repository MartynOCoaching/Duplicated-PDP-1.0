-- F5: hydration_log (wellness entries for minors) had one FOR ALL policy open to anon.
DO $$
DECLARE p record;
BEGIN
  FOR p IN SELECT policyname FROM pg_policies WHERE schemaname='public' AND tablename='hydration_log' LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.hydration_log', p.policyname);
  END LOOP;
END $$;

REVOKE ALL ON public.hydration_log FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.hydration_log TO authenticated;

ALTER TABLE public.hydration_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "hydration_log_select_own_or_staff" ON public.hydration_log
  FOR SELECT TO authenticated
  USING (public.is_staff() OR public.is_my_player(player_id::text));

CREATE POLICY "hydration_log_insert_own_or_staff" ON public.hydration_log
  FOR INSERT TO authenticated
  WITH CHECK (public.is_staff() OR public.is_my_player(player_id::text));

CREATE POLICY "hydration_log_update_own_or_staff" ON public.hydration_log
  FOR UPDATE TO authenticated
  USING (public.is_staff() OR public.is_my_player(player_id::text))
  WITH CHECK (public.is_staff() OR public.is_my_player(player_id::text));

CREATE POLICY "hydration_log_delete_own_or_staff" ON public.hydration_log
  FOR DELETE TO authenticated
  USING (public.is_staff() OR public.is_my_player(player_id::text));
