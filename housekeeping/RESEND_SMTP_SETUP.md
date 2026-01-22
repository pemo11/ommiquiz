# Resend SMTP Setup for Supabase

This guide shows how to configure Resend as a custom SMTP provider for Supabase authentication emails, replacing the default rate-limited SMTP.

## Why Resend?

- **Free tier**: 3,000 emails/month, 100 emails/day
- Excellent deliverability (emails won't go to spam)
- Simple setup and developer-friendly
- Much better than Supabase's default (4 emails/hour on free tier)

## Step 1: Create Resend Account

1. Go to [https://resend.com](https://resend.com)
2. Click **"Sign Up"** or **"Get Started"**
3. Sign up with your email or GitHub account
4. Verify your email address

## Step 2: Add and Verify Your Domain

### Option A: Use Your Own Domain (Recommended for Production)

1. In Resend dashboard, go to **"Domains"**
2. Click **"Add Domain"**
3. Enter your domain: `ommiquiz.de`
4. Resend will show DNS records you need to add:
   - **SPF** record (TXT)
   - **DKIM** record (TXT)
   - **DMARC** record (TXT - optional but recommended)

5. Add these DNS records to your domain provider:
   - If using DigitalOcean Domains: Go to Networking → Domains → Add Records
   - If using another registrar: Add them in your DNS management panel

6. Wait 5-60 minutes for DNS propagation
7. Click **"Verify"** in Resend dashboard

**Example DNS Records:**
```
Type: TXT
Name: @
Value: v=spf1 include:_spf.resend.com ~all

Type: TXT
Name: resend._domainkey
Value: [provided by Resend - will be a long string]

Type: TXT
Name: _dmarc
Value: v=DMARC1; p=none; pct=100; rua=mailto:dmarc@ommiquiz.de
```

### Option B: Use Resend's Testing Domain (Quick Start)

For development/testing, you can skip domain verification and use Resend's built-in domain:
- From: `onboarding@resend.dev`
- Works immediately, no DNS setup needed
- Can only send to your verified email address

## Step 3: Get Resend API Key

1. In Resend dashboard, go to **"API Keys"**
2. Click **"Create API Key"**
3. Name it: `Supabase Ommiquiz`
4. Permission: **"Sending access"** (default)
5. Click **"Create"**
6. **Copy the API key** (starts with `re_...`)
   - ⚠️ **Important**: Save it now - you can't see it again!

Example API key format: `re_123abc456def789ghi0jk`

## Step 4: Configure Supabase to Use Resend

### Method 1: Via Supabase Dashboard (Easiest)

1. Go to [Supabase Dashboard](https://app.supabase.com)
2. Select your **ommiquiz** project
3. Go to **Project Settings** (gear icon)
4. Click **Auth** in the left sidebar
5. Scroll down to **SMTP Settings**
6. Enable **"Enable Custom SMTP"**
7. Fill in these settings:

```
Sender name: Ommiquiz
Sender email: noreply@ommiquiz.de (or onboarding@resend.dev if using test domain)

Host: smtp.resend.com
Port: 465
Username: resend
Password: [Your Resend API Key - the re_... key you copied]

Secure Connection: Yes (Enable SSL/TLS)
```

8. Click **"Save"**

### Method 2: Via Environment Variables (Backend)

If you're managing SMTP via backend configuration, update your `.env`:

```env
SMTP_HOST=smtp.resend.com
SMTP_PORT=465
SMTP_USER=resend
SMTP_PASS=re_your_api_key_here
SMTP_FROM=noreply@ommiquiz.de
```

## Step 5: Verify Configuration

### Test Email Sending

1. Try to register a new user on your app
2. Check that the confirmation email arrives
3. Verify the email doesn't go to spam
4. Check that the sender shows as `Ommiquiz <noreply@ommiquiz.de>`

### Check Resend Dashboard

1. Go to **"Emails"** in Resend dashboard
2. You should see the sent confirmation email
3. Status should be **"Delivered"**

## Step 6: Customize Email Templates (Optional)

You can customize Supabase's email templates:

1. In Supabase Dashboard → **Authentication** → **Email Templates**
2. Customize templates for:
   - **Confirm signup**: Sent when users register
   - **Magic Link**: For passwordless login
   - **Change Email Address**: When users update email
   - **Reset Password**: For password recovery

Example customization:
```html
<h2>Welcome to Ommiquiz!</h2>
<p>Thanks for signing up. Click the link below to confirm your email:</p>
<p><a href="{{ .ConfirmationURL }}">Confirm your email</a></p>
```

## Troubleshooting

### Emails Not Arriving

**Check 1: API Key is Correct**
- Verify you copied the full API key (starts with `re_`)
- Make sure there are no extra spaces

**Check 2: Domain Verification**
- If using custom domain, verify DNS records are correct
- Use `dig TXT ommiquiz.de` to check DNS propagation

**Check 3: Resend Email Logs**
- Go to Resend dashboard → **"Emails"**
- Check for failed/bounced emails
- Look for error messages

**Check 4: Supabase SMTP Settings**
- Verify Port is **465** (not 587)
- Verify Username is exactly `resend` (lowercase)
- Ensure SSL/TLS is enabled

### Emails Going to Spam

- **Without domain**: Emails from `resend.dev` may go to spam
- **Solution**: Add and verify your own domain (`ommiquiz.de`)
- Also add DMARC record for better deliverability

### Rate Limits

**Resend Free Tier Limits:**
- 3,000 emails/month
- 100 emails/day
- If exceeded, emails will fail

**Solution:**
- Upgrade to Resend Pro: $20/month for 50,000 emails
- Monitor usage in Resend dashboard

## Security Best Practices

1. **Never commit API keys to git**
   - Add `.env` to `.gitignore` (already done)
   - Use environment variables in production

2. **Rotate API keys periodically**
   - Create new key in Resend dashboard
   - Update Supabase settings
   - Delete old key

3. **Use separate keys for dev/prod**
   - Create different API keys for different environments
   - Easier to track usage and revoke if needed

## Cost Comparison

| Provider | Free Tier | After Free |
|----------|-----------|------------|
| Supabase Default | 4/hour | Upgrade to Pro $25/month |
| Resend | 3,000/month | $20/month for 50k |
| SendGrid | 100/day | $20/month for 50k |
| AWS SES | - | $0.10 per 1,000 |

## Next Steps

1. ✅ Configure Resend SMTP in Supabase
2. ✅ Add redirect URLs to Supabase whitelist (see SUPABASE_SETUP.md)
3. ✅ Test user registration flow
4. Consider customizing email templates
5. Monitor email deliverability in Resend dashboard

## Support

- **Resend Documentation**: [https://resend.com/docs](https://resend.com/docs)
- **Resend SMTP Guide**: [https://resend.com/docs/send-with-smtp](https://resend.com/docs/send-with-smtp)
- **Supabase SMTP Docs**: [https://supabase.com/docs/guides/auth/auth-smtp](https://supabase.com/docs/guides/auth/auth-smtp)
