# Stekkie Full-App Assistant — Design

**Status:** Draft for review
**Date:** 2026-08-05
**Related:** #410 (merged), PR #739 (merged), PR #786 (model default → deepseek-v4-flash-0731)

## Goal

Make Stekkie a genuinely useful in-app assistant that can act across the whole Floreren app — care, plants, maps, calendar, and journal — while keeping every write safe, reviewable, and reversible. "Super function" means breadth of domains plus trustworthy execution, not unrestricted authority.

## Where we are

- #739 landed the safe-action foundation: tracked worker, deterministic `mark_care_done` + `navigate` actions, schedule-ID integrity, backend validation, worker-token auth, and the production cutover runbook.
- The live worker is still v1; the cutover (Fly token + Windows worker restart) is the prerequisite for *any* of this to reach production.
- PR #786 upgrades the default reasoning model to `deepseek/deepseek-v4-flash-0731` (verified live against Nous Portal).

## Decisions (from product review with Leon)

1. **Scope:** full app assistant — care, plants, maps, calendar, journal actions. This is the destination; rollout is phased.
2. **Authority:** every data change requires an explicit confirmation. Navigation and read-only answers are immediate. Nothing auto-executes.
3. **First phase:** daily care and quick logging (the highest-frequency, most conversational workflow).
4. **Batching:** multi-item messages ("I watered the balcony plants and misted the fern") produce an **itemized batch preview** with one confirmation.
5. **Stale items:** all-or-nothing with re-preview. If any item is stale/invalid at confirmation time, none execute; the refreshed preview shows what changed. (Default chosen over partial execution because silent partial completion would make the chat transcript disagree with Calendar/Dashboard state.)
6. **Quick logging v1:** care completion plus optional notes, water amount, and care-specific outcomes (e.g. pest-check result). Field-journal text entries and photos are a later phase.
7. **Model:** default to `deepseek/deepseek-v4-flash-0731` (PR #786); `STEKKIE_MODEL` env var still overrides.

## Architecture: typed proposals, not tools

The worker (LLM) must **never** choose trusted database IDs or execute writes. It produces a semantic proposal; the application backend grounds, validates, previews, and executes.

```
message
  → LLM semantic proposal   (intent + entity mentions + params, no IDs)
  → backend grounding       (resolve names against authenticated household data)
  → itemized preview        (exact plants, care types, dates, deltas, notes)
  → user confirmation       (one tap per batch)
  → revalidation            (re-check ownership, active schedules, state)
  → atomic execution        (via existing domain services, single transaction)
  → audit + undo            (care_log / action log; reversible via existing undo)
```

### Why not direct tool-calling

- A compromised prompt or model mistake could mutate shared household data directly.
- Authorization would be duplicated outside the application, breaking the "backend is authoritative" rule from #739.
- Deterministic phrase matching alone doesn't scale across five domains; the LLM is used for **intent**, the backend for **truth**.

### Proposal schema (v1, shared NL/EN)

```jsonc
{
  "intent": "complete_care" | "skip_care" | "postpone_care" | "change_interval"
           | "log_observation" | "navigate" | "answer",
  "items": [
    {
      "entity": "Basilicum",            // name mention, resolved by backend
      "scope": "plant" | "map" | "zone" | "all",  // "all balcony plants"
      "care_type": "water",
      "params": { "notes": "...", "water_amount_ml": 250, "outcome": "none" }
    }
  ],
  "schedule_delta": { "interval_days": 10 }   // only for change_interval
}
```

Backend resolution rules:

- Entity names must resolve to **exactly one** active plant/map in the household, or to an explicit group scope ("all balcony plants"). Ambiguous → drop that item, ask in the preview.
- Every proposed item is re-validated at confirmation time against the same constraints as #739 (ownership, active, care type actionable, schedule_id exact).
- `change_interval` requires the user to say an exact value ("every 10 days"); qualitative requests ("water less often") trigger a clarifying question, never a guess.

## Phase 1 — Daily care & quick logging

Actions:

- **complete_care** — one or many; optional notes / amount / outcome. Reuses `mark_care_done` + `schedule_id` path from #739.
- **skip_care** — skip the current occurrence (exists today via `/care/skip`).
- **postpone_care** — push next_due by N days with preview.
- **change_interval** — exact interval change with preview ("Watering: every 7 → 10 days; next due 12 Aug"). Requires `schedule_delta`, exact value only.
- **navigate** — already live from #739.
- Multi-item batches execute all-or-nothing in one transaction.

Frontend needs:

- Batch preview card in the assistant sheet: itemized rows, one Confirm button, per-item stale markers.
- Loading/error/undo states per batch (reuse `confirmMarkCareDone` patterns).
- All strings through the i18n catalog.

Backend needs:

- `POST /api/chat/actions/preview` (auth) — resolves proposal → preview with resolved schedule_ids.
- `POST /api/chat/actions/execute` (auth) — revalidates, runs items transactionally, returns per-item results + audit info.
- Proposal → Pydantic model with strict enums; worker output is untrusted input.
- Tests: resolution ambiguity, group scope, stale-item re-preview, all-or-nothing rollback, schedule-id integrity, undo round-trip, NL/EN parity.

## Later phases (same framework)

1. **Plant records** — rename, move to map, change location/zone, archive (confirm + preview + undo).
2. **Field journal** — text observations, then photos (dedicated journal model, not care_log).
3. **Calendar planning** — plan a care round, understand workload, maybe schedule-aware suggestions.
4. **Maps/editor** — placement hints, quick edits; highest-risk domain, last.

Each phase: LLM proposal → backend grounding → preview → confirm → execute → audit/undo. New intents get their own enum value; no new authority model.

## Safety invariants (apply to every phase)

- The worker never holds write credentials or receives trusted IDs from the LLM.
- Every write is confirmed by the user; navigation/read-only is immediate.
- Batches are all-or-nothing; stale items trigger re-preview, never silent partial execution.
- Qualitative or ambiguous requests produce questions, not guesses.
- All mutations go through existing domain services; nothing bypasses them.
- Every mutation is auditable and reversible (care_log / undo endpoints).
- NL/EN: labels and previews via the typed catalog; backend errors via HTTP status + `?lang=`; no invented sentences.

## Open questions for Leon

1. **Skip vs postpone semantics** — should "skip" just complete the occurrence silently, or advance without logging? (I recommend: log as skipped, don't advance rhythm silently.)
2. **Undo surface** — OK to reuse the existing care undo in chat, or does the batch need its own "undo all" action?
3. **Phase-1 acceptance** — after this ships, the success test is "log today's watering from chat in under 10 seconds, including a balcony batch".

## Follow-up

Phase-1 implementation plan (bite-sized TDD tasks) will be written after this design is approved. It will be a new issue + branch, separate from the model PR.
