# Login History System

## Overview

The Ommiquiz application includes a comprehensive login history tracking system that monitors all authentication attempts independently of Supabase's built-in audit logging. This provides complete control over login tracking, including failed attempts, IP addresses, user agents, and error messages.

## Features

✅ **Complete audit trail** - Every login attempt is recorded
✅ **Security monitoring** - Track failed login attempts and patterns
✅ **IP tracking** - Know where logins originate from
✅ **Error analysis** - See what authentication errors users encounter
✅ **Independent** - Not reliant on Supabase's audit logging
✅ **Non-blocking** - Logging failures won't affect actual login process

## Database Setup

### Migration SQL

Apply the following SQL in your Supabase SQL Editor:

```sql
-- Migration: Create login_history table for tracking all login attempts
-- This table is independent of Supabase auth system

-- Create login_history table
CREATE TABLE IF NOT EXISTS public.login_history (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES public.user_profiles(id) ON DELETE SET NULL,
    email TEXT NOT NULL,
    login_time TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    success BOOLEAN NOT NULL,
    ip_address TEXT,
    user_agent TEXT,
    error_message TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Create indexes for common queries
CREATE INDEX IF NOT EXISTS idx_login_history_user_id ON public.login_history(user_id);
CREATE INDEX IF NOT EXISTS idx_login_history_email ON public.login_history(email);
CREATE INDEX IF NOT EXISTS idx_login_history_login_time ON public.login_history(login_time DESC);
CREATE INDEX IF NOT EXISTS idx_login_history_success ON public.login_history(success);

-- Enable Row Level Security
ALTER TABLE public.login_history ENABLE ROW LEVEL SECURITY;

-- Policy: Admins can view all login history
CREATE POLICY "Admins can view all login history"
    ON public.login_history
    FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM public.user_profiles
            WHERE id = auth.uid()
            AND is_admin = true
        )
    );

-- Policy: Service role can insert login history (for backend logging)
CREATE POLICY "Service role can insert login history"
    ON public.login_history
    FOR INSERT
    WITH CHECK (true);

-- Add comments
COMMENT ON TABLE public.login_history IS 'Tracks all login attempts (successful and failed) independent of Supabase auth system';
COMMENT ON COLUMN public.login_history.user_id IS 'References user_profiles. NULL for failed attempts with unknown user';
COMMENT ON COLUMN public.login_history.success IS 'true for successful login, false for failed attempt';
COMMENT ON COLUMN public.login_history.login_time IS 'Timestamp when login attempt occurred';
COMMENT ON COLUMN public.login_history.ip_address IS 'Client IP address';
COMMENT ON COLUMN public.login_history.user_agent IS 'Client user agent string';
COMMENT ON COLUMN public.login_history.error_message IS 'Error message for failed login attempts';
```

### Database Schema

| Column         | Type         | Description                                    |
|----------------|--------------|------------------------------------------------|
| id             | UUID         | Primary key                                    |
| user_id        | UUID         | User reference (NULL for failed attempts)      |
| email          | TEXT         | Email address used in login attempt            |
| login_time     | TIMESTAMPTZ  | Timestamp of attempt                           |
| success        | BOOLEAN      | true for successful, false for failed          |
| ip_address     | TEXT         | Client IP address (auto-captured)              |
| user_agent     | TEXT         | Browser user agent (auto-captured)             |
| error_message  | TEXT         | Error message for failed attempts              |
| created_at     | TIMESTAMPTZ  | Row creation timestamp                         |

## Backend API

### POST /auth/log-login

Logs a login attempt to the database.

**Endpoint:** `/api/auth/log-login`

**Authentication:** Not required (allows logging of failed attempts)

**Request Headers:**
```
Content-Type: application/json
Authorization: Bearer <token>  (optional, only for successful logins)
User-Agent: <browser-agent>    (automatically captured)
```

**Request Body:**
```json
{
  "email": "user@example.com",
  "success": true,
  "error_message": null
}
```

**Response:**
```json
{
  "success": true,
  "message": "Login attempt logged successfully"
}
```

**What Gets Captured:**
- Email from request body
- Success status from request body
- Error message from request body (if provided)
- IP address from request headers (automatic)
- User agent from request headers (automatic)
- User ID from JWT token (if authenticated)

### GET /admin/login-history

Retrieves login history for admin panel.

**Endpoint:** `/api/admin/login-history`

**Authentication:** Required (admin only)

**Query Parameters:**
- `days` (optional): Number of days to include (default: 30)
- `limit` (optional): Maximum entries to return (default: 100)

**Response:**
```json
{
  "period_days": 30,
  "total_attempts": 45,
  "history": [
    {
      "log_id": "uuid",
      "timestamp": "2026-01-20T06:30:00Z",
      "user_id": "uuid",
      "email": "user@example.com",
      "display_name": "John Doe",
      "is_admin": false,
      "ip_address": "192.168.1.1",
      "action": "login",
      "success": true,
      "login_type": "success",
      "error_message": null
    }
  ]
}
```

## Frontend Integration

The login logging is automatically integrated into the authentication flow in `frontend/src/supabase.js`.

### How It Works

When a user attempts to log in:

1. Frontend calls `supabase.auth.signInWithPassword()`
2. After authentication completes (success or failure):
   - `logLoginAttempt()` is called with:
     - Email address
     - Success status
     - Error message (if failed)
     - Access token (if succeeded)
3. A POST request is sent to `/api/auth/log-login`
4. Backend captures IP address and user agent
5. Record is inserted into `login_history` table

