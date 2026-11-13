-- F8: any signed-in user could edit or delete any athlete row.
-- INSERT stays open to signed-in users because parent and player sign-up both
-- create athlete rows before any link exists. UPDATE/DELETE now require the row
-- to be the caller, one of the caller's children, an athlete on the caller's
-- team, or a row carrying the caller's own email (the avatar mirror write).
DO $$
DECLARE p record;
BEGIN
  FOR p IN SELECT policyname FROM pg_policies
           WHERE schemaname='public' AND tablename='players' AND cmd IN ('INSERT','UPDATE','DELETE') LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.players', p.policyname);
  END LOOP;
END $$;

CREATE POLICY "players_insert_signed_in" ON public.players
  FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "players_update_own_or_staff" ON public.players
  FOR UPDATE TO authenticated
  USING (
    public.is_staff()
    OR public.is_my_player(id::text)
    OR lower(coalesce(email, player_email, '')) = lower(coalesce(auth.jwt() ->> 'email', '~none~'))
  )
  WITH CHECK (
    public.is_staff()
    OR public.is_my_player(id::text)
    OR lower(coalesce(email, player_email, '')) = lower(coalesce(auth.jwt() ->> 'email', '~none~'))
  );

CREATE POLICY "players_delete_own_or_staff" ON public.players
  FOR DELETE TO authenticated
  USING (public.is_staff() OR public.is_my_player(id::text));
