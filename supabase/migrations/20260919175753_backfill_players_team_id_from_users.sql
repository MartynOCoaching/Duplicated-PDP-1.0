/*
# Backfill players.team_id from users table

The team_id column was already added as uuid to the players table.
Now backfill it from the users table (where team_id is text) by casting.
*/

UPDATE players p
SET team_id = u.team_id::uuid
FROM users u
WHERE p.id = u.id
  AND u.team_id IS NOT NULL
  AND p.team_id IS NULL;