### Code Implementation

```javascript
// In supabase.js

async function logLoginAttempt(email, success, errorMessage = null, accessToken = null) {
  try {
    const headers = {
      'Content-Type': 'application/json'
    };

    // Include auth token for successful logins
    if (accessToken) {
      headers['Authorization'] = `Bearer ${accessToken}`;
    }

    await fetch(`${API_URL}/auth/log-login`, {
      method: 'POST',
      headers: headers,
      body: JSON.stringify({
        email: email,
        success: success,
        error_message: errorMessage
      })
    });
  } catch (error) {
    // Don't fail the login if logging fails
    console.warn('Failed to log login attempt:', error);
  }
}

export async function signIn(email, password) {
  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password,
  })

  // Log the login attempt (non-blocking)
  logLoginAttempt(
    email,
    !error,
    error?.message || null,
    data?.session?.access_token || null
  );

  return { user: data?.user, session: data?.session, error }
}
```

## Admin Panel

The Login History section in the Admin Panel displays all tracked login attempts.

### Features

- View all login attempts (successful and failed)
- Filter by time period (last 7, 30, 90 days)
- See IP addresses and timestamps
- View error messages for failed attempts
- Export to CSV

### Statistics Displayed

- **Total Attempts:** All login attempts in the period
- **Successful:** Number of successful logins
- **Failed:** Number of failed login attempts

### Table Columns

- Timestamp
- Email
- User (display name)
- Role
- IP Address
- Status (Success/Failed)
- Error Message (for failures)

## Security & Privacy

### Row Level Security (RLS)

The `login_history` table has RLS enabled with two policies:

1. **Admins can view:** Only users with `is_admin = true` can SELECT from the table
2. **Service role can insert:** Backend can INSERT without authentication (required for logging failed attempts)

### Data Privacy Considerations

- IP addresses are stored for security monitoring
- Failed login attempts are logged (useful for detecting brute force attacks)
- No passwords are ever stored in this table
- Admin access is required to view login history

### Non-Blocking Design

The logging system is designed to never interfere with the authentication process:

- All logging happens after authentication completes
- Errors in logging are caught and logged to console only
- A logging failure will NOT prevent a user from logging in
- The API endpoint returns 200 even if database insert fails

## Testing

### Manual Testing Checklist

After applying the migration:

1. **Test Successful Login:**
   - Log in with valid credentials
   - Check Admin Panel → Login History
   - Verify entry shows:
     - Correct timestamp
     - Your email
     - Success status
     - Your IP address
     - No error message

2. **Test Failed Login:**
   - Try logging in with wrong password
   - Check Admin Panel → Login History
   - Verify entry shows:
     - Correct timestamp
     - Email you attempted
     - Failed status
     - Error message (e.g., "Invalid login credentials")

3. **Test Admin Panel Filters:**
   - Try different time periods (7, 30, 90 days)
   - Verify correct entries are shown
   - Check that statistics update correctly

4. **Test CSV Export:**
   - Click "Export to CSV"
   - Verify all columns are included
   - Check data integrity

### Automated Testing

Backend test example:

```python
async def test_log_login_attempt():
    response = await client.post(
        "/api/auth/log-login",
        json={
            "email": "test@example.com",
            "success": True,
            "error_message": None
        },
        headers={"Authorization": f"Bearer {valid_token}"}
    )
    assert response.status_code == 200
    assert response.json()["success"] == True
```

## Maintenance

### Database Growth

The `login_history` table will grow over time. Consider:

- **Archival Strategy:** Move old records to archive table after 1 year
- **Cleanup Policy:** Delete records older than 2 years
- **Monitoring:** Set up alerts if table grows beyond expected size

### Example Cleanup Query

```sql
-- Delete login history older than 2 years
DELETE FROM public.login_history
WHERE login_time < NOW() - INTERVAL '2 years';
```

## Troubleshooting

### No login history showing

1. **Check migration was applied:**
   ```sql
   SELECT EXISTS (
     SELECT FROM information_schema.tables
     WHERE table_schema = 'public'
     AND table_name = 'login_history'
   );
   ```

2. **Check RLS policies:**
   ```sql
   SELECT * FROM pg_policies
   WHERE tablename = 'login_history';
   ```

3. **Check if records exist:**
   ```sql
   SELECT COUNT(*) FROM public.login_history;
   ```

### Timezone issues

If timestamps appear incorrect:

- Backend uses `timezone.utc` for all datetime operations
- Database stores TIMESTAMPTZ (timezone-aware)
- Frontend displays in browser's local timezone

### IP address not captured

If IP addresses show as NULL:

- Check that backend is behind a proper reverse proxy
- Verify `request.client.host` is accessible
- For local development, IP will be `127.0.0.1`

## File Locations

- **Migration:** `/migrations/008_create_login_history_table.sql`
- **Backend Endpoint:** `/backend/app/main.py` (lines 1448-1503)
- **Frontend Integration:** `/frontend/src/supabase.js` (lines 31-110)
- **Admin Panel UI:** `/frontend/src/components/AdminPanel.js`

## Related Documentation

- [Supabase Row Level Security](https://supabase.com/docs/guides/auth/row-level-security)
- [FastAPI Request Object](https://fastapi.tiangolo.com/advanced/using-request-directly/)
- [PostgreSQL TIMESTAMPTZ](https://www.postgresql.org/docs/current/datatype-datetime.html)

---

**Version:** 1.0
**Last Updated:** 2026-01-20
**Status:** ✅ Deployed and Active
