/*
# Prevent duplicate coach drills by image_url

1. Purpose
- When a coach uploads a drill image URL that already exists in `coach_drills`,
  the system must NOT create a second row for it. Instead, the existing
  ("established") drill row is reused.

2. Changes
- New function `public.prevent_duplicate_drill_url()` (trigger function):
  - Runs BEFORE INSERT on `public.coach_drills`.
  - If any row already has the same `image_url`, the new insert is cancelled
    (trigger returns NULL), so no duplicate row is ever created.
  - SECURITY DEFINER so the duplicate check sees every coach's rows, not just
    the rows the current coach may read.
- New trigger `coach_drills_no_duplicate_url` on `public.coach_drills`.
- No existing rows are modified or deleted; pre-existing duplicates stay but
  no new ones can be created.

3. Security
- The function is SECURITY DEFINER with a fixed search_path.
- It is not an RPC: EXECUTE is revoked from PUBLIC/anon. Only the trigger
  machinery (and table owners) can invoke it.
- No RLS or grant changes: table policies and privileges stay as they are.
*/

CREATE OR REPLACE FUNCTION public.prevent_duplicate_drill_url()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.coach_drills WHERE image_url = NEW.image_url
  ) THEN
    RETURN NULL; -- cancel the insert: an identical drill already exists
  END IF;
  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.prevent_duplicate_drill_url() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS coach_drills_no_duplicate_url ON public.coach_drills;

CREATE TRIGGER coach_drills_no_duplicate_url
BEFORE INSERT ON public.coach_drills
FOR EACH ROW
EXECUTE FUNCTION public.prevent_duplicate_drill_url();
