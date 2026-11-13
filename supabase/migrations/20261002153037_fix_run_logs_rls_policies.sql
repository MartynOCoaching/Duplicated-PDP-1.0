/*
# Add RLS policies to run_logs table

## Problem
The `run_logs` table has RLS enabled but no policies, meaning all access is blocked.
This would cause errors when saving GPS run logs.

## Fix
Add 4 CRUD policies matching the pattern used on other tables:
- SELECT: anyone can view
- INSERT: authenticated users can insert
- UPDATE: authenticated users can update
- DELETE: authenticated users can delete
*/

ALTER TABLE public.run_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Anyone can view run logs" ON run_logs;
CREATE POLICY "Anyone can view run logs"
ON run_logs FOR SELECT
TO anon, authenticated
USING (true);

DROP POLICY IF EXISTS "Authenticated users can insert run logs" ON run_logs;
CREATE POLICY "Authenticated users can insert run logs"
ON run_logs FOR INSERT
TO authenticated
WITH CHECK (true);

DROP POLICY IF EXISTS "Authenticated users can update run logs" ON run_logs;
CREATE POLICY "Authenticated users can update run logs"
ON run_logs FOR UPDATE
TO authenticated
USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Authenticated users can delete run logs" ON run_logs;
CREATE POLICY "Authenticated users can delete run logs"
ON run_logs FOR DELETE
TO authenticated
USING (true);
