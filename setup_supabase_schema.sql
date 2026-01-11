-- ============================================================================
-- Supabase Database Setup for Ommiquiz
-- ============================================================================
-- Run this script in Supabase Dashboard > SQL Editor
-- This creates all tables, indexes, and Row Level Security policies

-- ============================================================================
-- 1. CREATE TABLES
-- ============================================================================

-- User Profiles Table
CREATE TABLE IF NOT EXISTS public.user_profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    email TEXT NOT NULL,
    display_name TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Flashcard Progress Table
CREATE TABLE IF NOT EXISTS public.flashcard_progress (
    id SERIAL PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    flashcard_id TEXT NOT NULL,
    card_id TEXT NOT NULL,
    box INTEGER CHECK (box IN (1, 2, 3)) NOT NULL,
    last_reviewed TIMESTAMPTZ NOT NULL,
    review_count INTEGER DEFAULT 1 NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(user_id, flashcard_id, card_id)
);

-- Quiz Sessions Table
CREATE TABLE IF NOT EXISTS public.quiz_sessions (
    id SERIAL PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    flashcard_id TEXT NOT NULL,
    flashcard_title TEXT,
    started_at TIMESTAMPTZ NOT NULL,
    completed_at TIMESTAMPTZ NOT NULL,
    cards_reviewed INTEGER NOT NULL,
    box1_count INTEGER DEFAULT 0 NOT NULL,
    box2_count INTEGER DEFAULT 0 NOT NULL,
    box3_count INTEGER DEFAULT 0 NOT NULL,
    duration_seconds INTEGER,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================================
-- 2. CREATE INDEXES
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_flashcard_progress_user_flashcard
    ON public.flashcard_progress(user_id, flashcard_id);

CREATE INDEX IF NOT EXISTS idx_quiz_sessions_user
    ON public.quiz_sessions(user_id);

CREATE INDEX IF NOT EXISTS idx_quiz_sessions_user_flashcard
    ON public.quiz_sessions(user_id, flashcard_id);

CREATE INDEX IF NOT EXISTS idx_quiz_sessions_completed_at
    ON public.quiz_sessions(completed_at DESC);

-- ============================================================================
-- 3. ENABLE ROW LEVEL SECURITY
-- ============================================================================

ALTER TABLE public.user_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.flashcard_progress ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.quiz_sessions ENABLE ROW LEVEL SECURITY;

-- ============================================================================
-- 4. CREATE RLS POLICIES
-- ============================================================================

-- Drop existing policies first (to avoid conflicts on re-run)
DROP POLICY IF EXISTS "Users can view own profile" ON public.user_profiles;
DROP POLICY IF EXISTS "Users can update own profile" ON public.user_profiles;
DROP POLICY IF EXISTS "Users can view own progress" ON public.flashcard_progress;
DROP POLICY IF EXISTS "Users can insert own progress" ON public.flashcard_progress;
DROP POLICY IF EXISTS "Users can update own progress" ON public.flashcard_progress;
DROP POLICY IF EXISTS "Users can view own sessions" ON public.quiz_sessions;
DROP POLICY IF EXISTS "Users can insert own sessions" ON public.quiz_sessions;

-- User Profiles Policies
CREATE POLICY "Users can view own profile"
    ON public.user_profiles FOR SELECT
    USING (auth.uid() = id);

CREATE POLICY "Users can update own profile"
    ON public.user_profiles FOR UPDATE
    USING (auth.uid() = id);

-- Flashcard Progress Policies
CREATE POLICY "Users can view own progress"
    ON public.flashcard_progress FOR SELECT
    USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own progress"
    ON public.flashcard_progress FOR INSERT
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own progress"
    ON public.flashcard_progress FOR UPDATE
    USING (auth.uid() = user_id);

-- Quiz Sessions Policies
CREATE POLICY "Users can view own sessions"
    ON public.quiz_sessions FOR SELECT
    USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own sessions"
    ON public.quiz_sessions FOR INSERT
    WITH CHECK (auth.uid() = user_id);

-- ============================================================================
-- SETUP COMPLETE
-- ============================================================================
-- You should now have:
--   ✓ 3 tables (user_profiles, flashcard_progress, quiz_sessions)
--   ✓ 4 indexes for query performance
--   ✓ Row Level Security enabled on all tables
--   ✓ 7 RLS policies to protect user data
-- ============================================================================
