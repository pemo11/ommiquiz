-- ============================================================================
-- Migration 001: Add Admin Role Support
-- ============================================================================
-- Run this in Supabase Dashboard > SQL Editor

BEGIN;

-- Add is_admin column to user_profiles
ALTER TABLE public.user_profiles
  ADD COLUMN IF NOT EXISTS is_admin BOOLEAN DEFAULT FALSE NOT NULL;

-- Create index for admin queries (partial index for efficiency)
CREATE INDEX IF NOT EXISTS idx_user_profiles_is_admin
  ON public.user_profiles(is_admin)
  WHERE is_admin = TRUE;

-- Add comment for documentation
COMMENT ON COLUMN public.user_profiles.is_admin IS
  'Flag indicating if user has admin privileges for flashcard management';

COMMIT;

-- ============================================================================
-- Rollback (if needed):
-- ============================================================================
-- BEGIN;
-- DROP INDEX IF EXISTS idx_user_profiles_is_admin;
-- ALTER TABLE public.user_profiles DROP COLUMN IF EXISTS is_admin;
-- COMMIT;
