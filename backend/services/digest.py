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
from datetime import date, datetime, time, timedelta, timezone
from zoneinfo import ZoneInfo

from auth import SECRET
from care_types import CARE_TYPES, parse_muted_care_types
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


# ── snooze token (#181) ────────────────────────────────────────────────────
# The service worker has no JWT (it acts on a notification, not a logged-in
# session), so a "snooze" tap authenticates with an HMAC capability token —
# same pattern as the unsubscribe link. It's keyed to the household, since a
# care push summarises that household's currently-due tasks. The token is only
# ever embedded in the push payload, which only the subscribed device receives.

_SNOOZE_CONTEXT = b"floreren-care-snooze:"
SNOOZE_DURATIONS = {"2h", "1d"}  # action values the SW may send


def _sign_snooze(household_id: int) -> str:
    msg = _SNOOZE_CONTEXT + str(household_id).encode()
    return hmac.new(SECRET.encode(), msg, hashlib.sha256).hexdigest()


def make_snooze_token(household_id: int) -> str:
    return f"{household_id}.{_sign_snooze(household_id)}"


def verify_snooze_token(token: str) -> int | None:
    """Return the household_id if the token is valid, else None."""
    raw_id, sep, sig = token.partition(".")
    if not sep or not raw_id.isdigit():
        return None
    household_id = int(raw_id)
    if not hmac.compare_digest(sig, _sign_snooze(household_id)):
        return None
    return household_id


def snooze_until(kind: str, now: datetime) -> datetime:
    """Naive-UTC timestamp to suppress care pushes until. '2h' → +2h; '1d' →
    tomorrow 08:00 Amsterdam (a sensible morning reminder rather than the exact
    same time next day). `now` is Amsterdam-aware."""
    if kind == "1d":
        tomorrow = (now + timedelta(days=1)).date()
        target = datetime.combine(tomorrow, time(8, 0), tzinfo=AMSTERDAM)
    else:  # "2h" (default / fallback)
        target = now + timedelta(hours=2)
    return target.astimezone(timezone.utc).replace(tzinfo=None)


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
    """Due when the current Amsterdam hour is at or after the chosen digest hour
    and the channel's last-sent stamp (email or push, per `last_field`) isn't
    today's.

    ">=" rather than "==" so the digest survives a *sparse* cron: the trigger no
    longer runs every hour (it runs a few times a day during waking hours, to
    let the Neon compute auto-suspend between calls), so an exact-hour match
    would skip any account whose hour isn't a tick. Catching up at the first run
    at or after the chosen hour delivers each account exactly once per day. The
    cron's last daily run is late enough to cover every selectable hour."""
    if now.hour < _digest_hour(pref_row["digest_time"]):
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


def _task_line(task: CareTask, s: dict, lang: str) -> str:
    care = CARE_TYPES.get(task.care_type, {})
    icon = care.get("icon", "🌿")
    label_key = "label_en" if lang == "en" else "label_nl"
    label = care.get(label_key) or care.get("label_nl", task.care_type)
    late = ""
    if task.days_overdue > 0:
        late = f' <span style="color:#b3261e;font-size:13px;">({s["days_late"].format(n=task.days_overdue)})</span>'
    place = task.map_name or task.location
    where = f' <span style="color:#999;font-size:13px;">— {place}</span>' if place else ""
    return (
        f'<li style="margin:0 0 8px;color:#333;font-size:15px;">'
        f'{icon} <strong>{task.plant_name}</strong> · {label}{late}{where}</li>'
    )


def _section(title: str, tasks: list[CareTask], s: dict, lang: str) -> str:
    if not tasks:
        return ""
    items = "".join(_task_line(t, s, lang) for t in tasks)
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
    lang = "en" if lang == "en" else "nl"
    s = _STRINGS[lang]
    body = _section(s["overdue"], overdue, s, lang) + _section(s["due_today"], due_today, s, lang)
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


# ── email digest orchestration ─────────────────────────────────────────────

