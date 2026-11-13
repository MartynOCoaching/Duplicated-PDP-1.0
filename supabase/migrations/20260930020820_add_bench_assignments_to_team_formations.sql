/*
# Add bench assignments to team formations

1. Overview
Lets a coach record substitutes for a saved formation. Players on the pitch are
the starting lineup; bench entries are players who hold a named position on the
team sheet but are NOT part of the starting formation.

2. Modified Tables
- `team_formations`
  - New column `bench_assignments` (jsonb, NOT NULL, default '[]').
    Holds an array of objects shaped { playerId, positionId, positionName }.
    An empty array means no substitutes have been recorded.

3. Security
- No policy changes. Row level security on `team_formations` stays exactly as it is.

4. Notes
- Additive only. Existing rows keep their data and default to an empty bench array.
- No columns are dropped, renamed, or retyped.
*/

ALTER TABLE team_formations
  ADD COLUMN IF NOT EXISTS bench_assignments jsonb NOT NULL DEFAULT '[]'::jsonb;
