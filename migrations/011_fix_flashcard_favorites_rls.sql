-- Migration 011: Fix flashcard favorites RLS for direct database connections
-- Update RLS policies to work with both Supabase Auth and direct database connections

-- Drop the existing RLS policies that only work with auth.uid()
DROP POLICY IF EXISTS "Users can view their own favorites" ON flashcard_favorites;
DROP POLICY IF EXISTS "Users can insert their own favorites" ON flashcard_favorites;
DROP POLICY IF EXISTS "Users can delete their own favorites" ON flashcard_favorites;

-- Create new RLS policies that work with direct database connections
-- These policies allow access when auth.uid() matches OR when using service role

-- Policy for SELECT operations
CREATE POLICY "Users can view their own favorites or service role access" 
ON flashcard_favorites FOR SELECT 
USING (
  -- Allow if user matches auth context (Supabase Auth)
  auth.uid() = user_id 
  OR 
  -- Allow if using service role (direct database connection)
  current_setting('request.jwt.claim.role', true) = 'service_role'
  OR
  -- Allow if no auth context (service role connection)
  auth.uid() IS NULL
);

-- Policy for INSERT operations  
CREATE POLICY "Users can insert their own favorites or service role access"
ON flashcard_favorites FOR INSERT 
WITH CHECK (
  -- Allow if user matches auth context (Supabase Auth)
  auth.uid() = user_id
  OR
  -- Allow if using service role (direct database connection)
  current_setting('request.jwt.claim.role', true) = 'service_role'
  OR
  -- Allow if no auth context (service role connection)
  auth.uid() IS NULL
);

-- Policy for DELETE operations
CREATE POLICY "Users can delete their own favorites or service role access"
ON flashcard_favorites FOR DELETE 
USING (
  -- Allow if user matches auth context (Supabase Auth)
  auth.uid() = user_id
  OR
  -- Allow if using service role (direct database connection)
  current_setting('request.jwt.claim.role', true) = 'service_role'
  OR
  -- Allow if no auth context (service role connection)
  auth.uid() IS NULL
);