async def send_due_digests(db) -> dict:
    """Email digest to every opted-in account whose digest hour matches now.

    Email only — push is real-time per task (`send_due_care_pushes`), not a
    daily batch. Returns counts only — never account data (the response is
    exposed to the cron caller).
    """
    now = _now()
    today = now.date()

    # Language comes from the user profile that signup creates alongside each
    # account (same name, same household — see routers/auth.py). Accounts have
    # no language column of their own (yet); the scalar subquery keeps one
    # digest row per account, with NULL falling back to NL when no profile exists.
    prefs = await db.execute_fetchall(
        """
        SELECT np.account_id, np.digest_time, np.digest_enabled,
               np.last_digest_sent_on, a.email, a.name, a.household_id,
               (
                 SELECT u.language
                 FROM users u
                 WHERE u.household_id = a.household_id
                   AND LOWER(u.name) = LOWER(a.name)
                 ORDER BY u.id
                 LIMIT 1
               ) AS user_language
        FROM notification_preferences np
        JOIN accounts a ON a.id = np.account_id
        WHERE np.digest_enabled
        """
    )

    checked = sent = skipped_no_tasks = failed = 0
    for pref in prefs:
        if not account_is_due(pref, now):
            continue
        checked += 1

        rows = await fetch_household_schedule_rows(db, pref["household_id"])
        overdue, due_today, _ = classify_care_tasks(rows, today=today)

        if not overdue and not due_today:
            # Task-free day: nothing to send, but stamp so later calls skip the work.
            await _stamp(db, pref["account_id"], today, "last_digest_sent_on")
            skipped_no_tasks += 1
            continue

        token = make_unsubscribe_token(pref["account_id"])
        unsubscribe_url = f"{_api_base()}/api/notifications/unsubscribe?token={token}"
        lang = "en" if pref["user_language"] == "en" else "nl"
        subject, html = build_digest_email(
            pref["name"], overdue, due_today, unsubscribe_url, lang=lang
        )
        if send_email(pref["email"], subject, html):
            await _stamp(db, pref["account_id"], today, "last_digest_sent_on")
            sent += 1
        else:
            failed += 1  # no stamp — eligible again on the next matching hour/day

    return {
        "checked": checked, "sent": sent,
        "skipped_no_tasks": skipped_no_tasks, "failed": failed,
    }


# ── real-time care push ────────────────────────────────────────────────────

# Don't ping overnight: only send care pushes during local daytime hours
# (Amsterdam). A task that becomes due overnight notifies on the first
# daytime dispatch.
# Care pushes are held during each account's quiet window. Default: overnight
# 21:00–08:00, so nobody gets a 3am water reminder. Users can override per
# account (#181).
DEFAULT_QUIET_START = "21:00"
DEFAULT_QUIET_END = "08:00"


def _hm_to_minutes(hm: str | None, fallback: str) -> int:
    """Parse 'HH:MM' to minutes-of-day, falling back to `fallback` if the value
    is missing or malformed (legacy/manual DB rows must never crash dispatch)."""
    try:
        h, m = str(hm or fallback).split(":", 1)
        return int(h) * 60 + int(m)
    except (ValueError, AttributeError):
        h, m = fallback.split(":", 1)
        return int(h) * 60 + int(m)


def _in_quiet_hours(now, quiet_start: str | None, quiet_end: str | None) -> bool:
    """True if `now` (Amsterdam) falls inside the [start, end) quiet window,
    handling an overnight wrap (start > end)."""
    qs = _hm_to_minutes(quiet_start, DEFAULT_QUIET_START)
    qe = _hm_to_minutes(quiet_end, DEFAULT_QUIET_END)
    if qs == qe:
        return False  # zero-length window → never quiet
    cur = now.hour * 60 + now.minute
    if qs < qe:
        return qs <= cur < qe
    return cur >= qs or cur < qe  # overnight wrap




_WEATHER_PUSH_LABELS = {
    "frost_protect": "beschermen tegen kou",
    "heat_protect": "beschermen tegen hitte",
}


def _care_push_label(care_type: str) -> str:
    """Friendly Dutch label for a care type in push body text."""
    if care_type in _WEATHER_PUSH_LABELS:
        return _WEATHER_PUSH_LABELS[care_type]
    return CARE_TYPES.get(care_type, {}).get("label_nl", care_type).lower()


def build_care_push_payload(due_rows: list[dict], snooze_token: str | None = None) -> dict:
    """One push summarising the newly-due tasks for an account.

    due_rows: dicts with plant_name + care_type. When `snooze_token` is given,
    the payload carries a `snooze_url` the service worker uses for its "remind
    me later" action buttons.
    """
    n = len(due_rows)
    if n == 1:
        row = due_rows[0]
        label = _care_push_label(row["care_type"])
        body = f"{row['plant_name']} heeft aandacht nodig — {label}"
    else:
        body = f"{n} planten hebben verzorging nodig"
    payload = {"title": "Floreren", "body": body, "url": f"{APP_URL}/maps"}
    if snooze_token:
        payload["snooze_url"] = f"{_api_base()}/api/notifications/snooze?token={snooze_token}"
    return payload


