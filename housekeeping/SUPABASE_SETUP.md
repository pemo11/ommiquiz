# Supabase Setup Guide for Ommiquiz

This guide walks you through setting up Supabase authentication and PostgreSQL database for Ommiquiz.

## Prerequisites

- Node.js and npm installed
- Python 3.x installed
- A Supabase account (free tier is fine)

## Step 1: Create Supabase Project

1. Go to [https://supabase.com](https://supabase.com) and sign up/login
2. Click **"New Project"**
3. Fill in:
   - **Project Name**: ommiquiz (or your choice)
   - **Database Password**: Create a strong password (save this!)
   - **Region**: Choose closest to you
4. Click **"Create new project"** and wait 2-3 minutes for setup

## Step 2: Get Supabase Credentials

### Get Project URL and API Keys

1. Go to **Project Settings** (gear icon in left sidebar)
2. Click **API** in the left menu
3. Copy these values (you'll need them later):
   - **Project URL** (under "Project URL")
   - **anon public** key (under "Project API keys")
   - **service_role** key (under "Project API keys" - click "Reveal")

### Get Database Connection String

1. Still in **Project Settings** > **Database**
2. Scroll to **Connection string** section
3. Select **"Connection pooling"** tab (recommended for production)
4. Copy the connection string that starts with `postgresql://...`
5. Replace `[YOUR-PASSWORD]` with your database password

### Get JWT Secret

1. In **Project Settings** > **API**
2. Scroll down to **JWT Settings**
3. Copy the **JWT Secret**

## Step 3: Configure Backend Environment

1. Create or update `backend/.env` file:

```env
# Supabase Configuration
SUPABASE_URL=https://xxxxxxxxxxxxx.supabase.co
SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
SUPABASE_PUB_KEY=your-jwt-secret-here

# Database URL (from Connection Pooling)
DATABASE_URL=postgresql://postgres.[project-ref]:[password]@aws-0-[region].pooler.supabase.com:6543/postgres
```

**Important:** Replace all placeholder values with your actual credentials!

## Step 4: Install Backend Dependencies

Choose one of these methods:

### Option A: PowerShell Script (Windows)
```powershell
cd backend
.\scripts\Install-BackendDependencies.ps1
```

### Option B: Manual Installation
```bash
cd backend
pip install -r requirements.txt
```

## Step 5: Set Up Database Schema

### Option A: Automated Setup (Recommended)

**PowerShell:**
```powershell
.\scripts\Setup-Database.ps1
```

**Python:**
```bash
cd backend
python scripts/setup_database.py
```

This will create:
- `user_profiles` table
- `flashcard_progress` table
- `quiz_sessions` table
- All indexes
- Row Level Security policies

### Option B: Manual Setup (via Supabase UI)

1. Run the PowerShell script to generate SQL:
   ```powershell
   .\scripts\Setup-SupabaseDatabase.ps1
   ```

2. Open `supabase_schema.sql`

3. Go to Supabase Dashboard > **SQL Editor**

4. Copy and paste the SQL from the file

5. Click **"Run"**

## Step 6: Test Database Connection

```powershell
.\scripts\Test-DatabaseConnection.ps1
```

You should see:
```
✓ Database connection successful!
✓ PostgreSQL is responding correctly
```

## Step 7: Configure Frontend Environment

1. Create `frontend/.env` file (copy from `.env.example`):

```env
# Backend API URL
OMMIQUIZ_APP_API_URL=http://localhost:8080/api

# Supabase Configuration
OMMIQUIZ_APP_SUPABASE_URL=https://xxxxxxxxxxxxx.supabase.co
OMMIQUIZ_APP_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

**Note:** Only use `SUPABASE_URL` and `SUPABASE_ANON_KEY` in frontend (never use service_role_key!)

## Step 8: Install Frontend Dependencies

```bash
cd frontend
npm install
```

This will install `@supabase/supabase-js` and other dependencies.

## Step 9: Create Your First User

### Option A: Via Supabase Dashboard

1. Go to **Authentication** > **Users** in Supabase Dashboard
2. Click **"Add user"**
3. Choose **"Create new user"**
4. Enter:
   - **Email**: your email
   - **Password**: your password
5. Toggle **"Auto Confirm User"** to ON
6. Click **"Create user"**

### Option B: Via Frontend Signup (if you add signup UI)

The Supabase client supports `signUp()`:
```javascript
import { signUp } from './supabase'

const { user, session, error } = await signUp(email, password)
```

## Step 10: Start the Application

### Start Backend

```bash
cd backend
uvicorn app.main:app --reload --port 8080
```

Backend will run on `http://localhost:8080`

### Start Frontend

```bash
cd frontend
npm start
```

Frontend will run on `http://localhost:3000`

## Step 11: Test Authentication

1. Open `http://localhost:3000` in your browser
2. Click **"Admin"** button
3. Enter your Supabase user credentials
4. You should see:
   - Your email displayed in the header
   - **"Logout"** button appears
   - **"Admin"** panel accessible

## Verification Checklist

- [ ] Supabase project created
- [ ] Database connection successful
- [ ] Three tables created (user_profiles, flashcard_progress, quiz_sessions)
- [ ] Backend environment variables set
- [ ] Frontend environment variables set
- [ ] Backend dependencies installed
- [ ] Frontend dependencies installed
- [ ] Backend server running on port 8080
- [ ] Frontend server running on port 3000
- [ ] Can login with Supabase credentials
- [ ] User email displays in header after login
- [ ] Can logout successfully
- [ ] Can save quiz progress (requires authentication)

## Email Configuration (Important!)

### Default SMTP Limitations

Supabase's default SMTP has strict rate limits:
- **Free tier**: Only 4 emails per hour
- Emails often go to spam
- Not suitable for production

### Configure Custom SMTP (Recommended)

For production use, configure a custom SMTP provider:

**See: [RESEND_SMTP_SETUP.md](./RESEND_SMTP_SETUP.md)** for complete setup guide

Quick overview:
1. Create free account at [Resend.com](https://resend.com) (3,000 emails/month free)
2. Get API key
3. Configure in Supabase Dashboard → Settings → Auth → SMTP Settings
4. Add redirect URLs to whitelist: `http://localhost:3000` and `https://ommiquiz.de`

### Whitelist Redirect URLs

**Important**: After adding `emailRedirectTo` in signup, you must whitelist URLs:

1. Go to Supabase Dashboard → **Authentication** → **URL Configuration**
2. Add to **Redirect URLs**:
   - `http://localhost:3000` (development)
   - `https://ommiquiz.de` (production)
3. Save changes

Without whitelisting, confirmation emails won't be sent!

## Troubleshooting

### "Missing Supabase configuration"

**Problem:** Frontend shows console errors about missing config

**Solution:** Ensure `frontend/.env` has both:
- `OMMIQUIZ_APP_SUPABASE_URL`
- `OMMIQUIZ_APP_SUPABASE_ANON_KEY`

Note: Environment variables must start with `OMMIQUIZ_APP_` for Create React App

### "DATABASE_URL not set"

**Problem:** Backend fails to start

**Solution:** Check `backend/.env` has `DATABASE_URL` with correct connection string

### "Authentication failed"

**Problem:** Can't login with credentials

**Solutions:**
1. Verify user exists in Supabase Dashboard > Authentication > Users
2. Check user is confirmed (email_confirmed_at is set)
3. Try creating new user in Supabase Dashboard
4. Check browser console for detailed error messages

### "Token expired"

**Problem:** Get 401 errors after some time

**Solution:** This is normal. Supabase automatically refreshes tokens. If login again doesn't work, clear localStorage and cookies.

### "Permission denied" when creating tables

**Problem:** Database setup fails with permission errors

**Solution:** Ensure you're using the connection string with pooler (port 6543), not direct connection (port 5432)

### "Row Level Security" blocking queries

**Problem:** Can't see data even though tables exist

**Solution:** RLS policies are working correctly! They ensure users only see their own data. Make sure you're authenticated when making requests.

## Production Deployment

### Environment Variables

**Backend (.env):**
```env
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
SUPABASE_PUB_KEY=your-jwt-secret
DATABASE_URL=postgresql://...connection-pooling-url...
```

**Frontend (.env.production):**
```env
OMMIQUIZ_APP_API_URL=https://your-backend-domain.com/api
OMMIQUIZ_APP_SUPABASE_URL=https://your-project.supabase.co
OMMIQUIZ_APP_SUPABASE_ANON_KEY=your-anon-key
```

### Security Checklist

- [ ] Never commit `.env` files to git
- [ ] Never use `SUPABASE_SERVICE_ROLE_KEY` in frontend
- [ ] Use connection pooling (port 6543) for production
- [ ] Enable Row Level Security on all tables
- [ ] Set up proper CORS in backend
- [ ] Use HTTPS in production
- [ ] Set strong database password
- [ ] Regularly rotate secrets

## Database Maintenance

### Fresh Database Install

To reset your database (⚠️ deletes all data):

```powershell
.\scripts\Setup-Database.ps1 -DropExisting
```

Or:
```bash
python backend/scripts/setup_database.py --drop-existing
```

### View Data

1. Go to Supabase Dashboard > **Table Editor**
2. Select a table: `flashcard_progress`, `quiz_sessions`, or `user_profiles`
3. View, edit, or delete rows

### Query Data with SQL

1. Go to Supabase Dashboard > **SQL Editor**
2. Run queries:

```sql
-- View all quiz sessions
SELECT * FROM quiz_sessions ORDER BY completed_at DESC;

-- Count sessions per user
SELECT user_id, COUNT(*) as session_count
FROM quiz_sessions
GROUP BY user_id;

-- View progress for specific flashcard
SELECT * FROM flashcard_progress
WHERE flashcard_id = 'your-flashcard-id';
```

## Need Help?

1. Check the [Supabase Documentation](https://supabase.com/docs)
2. Check backend logs for detailed error messages
3. Check browser console for frontend errors
4. Review `backend/scripts/README.md` for database setup details

## Summary

You now have:
- ✅ Supabase authentication replacing Auth0
- ✅ PostgreSQL database with Row Level Security
- ✅ User progress tracking with box assignments
- ✅ Quiz session history
- ✅ Learning report generation capability
- ✅ Secure, scalable authentication flow

Happy quizzing! 🎯
