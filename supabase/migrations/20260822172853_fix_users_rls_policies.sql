/*
# Fix users table RLS policies

## Problem
The `users` table only allowed users to view their own profile (auth.uid() = id)
and had no INSERT or DELETE policies. This meant:
1. Coaches couldn't see player profiles in the users table
2. New player registrations couldn't save their user profile (upsert failed silently)
3. The coach dashboard couldn't reconcile players with their user profiles

## Changes
- Drop the restrictive "Users can view own profile" SELECT policy
- Add a new SELECT policy allowing all authenticated users to view all profiles
  (needed so coaches can see their players' profiles)
- Add INSERT policy allowing authenticated users to insert their own profile
- Add UPDATE policy allowing authenticated users to update their own profile
- Add DELETE policy allowing authenticated users to delete their own profile

## Security
- SELECT is broadened to all authenticated users since coaches need to see player profiles
- INSERT/UPDATE/DELETE are still scoped to own row (auth.uid() = id)
*/

-- Drop old restrictive policies
DROP POLICY IF EXISTS "Users can view own profile" ON users;
DROP POLICY IF EXISTS "Users can update own profile" ON users;

-- New SELECT policy: all authenticated users can view all profiles
-- (coaches need to see player profiles, players need to see coach info)
CREATE POLICY "Authenticated users can view all profiles"
ON users FOR SELECT
TO authenticated
USING (true);

-- INSERT policy: users can insert their own profile
CREATE POLICY "Users can insert own profile"
ON users FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = id);

-- UPDATE policy: users can update their own profile
CREATE POLICY "Users can update own profile"
ON users FOR UPDATE
TO authenticated
USING (auth.uid() = id)
WITH CHECK (auth.uid() = id);

-- DELETE policy: users can delete their own profile
CREATE POLICY "Users can delete own profile"
ON users FOR DELETE
TO authenticated
USING (auth.uid() = id);
