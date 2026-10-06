"""Web push delivery via pywebpush + VAPID.

send_push returns a tri-state string instead of raising:
  "ok"    — delivered to the push service
  "gone"  — the subscription is dead (404/410); the caller must prune the row
  "error" — transient or config failure; leave the subscription alone

VAPID keys live in Fly secrets (VAPID_PRIVATE_KEY / VAPID_PUBLIC_KEY /
VAPID_SUBJECT); without them every send is a logged no-op ("error").
"""
import json
import logging
import os
from urllib.parse import urlparse

logger = logging.getLogger(__name__)

# How long the push service may hold a message for an unreachable device.
# pywebpush defaults to 0, which tells the service to drop the message unless
# the phone is reachable that very instant — a phone in battery saver or on a
# flaky connection simply never heard about the watering. Half a day keeps a
# reminder useful without delivering yesterday's news.
PUSH_TTL_S = 12 * 3600
PUSH_TIMEOUT_S = 10

# The push services browsers hand out subscriptions for: FCM (Chrome, Edge on
# Android, Brave, Opera, Samsung), Apple (Safari / iOS home-screen apps),
# Mozilla (Firefox) and WNS (Edge on Windows).
_PUSH_HOST_SUFFIXES = (
    "fcm.googleapis.com",
    "android.googleapis.com",
    ".push.apple.com",
    ".push.services.mozilla.com",
    ".notify.windows.com",
)


def is_known_push_endpoint(endpoint: str) -> bool:
    parsed = urlparse(endpoint or "")
    host = (parsed.hostname or "").lower().rstrip(".")
    if parsed.scheme != "https" or not host:
        return False
    return any(
        host == suffix.lstrip(".") or host.endswith(suffix if suffix.startswith(".") else "." + suffix)
        for suffix in _PUSH_HOST_SUFFIXES
    )


def _no_redirect_session():
    """Push services answer directly; a redirect could only lead somewhere the
    endpoint check never saw, so following one is refused."""
    import requests

    session = requests.Session()
    session.max_redirects = 0
    return session


def send_push(subscription: dict, payload: dict) -> str:
    """subscription: a push_subscriptions row (endpoint/p256dh/auth)."""
    private_key = os.environ.get("VAPID_PRIVATE_KEY")
    if not private_key:
        logger.info("[DEV] push skipped (no VAPID key): %s", payload.get("title"))
        return "error"

    if not is_known_push_endpoint(subscription.get("endpoint", "")):
        # Rows saved before endpoints were validated; never send them anywhere.
        logger.warning("push skipped: endpoint is not a known push service")
        return "error"

    try:
        from pywebpush import webpush, WebPushException
    except ImportError:
        logger.warning("pywebpush not installed — push skipped")
        return "error"

    try:
        webpush(
            subscription_info={
                "endpoint": subscription["endpoint"],
                "keys": {"p256dh": subscription["p256dh"], "auth": subscription["auth"]},
            },
            data=json.dumps(payload),
            vapid_private_key=private_key,
            vapid_claims={"sub": os.environ.get("VAPID_SUBJECT", "mailto:noreply@floreren.app")},
            ttl=PUSH_TTL_S,
            # requests waits forever by default; one stalled push service must
            # not hold up the whole dispatch run.
            timeout=PUSH_TIMEOUT_S,
            requests_session=_no_redirect_session(),
        )
        return "ok"
    except WebPushException as exc:
        status = getattr(getattr(exc, "response", None), "status_code", None)
        if status in (404, 410):
            return "gone"
        logger.warning("push send failed (%s): %s", status, exc)
        return "error"
    except Exception as exc:
        logger.warning("push send failed: %s", exc)
        return "error"
