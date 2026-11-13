-- F1: the users UPDATE policy allows a user to write every column of their own
-- row, including `role`, which is_coach() reads to decide privilege. Pin the
-- column once it has a value: the first assignment (sign-up) still works, later
-- changes are silently ignored rather than erroring, so the client keeps working.
CREATE OR REPLACE FUNCTION public.enforce_user_role_immutable()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF OLD.role IS NOT NULL AND NEW.role IS DISTINCT FROM OLD.role THEN
    NEW.role := OLD.role;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_users_role_immutable ON public.users;
CREATE TRIGGER trg_users_role_immutable
  BEFORE UPDATE ON public.users
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_user_role_immutable();
