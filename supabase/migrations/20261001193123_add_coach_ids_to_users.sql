/*
# Add coach_ids column to users table

1. Changes
- Adds `coach_ids` (uuid[]) column to the `users` table.
- This column stores the array of coach IDs that a parent is linked to,
  supporting parents with multiple children on different teams with different coaches.
- Existing rows will have NULL for this column, which is fine — the app
  falls back to the single `coach_id` column when `coach_ids` is empty.
2. Security
- No RLS policy changes needed — existing policies already cover the users table.
*/

ALTER TABLE users ADD COLUMN IF NOT EXISTS coach_ids uuid[];
