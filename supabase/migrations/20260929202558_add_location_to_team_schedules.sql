/*
# Add location to team_schedules

1. Modified Tables
- `team_schedules`
  - Added `location` (text, nullable) — free-text venue/location for a practice or session
    (e.g. "Riverside Pitch", "Main Gym"). Nullable because existing rows and quick
    ad-hoc entries may not specify a location.

2. Security
- No policy changes. RLS and existing anon + authenticated CRUD policies on
  `team_schedules` are unchanged and continue to apply to the new column.

3. Important Notes
- Additive, non-destructive change. No existing data is altered or removed.
- Idempotent: uses ADD COLUMN IF NOT EXISTS so it is safe to re-run.
*/

ALTER TABLE team_schedules ADD COLUMN IF NOT EXISTS location text;
