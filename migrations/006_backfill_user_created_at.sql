-- ============================================================================
-- Migration 006: Backfill missing created_at values in user_profiles
-- ============================================================================
-- Description: Sets created_at for users who have NULL values
-- Run this in Supabase Dashboard > SQL Editor

BEGIN;

-- Update user_profiles with NULL created_at
-- Try to use the auth.users.created_at if available, otherwise use NOW()
UPDATE public.user_profiles up
SET created_at = COALESCE(au.created_at, NOW())
FROM auth.users au
WHERE up.id = au.id
  AND up.created_at IS NULL;

-- For any remaining users without a match in auth.users, set to NOW()
UPDATE public.user_profiles
SET created_at = NOW()
WHERE created_at IS NULL;

-- Ensure created_at is not nullable going forward (optional, but recommended)
-- This will prevent future NULL values
ALTER TABLE public.user_profiles
  ALTER COLUMN created_at SET DEFAULT NOW(),
  ALTER COLUMN created_at SET NOT NULL;

-- Same for updated_at
UPDATE public.user_profiles
SET updated_at = created_at
WHERE updated_at IS NULL;

ALTER TABLE public.user_profiles
  ALTER COLUMN updated_at SET DEFAULT NOW(),
  ALTER COLUMN updated_at SET NOT NULL;

COMMIT;

-- ============================================================================
-- Verification Query:
-- ============================================================================
-- Run this to verify all users have created_at values:
-- SELECT email, created_at, updated_at FROM public.user_profiles WHERE created_at IS NULL OR updated_at IS NULL;
