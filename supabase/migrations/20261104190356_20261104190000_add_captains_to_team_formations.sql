/*
# Add captains to team formations

## 1. Summary
Coaches can now mark one or two players as match captain(s) from the Match Setup
"Squad Selection" widget. The selected players get a "C" badge on their roster
name tag and on their field circle, and the selection is saved with the lineup so
it survives a reload and is visible to players and parents.

## 2. Modified tables and changes
- `team_formations`
  - New column `captains` (jsonb, NOT NULL, default `'[]'::jsonb`) holding an array
    of player id strings who are the captains for that lineup.
  - Existing rows are backfilled with an empty array by the column default.

## 3. Security changes
None. Row level security on `team_formations` is unchanged: no new policies and no
new grants are added, because the table already grants the roles it needs and the
new column is covered by the existing table level privileges.

## 4. Important notes
1. The column is additive only. No column is dropped, renamed or retyped, so no
   existing lineup data is lost.
2. Captains are stored on the lineup record rather than in a new table so that a
   lineup stays a single self contained document.
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'team_formations'
      AND column_name = 'captains'
  ) THEN
    ALTER TABLE public.team_formations
      ADD COLUMN captains jsonb NOT NULL DEFAULT '[]'::jsonb;
  END IF;
END $$;
