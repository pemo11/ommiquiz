-- Migration 010: Add user-generated flashcards with public/private visibility
-- Allows users to create and manage their own flashcard sets

CREATE TABLE user_flashcards (
    id SERIAL PRIMARY KEY,
    flashcard_id TEXT NOT NULL UNIQUE,
    owner_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    visibility TEXT NOT NULL CHECK (visibility IN ('global', 'private')),

    -- Denormalized metadata for performance
    title TEXT NOT NULL,
    description TEXT,
    author TEXT,
    language TEXT DEFAULT 'de',
    module TEXT,
    topics TEXT[],
    keywords TEXT[],
    card_count INTEGER DEFAULT 0,

    -- Storage info
    storage_type TEXT NOT NULL DEFAULT 'local',
    storage_path TEXT NOT NULL,
    filename TEXT NOT NULL,

    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for performance
CREATE INDEX idx_user_flashcards_owner ON user_flashcards(owner_id);
CREATE INDEX idx_user_flashcards_visibility ON user_flashcards(visibility);
CREATE INDEX idx_user_flashcards_flashcard_id ON user_flashcards(flashcard_id);
CREATE INDEX idx_user_flashcards_owner_visibility ON user_flashcards(owner_id, visibility);

-- Enable RLS
ALTER TABLE user_flashcards ENABLE ROW LEVEL SECURITY;

-- RLS Policies
-- Anyone can view global flashcards
CREATE POLICY "Anyone can view global flashcards" ON user_flashcards
    FOR SELECT USING (visibility = 'global');

-- Users can view their own private flashcards
CREATE POLICY "Users can view their own private flashcards" ON user_flashcards
    FOR SELECT USING (auth.uid() = owner_id);

-- Admins can view all flashcards
CREATE POLICY "Admins can view all flashcards" ON user_flashcards
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM user_profiles
            WHERE user_profiles.id = auth.uid()
            AND user_profiles.is_admin = true
        )
    );

-- Users can insert their own flashcards
CREATE POLICY "Users can insert their own flashcards" ON user_flashcards
    FOR INSERT WITH CHECK (auth.uid() = owner_id);

-- Users can update their own flashcards
CREATE POLICY "Users can update their own flashcards" ON user_flashcards
    FOR UPDATE USING (auth.uid() = owner_id);

-- Admins can update all flashcards
CREATE POLICY "Admins can update all flashcards" ON user_flashcards
    FOR UPDATE USING (
        EXISTS (
            SELECT 1 FROM user_profiles
            WHERE user_profiles.id = auth.uid()
            AND user_profiles.is_admin = true
        )
    );

-- Users can delete their own flashcards
CREATE POLICY "Users can delete their own flashcards" ON user_flashcards
    FOR DELETE USING (auth.uid() = owner_id);

-- Admins can delete all flashcards
CREATE POLICY "Admins can delete all flashcards" ON user_flashcards
    FOR DELETE USING (
        EXISTS (
            SELECT 1 FROM user_profiles
            WHERE user_profiles.id = auth.uid()
            AND user_profiles.is_admin = true
        )
    );

-- Trigger to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_user_flashcards_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_user_flashcards_timestamp
    BEFORE UPDATE ON user_flashcards
    FOR EACH ROW
    EXECUTE FUNCTION update_user_flashcards_updated_at();