async def send_due_care_pushes(db) -> dict:
    """Push a reminder the moment a care task becomes due, once per due cycle.

    Runs every (hourly) cron call. For every account that has at least one push
    subscription, finds active schedules that are due (next_due <= today) and
    not yet notified for their current due date, sends one batched push, and
    stamps `notified_for_due` so the same task never re-pings until it's
    completed and falls due again. Held during each account's quiet hours, and
    care types the account has muted are skipped.

    Delivery is driven by the *subscriptions* themselves, not an account-wide
    flag — subscriptions are per-device, so unsubscribing one device never
    silences another.
    """
    now = _now()
    today = now.date()
    now_utc = now.astimezone(timezone.utc).replace(tzinfo=None)  # for snoozed_until compare

    accounts = await db.execute_fetchall(
        """
        SELECT DISTINCT ps.account_id, a.household_id,
               np.quiet_start, np.quiet_end, np.muted_care_types
        FROM push_subscriptions ps
        JOIN accounts a ON a.id = ps.account_id
        LEFT JOIN notification_preferences np ON np.account_id = ps.account_id
        """
    )

    push_checked = push_sent = push_failed = push_pruned = 0
    for acc in accounts:
        # Hold during the account's quiet window (default overnight).
        if _in_quiet_hours(now, acc["quiet_start"], acc["quiet_end"]):
            continue

        due_rows = await db.execute_fetchall(
            """
            SELECT cs.id, cs.next_due, cs.care_type, p.name AS plant_name
            FROM care_schedules cs
            JOIN plants p ON cs.plant_id = p.id
            WHERE cs.is_active = 1 AND p.is_active = 1 AND p.household_id = ?
              AND cs.next_due <= ?
              AND (cs.snoozed_until IS NULL OR cs.snoozed_until <= ?)
              AND (cs.notified_for_due IS NULL OR cs.notified_for_due <> cs.next_due
                   OR cs.snoozed_until IS NOT NULL)
            ORDER BY cs.next_due ASC
            """,
            (acc["household_id"], today, now_utc),
        )
        # Skip care types this account has muted.
        muted = set(parse_muted_care_types(acc["muted_care_types"]))
        if muted:
            due_rows = [r for r in due_rows if r["care_type"] not in muted]
        if not due_rows:
            continue
        push_checked += 1

        subs = await db.execute_fetchall(
            "SELECT id, endpoint, p256dh, auth FROM push_subscriptions WHERE account_id = ?",
            (acc["account_id"],),
        )
        if not subs:
            continue

        payload = build_care_push_payload(
            [dict(r) for r in due_rows],
            snooze_token=make_snooze_token(acc["household_id"]),
        )
        delivered = False
        for sub in subs:
            outcome = send_push(dict(sub), payload)
            if outcome == "ok":
                delivered = True
            elif outcome == "gone":
                await db.execute("DELETE FROM push_subscriptions WHERE id = ?", (sub["id"],))
                await db.commit()
                push_pruned += 1

        if delivered:
            # Stamp each due schedule with the due date we just notified for, so
            # it won't re-ping until completion advances next_due. Only on a
            # real delivery — a transient failure stays eligible next hour.
            for row in due_rows:
                due = row["next_due"]
                if isinstance(due, str):
                    due = date.fromisoformat(due[:10])
                # Clear any (now-elapsed) snooze as we re-notify, so the same
                # due cycle doesn't immediately re-ping on the next run.
                await db.execute(
                    "UPDATE care_schedules SET notified_for_due = ?, snoozed_until = NULL WHERE id = ?",
                    (due, row["id"]),
                )
            await db.commit()
            push_sent += 1
        else:
            push_failed += 1

    return {"push_checked": push_checked, "push_sent": push_sent,
            "push_failed": push_failed, "push_pruned": push_pruned}


_STAMP_COLUMNS = {"last_digest_sent_on", "last_push_sent_on"}


async def _stamp(db, account_id: int, today: date, column: str = "last_digest_sent_on") -> None:
    # Runtime guard, not assert: asserts vanish under `python -O`, and this
    # name is interpolated into SQL.
    if column not in _STAMP_COLUMNS:
        raise ValueError(f"invalid stamp column: {column!r}")
    await db.execute(
        f"UPDATE notification_preferences SET {column} = ? WHERE account_id = ?",
        (today, account_id),
    )
    await db.commit()
