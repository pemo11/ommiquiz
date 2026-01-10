# Setup-SupabaseDatabase.ps1
# Generates SQL commands for creating Supabase database schema
# Run the generated SQL in Supabase SQL Editor

$sqlCommands = @"
-- Create user_profiles table
CREATE TABLE public.user_profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  display_name TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable Row Level Security for user_profiles
ALTER TABLE public.user_profiles ENABLE ROW LEVEL SECURITY;

-- Policy: Users can only read/update their own profile
CREATE POLICY "Users can view own profile"
  ON public.user_profiles FOR SELECT
  USING (auth.uid() = id);

CREATE POLICY "Users can update own profile"
  ON public.user_profiles FOR UPDATE
  USING (auth.uid() = id);

-- Create flashcard_progress table
CREATE TABLE public.flashcard_progress (
  id SERIAL PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  flashcard_id TEXT NOT NULL,
  card_id TEXT NOT NULL,
  box INTEGER CHECK (box IN (1, 2, 3)),
  last_reviewed TIMESTAMPTZ NOT NULL,
  review_count INTEGER DEFAULT 1,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, flashcard_id, card_id)
);

-- Create index for faster queries
CREATE INDEX idx_flashcard_progress_user_flashcard
  ON public.flashcard_progress(user_id, flashcard_id);

-- Enable Row Level Security for flashcard_progress
ALTER TABLE public.flashcard_progress ENABLE ROW LEVEL SECURITY;

-- Policies for flashcard_progress
CREATE POLICY "Users can view own progress"
  ON public.flashcard_progress FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own progress"
  ON public.flashcard_progress FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own progress"
  ON public.flashcard_progress FOR UPDATE
  USING (auth.uid() = user_id);

-- Create quiz_sessions table (for history tracking)
CREATE TABLE public.quiz_sessions (
  id SERIAL PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  flashcard_id TEXT NOT NULL,
  flashcard_title TEXT,
  started_at TIMESTAMPTZ NOT NULL,
  completed_at TIMESTAMPTZ NOT NULL,
  cards_reviewed INTEGER NOT NULL,
  box1_count INTEGER DEFAULT 0,
  box2_count INTEGER DEFAULT 0,
  box3_count INTEGER DEFAULT 0,
  duration_seconds INTEGER,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create indexes for quiz_sessions
CREATE INDEX idx_quiz_sessions_user ON public.quiz_sessions(user_id);
CREATE INDEX idx_quiz_sessions_user_flashcard ON public.quiz_sessions(user_id, flashcard_id);
CREATE INDEX idx_quiz_sessions_completed_at ON public.quiz_sessions(completed_at DESC);

-- Enable Row Level Security for quiz_sessions
ALTER TABLE public.quiz_sessions ENABLE ROW LEVEL SECURITY;

-- Policies for quiz_sessions
CREATE POLICY "Users can view own sessions"
  ON public.quiz_sessions FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own sessions"
  ON public.quiz_sessions FOR INSERT
  WITH CHECK (auth.uid() = user_id);
"@

Write-Host "`n========================================" -ForegroundColor Cyan
Write-Host "Supabase Database Schema Generator" -ForegroundColor Cyan
Write-Host "========================================`n" -ForegroundColor Cyan

Write-Host "This script will create SQL commands for setting up your Supabase database.`n" -ForegroundColor White

Write-Host "Tables to be created:" -ForegroundColor Yellow
Write-Host "  1. user_profiles - User profile information" -ForegroundColor White
Write-Host "  2. flashcard_progress - Card box assignments and review counts" -ForegroundColor White
Write-Host "  3. quiz_sessions - Quiz completion history with box distributions`n" -ForegroundColor White

Write-Host "Copy the SQL commands below and run them in Supabase SQL Editor:" -ForegroundColor Green
Write-Host "========================================`n" -ForegroundColor Cyan

Write-Host $sqlCommands -ForegroundColor White

Write-Host "`n========================================" -ForegroundColor Cyan
Write-Host "`nPress any key to save SQL to file..." -ForegroundColor Yellow
$null = $Host.UI.RawUI.ReadKey("NoEcho,IncludeKeyDown")

# Save to file
$outputPath = Join-Path -Path $PSScriptRoot -ChildPath ".." | Join-Path -ChildPath "supabase_schema.sql"
$sqlCommands | Out-File -FilePath $outputPath -Encoding UTF8

Write-Host "`nSQL schema saved to: $outputPath" -ForegroundColor Green
Write-Host "`nNext steps:" -ForegroundColor Yellow
Write-Host "  1. Open your Supabase project at https://supabase.com" -ForegroundColor White
Write-Host "  2. Navigate to SQL Editor" -ForegroundColor White
Write-Host "  3. Copy and paste the SQL from supabase_schema.sql" -ForegroundColor White
Write-Host "  4. Run the SQL commands" -ForegroundColor White
Write-Host "  5. Verify tables were created in Table Editor`n" -ForegroundColor White
