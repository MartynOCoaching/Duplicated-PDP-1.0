-- Corrective: OLD is unassigned on INSERT, so build the previous-id set per op.
CREATE OR REPLACE FUNCTION public.enforce_child_link_ownership()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  added text;
  old_ids text[] := '{}'::text[];
BEGIN
  IF TG_OP = 'UPDATE' THEN
    old_ids := coalesce(OLD.child_player_ids, '{}'::text[]);
    IF OLD.child_player_id IS NOT NULL THEN
      old_ids := old_ids || OLD.child_player_id;
    END IF;
  END IF;

  FOR added IN
    SELECT x FROM unnest(
      coalesce(NEW.child_player_ids, '{}'::text[])
      || CASE WHEN NEW.child_player_id IS NULL THEN '{}'::text[]
              ELSE ARRAY[NEW.child_player_id] END
    ) AS x
    WHERE x IS NOT NULL AND NOT (x = ANY (old_ids))
  LOOP
    IF EXISTS (
      SELECT 1 FROM public.users other
      WHERE other.id <> NEW.id
        AND (other.child_player_id = added
             OR added = ANY (coalesce(other.child_player_ids, '{}'::text[])))
    ) THEN
      RAISE EXCEPTION 'This athlete is already linked to another parent account.';
    END IF;

    IF EXISTS (
      SELECT 1 FROM public.users child
      WHERE child.id::text = added
        AND child.parent_user_id IS NOT NULL
        AND child.parent_user_id <> NEW.id::text
    ) THEN
      RAISE EXCEPTION 'This athlete is already linked to another parent account.';
    END IF;
  END LOOP;

  RETURN NEW;
END;
$$;
