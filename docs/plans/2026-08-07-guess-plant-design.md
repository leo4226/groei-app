# Guess the Plant — design (solo quiz, phase 1)

Date: 2026-08-07 · Status: accepted (Leon) · Type: design

## Problem

The existing garden game is a **physical "find & scan" hunt** — social, ≥2 players,
outdoor maps only, needs the BioCLIP worker. Leon wants a lighter, personal
**knowledge quiz**: app picks a random plant from the household collection, shows
its photo **without the name**, people guess, then it reveals the real plant.

This is a different game loop and must not be bolted onto the hunt's session
machinery. Phase 1 is a **solo quiz**; phase 2 reuses the sessions flow for a
party mode.

## Decisions (confirmed with Leon, 2026-08-07)

| Fork | Choice |
|---|---|
| Photo pool | **All household plants** (garden + indoor, all maps) with a `photo_path` |
| Guess mechanics | **Hybrid**: free-text first → if wrong, 4-option MC fallback at **half points** |
| Entry points | **Both** — solo from map, party mode later via join-code flow |
| Build order | Solo first (smallest useful slice), party mode second |

## Phase 1 — solo quiz

### Flow

1. Entry: quiz icon in `MapActionCluster`, visible on **all map types**
   (the hunt's gamepad is outdoor-only; this quiz works indoor too). Route `/quiz`.
2. `POST /api/quiz/rounds {count}` → random sample of household plants with
   `photo_path`, returns `[{ round_id (plant_id), photo_url }]` — **no names**, so
   the answer can't leak to the client. Needs ≥4 photos to build MC options;
   below that the entry hides and the endpoint 400s with a clear message.
3. Free-text guess → `POST /api/quiz/guess {plant_id, guess}` →
   **fuzzy match** against `plants.name`, `plants.species`,
   `plant_species.common_name_nl/en`, `latin_name` (normalize: lowercase,
   strip diacritics, collapse whitespace; match: exact, prefix, token-prefix,
   contains, Levenshtein ≤ 2).
   - Correct → 100 pts + reveal.
   - Wrong → response includes 4 MC options (target + 3 household distractors
     via seeded PRNG — same deterministic pattern as `GameQuizRound`) → user
     picks → `POST /api/quiz/mc {plant_id, picked_id}` → 50 pts if correct.
4. Reveal: NL/EN names + Latin name + thumbnail. Score tracked client-side.
   End screen: score, rounds, play-again.

### Backend

- New router `backend/routers/quiz.py` (keeps the hunt's `game.py` untouched).
- Reuse `_normalise`-style helpers; fuzzy match lives in `quiz.py` (or a small
  shared helper if phase 2 needs it — YAGNI until then).
- MC options sampled with the same mulberry32-seeded approach as
  `GameQuizRound.tsx` so phase 2 clients could render identical choices.
- No schema migration, no new tables, no session rows for solo play.

### Frontend

- `frontend/src/pages/QuizPage.tsx` — round card (photo, guess input),
  MC fallback state, reveal state, end screen.
- `frontend/src/api/quiz.ts` — `rounds`, `guess`, `mc` methods.
- `MapActionCluster.tsx` — add quiz icon (all map types) → `navigate('/quiz')`.
- i18n: all strings in `translations.ts`, `en.ts`, `nl.ts`.

### Deliberately cut (YAGNI)

- No anti-cheat (household quiz — low stakes).
- No speed bonus in solo (party mode may add it later).
- No persistence / best-score history in phase 1.
- No new DB tables.

## Phase 2 — party mode (sketch, not built)

- Add `clue_mode: 'guess'` to the existing `GameCreateRequest`; sessions flow
  (host → join code → players) stays as-is — `clue_mode` is a VARCHAR column,
  no migration.
- Same guess/mc endpoints, extended to write answers into `game_answers` and
  scores into `game_players` (the hunt's scoring already lives there).
- `GamePlayerPage`/`GameHostPage` render the hybrid guess UI for `guess` mode.

## Verification

- Backend: pytest for `quiz.py` — fuzzy-match table (exact/prefix/diacritics/
  typo/NL+EN+Latin), MC option shape (4, unique, includes target), ≥4-photo
  guard, cross-household isolation.
- Frontend: `npm run lint:i18n`, `npx tsc -b --force`, `npm run build`.
- Manual: verify EN + NL, indoor map entry, below-4-photos state.
