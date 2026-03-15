"""
Database schema documentation for Ommiquiz.

This file documents the PostgreSQL database schema.
No ORM models - we use plain SQL queries with asyncpg.
"""

# =============================================================================
# TABLE: user_profiles
# =============================================================================
# Stores user profile information linked to Supabase auth.users
#
# Columns:
#   - id (UUID, PRIMARY KEY): References auth.users(id)
#   - email (TEXT, NOT NULL): User's email address
#   - display_name (TEXT): Optional display name
#   - created_at (TIMESTAMPTZ): Record creation timestamp
#   - updated_at (TIMESTAMPTZ): Record update timestamp
#
# Row Level Security: Enabled
# Policies:
#   - Users can view their own profile
#   - Users can update their own profile


# =============================================================================
# TABLE: flashcard_progress
# =============================================================================
# Tracks user progress for individual flashcards
#
# Columns:
#   - id (SERIAL, PRIMARY KEY): Auto-incrementing ID
#   - user_id (UUID, NOT NULL): References auth.users(id)
#   - flashcard_id (TEXT, NOT NULL): Flashcard set identifier
#   - card_id (TEXT, NOT NULL): Individual card identifier
#   - box (INTEGER, NOT NULL): Box number (1=learned, 2=uncertain, 3=not learned)
#   - last_reviewed (TIMESTAMPTZ, NOT NULL): Last review timestamp
#   - review_count (INTEGER, DEFAULT 1): Number of times reviewed
#   - created_at (TIMESTAMPTZ): Record creation timestamp
#   - updated_at (TIMESTAMPTZ): Record update timestamp
#
# Constraints:
#   - CHECK: box IN (1, 2, 3)
#   - UNIQUE: (user_id, flashcard_id, card_id)
#
# Indexes:
#   - idx_flashcard_progress_user_flashcard ON (user_id, flashcard_id)
#   - UNIQUE index on (user_id, flashcard_id, card_id)
#
# Row Level Security: Enabled
# Policies:
#   - Users can view their own progress
#   - Users can insert their own progress
#   - Users can update their own progress


# =============================================================================
# TABLE: quiz_sessions
# =============================================================================
# Records completed quiz sessions for history tracking
#
# Columns:
#   - id (SERIAL, PRIMARY KEY): Auto-incrementing ID
#   - user_id (UUID, NOT NULL): References auth.users(id)
#   - flashcard_id (TEXT, NOT NULL): Flashcard set identifier
#   - flashcard_title (TEXT): Optional flashcard set title
#   - started_at (TIMESTAMPTZ, NOT NULL): Session start time
#   - completed_at (TIMESTAMPTZ, NOT NULL): Session completion time
#   - cards_reviewed (INTEGER, NOT NULL): Number of cards reviewed
#   - box1_count (INTEGER, DEFAULT 0): Number of cards in box 1 (learned)
#   - box2_count (INTEGER, DEFAULT 0): Number of cards in box 2 (uncertain)
#   - box3_count (INTEGER, DEFAULT 0): Number of cards in box 3 (not learned)
#   - duration_seconds (INTEGER): Session duration in seconds
#   - created_at (TIMESTAMPTZ): Record creation timestamp
#
# Indexes:
#   - idx_quiz_sessions_user ON (user_id)
#   - idx_quiz_sessions_user_flashcard ON (user_id, flashcard_id)
#   - idx_quiz_sessions_completed_at ON (completed_at DESC)
#
# Row Level Security: Enabled
# Policies:
#   - Users can view their own sessions
#   - Users can insert their own sessions


# =============================================================================
# TABLE: card_ratings
# =============================================================================
# Stores user ratings (1-5 stars) for individual flashcards
#
# Columns:
#   - id (SERIAL, PRIMARY KEY): Auto-incrementing ID
#   - user_id (UUID, NOT NULL): References auth.users(id)
#   - flashcard_id (TEXT, NOT NULL): Flashcard set identifier
#   - card_id (TEXT, NOT NULL): Individual card identifier
#   - rating (INTEGER, NOT NULL): Rating value (1-5 stars)
#   - created_at (TIMESTAMPTZ): When the rating was given
#   - updated_at (TIMESTAMPTZ): When the rating was last updated
#
# Constraints:
#   - CHECK: rating >= 1 AND rating <= 5
#   - UNIQUE: (user_id, flashcard_id, card_id)
#
# Indexes:
#   - idx_card_ratings_user ON (user_id)
#   - idx_card_ratings_flashcard ON (flashcard_id)
#   - idx_card_ratings_user_flashcard ON (user_id, flashcard_id)
#
# Row Level Security: Enabled
# Policies:
#   - Users can view their own ratings
#   - Users can insert their own ratings
#   - Users can update their own ratings
#   - Users can delete their own ratings


# =============================================================================
# TABLE: folders
# =============================================================================
# Stores user-created folders for organizing flashcard sets
#
# Columns:
#   - id (SERIAL, PRIMARY KEY): Auto-incrementing ID
#   - folder_id (TEXT, NOT NULL UNIQUE): Unique folder identifier
#   - owner_id (UUID, NOT NULL): References auth.users(id)
#   - name (TEXT, NOT NULL): Folder display name
#   - description (TEXT): Optional folder description
#   - color (TEXT): Hex color code for folder visualization (default: '#667eea')
#   - icon (TEXT): Emoji or icon identifier (default: '📁')
#   - parent_folder_id (TEXT): References folders(folder_id) for nested folders
#   - sort_order (INTEGER): For custom ordering (default: 0)
#   - created_at (TIMESTAMPTZ): Record creation timestamp
#   - updated_at (TIMESTAMPTZ): Record update timestamp
#
# Constraints:
#   - UNIQUE: folder_id
#   - FOREIGN KEY: parent_folder_id REFERENCES folders(folder_id)
#
# Indexes:
#   - idx_folders_owner ON (owner_id)
#   - idx_folders_parent ON (parent_folder_id)
#   - idx_folders_owner_sort ON (owner_id, sort_order)
#
# Row Level Security: Enabled
# Policies:
#   - Users can view their own folders
#   - Users can manage their own folders
#   - Admins have full access to all folders


# =============================================================================
# TABLE: user_flashcards (UPDATED)
# =============================================================================
# Extended with folder organization support
# 
# Additional Column:
#   - folder_id (TEXT): References folders(folder_id) ON DELETE SET NULL
#
# Additional Index:
#   - idx_user_flashcards_folder ON (folder_id)
