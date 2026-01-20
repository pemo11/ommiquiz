# Login History Integration Guide

## Overview

The application now has a custom `login_history` table that tracks all login attempts independently of Supabase's auth system. This allows full control over login tracking including failed attempts, IP addresses, and error messages.

## Database Setup

**Apply the migration:**
```bash
psql <your-database-url> < migrations/008_create_login_history_table.sql
```

Or apply via Supabase SQL Editor:
- Copy the contents of `migrations/008_create_login_history_table.sql`
- Run in the Supabase SQL Editor

## Backend API

### POST /auth/log-login

Logs a login attempt to the database.

**Request Body:**
```json
{
  "email": "user@example.com",
  "success": true,
  "error_message": null  // optional, for failed attempts
}
```

**Headers:**
- `Authorization: Bearer <token>` (optional, only for successful logins)
- `User-Agent`: Automatically captured from request headers

**Response:**
```json
{
  "success": true,
  "message": "Login attempt logged successfully"
}
```

**Note:** This endpoint does NOT require authentication - it can be called for both successful and failed login attempts.

## Frontend Integration Required

### Where to Add Logging

The frontend needs to call `/auth/log-login` in the authentication flow. Look for where Supabase authentication is handled.

**Likely location:** `frontend/src/App.js` or a dedicated auth service file

### Example Integration

```javascript
// After successful Supabase login
const { data, error } = await supabase.auth.signInWithPassword({
  email,
  password
});

// Log the login attempt
try {
  await fetch(`${API_URL}/auth/log-login`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': data.session ? `Bearer ${data.session.access_token}` : undefined
    },
    body: JSON.stringify({
      email: email,
      success: !error,
      error_message: error ? error.message : null
    })
  });
} catch (logError) {
  // Don't fail the login if logging fails
  console.error('Failed to log login attempt:', logError);
}
```

### Integration Points

1. **Successful Login:**
   - After `supabase.auth.signInWithPassword()` succeeds
   - Include the auth token in the Authorization header
   - Set `success: true`

2. **Failed Login:**
   - After `supabase.auth.signInWithPassword()` fails
   - Do NOT include Authorization header
   - Set `success: false`
   - Include error message in `error_message` field

3. **OAuth Logins** (if applicable):
   - After OAuth callback completes
   - Same pattern as password login

## What Gets Tracked

The `login_history` table stores:

| Column         | Description                                    |
|----------------|------------------------------------------------|
| id             | UUID primary key                               |
| user_id        | User UUID (NULL for failed attempts)           |
| email          | Email address used in login attempt            |
| login_time     | Timestamp of attempt                           |
| success        | true/false                                     |
| ip_address     | Client IP address (auto-captured)              |
| user_agent     | Browser user agent (auto-captured)             |
| error_message  | Error message for failed attempts              |
| created_at     | Row creation timestamp                         |

## Admin Panel

The Login History in the Admin Panel now shows:

- All login attempts (successful and failed)
- IP addresses
- Error messages for failures
- Timestamps
- User information (email, display name, role)

**Statistics:**
- Total Attempts
- Successful logins
- Failed attempts

## Benefits

✅ **Complete audit trail**: Every login attempt is recorded
✅ **Security monitoring**: Track failed login attempts
✅ **IP tracking**: Know where logins come from
✅ **Error analysis**: See what auth errors users encounter
✅ **Independent**: Not reliant on Supabase's audit logging

## Testing

After implementing frontend integration:

1. Try a successful login - should appear in admin login history
2. Try a failed login (wrong password) - should appear with error message
3. Check that IP addresses are captured
4. Verify timestamps are accurate

## Notes

- The endpoint is non-blocking - if logging fails, it won't affect the actual login
- No authentication required for the logging endpoint (to allow failed attempt logging)
- RLS policies restrict viewing to admins only
- The table can grow large over time - consider implementing cleanup/archival
