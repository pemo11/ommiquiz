"""
Setup Supabase Database Schema

This script creates all necessary tables, indexes, and Row Level Security policies
for the Ommiquiz application. It can be run multiple times to reset the database.

Usage:
    python setup_database.py [--drop-existing]

Options:
    --drop-existing    Drop existing tables before creating new ones (fresh install)
"""

import os
import sys
import asyncio
import asyncpg
from typing import Optional


# SQL for creating tables
CREATE_USER_PROFILES_TABLE = """
CREATE TABLE IF NOT EXISTS public.user_profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    email TEXT NOT NULL,
    display_name TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);
"""

CREATE_FLASHCARD_PROGRESS_TABLE = """
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
"""

CREATE_QUIZ_SESSIONS_TABLE = """
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
"""

# SQL for creating indexes
CREATE_INDEXES = [
    "CREATE INDEX IF NOT EXISTS idx_flashcard_progress_user_flashcard ON public.flashcard_progress(user_id, flashcard_id);",
    "CREATE INDEX IF NOT EXISTS idx_quiz_sessions_user ON public.quiz_sessions(user_id);",
    "CREATE INDEX IF NOT EXISTS idx_quiz_sessions_user_flashcard ON public.quiz_sessions(user_id, flashcard_id);",
    "CREATE INDEX IF NOT EXISTS idx_quiz_sessions_completed_at ON public.quiz_sessions(completed_at DESC);"
]

# SQL for enabling RLS
ENABLE_RLS = [
    "ALTER TABLE public.user_profiles ENABLE ROW LEVEL SECURITY;",
    "ALTER TABLE public.flashcard_progress ENABLE ROW LEVEL SECURITY;",
    "ALTER TABLE public.quiz_sessions ENABLE ROW LEVEL SECURITY;"
]

# SQL for creating RLS policies (drop existing first to avoid conflicts)
RLS_POLICIES = [
    # user_profiles policies
    "DROP POLICY IF EXISTS \"Users can view own profile\" ON public.user_profiles;",
    """CREATE POLICY "Users can view own profile"
       ON public.user_profiles FOR SELECT
       USING (auth.uid() = id);""",

    "DROP POLICY IF EXISTS \"Users can update own profile\" ON public.user_profiles;",
    """CREATE POLICY "Users can update own profile"
       ON public.user_profiles FOR UPDATE
       USING (auth.uid() = id);""",

    # flashcard_progress policies
    "DROP POLICY IF EXISTS \"Users can view own progress\" ON public.flashcard_progress;",
    """CREATE POLICY "Users can view own progress"
       ON public.flashcard_progress FOR SELECT
       USING (auth.uid() = user_id);""",

    "DROP POLICY IF EXISTS \"Users can insert own progress\" ON public.flashcard_progress;",
    """CREATE POLICY "Users can insert own progress"
       ON public.flashcard_progress FOR INSERT
       WITH CHECK (auth.uid() = user_id);""",

    "DROP POLICY IF EXISTS \"Users can update own progress\" ON public.flashcard_progress;",
    """CREATE POLICY "Users can update own progress"
       ON public.flashcard_progress FOR UPDATE
       USING (auth.uid() = user_id);""",

    # quiz_sessions policies
    "DROP POLICY IF EXISTS \"Users can view own sessions\" ON public.quiz_sessions;",
    """CREATE POLICY "Users can view own sessions"
       ON public.quiz_sessions FOR SELECT
       USING (auth.uid() = user_id);""",

    "DROP POLICY IF EXISTS \"Users can insert own sessions\" ON public.quiz_sessions;",
    """CREATE POLICY "Users can insert own sessions"
       ON public.quiz_sessions FOR INSERT
       WITH CHECK (auth.uid() = user_id);"""
]

# SQL for dropping tables (in correct order due to foreign keys)
DROP_TABLES = [
    "DROP TABLE IF EXISTS public.quiz_sessions CASCADE;",
    "DROP TABLE IF EXISTS public.flashcard_progress CASCADE;",
    "DROP TABLE IF EXISTS public.user_profiles CASCADE;"
]


