#!/usr/bin/env python3
"""
Apply database migration 005: Add time-to-flip tracking
"""

import asyncio
import asyncpg
import os
from pathlib import Path

# Load environment from backend/.env manually
def load_env_file(env_path):
    """Simple .env file parser"""
    env_vars = {}
    if env_path.exists():
        with open(env_path, 'r') as f:
            for line in f:
                line = line.strip()
                if line and not line.startswith('#') and '=' in line:
                    key, value = line.split('=', 1)
                    # Remove quotes if present
                    value = value.strip().strip('"').strip("'")
                    env_vars[key.strip()] = value
    return env_vars

backend_dir = Path(__file__).parent / "backend"
env_file = backend_dir / ".env"

if env_file.exists():
    env_vars = load_env_file(env_file)
    for key, value in env_vars.items():
        os.environ[key] = value
    print(f"Loaded environment from {env_file}")
else:
    print(f"Warning: {env_file} not found, using system environment")

DATABASE_URL = os.getenv("DATABASE_URL")

if not DATABASE_URL:
    print("ERROR: DATABASE_URL environment variable is not set")
    exit(1)

# Read migration SQL
migration_file = Path(__file__).parent / "migrations" / "005_add_time_to_flip_tracking.sql"

if not migration_file.exists():
    print(f"ERROR: Migration file not found: {migration_file}")
    exit(1)

with open(migration_file, 'r') as f:
    migration_sql = f.read()

print(f"Migration SQL:\n{migration_sql}\n")


async def apply_migration():
    """Apply the migration to the database"""
    print("Connecting to database...")

    try:
        conn = await asyncpg.connect(DATABASE_URL)
        print("✓ Connected successfully")

        print("\nApplying migration...")
        await conn.execute(migration_sql)
        print("✓ Migration applied successfully")

        # Verify the column was added
        print("\nVerifying column exists...")
        result = await conn.fetchrow("""
            SELECT column_name, data_type
            FROM information_schema.columns
            WHERE table_name = 'quiz_sessions'
            AND column_name = 'average_time_to_flip_seconds'
        """)

        if result:
            print(f"✓ Column verified: {result['column_name']} ({result['data_type']})")
        else:
            print("⚠ Warning: Column verification failed")

        await conn.close()
        print("\n✓ Migration completed successfully!")

    except Exception as e:
        print(f"\n✗ Error applying migration: {e}")
        exit(1)


if __name__ == "__main__":
    asyncio.run(apply_migration())
