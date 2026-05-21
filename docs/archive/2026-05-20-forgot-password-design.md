# Forgot Password — Design Spec

**Date:** 2026-05-20  
**Status:** Approved, pending implementation

## Overview

Add a self-serve password reset flow to the Floreren login page. Users receive a reset link by email (via Resend), click it, and set a new password. Targets real external users beyond the Leon & Lisbeth household.

## Database

New table added via Alembic migration:

```sql
CREATE TABLE password_reset_tokens (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  account_id INTEGER NOT NULL REFERENCES accounts(id),
  token      TEXT    NOT NULL UNIQUE,
  expires_at TEXT    NOT NULL,  -- ISO 8601 UTC
  used_at    TEXT               -- NULL until consumed
);
```

- Token: `secrets.token_urlsafe(32)` (256-bit random, URL-safe)
- Expires: 1 hour after creation
- Single-use: `used_at` set on successful reset, token rejected if already set
- No active cleanup — expired/used tokens are ignored on lookup

## Backend

Two new endpoints in `routers/auth.py`. New Pydantic models: `ForgotPasswordInput`, `ResetPasswordInput`.

### `POST /auth/forgot-password`

Body: `{ email: str }`

- Always returns `200 { message: "If that email exists, a reset link has been sent." }` — never reveals whether email is registered (prevents account enumeration).
- If account found: generate token, insert into `password_reset_tokens`, send email via Resend.
- Reset link: `{APP_URL}/reset-password?token=<token>` — `APP_URL` env var (e.g. `https://floreren.app` in prod, `http://localhost:5173` in dev).
- Config: `RESEND_API_KEY` env var. If absent, log the link to stdout (dev fallback).

### `POST /auth/reset-password`

Body: `{ token: str, new_password: str (min 8 chars) }`

- Validate: token exists, `used_at IS NULL`, `expires_at > now UTC`.
- Invalid/expired → `400 "Reset link is invalid or has expired"`.
- Valid → bcrypt-hash new password, update `accounts.password_hash`, set `used_at = now`, commit.
- Returns `200 { message: "Password updated" }`.

### Email service

`services/email.py` — sends via Resend Python SDK.

- From: `noreply@floreren.app` (domain must be verified in Resend dashboard)
- Subject: `Reset your Floreren password`
- HTML: inline string, Floreren branding (Fraunces font for the title, green CTA button), 1-hour expiry note, ignore-if-not-you footer.

## Frontend

### LoginPage changes

- Add `'forgot'` as a third value to the existing `mode` state (`'login' | 'register' | 'forgot'`).
- In login mode: show "Forgot password?" text link below the password field. Clicking sets `mode = 'forgot'`.
- Forgot view: email input + "Send reset link" button + "← Back to log in" link. No tab in the mode toggle.
- On success: replace form with *"Check your inbox — if that email is registered, a reset link is on its way."*

### New page: `ResetPasswordPage.tsx`

Route: `/reset-password`

- On mount: read `?token=` from URL query string.
- Fields: "New password" + "Confirm password" with client-side match validation.
- On submit: call `POST /auth/reset-password`.
- Success: show *"Password updated!"* + link to log in. No auto-login.
- Invalid/expired token: show error + link back to the forgot-password view on login page.

### API additions (`api/auth.ts`)

```ts
forgotPassword(email: string): Promise<{ message: string }>
resetPassword(token: string, newPassword: string): Promise<{ message: string }>
```

## Email template (outline)

```
Subject: Reset your Floreren password

[Floreren]  ← Fraunces serif, green

Hi,

Someone requested a password reset for this email address.
Click the button below to set a new password. This link expires in 1 hour.

[ Reset my password ]  ← green button → https://floreren.app/reset-password?token=...

If you didn't request this, you can safely ignore this email.
Your password won't change unless you click the link above.
```

## Out of scope

- Auto-login after reset (user logs in manually after resetting)
- Rate limiting on `/auth/forgot-password` (can be added later)
- Email verification on register
