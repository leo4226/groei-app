# Architecture & bug audit — 2026-07-06

Deep audit focused on Floreren's two *proven* failure modes (both bit real users
this month): **silent divergence between duplicated logic paths** and
**prod/test type seams** (asyncpg returns `date`/`datetime`, the SQLite test
seam returns TEXT). Findings are ordered by user impact. Each actionable item
has a GitHub issue; the guardrail tests shipped alongside this doc pin the
invariants that past bugs violated.

## The architecture in one paragraph

React 19 SPA (Zustand store `useFloreren`) → FastAPI (asyncpg → Neon Postgres,
`DbAdapter` converts `?` placeholders). Care state flows from one table,
`care_schedules`, out to four user surfaces: the **map** (via
`enrich_plants` → `compute_plant_warnings`), the **calendar**
(`routers/calendar.py`, projects schedules forward), the **email digest** and
**web push** (`services/digest.py` via `care_task_service`). Weather
(open-meteo) both decorates warnings and materialises ephemeral
`protect_cold`/`protect_heat` schedules (`weather_task_service`, run by the
dashboard endpoint *and* the notification cron). Species knowledge
(`plant_species.phenology_json`) is LLM-generated and joined into plant reads.
Cross-cutting: JWT auth (accounts→households), HMAC capability tokens for
tokenised endpoints (unsubscribe, snooze), GitHub-Actions crons (digest,
watchdog→R2).

## Findings

### F1 — Two parallel warning pipelines still run for every plant  · issue #→ "legacy alert pipeline"
`enrich_plants` computes **both** generations of warning logic per plant on
every map load:
- **Legacy:** `_compute_care_status` (`care_status`, `most_urgent`) +
  `services/alert_service.py` (`top_alert`, `alerts`) — NL-only strings, its own
  severity model, and a stale `repot_check` icon key (schedules store `repot`,
  so an overdue repot renders the 💧 water icon).
- **Current:** `compute_plant_warnings` (`top_warning`, `warnings`) — the
  canonical system (`docs`: Phase C), i18n'd, env-aware.

Consumers of the legacy output today: `PlantDetail.tsx` (alerts list) and the
halo *fallback* in `usePlantStatus.ts`/`careDisplay.ts` (the latter literally
marked `// Deprecated`). This split is exactly what produced the
"map says fine, calendar says 12 tasks" bug (#420). Every future change must
currently be made twice or the surfaces drift again.
**Fix (staged):** port PlantDetail to `warnings`; make the halo derive from
`top_warning` only; delete `alert_service.py` + the `top_alert`/`alerts`
fields; keep `care_status` solely as a cheap sort key if still needed.

### F2 — Plant enrichment is triplicated  · issue → "consolidate enrichment"
`plant_reader.py` has `enrich_plant`, `enrich_plant_full`, and
`enrich_plants`, each re-implementing phenology-JSON parsing and care-status
logic. Repo-wide there are **13 sites** parsing `phenology_json`. Every
seam-coercion bug fix (str→date etc.) must be re-applied in several places —
this is how latent copies survive. **Fix:** one enrichment function with a
`fields=` knob; one `parse_phenology(row)` helper.

### F3 — `/dashboard/v2` survives only to feed one widget  · issue → "retire dashboard endpoints"
The Dashboard page was removed (map-as-home migration), but the store still
lazily fetches `/dashboard/v2` — a heavy endpoint (full household
classification, plant facts, weather, **plus a redundant
`sync_ephemeral_schedules()` run**) — solely so `RecentCareSection` on the
Plants page can read `recent_log`. `/dashboard` (v1) appears fully dead.
**Fix:** lean `GET /care/recent-log` endpoint (or reuse `/log` data), then
delete both dashboard endpoints and the `sync` double-run.

### F4 — Notifications ignore the user's language  · issue → "notifications i18n"
- The digest email template is bilingual, but `send_due_digests` **never passes
  `lang`** — every email is Dutch, even for an English profile (user-reported).
  *Fixed for email in the guardrail PR* (language resolved via the user profile
  created alongside the account; see test).
- Care-push bodies are hardcoded NL (`"… heeft aandacht nodig"`), as are the
  snooze action buttons in `sw.js` ("⏰ 2 uur" / "🌙 Morgen").
- Proper fix: persist `language` on `accounts` (small migration) and use it in
  all three channels.

### F5 — 16 silent `except Exception` sites  · issue → "silent-except audit"
Some are legitimate best-effort guards (weather sync in the cron), but several
swallow real errors invisibly — e.g. `routers/plants.py` position updates fall
back on *any* exception (commented as FK-constraint handling, but a DataError
would also vanish), and species/LLM paths return `None` with no log line.
**Fix:** sweep each site; keep the guard, add `logger.warning` with context,
narrow exception types where the intent is a specific failure.

### F6 — Type-seam class (recurring)
Three shipped bugs this month came from asyncpg↔SQLite type differences
(`update_plant` date binds #392, game speed-bonus TEXT `started_at`, digest
`notified_for_due`). Pattern to keep enforcing: **parse at the read site**
(`isinstance(x, str)` coercion, as `_compute_care_status` does) and **bind
objects, never `.isoformat()`**, plus a bind-type regression test per new
write path (see `test_plant_update_preserves.py` as the template).

### F7 — Calendar drops overdue tasks from forward-looking windows  · issue → "calendar overdue window"
Discovered while writing the consistency guardrail: the calendar renders
occurrences **on their dates**, so an overdue schedule (due 5 days ago,
interval 7) produces **zero events** in a `[today, today+N]` window — its past
occurrence is before the window and its next projected one may be after it.
The month view masks this (it includes past days, where the item shows flagged
`overdue`), but any "upcoming"/agenda-style query starting today silently
omits outstanding work — the same divergence class as #420. **Product
decision needed:** either clamp an overdue schedule's first occurrence to
`max(next_due, from_dt)` or document that calendar = occurrence dates and
overdue lives on the map/digest.

## Non-findings (checked, fine)
- Secrets: env-var based, constant-time compares on shared-secret endpoints,
  HMAC tokens context-separated. No secrets in repo.
- Auth scoping: household checks present on the routes sampled (incl. the
  foreign-subscription delete case, which has a regression test).
- `useFloreren` store is a healthy 246 lines; `admin_panel.py` (1638 lines) is
  big but cold code.

## Guardrail tests added with this audit
1. **Cross-surface consistency** — one seeded overdue plant must be reported by
   *all three* backends: `classify_care_tasks` (email), `compute_plant_warnings`
   (map), and the calendar query window. Pins the #420 class of bug.
2. **Digest email language** — an English user's digest renders the EN
   template (would have failed before the F4 email fix).

## Suggested order of execution (small PRs, cheap agents)
1. F4 remainder (push + snooze i18n; `accounts.language` migration)
2. F1 stage 1 (PlantDetail → warnings) → stage 2 (delete alert_service)
3. F3 (recent-log endpoint, delete dashboard)
4. F2 (enrichment consolidation) — after F1/F3 shrink the surface
5. F5 sweep (mechanical, reviewable in one pass)
