-- ============================================================================
-- Migration 007: Fix user profile trigger to explicitly set timestamps
-- ============================================================================
-- Description: Updates the handle_new_user() trigger to explicitly set
--              created_at and updated_at timestamps
-- Run this in Supabase Dashboard > SQL Editor

BEGIN;

-- Update the function to explicitly set timestamps
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
DECLARE
    user_display_name TEXT;
BEGIN
    -- Extract display_name from user metadata (set during signup)
    user_display_name := NEW.raw_user_meta_data->>'display_name';

    -- If no display_name, try username
    IF user_display_name IS NULL THEN
        user_display_name := NEW.raw_user_meta_data->>'username';
    END IF;

    -- Insert new user profile with explicit timestamps
    INSERT INTO public.user_profiles (id, email, display_name, is_admin, created_at, updated_at)
    VALUES (
        NEW.id,
        NEW.email,
        user_display_name,
        FALSE,
        NOW(),  -- Explicitly set created_at
        NOW()   -- Explicitly set updated_at
    )
    ON CONFLICT (id) DO NOTHING;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMIT;

-- ============================================================================
-- Verification:
-- ============================================================================
-- To verify the function was updated:
-- SELECT prosrc FROM pg_proc WHERE proname = 'handle_new_user';
