# Notification system — audit (2026-08-14)

> **Status.** Audit + improvement run. Everything in §3 is fixed in this branch
> except where marked. Emails were rendered and looked at, in both languages.

**Scope:** every unprompted message Floreren sends.

| Channel | Code | Trigger |
|---|---|---|
| Daily care digest (email) | `services/digest.py` → `services/email.py` (Resend) | cron → `POST /internal/send-digests`, once per account per day at its chosen hour |
| Care push | `services/digest.py` → `services/push.py` (pywebpush/VAPID) | same cron, the moment a task falls due, outside quiet hours |
| Password reset (email) | `services/email.py` | user request |
| Unsubscribe confirmation (web page) | `routers/notifications.py` | digest footer link |
| Snooze confirmation (push) | `frontend/public/sw.js` | notification action button |

The machinery underneath is in good shape and worth saying so: per-device
subscriptions so unsubscribing one phone doesn't silence another, `notified_for_due`
stamping so a task never re-pings until it's completed, quiet hours with an
overnight wrap, HMAC capability tokens for unsubscribe and snooze (no login
needed from a service worker), dead-subscription pruning on 404/410, and a
send stamp that survives a sparse cron. The problems were all in what the
messages *say* and *look like*.

---

## 1. The two that were actually broken

### P1-1 — Push language froze at signup — **FIXED**

`accounts.language` is set once, at signup, from the landing-page toggle.
`PATCH /users/{id}/language` — what the language switch in Settings calls —
updated **`users.language` only**.

The two channels then read different columns:

- **push** → `accounts.language` (`send_due_care_pushes`), frozen forever;
- **email** → `users.language`, via a correlated subquery, correct.

So a user who switched the app to English kept getting **Dutch push
notifications indefinitely**, while their digest correctly switched. Nothing in
the UI hinted why. This is precisely the class of defect the 2026-07 language
audit was about, hiding in the one surface that audit didn't cover.

Fixed by making the language switch write both, matching account to profile the
same way migration `0041` backfilled the column. With `accounts.language`
trustworthy again, the digest's subquery — sitting under a comment claiming
"accounts have no language column of their own (yet)", true when written and
superseded by `0041` — collapses to a plain column read.

### P1-2 — The password reset email was English-only — **FIXED**

`send_password_reset` had one hardcoded English template, `<html lang="en">`,
sent to every account regardless of language. The single email a user cannot
afford to misread — the one that gets them back into a locked account — arrived
in a language they may never have chosen. Now bilingual, driven by
`accounts.language`, which P1-1 makes current.

### P1-3 — The unsubscribe page was Dutch-only — **FIXED**

Hardcoded NL, so an English reader unsubscribing from an English digest landed
on a Dutch confirmation. Now answers in the account's language, and uses the
shared shell instead of its own one-off markup.

---

## 2. "The email is basic and ugly"

Correct, and it was measurably off-brand rather than merely plain.

**It used a palette the app does not have.** The template's green was `#4a7c59`
and its page `#f5f5f0`; the app's are `#2F5D3A` and `#F5F0E3`. Near-misses on
both — close enough to look like a mistake rather than a decision.

**Every task looked identical.** One `<ul>`, one `<li>` per task, an emoji and a
name. A plant three days overdue and one due this afternoon were the same line,
distinguished only by which of two headings they sat under.

**The subject never changed.** "Je planten hebben vandaag aandacht nodig 🌿",
every single day. A week of digests was a wall of identical lines, and nothing
in the inbox said whether today's was urgent or routine.

**No preheader**, so inboxes filled the preview line with the first markup they
found — the word "Floreren" — wasting the one line of persuasion an email gets.

**No plain-text part.** Some clients prefer one, screen readers handle it
better, and its absence is a documented spam signal.

**No display name on the sender.** Every email arrived from
`noreply@floreren.app` rather than "Floreren".

**No `List-Unsubscribe` header**, so the mail client couldn't offer its own
unsubscribe button — the one people actually use. Its absence pushes users
toward "mark as spam" instead, which is what damages a sending domain.

### What changed

A shared shell (`services/email_template.py`) mirroring the app's tokens, used
by the digest, the password reset and the unsubscribe page, so they can no
longer drift apart. On top of it:

- **Task cards**, each with the care icon, the plant, the care type, the place,
  a coloured left border, and an overdue pill in the app's overdue colour —
  the same visual language as an overdue chip in the UI.
- **Section counts**: "TE LAAT · 2", "VANDAAG · 2".
- **A subject that leads with the count** — "4 planten hebben vandaag aandacht
  nodig" — so a week of digests is skimmable and the urgent ones stand out.
- **A preheader** naming the first plant and its task.
- **Natural plurals**: "1 dag te laat", not "1 dag(en) te laat".
- **Dark mode**, via `prefers-color-scheme` and `color-scheme` — ignored
  harmlessly where unsupported.
- **A plain-text part**, derived from the HTML so the two cannot drift, keeping
  link destinations (a text-only "Open Floreren" is useless).
- **`Floreren <noreply@floreren.app>`** and one-click `List-Unsubscribe`.

Structure stays deliberately old-fashioned — nested tables, inline styles, a
button that is a table because Outlook renders with Word and drops padding on
inline elements.

---

## 3. Push

### P2-1 — Every push was titled "Floreren" — **FIXED**

The notification shade showed the app name in bold and the useful part in grey
underneath. The reader already knows which app it is — the icon says so. The
plant leads now ("Monstera" / "Tijd om te water"), and a multi-plant push leads
with the count and names the first few.

### P3-1 — `sw.js` falls back to Dutch — **left as is**

The snooze action titles and confirmations come localized in the payload, with
hardcoded NL fallbacks for "legacy pushes". That fallback only fires for a
payload built by a server older than the localization change, which no longer
exists in production. Harmless, and the comment explains itself.

---

## 4. Still open

- **The digest is the only email that batches.** A user with 40 plants and 12
  tasks gets 12 cards. There is no cap and no "and 6 more" — worth revisiting
  when someone has a garden that big.
- **No send log.** `send_due_digests` returns counts to the cron caller and
  keeps nothing, so "did Leon get Tuesday's digest?" is unanswerable after the
  fact. The push side has `notified_for_due`; email has only
  `last_digest_sent_on` (a date, not a record).
- **Weather warnings reach push but not the subject line.** They *are* in the
  digest body (ephemeral schedules are included by
  `fetch_household_schedule_rows`), but a frost warning reads like any other
  task. A frost night is the one notification where being late actually kills a
  plant.
