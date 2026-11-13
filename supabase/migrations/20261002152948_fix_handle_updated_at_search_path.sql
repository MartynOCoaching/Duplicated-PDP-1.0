/*
# Fix handle_updated_at trigger function search_path

## Problem
The `handle_updated_at()` trigger was flagged with "Function Search Path Mutable".
While less likely to cause the signup error, it should be fixed for consistency.

## Fix
Recreate with explicit `search_path = public`.
*/

CREATE OR REPLACE FUNCTION public.handle_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $function$
begin
  new.updated_at = now();
  return new;
end;
$function$;
