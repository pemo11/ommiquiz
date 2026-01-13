-- ============================================================================
-- Migration 004: Auto-create user profile on signup
-- ============================================================================
-- This creates a trigger that automatically creates a user_profiles entry
-- when a new user signs up via Supabase Auth
-- ============================================================================

BEGIN;

-- Create function to handle new user signup
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

    -- Insert new user profile
    INSERT INTO public.user_profiles (id, email, display_name, is_admin)
    VALUES (
        NEW.id,
        NEW.email,
        user_display_name,
        FALSE
    )
    ON CONFLICT (id) DO NOTHING;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create trigger on auth.users insert
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW
    EXECUTE FUNCTION public.handle_new_user();

COMMIT;

-- ============================================================================
-- Verification:
-- ============================================================================
-- To verify the trigger was created, run:
-- SELECT * FROM information_schema.triggers WHERE trigger_name = 'on_auth_user_created';
--
-- To test: Create a new user in Supabase Auth Dashboard and check if
-- a corresponding entry appears in public.user_profiles
-- ============================================================================

-- ============================================================================
-- Rollback (if needed):
-- ============================================================================
-- DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
-- DROP FUNCTION IF EXISTS public.handle_new_user();
-- ============================================================================
