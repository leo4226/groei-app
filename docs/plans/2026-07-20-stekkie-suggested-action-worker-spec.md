# Stekkie worker: emit `suggested_action` for issue #410

> **Audience:** whoever/whatever edits `C:\Projects\leonnetje-server\app.py` (the Stekkie
> chat worker, tunneled at `chatbot.floreren.app`). That code is **not** in the
> `groei-app` repo, so this doc is the handoff — everything on the `groei-app` side
> is already merged and waiting.

## What's already done (don't redo this)

Two PRs already merged into `groei-app`:

1. **#736** — chat bubble markdown rendering, avatar/disclaimer cleanup (unrelated to this).
2. **#738** — `backend/routers/chat.py` now accepts an optional `suggested_action` field on
   the worker's response, validates it against the caller's own household, and forwards
   the validated version to the frontend. `frontend/src/components/HelpAssistant.tsx`
   already renders a button for it and wires it to the real app endpoints.

**None of that does anything yet** because the worker doesn't send `suggested_action`.
This doc describes exactly what the worker needs to add so the button starts appearing.

## The response contract

The worker's `POST /chat` response currently looks like:

```json
{ "response": "Basilicum is 2 dagen te laat met water." }
```

Add one optional field:

```json
{
  "response": "Basilicum is 2 dagen te laat met water.",
  "suggested_action": {
    "type": "mark_care_done",
    "label": "Markeer Basilicum als water gegeven",
    "payload": { "plant_id": 101, "schedule_id": 456, "care_type": "water" }
  }
}
```

- `response` stays required, unchanged, backward compatible.
- `suggested_action` — omit the key entirely (or send `null`) whenever there's nothing
  safe/obvious to suggest. That's the common case — most replies won't have one.
- `requires_confirmation` is accepted in the payload but **the backend ignores whatever
  the worker sends and forces it itself** (`false` for `navigate`, `true` for
  `mark_care_done`) — don't bother computing it, it has no effect.

The backend (`backend/routers/chat.py::_validate_suggested_action`) **re-validates
everything** against the caller's real household data before it ever reaches the
frontend. If anything is malformed, unsupported, or references a plant/map/schedule
that doesn't check out, the whole `suggested_action` is silently dropped and `response`
is still returned normally. **This means the worker can be wrong or uncertain without
breaking the reply** — worst case, no button shows up. Don't add try/catch gymnastics
around this on the worker side; just do a reasonable best effort.

## The only two supported action types (v1 scope)

