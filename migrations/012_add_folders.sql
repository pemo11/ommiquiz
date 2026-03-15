-- Migration 012: Add folders for organizing flashcard sets
-- Allows users to create folders and organize their flashcards

BEGIN;

-- Create folders table
CREATE TABLE folders (
    id SERIAL PRIMARY KEY,
    folder_id TEXT NOT NULL UNIQUE,
    owner_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    description TEXT,
    color TEXT DEFAULT '#667eea', -- Hex color for folder visualization
    icon TEXT DEFAULT '📁', -- Emoji or icon identifier
    parent_folder_id TEXT REFERENCES folders(folder_id) ON DELETE CASCADE, -- For nested folders
    sort_order INTEGER DEFAULT 0, -- For custom ordering
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Add folder_id to user_flashcards table
ALTER TABLE user_flashcards 
ADD COLUMN folder_id TEXT REFERENCES folders(folder_id) ON DELETE SET NULL;

-- Create indexes for performance
CREATE INDEX idx_folders_owner ON folders(owner_id);
CREATE INDEX idx_folders_parent ON folders(parent_folder_id);
CREATE INDEX idx_folders_owner_sort ON folders(owner_id, sort_order);
CREATE INDEX idx_user_flashcards_folder ON user_flashcards(folder_id);

-- Enable RLS
ALTER TABLE folders ENABLE ROW LEVEL SECURITY;

-- RLS Policies for folders
-- Users can view their own folders
CREATE POLICY "Users can view their own folders" ON folders
    FOR SELECT USING (auth.uid() = owner_id);

-- Admins can view all folders
CREATE POLICY "Admins can view all folders" ON folders
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM user_profiles
            WHERE user_profiles.id = auth.uid()
            AND user_profiles.is_admin = true
        )
    );

-- Users can insert their own folders
CREATE POLICY "Users can insert their own folders" ON folders
    FOR INSERT WITH CHECK (auth.uid() = owner_id);

-- Users can update their own folders
CREATE POLICY "Users can update their own folders" ON folders
    FOR UPDATE USING (auth.uid() = owner_id);

-- Admins can update all folders
CREATE POLICY "Admins can update all folders" ON folders
    FOR UPDATE USING (
        EXISTS (
            SELECT 1 FROM user_profiles
            WHERE user_profiles.id = auth.uid()
            AND user_profiles.is_admin = true
        )
    );

-- Users can delete their own folders
CREATE POLICY "Users can delete their own folders" ON folders
    FOR DELETE USING (auth.uid() = owner_id);

-- Admins can delete all folders
CREATE POLICY "Admins can delete all folders" ON folders
    FOR DELETE USING (
        EXISTS (
            SELECT 1 FROM user_profiles
            WHERE user_profiles.id = auth.uid()
            AND user_profiles.is_admin = true
        )
    );

-- Trigger to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_folders_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_folders_timestamp
    BEFORE UPDATE ON folders
    FOR EACH ROW
    EXECUTE FUNCTION update_folders_updated_at();

-- Create default "Uncategorized" folder for existing users
INSERT INTO folders (folder_id, owner_id, name, description, color, icon)
SELECT 
    'default_' || substring(id::text, 1, 8) as folder_id,
    id as owner_id,
    'Uncategorized' as name,
    'Default folder for uncategorized flashcards' as description,
    '#6c757d' as color,
    '📝' as icon
FROM auth.users
ON CONFLICT (folder_id) DO NOTHING;

COMMIT;

-- ============================================================================
-- Rollback (if needed):
-- ============================================================================
-- BEGIN;
-- DROP TRIGGER IF EXISTS trigger_update_folders_timestamp ON folders;
-- DROP FUNCTION IF EXISTS update_folders_updated_at();
-- ALTER TABLE user_flashcards DROP COLUMN IF EXISTS folder_id;
-- DROP TABLE IF EXISTS folders;
-- COMMIT;