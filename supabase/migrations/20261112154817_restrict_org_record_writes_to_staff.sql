-- F10: teams, clubs, associations and coaches accepted writes from any signed-in
-- user. Reads stay public because the sign-up screen lists coaches and teams
-- before anyone has a session; only the write verbs are narrowed.
-- INSERT stays open to signed-in users: sign-up creates the coach/association row
-- before any role exists to check against.
DO $$
DECLARE p record; t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['teams','clubs','associations','coaches'] LOOP
    FOR p IN SELECT policyname FROM pg_policies
             WHERE schemaname='public' AND tablename=t AND cmd IN ('UPDATE','DELETE','ALL') LOOP
      EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', p.policyname, t);
    END LOOP;
  END LOOP;
END $$;

REVOKE UPDATE, DELETE, TRUNCATE ON public.teams FROM anon;
REVOKE UPDATE, DELETE, TRUNCATE ON public.clubs FROM anon;
REVOKE UPDATE, DELETE, TRUNCATE ON public.associations FROM anon;
REVOKE UPDATE, DELETE, TRUNCATE ON public.coaches FROM anon;

CREATE POLICY "teams_update_staff" ON public.teams
  FOR UPDATE TO authenticated USING (public.is_staff()) WITH CHECK (public.is_staff());
CREATE POLICY "teams_delete_staff" ON public.teams
  FOR DELETE TO authenticated USING (public.is_staff());

CREATE POLICY "clubs_update_staff" ON public.clubs
  FOR UPDATE TO authenticated USING (public.is_staff()) WITH CHECK (public.is_staff());
CREATE POLICY "clubs_delete_staff" ON public.clubs
  FOR DELETE TO authenticated USING (public.is_staff());

CREATE POLICY "associations_update_staff" ON public.associations
  FOR UPDATE TO authenticated USING (public.is_staff()) WITH CHECK (public.is_staff());
CREATE POLICY "associations_delete_staff" ON public.associations
  FOR DELETE TO authenticated USING (public.is_staff());

CREATE POLICY "coaches_update_self_or_staff" ON public.coaches
  FOR UPDATE TO authenticated
  USING (id = auth.uid() OR public.is_staff())
  WITH CHECK (id = auth.uid() OR public.is_staff());
CREATE POLICY "coaches_delete_self_or_staff" ON public.coaches
  FOR DELETE TO authenticated USING (id = auth.uid() OR public.is_staff());