Anything else in `type` gets silently dropped. Do not invent new types — `snooze_care_task`,
schedule/threshold edits, deleting anything, etc. are explicitly **out of scope** for this
round (see issue #410's own "Out of scope" section). Only these two:

### 1. `navigate` — no confirmation, safe to suggest freely

```json
{ "type": "navigate", "label": "Open de kalender", "payload": { "target": "calendar" } }
```

`payload.target` must be one of:

| target | extra payload fields | validated against |
|---|---|---|
| `"plant"` | `id` (int, required) | an **active** plant in `garden_context.plants[].id` belonging to this household |
| `"map"` | `slug` (string) **or** `id` (int) | `garden_context.maps[].slug` / `.id` |
| `"calendar"` | none | static route, always valid |
| `"add_plant"` | none | static route, always valid |

Use the ids/slugs straight out of `garden_context.plants` / `garden_context.maps` —
never guess or increment an id.

### 2. `mark_care_done` — always requires confirmation, use conservatively

```json
{
  "type": "mark_care_done",
  "label": "Markeer Basilicum als water gegeven",
  "payload": { "plant_id": 101, "care_type": "water", "schedule_id": 456 }
}
```

- `plant_id` (int, required) and `care_type` (string, required).
- `schedule_id` (int, optional but recommended when known) — if you include it, it must
  match the plant's actual active schedule for that `care_type` or the whole action gets
  dropped. Easiest: pull it straight from `garden_context.care_tasks.*[].schedule_id`
  (see below) rather than inventing it.
- `care_type` must be one of the canonical values already used throughout
  `garden_context` (`plants[].care_overview` keys, `care_tasks.*[].care_type`):
  `water`, `fertilize`, `frost_protect`, `heat_protect`, `moisture_check`, `prune`,
  `repot`, `mist`, `rotate`, `pest_check`, `dust`. Don't use aliases like `feed` or
  `protect_cold` — the backend matches this string exactly against the DB row.

## Where to get real ids from — `garden_context` already has everything

`chat.py` sends this in every request already; the worker doesn't need any new lookups,
just needs to read what's already there:

- **`garden_context.plants[]`** — each has `id`, `name`, `active_warnings[]`,
  `care_overview` (keyed by care_type with `.status`).
- **`garden_context.maps[]`** — each has `id`, `slug`, `name`, `type`.
- **`garden_context.care_tasks.overdue` / `.due_today` / `.upcoming_7_days`** — this is
  the best source for `mark_care_done`. Each entry already has `plant_id`, `plant_name`,
  `care_type`, `schedule_id`, `days_overdue`, `reason` — i.e. exactly the fields the
  action payload needs, pre-resolved and pre-prioritized (overdue sorts before due_today
  before upcoming).

If a plant/schedule/map the model wants to reference **isn't present** in the current
`garden_context` (e.g. it was truncated — see `bounds.truncated`), don't emit an action
for it — the id may not resolve and the backend will drop it anyway, but it's cleaner to
just not offer a button than to offer a dead one.

## How to actually produce the JSON (recommended approach)

Don't ask DeepSeek to emit strict JSON as its entire response — you'd lose the free-form
prose `response` text, and LLM-generated JSON is exactly the kind of unreliable
tool-calling issue #410 was trying to avoid in the first place ("The model should not
directly call arbitrary backend endpoints" / "context grounding must be reliable before
mutation affordances").

Two workable patterns, pick one:

**A. Deterministic, no LLM involvement in the action itself (recommended, most robust).**
After getting the model's prose `response` back, run a small separate Python check:
if the user's message plus `garden_context.care_tasks` clearly point at one specific
plant+care_type (e.g. the model's reply mentions marking something as done, or the
prompt was phrased like "ik heb X water gegeven" / "I watered X"), attach the
`mark_care_done` action for that task using the already-classified `care_tasks` data.
For `navigate`, this can be close to keyword matching ("open de kalender" → calendar,
model referenced a specific plant by name that's in `garden_context.plants` → that
plant's navigate action). This never touches the LLM for the action itself, so it can't
hallucinate a bad id.

**B. Ask the model for a small trailing structured block, parsed out of the prose.**
Add one instruction to the system prompt: when (and only when) one clear action applies,
end the reply with a fenced block like:

    ```stekkie_action
    {"type": "mark_care_done", "label": "...", "payload": {...}}
    ```

Then in the worker: regex out the fenced block, `json.loads` it (wrap in try/except —
on any parse failure just omit `suggested_action`, don't fail the request), strip the
fence out of the visible `response` text before returning it, and pass the parsed object
through as `suggested_action`. This keeps action-selection reasoning where the model has
the context to make the call ("is this really the one right action to suggest"), while
still being validated server-side afterward.

Either is fine — the backend's validation is the real safety net either way. (A) is
safer/simpler to reason about; (B) captures intent better for free-form phrasing like
"I already watered it." A hybrid (B for the action *type+label*, but always re-resolving
`payload` ids from `garden_context` rather than trusting whatever ids the model wrote) is
probably the sweet spot if you want both.

## Guardrails (from the issue, worth repeating)

- No arbitrary tool-calling — only `navigate` and `mark_care_done`, nothing else.
- Never suggest an action with a guessed/invented id — always pull ids from `garden_context`.
- One action per reply, at most. Don't attach multiple.
- `label` must be a real string in the request's `language` (nl/en) — it's shown verbatim
  as the button text, no further translation happens downstream.
- If in doubt, omit `suggested_action` — an answer with no button is always safe; the
  cost of a wrong button is a confusing UI, not a bad mutation (the backend still checks
  household ownership, and the frontend still requires a confirm click for
  `mark_care_done`), but "no button" is still the better default.

## After the change: how to verify end-to-end

1. Restart the worker (`C:\Users\leon_\Scripts\start-floreren-workers.ps1` / whatever the
   current launcher is) and confirm `curl https://chatbot.floreren.app/health` still
   returns `{"status":"ok", ...}`.
2. Manual test from the real app (not curl) — log in, open Stekkie, and try:
   - `"Ik heb Basilicum water gegeven"` (with an overdue water task in context) → reply
     text plus a `mark_care_done` button. Click it → confirm/cancel row appears → confirm
     → button shows "✓ Gedaan!" and the plant's care status actually updates elsewhere
     in the app (dashboard/care needs list).
   - `"Waar kan ik de kalender vinden?"` → reply plus a `navigate` button with no
     confirmation step → clicking it closes Stekkie and routes to `/calendar`.
   - A vague question with no single obvious task ("Wat moet ik vandaag doen?" when
     nothing is overdue) → reply text only, **no** button.
   - Ask about something entirely out of the two supported types (e.g. "verander het
     interval naar 10 dagen") → reply text only, no button — this is correctly
     unsupported in v1.
3. Confirm nothing crashed when the model doesn't produce a parseable action — the
   worker should never 500 because an action was malformed; at worst it should log and
   omit `suggested_action`.

Once that manual pass looks right, issue **#410** can be closed — it's intentionally
being kept open until this end-to-end flow is confirmed working, not just the repo-side
plumbing.
