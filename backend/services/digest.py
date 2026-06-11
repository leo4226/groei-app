"""Daily care digest service (#137).

Selects opted-in accounts whose digest hour matches the current hour in
Europe/Amsterdam, builds a task summary email from the same data as
/dashboard/v2 (`classify_care_tasks`), sends it via Resend, and stamps
`last_digest_sent_on` so a duplicate or late cron call never double-sends.

Also owns the signed unsubscribe token (HMAC of the account_id, keyed with
JWT_SECRET — no login required to unsubscribe).
"""
import hashlib
import hmac
import os
from datetime import date, datetime, time
from zoneinfo import ZoneInfo

from auth import SECRET
from care_types import CARE_TYPES
from models import CareTask
from services.care_task_service import fetch_household_schedule_rows, classify_care_tasks
from services.email import send_email
from services.push import send_push

AMSTERDAM = ZoneInfo("Europe/Amsterdam")

_UNSUB_CONTEXT = b"floreren-digest-unsubscribe:"


def _now() -> datetime:
    """Current time in Europe/Amsterdam. Separate function so tests can freeze it."""
    return datetime.now(AMSTERDAM)


# ── unsubscribe token ────────────────────────────────────────────────────

def _sign(account_id: int) -> str:
    msg = _UNSUB_CONTEXT + str(account_id).encode()
    return hmac.new(SECRET.encode(), msg, hashlib.sha256).hexdigest()


def make_unsubscribe_token(account_id: int) -> str:
    return f"{account_id}.{_sign(account_id)}"


def verify_unsubscribe_token(token: str) -> int | None:
    """Return the account_id if the token is valid, else None."""
    raw_id, sep, sig = token.partition(".")
    if not sep or not raw_id.isdigit():
        return None
    account_id = int(raw_id)
    if not hmac.compare_digest(sig, _sign(account_id)):
        return None
    return account_id


# ── selection ────────────────────────────────────────────────────────────

def _digest_hour(value) -> int:
    """Hour from a digest_time value — TEXT 'HH:MM' (SQLite/PG) or time (PG TIME)."""
    if isinstance(value, time):
        return value.hour
    return int(str(value).split(":", 1)[0])


def _as_date(value) -> date | None:
    if value is None or isinstance(value, date):
        return value
    return date.fromisoformat(str(value)[:10])


def account_is_due(pref_row, now: datetime, last_field: str = "last_digest_sent_on") -> bool:
    """digest hour matches the current Amsterdam hour and the channel's
    last-sent stamp (email or push, per `last_field`) isn't today's."""
    if _digest_hour(pref_row["digest_time"]) != now.hour:
        return False
    last = _as_date(pref_row[last_field])
    return last is None or last < now.date()


# ── email template ───────────────────────────────────────────────────────

_STRINGS = {
    "nl": {
        "subject": "Je planten hebben vandaag aandacht nodig 🌿",
        "greeting": "Hoi {name},",
        "intro": "Dit zijn de verzorgingstaken voor vandaag:",
        "overdue": "Te laat",
        "due_today": "Vandaag",
        "days_late": "{n} dag(en) te laat",
        "open_app": "Open Floreren",
        "unsubscribe": "Geen dagelijkse digest meer ontvangen? Afmelden",
    },
    "en": {
        "subject": "Your plants need attention today 🌿",
        "greeting": "Hi {name},",
        "intro": "Here are today's care tasks:",
        "overdue": "Overdue",
        "due_today": "Today",
        "days_late": "{n} day(s) overdue",
        "open_app": "Open Floreren",
        "unsubscribe": "Don't want the daily digest? Unsubscribe",
    },
}

APP_URL = os.environ.get("APP_URL", "https://floreren.app")


def _api_base() -> str:
    return os.environ.get("API_BASE_URL", "https://api.floreren.app").rstrip("/")


def _task_line(task: CareTask, s: dict) -> str:
    care = CARE_TYPES.get(task.care_type, {})
    icon = care.get("icon", "🌿")
    label = care.get("label_nl", task.care_type)
    late = ""
    if task.days_overdue > 0:
        late = f' <span style="color:#b3261e;font-size:13px;">({s["days_late"].format(n=task.days_overdue)})</span>'
    where = f' <span style="color:#999;font-size:13px;">— {task.location}</span>' if task.location else ""
    return (
        f'<li style="margin:0 0 8px;color:#333;font-size:15px;">'
        f'{icon} <strong>{task.plant_name}</strong> · {label}{late}{where}</li>'
    )


def _section(title: str, tasks: list[CareTask], s: dict) -> str:
    if not tasks:
        return ""
    items = "".join(_task_line(t, s) for t in tasks)
    return (
        f'<h2 style="font-size:14px;text-transform:uppercase;letter-spacing:0.05em;'
        f'color:#4a7c59;margin:20px 0 8px;">{title}</h2>'
        f'<ul style="margin:0;padding-left:4px;list-style:none;">{items}</ul>'
    )


