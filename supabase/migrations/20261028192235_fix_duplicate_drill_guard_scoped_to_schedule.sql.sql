/*
# Fix over-aggressive duplicate drill guard

1. Purpose
- The previous duplicate guard cancelled ANY insert into `coach_drills`
  whose image_url already existed anywhere in the table. That silently
  swallowed legitimate saves, e.g. attaching a library drill to a
  different session or another team attaching the same drill. The app
  reported success but no row was stored, so drills "didn't save" to the
  team's session.

2. Changes
- Replace `public.prevent_duplicate_drill_url()`:
  - Only cancels an insert when the SAME image_url is being added to the
    SAME schedule (schedule_id) — a true duplicate within one session.
  - In that case it now raises a clear error instead of silently
    returning NULL, so the app can show "already added to this session".
  - Different sessions / different teams may reuse the same image freely.
- Trigger `coach_drills_no_duplicate_url` is recreated to use the fixed
  function. No data is changed; the library-copy trigger is untouched.

3. Security
- Function stays SECURITY DEFINER with a fixed search_path so the check
  sees every team's rows regardless of RLS.
- EXECUTE stays revoked from PUBLIC/anon/authenticated (trigger-only).
- No RLS or grant changes.
*/

CREATE OR REPLACE FUNCTION public.prevent_duplicate_drill_url()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.schedule_id IS NOT NULL AND EXISTS (
    SELECT 1
    FROM public.coach_drills
    WHERE image_url = NEW.image_url
      AND schedule_id = NEW.schedule_id
  ) THEN
    RAISE EXCEPTION 'This drill is already attached to this session.';
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
