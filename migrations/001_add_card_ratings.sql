-- Migration: Add card_ratings table
-- Description: Stores user ratings (1-5 stars) for individual flashcards
-- Date: 2026-01-17

-- Create card_ratings table
CREATE TABLE IF NOT EXISTS card_ratings (
    id SERIAL PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    flashcard_id TEXT NOT NULL,
    card_id TEXT NOT NULL,
    rating INTEGER NOT NULL CHECK (rating >= 1 AND rating <= 5),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    CONSTRAINT unique_user_flashcard_card UNIQUE (user_id, flashcard_id, card_id)
);

-- Create indexes for efficient queries
CREATE INDEX IF NOT EXISTS idx_card_ratings_user ON card_ratings(user_id);
CREATE INDEX IF NOT EXISTS idx_card_ratings_flashcard ON card_ratings(flashcard_id);
CREATE INDEX IF NOT EXISTS idx_card_ratings_user_flashcard ON card_ratings(user_id, flashcard_id);

-- Enable Row Level Security
ALTER TABLE card_ratings ENABLE ROW LEVEL SECURITY;

-- Create policies
CREATE POLICY "Users can view their own ratings" ON card_ratings
    FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own ratings" ON card_ratings
    FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own ratings" ON card_ratings
    FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own ratings" ON card_ratings
    FOR DELETE USING (auth.uid() = user_id);

-- Create trigger to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_card_ratings_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER card_ratings_updated_at
    BEFORE UPDATE ON card_ratings
    FOR EACH ROW
    EXECUTE FUNCTION update_card_ratings_updated_at();

-- Add comment
COMMENT ON TABLE card_ratings IS 'Stores user ratings (1-5 stars) for individual flashcards. Optional feature for users to rate card difficulty/quality.';