def build_digest_email(
    name: str,
    overdue: list[CareTask],
    due_today: list[CareTask],
    unsubscribe_url: str,
    lang: str = "nl",
) -> tuple[str, str]:
    """Return (subject, html) for the daily digest. Bilingual-ready via `lang`."""
    s = _STRINGS.get(lang, _STRINGS["nl"])
    body = _section(s["overdue"], overdue, s) + _section(s["due_today"], due_today, s)
    html = f"""\
<!DOCTYPE html>
<html lang="{lang}">
<head><meta charset="UTF-8"></head>
<body style="margin:0;padding:0;background:#f5f5f0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0">
<tr><td align="center" style="padding:40px 16px;">
<table role="presentation" width="480" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 2px 12px rgba(0,0,0,0.06);">
<tr><td style="padding:32px 32px 0;text-align:center;background:#f5f5f0;">
<h1 style="font-family:'Fraunces',Georgia,serif;font-size:2rem;color:#4a7c59;margin:0 0 8px;">Floreren</h1>
</td></tr>
<tr><td style="padding:32px;">
<p style="color:#333;font-size:16px;line-height:1.5;margin:0 0 4px;">{s["greeting"].format(name=name)}</p>
<p style="color:#333;font-size:16px;line-height:1.5;margin:0 0 12px;">{s["intro"]}</p>
{body}
<table role="presentation" cellpadding="0" cellspacing="0" style="margin:24px auto 0;">
<tr><td align="center" style="background:#4a7c59;border-radius:10px;padding:14px 32px;">
<a href="{APP_URL}/dashboard" style="color:#ffffff;font-size:16px;font-weight:700;text-decoration:none;display:inline-block;">{s["open_app"]}</a>
</td></tr>
</table>
</td></tr>
<tr><td style="padding:16px 32px;border-top:1px solid #eee;text-align:center;">
<p style="color:#999;font-size:12px;margin:0;"><a href="{unsubscribe_url}" style="color:#999;">{s["unsubscribe"]}</a></p>
</td></tr>
</table>
</td></tr>
</table>
</body>
</html>"""
    return s["subject"], html


# ── push payload ─────────────────────────────────────────────────────────

def build_push_payload(overdue: list[CareTask], due_today: list[CareTask]) -> dict:
    total = len(overdue) + len(due_today)
    if overdue:
        body = f"{total} taken vandaag, waarvan {len(overdue)} te laat"
    else:
        body = f"{total} taken vandaag" if total != 1 else "1 taak vandaag"
    return {
        "title": "Floreren 🌿",
        "body": body,
        "url": f"{APP_URL}/dashboard",
    }


# ── orchestration ────────────────────────────────────────────────────────

async def send_due_digests(db) -> dict:
    """Email + push to every opted-in account whose hour matches now.

    The two channels share the selection and task data but stamp
    independently (last_digest_sent_on / last_push_sent_on), so one
    channel failing never blocks the other. Returns counts only — never
    account data (the response is exposed to the cron caller).
    """
    now = _now()
    today = now.date()

    prefs = await db.execute_fetchall(
        """
        SELECT np.account_id, np.digest_time, np.digest_enabled,
               np.last_digest_sent_on, np.push_enabled, np.last_push_sent_on,
               a.email, a.name, a.household_id
        FROM notification_preferences np
        JOIN accounts a ON a.id = np.account_id
        WHERE np.digest_enabled OR np.push_enabled
        """
    )

    checked = sent = skipped_no_tasks = failed = 0
    push_sent = push_failed = push_pruned = 0
    for pref in prefs:
        email_due = pref["digest_enabled"] and account_is_due(pref, now)
        push_due = pref["push_enabled"] and account_is_due(pref, now, "last_push_sent_on")
        if not email_due and not push_due:
            continue
        checked += 1

        rows = await fetch_household_schedule_rows(db, pref["household_id"])
        overdue, due_today, _ = classify_care_tasks(rows, today=today)

        if not overdue and not due_today:
            # Task-free day: nothing to send, but stamp so later calls skip the work.
            if email_due:
                await _stamp(db, pref["account_id"], today, "last_digest_sent_on")
            if push_due:
                await _stamp(db, pref["account_id"], today, "last_push_sent_on")
            skipped_no_tasks += 1
            continue

        if email_due:
            token = make_unsubscribe_token(pref["account_id"])
            unsubscribe_url = f"{_api_base()}/api/notifications/unsubscribe?token={token}"
            subject, html = build_digest_email(pref["name"], overdue, due_today, unsubscribe_url)
            if send_email(pref["email"], subject, html):
                await _stamp(db, pref["account_id"], today, "last_digest_sent_on")
                sent += 1
            else:
                failed += 1  # no stamp — eligible again on the next matching hour/day

        if push_due:
            subs = await db.execute_fetchall(
                "SELECT id, endpoint, p256dh, auth FROM push_subscriptions WHERE account_id = ?",
                (pref["account_id"],),
            )
            if subs:
                payload = build_push_payload(overdue, due_today)
                delivered = False
                for sub in subs:
                    outcome = send_push(dict(sub), payload)
                    if outcome == "ok":
                        delivered = True
                    elif outcome == "gone":
                        # Dead endpoint (404/410) — prune at send time.
                        await db.execute(
                            "DELETE FROM push_subscriptions WHERE id = ?", (sub["id"],)
                        )
                        await db.commit()
                        push_pruned += 1
                if delivered:
                    await _stamp(db, pref["account_id"], today, "last_push_sent_on")
                    push_sent += 1
                else:
                    push_failed += 1

    return {
        "checked": checked, "sent": sent,
        "skipped_no_tasks": skipped_no_tasks, "failed": failed,
        "push_sent": push_sent, "push_failed": push_failed, "push_pruned": push_pruned,
    }


_STAMP_COLUMNS = {"last_digest_sent_on", "last_push_sent_on"}


async def _stamp(db, account_id: int, today: date, column: str = "last_digest_sent_on") -> None:
    assert column in _STAMP_COLUMNS  # never interpolate unvetted SQL
    await db.execute(
        f"UPDATE notification_preferences SET {column} = ? WHERE account_id = ?",
        (today, account_id),
    )
    await db.commit()
