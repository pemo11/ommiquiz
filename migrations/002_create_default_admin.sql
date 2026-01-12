-- ============================================================================
-- Migration 002: Create Default Admin User
-- ============================================================================
-- WICHTIG: Zuerst manuell in Supabase Dashboard erstellen:
-- 1. Supabase Dashboard > Authentication > Users > "Add User" klicken
-- 2. Email: ommiadmin@example.com
-- 3. Password: demo+123
-- 4. "Auto Confirm User": YES (aktivieren!)
-- 5. Benutzer erstellen
-- 6. Dann dieses SQL-Skript ausführen:
-- ============================================================================

BEGIN;

-- Grant admin privileges to the default admin account
UPDATE public.user_profiles
SET is_admin = TRUE, updated_at = NOW()
WHERE email = 'ommiadmin@example.com';

-- Verify the update was successful
DO $$
DECLARE
    admin_count INTEGER;
BEGIN
    SELECT COUNT(*) INTO admin_count
    FROM public.user_profiles
    WHERE email = 'ommiadmin@example.com' AND is_admin = TRUE;

    IF admin_count = 0 THEN
        RAISE NOTICE 'WARNING: Admin user not found or not updated. Please ensure the user exists in auth.users first.';
    ELSE
        RAISE NOTICE 'SUCCESS: Admin privileges granted to ommiadmin@example.com';
    END IF;
END $$;

COMMIT;

-- ============================================================================
-- Verification Query:
-- ============================================================================
-- Run this to verify the admin user was created successfully:
--
-- SELECT id, email, is_admin, created_at, updated_at
-- FROM public.user_profiles
-- WHERE email = 'ommiadmin@example.com';
--
-- Expected result: One row with is_admin = true
-- ============================================================================
