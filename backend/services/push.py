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

logger = logging.getLogger(__name__)

# How long the push service may hold a message for an unreachable device.
# pywebpush defaults to 0, which tells the service to drop the message unless
# the phone is reachable that very instant — a phone in battery saver or on a
# flaky connection simply never heard about the watering. Half a day keeps a
# reminder useful without delivering yesterday's news.
PUSH_TTL_S = 12 * 3600
PUSH_TIMEOUT_S = 10


def send_push(subscription: dict, payload: dict) -> str:
    """subscription: a push_subscriptions row (endpoint/p256dh/auth)."""
    private_key = os.environ.get("VAPID_PRIVATE_KEY")
    if not private_key:
        logger.info("[DEV] push skipped (no VAPID key): %s", payload.get("title"))
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
