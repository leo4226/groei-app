# Web Push v2.0 — Design (issue #139)

**Decisions (confirmed with Leon, 2026-06-11):**
1. **Daily-summary push** — one push per day at the account's chosen hour when ≥1
   task is due/overdue. Reuses the digest machinery from #137 wholesale: the same
   hourly GitHub Actions cron, the same `/internal/send-digests` trigger, the same
   hour-match + `last_*_sent_on` idempotence stamp. No per-task sent-state.
2. **Minimal scope** — master push toggle + shared reminder time (`digest_time`
   doubles as the push hour) + iOS install explainer. Per-care-type toggles and
   snooze deferred to a v2.1 issue. Quiet hours stay dormant (the schema field
   from #137 remains unused — a fixed daily hour is quiet by design; it becomes
   relevant only with per-task pushes).

## The service-worker problem (the real risk in this issue)

`frontend/public/sw.js` is currently a **kill-switch**: it wipes caches and
unregisters itself — deliberate fallout from the stale-chunk bugs (#98). Push
requires a persistently registered SW.

Resolution: a **push-only** service worker. It handles exactly two events
(`push`, `notificationclick`), has **no `fetch` handler and performs no
caching**, so the stale-chunk failure mode cannot recur. Its `activate` handler
keeps the cache-wipe (harmless, protects any straggler with zombie caches) but
does NOT unregister.

## Backend

- **Migration 0015**:
  - `push_subscriptions (id SERIAL PK, account_id → accounts ON DELETE CASCADE,
    endpoint TEXT UNIQUE NOT NULL, p256dh TEXT NOT NULL, auth TEXT NOT NULL,
    created_at)` — one row per browser/device.
  - `notification_preferences` + `push_enabled BOOLEAN NOT NULL DEFAULT FALSE`,
    `last_push_sent_on DATE` (separate stamp: email and push succeed/fail
    independently).
- **`services/push.py`**: `send_push(subscription, payload) -> "ok" | "gone" |
  "error"` via `pywebpush` + VAPID. **404/410 from the push service ⇒ "gone" ⇒
  caller deletes the subscription row** (answers the issue's pruning question:
  prune at send time, no separate job).
- **Routers** (extend `routers/notifications.py`):
  - `GET /push/vapid-public-key` — public key for the client subscribe call.
  - `POST /push/subscription` (auth) — upsert by endpoint, bound to the account.
  - `DELETE /push/subscription` (auth) — delete own subscription by endpoint.
  - Prefs GET/PUT gain `push_enabled`.
  - `/internal/send-digests` also dispatches push: same per-account selection
    with `push_enabled` + `last_push_sent_on`; payload = NL one-liner
    ("3 taken vandaag, waarvan 1 te laat") + `/dashboard` URL. Response stays
    counts-only.
- **Secrets**: `VAPID_PRIVATE_KEY`, `VAPID_PUBLIC_KEY`, `VAPID_SUBJECT`
  (mailto:) on Fly. The cron workflow needs no change.

## Frontend

- `sw.js`: push-only SW as above.
- Settings → notifications section gains a push toggle under the digest toggle:
  on-enable → `Notification.requestPermission()` →
  `pushManager.subscribe({ userVisibleOnly: true, applicationServerKey })` →
  `POST /push/subscription` + `PUT prefs {push_enabled: true}`. Disable reverses
  all three. Errors (permission denied) revert the toggle with an inline message.
- iOS: when `iPhone|iPad` UA and not `display-mode: standalone`, show the
  explainer ("voeg Floreren toe aan je beginscherm…", iOS 16.4+) instead of the
  toggle.

## Tests

Prefs roundtrip with `push_enabled`; subscription POST/DELETE (auth, ownership,
upsert); dispatch from `/internal/send-digests` (mocked sender): hour match,
idempotence stamp, no-tasks ⇒ no push, **410 ⇒ row pruned**.

## Out of scope (v2.1 issue to file after merge)

Per-care-type toggles, snooze action button, per-task pushes, quiet-hours
enforcement.
