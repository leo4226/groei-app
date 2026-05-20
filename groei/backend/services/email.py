"""Email service — sends transactional emails via Resend."""

import os
import logging

logger = logging.getLogger(__name__)

_RESEND_API_KEY: str | None = None


def _get_resend() -> object | None:
    """Lazy-import resend and configure the API key."""
    global _RESEND_API_KEY
    key = os.environ.get("RESEND_API_KEY")
    if not key:
        return None
    if key != _RESEND_API_KEY:
        _RESEND_API_KEY = key
        import resend  # type: ignore[import-untyped]

        resend.api_key = key
    return __import__("resend", fromlist=["Emails"])


def send_password_reset(
    to_email: str,
    reset_link: str,
) -> bool:
    """Send a password reset email. Returns True on success, False on failure.

    If RESEND_API_KEY is not set, logs the reset link to stdout (dev fallback).
    """
    link = reset_link
    app_name = "Groei"

    html = f"""\
<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"></head>
<body style="margin:0;padding:0;background:#f5f5f0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0">
<tr><td align="center" style="padding:40px 16px;">
<table role="presentation" width="480" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 2px 12px rgba(0,0,0,0.06);">
<tr><td style="padding:32px 32px 0;text-align:center;background:#f5f5f0;">
<h1 style="font-family:'Fraunces',Georgia,serif;font-size:2rem;color:#4a7c59;margin:0 0 8px;">{app_name}</h1>
</td></tr>
<tr><td style="padding:32px;">
<p style="color:#333;font-size:16px;line-height:1.5;margin:0 0 16px;">Hi,</p>
<p style="color:#333;font-size:16px;line-height:1.5;margin:0 0 20px;">
Someone requested a password reset for this email address. Click the button below to set a new password.
</p>
<table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 auto 24px;">
<tr>
<td align="center" style="background:#4a7c59;border-radius:10px;padding:14px 32px;">
<a href="{link}" style="color:#ffffff;font-size:16px;font-weight:700;text-decoration:none;display:inline-block;">Reset my password</a>
</td>
</tr>
</table>
<p style="color:#666;font-size:14px;line-height:1.5;margin:0 0 8px;">
This link expires in <strong>1 hour</strong>.
</p>
<p style="color:#666;font-size:14px;line-height:1.5;margin:0;">
If you didn't request this, you can safely ignore this email. Your password won't change unless you click the link above.
</p>
</td></tr>
<tr><td style="padding:16px 32px;border-top:1px solid #eee;text-align:center;">
<p style="color:#999;font-size:12px;margin:0;">{app_name} — Track your plants, grow your garden</p>
</td></tr>
</table>
</td></tr>
</table>
</body>
</html>"""

    key = os.environ.get("RESEND_API_KEY")
    if not key:
        # Dev fallback: log the link
        logger.info(f"[DEV] Password reset link for {to_email}: {link}")
        print(f"[DEV EMAIL] To: {to_email}")
        print(f"[DEV EMAIL] Link: {link}")
        return True

    try:
        import resend  # type: ignore[import-untyped]
        resend.api_key = key
        params = {
            "from": "noreply@floreren.app",
            "to": [to_email],
            "subject": "Reset your Groei password",
            "html": html,
        }
        r = resend.Emails.send(params)
        logger.info("Password reset email sent to %s: %s", to_email, r)
        return True
    except Exception as e:
        logger.error("Failed to send password reset email to %s: %s", to_email, e)
        return False
