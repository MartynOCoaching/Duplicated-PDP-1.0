/*
# Fix set_child_avatar to support children that only exist in the players table

## 1. Problem
The `set_child_avatar` function authorized a parent by looking for the child in
the `users` table only. In this app many children have no `users` row — they
exist only in `players`. For those children the authorization check always
failed with "Not authorized", so parents could not upload a profile photo.

## 2. Change (no schema change, function body only)
- `set_child_avatar(p_child_id text, p_avatar_url text)` now authorizes when
  EITHER:
  - the child id is listed on the signed-in parent's own profile
    (`child_player_id` or `child_player_ids`), and a matching `players` row
    exists (children without a `users` row), OR
  - the child is a `player` in `users` linked to the caller via
    `parent_user_id` or the parent's child lists.
- The caller is still derived from `auth.uid()` only; the child id parameter
  can never grant access on its own.
- The image-link validation (must point at the `profile-images` bucket, max
  500 chars, or null to remove) is unchanged.
- Writes remain: `users.avatar_url` (when such a row exists) and
  `players.avatar_url` for the child's id.

## 3. Security
- Still `SECURITY DEFINER` with `SET search_path = public`.
- `REVOKE EXECUTE` from `PUBLIC` and `anon`; `GRANT EXECUTE` to `authenticated`.
- Idempotent: uses `CREATE OR REPLACE FUNCTION` and drops/recreates grants.
*/

CREATE OR REPLACE FUNCTION set_child_avatar(p_child_id text, p_avatar_url text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller_child_id text;
  v_caller_child_ids text[];
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  IF p_child_id IS NULL OR length(p_child_id) = 0 THEN
    RAISE EXCEPTION 'Invalid child';
  END IF;

  SELECT c.child_player_id, c.child_player_ids
    INTO v_caller_child_id, v_caller_child_ids
    FROM users c WHERE c.id = auth.uid();

  -- Authorized when the child is linked on the caller's own profile and the
  -- child row exists (players-only children), or when the child is a player
  -- in users linked back to this parent.
  IF NOT EXISTS (
    SELECT 1 FROM players p
    WHERE p.id::text = p_child_id
      AND (
        p.id::text = v_caller_child_id
        OR (v_caller_child_ids IS NOT NULL AND p.id::text = ANY (v_caller_child_ids))
      )
  )
  AND NOT EXISTS (
    SELECT 1 FROM users child
    WHERE child.id::text = p_child_id
      AND child.role = 'player'
      AND (
        child.parent_user_id = auth.uid()::text
        OR child.id::text = v_caller_child_id
        OR (v_caller_child_ids IS NOT NULL AND child.id::text = ANY (v_caller_child_ids))
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