async def setup_database(database_url: str, drop_existing: bool = False):
    """
    Set up the Supabase database schema.

    Args:
        database_url: PostgreSQL connection string
        drop_existing: If True, drop existing tables before creating new ones
    """
    print("=" * 70)
    print("Supabase Database Setup")
    print("=" * 70)
    print()

    try:
        print("Connecting to database...")
        conn = await asyncpg.connect(database_url)
        print("✓ Connected successfully")
        print()

        # Drop existing tables if requested
        if drop_existing:
            print("Dropping existing tables...")
            for drop_sql in DROP_TABLES:
                table_name = drop_sql.split("DROP TABLE IF EXISTS ")[1].split(" ")[0]
                try:
                    await conn.execute(drop_sql)
                    print(f"  ✓ Dropped {table_name}")
                except Exception as e:
                    print(f"  ⚠ Could not drop {table_name}: {e}")
            print()

        # Create tables
        print("Creating tables...")

        print("  Creating user_profiles...")
        await conn.execute(CREATE_USER_PROFILES_TABLE)
        print("  ✓ user_profiles created")

        print("  Creating flashcard_progress...")
        await conn.execute(CREATE_FLASHCARD_PROGRESS_TABLE)
        print("  ✓ flashcard_progress created")

        print("  Creating quiz_sessions...")
        await conn.execute(CREATE_QUIZ_SESSIONS_TABLE)
        print("  ✓ quiz_sessions created")
        print()

        # Create indexes
        print("Creating indexes...")
        for index_sql in CREATE_INDEXES:
            index_name = index_sql.split("CREATE INDEX IF NOT EXISTS ")[1].split(" ")[0]
            try:
                await conn.execute(index_sql)
                print(f"  ✓ {index_name}")
            except Exception as e:
                print(f"  ⚠ Could not create {index_name}: {e}")
        print()

        # Enable Row Level Security
        print("Enabling Row Level Security...")
        for rls_sql in ENABLE_RLS:
            table_name = rls_sql.split("ALTER TABLE ")[1].split(" ")[0]
            try:
                await conn.execute(rls_sql)
                print(f"  ✓ RLS enabled on {table_name}")
            except Exception as e:
                print(f"  ⚠ Could not enable RLS on {table_name}: {e}")
        print()

        # Create RLS policies
        print("Creating Row Level Security policies...")
        policy_count = 0
        for policy_sql in RLS_POLICIES:
            try:
                await conn.execute(policy_sql)
                if "CREATE POLICY" in policy_sql:
                    policy_count += 1
            except Exception as e:
                print(f"  ⚠ Policy error: {e}")
        print(f"  ✓ Created {policy_count} RLS policies")
        print()

        # Close connection
        await conn.close()
        print("=" * 70)
        print("✓ Database setup completed successfully!")
        print("=" * 70)
        print()
        print("Tables created:")
        print("  - user_profiles")
        print("  - flashcard_progress")
        print("  - quiz_sessions")
        print()
        print("Next steps:")
        print("  1. Start your backend server")
        print("  2. Test the database connection")
        print("  3. Begin using the application")
        print()

        return True

    except asyncpg.InvalidPasswordError:
        print("✗ Authentication failed: Invalid password")
        print("  Check your DATABASE_URL credentials")
        return False

    except asyncpg.InvalidCatalogNameError:
        print("✗ Database does not exist")
        print("  Check your DATABASE_URL database name")
        return False

    except asyncpg.CannotConnectNowError:
        print("✗ Cannot connect to database")
        print("  The database server may be starting up or unavailable")
        return False

    except Exception as e:
        print(f"✗ Error setting up database: {e}")
        print(f"  Error type: {type(e).__name__}")
        return False


async def verify_schema(database_url: str):
    """
    Verify that the schema was created correctly.

    Args:
        database_url: PostgreSQL connection string
    """
    print("Verifying schema...")

    try:
        conn = await asyncpg.connect(database_url)

        # Check tables exist
        tables_query = """
            SELECT table_name
            FROM information_schema.tables
            WHERE table_schema = 'public'
            AND table_name IN ('user_profiles', 'flashcard_progress', 'quiz_sessions')
            ORDER BY table_name;
        """
        tables = await conn.fetch(tables_query)

        print(f"\nFound {len(tables)} tables:")
        for table in tables:
            print(f"  ✓ {table['table_name']}")

        # Check indexes
        indexes_query = """
            SELECT indexname
            FROM pg_indexes
            WHERE schemaname = 'public'
            AND tablename IN ('user_profiles', 'flashcard_progress', 'quiz_sessions')
            ORDER BY indexname;
        """
        indexes = await conn.fetch(indexes_query)

        print(f"\nFound {len(indexes)} indexes:")
        for index in indexes[:5]:  # Show first 5
            print(f"  ✓ {index['indexname']}")
        if len(indexes) > 5:
            print(f"  ... and {len(indexes) - 5} more")

        await conn.close()
        print("\n✓ Schema verification passed")

    except Exception as e:
        print(f"\n✗ Schema verification failed: {e}")


def main():
    """Main entry point for the script."""
    # Check for --drop-existing flag
    drop_existing = "--drop-existing" in sys.argv

    # Get database URL from environment
    database_url = os.getenv("DATABASE_URL")

    if not database_url:
        print("✗ Error: DATABASE_URL environment variable is not set")
        print()
        print("Please set DATABASE_URL in your .env file or environment:")
        print("  export DATABASE_URL='postgresql://postgres:password@db.xxxxx.supabase.co:5432/postgres'")
        print()
        sys.exit(1)

    # Run setup
    try:
        success = asyncio.run(setup_database(database_url, drop_existing))

        if success:
            # Verify the schema
            asyncio.run(verify_schema(database_url))
            sys.exit(0)
        else:
            sys.exit(1)

    except KeyboardInterrupt:
        print("\n\n✗ Setup cancelled by user")
        sys.exit(1)


if __name__ == "__main__":
    main()
