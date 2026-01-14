-- Migration 005: Add time-to-flip tracking to quiz_sessions
-- This adds a column to track the average time (in seconds) it took users
-- to flip cards and reveal answers during a quiz session.

-- Add column to quiz_sessions table
ALTER TABLE public.quiz_sessions
ADD COLUMN IF NOT EXISTS average_time_to_flip_seconds FLOAT;

-- Add comment for documentation
COMMENT ON COLUMN public.quiz_sessions.average_time_to_flip_seconds IS
'Average time in seconds between displaying a card and flipping it to reveal the answer';
