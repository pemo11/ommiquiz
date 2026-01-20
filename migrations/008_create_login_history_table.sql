-- Migration: Create login_history table for tracking all login attempts
-- This table is independent of Supabase auth system

-- Create login_history table
CREATE TABLE IF NOT EXISTS public.login_history (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES public.user_profiles(id) ON DELETE SET NULL,
    email TEXT NOT NULL,
    login_time TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    success BOOLEAN NOT NULL,
    ip_address TEXT,
    user_agent TEXT,
    error_message TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Create indexes for common queries
CREATE INDEX IF NOT EXISTS idx_login_history_user_id ON public.login_history(user_id);
CREATE INDEX IF NOT EXISTS idx_login_history_email ON public.login_history(email);
CREATE INDEX IF NOT EXISTS idx_login_history_login_time ON public.login_history(login_time DESC);
CREATE INDEX IF NOT EXISTS idx_login_history_success ON public.login_history(success);

-- Enable Row Level Security
ALTER TABLE public.login_history ENABLE ROW LEVEL SECURITY;

-- Policy: Admins can view all login history
CREATE POLICY "Admins can view all login history"
    ON public.login_history
    FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM public.user_profiles
            WHERE id = auth.uid()
            AND is_admin = true
        )
    );

-- Policy: Service role can insert login history (for backend logging)
CREATE POLICY "Service role can insert login history"
    ON public.login_history
    FOR INSERT
    WITH CHECK (true);

-- Add comment to table
COMMENT ON TABLE public.login_history IS 'Tracks all login attempts (successful and failed) independent of Supabase auth system';
COMMENT ON COLUMN public.login_history.user_id IS 'References user_profiles. NULL for failed attempts with unknown user';
COMMENT ON COLUMN public.login_history.success IS 'true for successful login, false for failed attempt';
COMMENT ON COLUMN public.login_history.login_time IS 'Timestamp when login attempt occurred';
COMMENT ON COLUMN public.login_history.ip_address IS 'Client IP address';
COMMENT ON COLUMN public.login_history.user_agent IS 'Client user agent string';
COMMENT ON COLUMN public.login_history.error_message IS 'Error message for failed login attempts';
