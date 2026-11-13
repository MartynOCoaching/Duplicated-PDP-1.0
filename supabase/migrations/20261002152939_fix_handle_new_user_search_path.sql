/*
# Fix handle_new_user trigger function search_path

## Problem
The `handle_new_user()` trigger fires on `auth.users` INSERT (during signup).
The Supabase database linter flagged it with "Function Search Path Mutable" —
a mutable search_path can cause "database error saving new user" because the
trigger cannot resolve the `public.users` table reference reliably.

## Fix
Recreate `handle_new_user()` with an explicit `search_path = public` so the
unqualified `public.users` reference always resolves correctly.

## No data changes
Only the function definition changes. No tables, columns, or policies are touched.
*/

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
begin
  insert into public.users (id, email, name)
  values (
    new.id,
    new.email,
    new.raw_user_meta_data->>'name'
  );
  return new;
end;
$function$;
