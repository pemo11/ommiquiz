-- Migration 009: Add flashcard favorites feature
-- Allows authenticated users to mark flashcard sets as favorites

CREATE TABLE flashcard_favorites (
    id SERIAL PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    flashcard_id TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    CONSTRAINT unique_user_flashcard_favorite UNIQUE (user_id, flashcard_id)
);

CREATE INDEX idx_favorites_user ON flashcard_favorites(user_id);
CREATE INDEX idx_favorites_flashcard ON flashcard_favorites(flashcard_id);

ALTER TABLE flashcard_favorites ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own favorites" ON flashcard_favorites
    FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert their own favorites" ON flashcard_favorites
    FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can delete their own favorites" ON flashcard_favorites
    FOR DELETE USING (auth.uid() = user_id);
