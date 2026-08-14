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


# Inboxes show the display name, not the address. Without one every Floreren
# email arrived from "noreply@floreren.app", which reads like a machine and
# sorts badly in a threaded inbox (#889).
FROM_ADDRESS = "Floreren <noreply@floreren.app>"


def send_email(
    to_email: str,
    subject: str,
    html: str,
    *,
    unsubscribe_url: str | None = None,
) -> bool:
    """Send a transactional email via Resend. Returns True on success.

    Always sends a text/plain part alongside the HTML: some clients prefer it,
    screen readers handle it better, and a missing plain part is a documented
    spam signal. It is derived from the HTML so the two cannot drift.

    `unsubscribe_url` adds the List-Unsubscribe headers, which turn the
    unsubscribe link into the mail client's own button. Gmail and Outlook weigh
    its presence in bulk-sender reputation, and a one-click header is far
    likelier to be used than a hunt through the footer — which protects the
    sending domain from being marked as spam instead.

    If RESEND_API_KEY is not set, logs the email to stdout (dev fallback).
    """
    from services.email_template import html_to_text

    key = os.environ.get("RESEND_API_KEY")
    if not key:
        logger.info("[DEV] Email to %s: %s", to_email, subject)
        print(f"[DEV EMAIL] To: {to_email}")
        print(f"[DEV EMAIL] Subject: {subject}")
        return True

    try:
        import resend  # type: ignore[import-untyped]
        resend.api_key = key
        params: dict = {
            "from": FROM_ADDRESS,
            "to": [to_email],
            "subject": subject,
            "html": html,
            "text": html_to_text(html),
        }
        if unsubscribe_url:
            params["headers"] = {
                "List-Unsubscribe": f"<{unsubscribe_url}>",
                "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
            }
        r = resend.Emails.send(params)
        logger.info("Email sent to %s: %s", to_email, r)
        return True
    except Exception as e:
        logger.error("Failed to send email to %s: %s", to_email, e)
        return False


_RESET_STRINGS = {
    "nl": {
        "subject": "Stel je Floreren-wachtwoord opnieuw in",
        "preheader": "Deze link verloopt over een uur.",
        "greeting": "Hoi,",
        "intro": "Er is een nieuw wachtwoord aangevraagd voor dit e-mailadres. "
                 "Klik op de knop om er een in te stellen.",
        "cta": "Nieuw wachtwoord instellen",
        "expiry": "Deze link verloopt over <strong>1 uur</strong>.",
        "ignore": "Heb je dit niet aangevraagd? Dan kun je deze mail negeren — "
                  "je wachtwoord verandert pas als je op de knop klikt.",
        "footer": "Floreren — laat je tuin floreren",
    },
    "en": {
        "subject": "Reset your Floreren password",
        "preheader": "This link expires in an hour.",
        "greeting": "Hi,",
        "intro": "Someone asked for a new password for this email address. "
                 "Use the button below to set one.",
        "cta": "Set a new password",
        "expiry": "This link expires in <strong>1 hour</strong>.",
        "ignore": "Didn't ask for this? You can ignore this email — your "
                  "password only changes once you click the button.",
        "footer": "Floreren — let your garden flourish",
    },
}


def send_password_reset(to_email: str, reset_link: str, lang: str = "nl") -> bool:
    """Send a password reset email in the account's language.

    It was English-only and hardcoded, so a Dutch user asking to recover their
    account got the one email they cannot afford to misread in a language they
    may not have chosen (#889).
    """
    from services.email_template import (
        button, footer_note, paragraph, render_email,
    )

    lang = "en" if lang == "en" else "nl"
    s = _RESET_STRINGS[lang]

    body = (
        paragraph(s["greeting"])
        + paragraph(s["intro"])
        + button(s["cta"], reset_link)
        + paragraph(s["expiry"], muted=True, size=14)
        + paragraph(s["ignore"], muted=True, size=14)
    )
    html = render_email(
        lang=lang,
        preheader=s["preheader"],
        body_html=body,
        footer_html=footer_note(s["footer"]),
    )

    key = os.environ.get("RESEND_API_KEY")
    if not key:
        logger.info("[DEV] Password reset link for %s: %s", to_email, reset_link)
        print(f"[DEV EMAIL] To: {to_email}")
        print(f"[DEV EMAIL] Link: {reset_link}")
        return True

    return send_email(to_email, s["subject"], html)
