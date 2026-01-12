-- ============================================================================
-- Migration 003: Add RLS Policies for Admin Management
-- ============================================================================
-- Run this in Supabase Dashboard > SQL Editor
-- These policies allow admins to view and manage all user profiles
-- ============================================================================

BEGIN;

-- ============================================================================
-- Policy 1: Admins can view all profiles
-- ============================================================================
-- This allows admins to see the list of all users in the User Management UI
DROP POLICY IF EXISTS "Admins can view all profiles" ON public.user_profiles;

CREATE POLICY "Admins can view all profiles"
  ON public.user_profiles FOR SELECT
  USING (
    auth.uid() IN (
      SELECT id FROM public.user_profiles WHERE is_admin = TRUE
    )
  );

-- ============================================================================
-- Policy 2: Admins can manage admin status
-- ============================================================================
-- This allows admins to grant/revoke admin privileges for other users
DROP POLICY IF EXISTS "Admins can manage admin status" ON public.user_profiles;

CREATE POLICY "Admins can manage admin status"
  ON public.user_profiles FOR UPDATE
  USING (
    auth.uid() IN (
      SELECT id FROM public.user_profiles WHERE is_admin = TRUE
    )
  )
  WITH CHECK (
    auth.uid() IN (
      SELECT id FROM public.user_profiles WHERE is_admin = TRUE
    )
  );

COMMIT;

-- ============================================================================
-- Important Notes:
-- ============================================================================
-- 1. These policies work in ADDITION to existing policies like "Users can view own profile"
-- 2. Regular users can still view their own profile via the existing policy
-- 3. Only admins can view OTHER users' profiles
-- 4. Only admins can update user_profiles (including admin status changes)
-- 5. The backend API endpoints will further validate admin permissions
-- ============================================================================

-- ============================================================================
-- Verification:
-- ============================================================================
-- To verify the policies were created, run:
--
-- SELECT schemaname, tablename, policyname, permissive, roles, cmd, qual, with_check
-- FROM pg_policies
-- WHERE tablename = 'user_profiles'
-- ORDER BY policyname;
--
-- You should see at least these policies:
-- - "Admins can view all profiles" (SELECT)
-- - "Admins can manage admin status" (UPDATE)
-- - Any existing policies for regular users
-- ============================================================================
