-- Run this in Supabase SQL Editor to diagnose the issue

-- 1. Check if any users have NULL created_at
SELECT
    COUNT(*) as total_users,
    COUNT(created_at) as users_with_created_at,
    COUNT(*) - COUNT(created_at) as users_without_created_at
FROM public.user_profiles;

-- 2. Show specific users with NULL dates
SELECT email, display_name, created_at, updated_at, is_admin
FROM public.user_profiles
WHERE created_at IS NULL OR updated_at IS NULL
ORDER BY email
LIMIT 10;

-- 3. Check if created_at column has NOT NULL constraint
SELECT
    column_name,
    is_nullable,
    column_default
FROM information_schema.columns
WHERE table_schema = 'public'
    AND table_name = 'user_profiles'
    AND column_name IN ('created_at', 'updated_at');

-- 4. Check a sample of users with dates
SELECT email, created_at, updated_at
FROM public.user_profiles
WHERE created_at IS NOT NULL
ORDER BY created_at DESC
LIMIT 5;
