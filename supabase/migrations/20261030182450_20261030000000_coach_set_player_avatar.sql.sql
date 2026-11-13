/*
# Coach-managed player profile photo

1. Purpose
- Coaches can add or replace the profile photo of players on their team.
- Users may normally only update their own profile row, so this privileged
  server function verifies the coach-player link before writing.

2. New function
- `set_player_avatar(p_player_id text, p_avatar_url text)`
  - SECURITY DEFINER PL/pgSQL.
  - Caller identity comes from the session (auth.uid()), never a parameter.
  - Authorizes the caller when the player's coach_id matches the caller,
    the caller's coach_ids include the player's coach_id (cast to text for
    comparison), or the player's team_id matches one of the caller's teams.
  - Only allows clearing the photo (NULL) or a link pointing into the
    `profile-images` storage bucket, capped at 500 characters.
  - Writes avatar_url on both the users row and the mirrored players row.

3. Security
- EXECUTE revoked from PUBLIC and anon; granted to authenticated only.
- No policy changes; storage uploads still land in the uploader's own folder.
*/

CREATE OR REPLACE FUNCTION set_player_avatar(p_player_id text, p_avatar_url text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller users%ROWTYPE;
  v_player_team text;
  v_player_coach text;
  v_player_coaches_users users.coach_ids%TYPE;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  IF p_player_id IS NULL OR length(p_player_id) = 0 THEN
    RAISE EXCEPTION 'Invalid player';
  END IF;

  SELECT * INTO v_caller FROM users WHERE id = auth.uid();
  IF v_caller.id IS NULL THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  SELECT team_id::text, coach_id::text, coach_ids
    INTO v_player_team, v_player_coach, v_player_coaches_users
  FROM users
  WHERE id::text = p_player_id AND role = 'player';

  IF v_player_team IS NULL AND v_player_coach IS NULL THEN
    SELECT team_id::text, coach_id::text
      INTO v_player_team, v_player_coach
    FROM players
    WHERE id::text = p_player_id;
  END IF;

  IF NOT (
    (v_player_coach IS NOT NULL AND v_player_coach = auth.uid()::text)
    OR (v_player_coach IS NOT NULL AND v_caller.coach_ids IS NOT NULL
        AND v_player_coach::uuid = ANY (v_caller.coach_ids))
    OR (v_player_team IS NOT NULL AND v_player_team = v_caller.team_id)
    OR (v_player_team IS NOT NULL AND v_caller.team_ids IS NOT NULL
        AND v_player_team = ANY (v_caller.team_ids))
    OR (v_player_coaches_users IS NOT NULL
        AND auth.uid() = ANY (v_player_coaches_users))
  ) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  IF p_avatar_url IS NOT NULL THEN
    IF length(p_avatar_url) = 0 OR length(p_avatar_url) > 500
       OR position('/profile-images/' in p_avatar_url) = 0 THEN
      RAISE EXCEPTION 'Invalid image link';
    END if;
  END IF;

  UPDATE users SET avatar_url = p_avatar_url WHERE id::text = p_player_id;
  UPDATE players SET avatar_url = p_avatar_url WHERE id::text = p_player_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION set_player_avatar(text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION set_player_avatar(text, text) TO authenticated;
