# Database Setup Scripts

This directory contains scripts for setting up the Supabase database schema for Ommiquiz.

## Quick Start

### 1. Install Dependencies

```powershell
.\scripts\Install-BackendDependencies.ps1
```

Or manually:
```bash
cd backend
pip install -r requirements.txt
```

### 2. Set Up Database URL

Add to your `.env` file:
```env
DATABASE_URL=postgresql://postgres:[password]@db.xxxxx.supabase.co:5432/postgres
```

Get this from your Supabase project:
- Go to Project Settings > Database
- Copy the "Connection string" under "Connection pooling"
- Replace `[password]` with your database password

### 3. Run Database Setup (Recommended)

**PowerShell:**
```powershell
.\scripts\Setup-Database.ps1
```

**Python directly:**
```bash
cd backend
python scripts/setup_database.py
```

### Fresh Install (Drop Existing Tables)

**PowerShell:**
```powershell
.\scripts\Setup-Database.ps1 -DropExisting
```

**Python:**
```bash
python scripts/setup_database.py --drop-existing
```

⚠️ **Warning:** This will delete all existing data!

---

## Available Scripts

### setup_database.py (Recommended)
**Purpose:** Programmatically creates database schema using Python and asyncpg

**Features:**
- Creates all tables (user_profiles, flashcard_progress, quiz_sessions)
- Sets up indexes for performance
- Configures Row Level Security (RLS) policies
- Can drop existing tables for fresh install
- Verifies schema after creation
- Clear progress output

**Usage:**
```bash
python setup_database.py [--drop-existing]
```

**Advantages:**
- Repeatable - run multiple times for fresh installs
- Automated - no manual SQL execution needed
- Verified - checks schema after creation
- Safe - requires explicit flag to drop tables

---

### Setup-Database.ps1 (PowerShell Wrapper)
**Purpose:** PowerShell wrapper for setup_database.py

**Features:**
- Checks if DATABASE_URL is set
- Validates Python and dependencies
- Prompts for confirmation before dropping tables
- Better Windows integration

**Usage:**
```powershell
.\scripts\Setup-Database.ps1 [-DropExisting]
```

---

### Setup-SupabaseDatabase.ps1 (Manual Method)
**Purpose:** Generates SQL file for manual execution in Supabase SQL Editor

**Features:**
- Creates SQL file with complete schema
- Good for learning SQL structure
- Manual control over execution

**Usage:**
```powershell
.\scripts\Setup-SupabaseDatabase.ps1
```

Then copy SQL from `supabase_schema.sql` and run in Supabase SQL Editor.

**When to use:**
- You prefer manual database setup
- You want to review SQL before execution
- You're learning the schema structure

---

### Install-BackendDependencies.ps1
**Purpose:** Installs Python dependencies

**Features:**
- Adds Supabase dependencies to requirements.txt
- Runs pip install
- Interactive confirmation

**Usage:**
```powershell
.\scripts\Install-BackendDependencies.ps1
```

---

### Test-DatabaseConnection.ps1
**Purpose:** Tests PostgreSQL connection to Supabase

**Features:**
- Validates DATABASE_URL
- Tests asyncpg connection
- Helpful error messages

**Usage:**
```powershell
.\scripts\Test-DatabaseConnection.ps1
```

---

## Database Schema

### Tables

#### user_profiles
Stores user profile information linked to Supabase auth.users

- `id` (UUID, PK): References auth.users(id)
- `email` (TEXT): User's email
- `display_name` (TEXT): Optional display name
- `created_at`, `updated_at` (TIMESTAMPTZ): Timestamps

#### flashcard_progress
Tracks individual card progress (box assignments)

- `id` (SERIAL, PK): Auto-increment ID
- `user_id` (UUID): References auth.users(id)
- `flashcard_id` (TEXT): Flashcard set ID
- `card_id` (TEXT): Individual card ID
- `box` (INTEGER): Box number (1=learned, 2=uncertain, 3=not learned)
- `last_reviewed` (TIMESTAMPTZ): Last review time
- `review_count` (INTEGER): Number of reviews
- `created_at`, `updated_at` (TIMESTAMPTZ): Timestamps

**Constraints:**
- UNIQUE (user_id, flashcard_id, card_id)
- CHECK (box IN (1, 2, 3))

#### quiz_sessions
Records completed quiz sessions for history tracking

- `id` (SERIAL, PK): Auto-increment ID
- `user_id` (UUID): References auth.users(id)
- `flashcard_id` (TEXT): Flashcard set ID
- `flashcard_title` (TEXT): Optional title
- `started_at`, `completed_at` (TIMESTAMPTZ): Session times
- `cards_reviewed` (INTEGER): Total cards reviewed
- `box1_count`, `box2_count`, `box3_count` (INTEGER): Box distribution
- `duration_seconds` (INTEGER): Session duration
- `created_at` (TIMESTAMPTZ): Timestamp

### Row Level Security (RLS)

All tables have RLS enabled with policies ensuring users can only:
- View their own data
- Insert their own data
- Update their own data

RLS uses Supabase's `auth.uid()` function to match the authenticated user's UUID.

---

## Troubleshooting

### "DATABASE_URL not set"
- Check your `.env` file exists
- Verify the variable name is exactly `DATABASE_URL`
- Load .env: `$env:DATABASE_URL = "postgresql://..."`

### "asyncpg not installed"
Run: `pip install asyncpg`

### "Authentication failed"
- Check password in DATABASE_URL
- Verify database credentials in Supabase settings

### "Cannot connect"
- Check internet connection
- Verify Supabase project is active
- Confirm DATABASE_URL format is correct

### "Permission denied to create table"
- Your database user needs CREATE privileges
- Use the connection string from Supabase project settings
- Ensure you're using the service role (not anon key)

---

## Next Steps After Setup

1. **Test the connection:**
   ```powershell
   .\scripts\Test-DatabaseConnection.ps1
   ```

2. **Start the backend:**
   ```bash
   cd backend
   uvicorn app.main:app --reload
   ```

3. **Verify tables exist:**
   - Go to Supabase Dashboard > Table Editor
   - You should see: user_profiles, flashcard_progress, quiz_sessions

4. **Test authentication:**
   - Set up Supabase Auth in your frontend
   - Try creating a user and logging in
   - Data should be isolated per user (RLS)
