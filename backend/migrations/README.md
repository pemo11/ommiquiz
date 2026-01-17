# Database Migrations

This directory contains SQL migration scripts for the Ommiquiz database.

## How to Apply Migrations

Migrations should be applied manually using `psql` or through Supabase dashboard's SQL editor.

### Local Development (Docker)
```bash
# Connect to the local PostgreSQL database
docker exec -it ommiquiz-postgres psql -U postgres -d ommiquiz

# Run the migration
\i /path/to/migration/001_add_card_ratings.sql
```

### Supabase Production
1. Go to Supabase Dashboard > SQL Editor
2. Copy the contents of the migration file
3. Execute the SQL

## Migration Files

- `001_add_card_ratings.sql` - Adds card_ratings table for storing user ratings (1-5 stars) on individual flashcards

## Migration Guidelines

- Migrations are numbered sequentially (001, 002, etc.)
- Always include CREATE IF NOT EXISTS to make migrations idempotent
- Include appropriate indexes for query performance
- Enable Row Level Security (RLS) with appropriate policies
- Add table and column comments for documentation
