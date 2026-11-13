/*
# Parent-managed child profile photo

1. Purpose
- Parents can add, correct or replace the profile photo of their linked child
  (a "player" user row). Database rules only allow users to update their own
  profile row, so a parent needs a privileged, server-verified path.

2. New functions
- `set_child_avatar(p_child_id text, p_avatar_url text)`
  - SECURITY DEFINER PL/pgSQL function.
  - Verifies the caller (from the session, never from a parameter) is the
    parent of the child: the child's `parent_user_id` matches the caller,
    or the caller's `child_player_id` / `child_player_ids` includes the child.
  - Only allows clearing the link (NULL) or a link pointing into the
    `profile-images` storage bucket, capped at 500 characters.
  - Writes `avatar_url` on both the `users` row and the mirrored `players` row
    for the child.

3. Security
- EXECUTE revoked from PUBLIC and anon; granted to authenticated only.
- The parent-child link check is inside the function; no policy changes.

4. Notes
- No schema changes. Storage upload still lands in the parent's own folder
  (existing storage policy), only the link is written here.
*/

CREATE OR REPLACE FUNCTION set_child_avatar(p_child_id text, p_avatar_url text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller text[];
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  IF p_child_id IS NULL OR length(p_child_id) = 0 THEN
    RAISE EXCEPTION 'Invalid child';
  END IF;

  SELECT u.child_player_ids INTO v_caller FROM users u WHERE u.id = auth.uid();

  IF NOT EXISTS (
    SELECT 1
    FROM users child
    WHERE child.id::text = p_child_id
      AND child.role = 'player'
      AND (
        child.parent_user_id = auth.uid()::text
        OR child.id::text = (SELECT c.child_player_id FROM users c WHERE c.id = auth.uid())
        OR (v_caller IS NOT NULL AND child.id::text = ANY (v_caller))
      )
  ) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  IF p_avatar_url IS NOT NULL THEN
    IF length(p_avatar_url) = 0 OR length(p_avatar_url) > 500
       OR position('/profile-images/' in p_avatar_url) = 0 THEN
      RAISE EXCEPTION 'Invalid image link';
    END IF;
  END IF;

  UPDATE users SET avatar_url = p_avatar_url WHERE id::text = p_child_id;
  UPDATE players SET avatar_url = p_avatar_url WHERE id::text = p_child_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION set_child_avatar(text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION set_child_avatar(text, text) TO authenticated;
