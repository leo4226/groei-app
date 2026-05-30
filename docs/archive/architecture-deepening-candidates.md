# Architecture deepening candidates

Generated from `/improve-codebase-architecture` exploration on 2026-05-23.

Vocabulary:
- **Domain terms** follow `CONTEXT.md` (Map, Plant, Species, Zone, Container, Care schedule, Care task, Alert, Care thresholds, Icon, Form, Phase, etc.).
- **Architecture terms**: module = interface + implementation; seam = where an interface lives; depth = leverage at a small interface; locality = changes/bugs concentrated in one place; deletion test = imagine deleting the module — does complexity vanish (pass-through) or concentrate elsewhere (earning its keep)?

---

## Execution log 2026-05-24

Worked through P0–P4 in one session. Status:

| Step | Status | Notes |
|---|---|---|
| **P0** Delete dead nested dirs | ✅ Done | `git rm -rf` of `backend/routers/routers/`, `backend/services/services/`, `backend/tests/tests/`. Recovered an unshipped feature on the way (see below). |
| **Bug fix** Lost `soil_zones` sync | ✅ Done | Commit `ff34d9c` ("soil_note sync on map save") had landed the 20-line backend block in the wrong path (`routers/routers/maps.py`), so it never ran. Promoted to the real `routers/maps.py` before deleting the dupe dirs. |
| **P1** Close out #1 shadow casters | ✅ Done | Deleted dead `SHADOW_CASTERS` (109 lines) and `GARDEN_FLOOR` from `gardenStructures.ts`. Updated CLAUDE.md (removed stale "known issue", reframed §Shadow casters around the remaining `GARDEN_CLIP` hardcode). |
| **P2** Split `plant_care.py` (#4 + #5) | ✅ Done | 865 → 252 lines. Now backed by `services/environment.py` (124L), `services/species_knowledge.py` (446L), `services/garden_log.py` (140L). All 4 callers updated to canonical paths — no more `_`-prefixed cross-imports. |
| **Bug fix** Deepseek response shape | ✅ Done | `_fetch_ai_species` was still parsing `resp.json()["content"][0]["text"]` (Anthropic format) on a Deepseek response — silently broken since the migration. Fixed in passing during the species_knowledge extraction. |
| **P3** Care task service (#7) | ✅ Done | `dashboard.py` 249 → 127 lines. Care-task SELECT + classification (duplicated across v1/v2) moved to `services/care_task_service.py` (88L). Plant-fact lookup also deduplicated locally. |
| **P4** Re-scope #6 icon resolution | ✅ Done (right-sized) | Added thin `resolve_placement_icon(icon_key, *, container_id)` helper to `icons.py` to consolidate the form rule (`"potted" if container_id else "bare"`). Updated the 3 call sites in `plants.py`. Skipped the larger "deep resolver" the doc imagined — Phase auto-selection is "future" per CONTEXT.md and Zone-based selection isn't implemented, so there's nothing to deepen yet. |
| **P5** #2, #3, #8 | ⏸ Deferred | Confirmed: no per-Map scale work in flight (#2), no concurrent feature pressure on the store (#3/#8). Revisit when pain appears. |

Net code shape change: 1 router (`plant_care.py`) and 1 router (`dashboard.py`) became thin route definitions; 4 new service modules carry the real logic; 2 stale-but-edited copies of the codebase deleted; 2 dormant bugs fixed in passing.

---

## Triage 2026-05-24

Each candidate re-verified against the current code. Priority below; per-candidate `Verified` notes inline.

**P0 — Foundation (do first, separate from candidate list):**
- Delete dead duplicate dirs `backend/routers/routers/` (20 files) and `backend/tests/tests/` (10+ files). Leftover from commit `a0d6abb` ("flatten nested groei/groei structure"). Not imported anywhere — `grep "routers\.routers"` finds nothing. Files have drifted from their parents (stale copies). Resolves a correctness risk before any backend refactor.

**P1 — Quick close-out:**
- **#1 Shadow caster resolver** — essentially already done. Delete the dead `SHADOW_CASTERS` constant from `gardenStructures.ts` and update CLAUDE.md "known issues" (~30 min).

**P2 — Highest architectural payoff:**
- **#4 + #5 combined** — split `plant_care.py` (865 lines, 4 jobs) into Species Knowledge service, Plant Onboarding service, and Environment service. Removes 4 callers cross-importing private `_`-prefixed helpers. Bundled because they share a file.

**P3 — Worth doing once #4 lands:**
- **#7 Care task service** — confirmed: task generation lives inline in `dashboard.py` (~80 lines, 2 places). Extract a `care_task_service` mirroring `alert_service`. Better done after #4 to inherit the service-extraction pattern.

**P4 — Re-scope before doing:**
- **#6 Icon resolution** — doc's "dead code" framing was wrong (`find_variant` is called 3× from `plants.py`). Real gap is that no module picks variants from Form/Phase/Zone. Re-scope around that before planning.

**P5 — Defer until pain appears:**
- **#2 Map scale module** — bigger than doc said (13 files, not 6). Mechanical. No per-Map scale work in flight today.
- **#3 FlorerStore slicing + #8 store tests** — real but contained (221 lines, 19 actions). No concurrent feature pressure on the file. Revisit when the store grows past ~400 lines or two features collide.

---

## 1. Shadow caster resolver

> **Verified 2026-05-24 — mostly done:** No file imports the `SHADOW_CASTERS` constant. `useSunPosition.ts` doesn't touch shadow casters at all (it only computes sun angle from time). `useSunVisualization.ts` and `useSunAt.ts` already use `deriveAllShadowCasters`. CLAUDE.md "known issues" is also stale on this point. Action: delete dead constant + fix CLAUDE.md. Demoted to P1 cleanup.

- **Files** — `frontend/src/utils/gardenStructures.ts` (hardcoded `SHADOW_CASTERS`), `utils/gardenFromCanvas.ts` (`deriveAllShadowCasters`), `utils/heatmapCalc.ts`, `hooks/useSunPosition.ts`, `components/map/SunDebugOverlay.tsx`
- **Problem** — Two parallel paths for "what casts a shadow on this Map." The canvas-derived path supports per-Map data; the hardcoded path is Leon's garden frozen in code. Three sun callers each reach for one or the other. Neither passes the deletion test alone.
- **Solution** — A single shadow-caster resolver for a given Map. One adapter satisfies the seam from canvas data; the legacy hardcoded array becomes a fallback adapter (or is deleted once parity is verified).
- **Benefits** — Sun simulation, heatmap, and debug overlay all consume the same source. Per-Map shadow support stops being a "known issue" and becomes a property of the seam. Tests can drive the resolver with synthetic canvas data without touching React.

## 2. Map scale module (per-Map `PX_PER_M`)

> **Verified 2026-05-24:** Spread is wider than originally documented — `PX_PER_M`/`PX_PER_CM` references in 13 files (`Dashboard.tsx`, `ObjectShape`, `PlantMarker`, `svgCoords.ts`, `heatmapCalc.ts`, `FixedPlantsLayer`, `skyViewFactor.ts`, `shadowGeometry.ts`, `gardenStructures.ts`, `shadowCasterConversions.test.ts`, `useResize.ts`, `SelectionOverlay`, `PlantResizeOverlay`). Mechanical work. Priority P5 — defer until per-Map scale becomes a live requirement.

- **Files** — `utils/svgCoords.ts`, `utils/gardenStructures.ts`, plus `PX_PER_CM = 0.46` redefined in `FixedPlantsLayer`, `ObjectShape`, `PlantMarker`, `PlantResizeOverlay`, `SelectionOverlay`
- **Problem** — The same constant exists ~6 times. CLAUDE.md already says this constant will become per-Map; the current shape guarantees a multi-file hunt the day that change lands.
- **Solution** — One module that owns scale and unit conversion for a Map. Components read scale from context (or props derived from the current Map), never as a module-level constant.
- **Benefits** — Per-Map scale becomes a one-line change. Coordinate bugs concentrate in one place to test. The interface is small (`m→px`, `cm→px`, `screen→svg`) but the behaviour behind it is real.

## 3. FlorerStore slicing

> **Verified 2026-05-24:** 19 actions, 13 fields, 221 lines total — slightly bigger than originally counted but still contained. `markCareDone` touches 3 state slices (plants, dashboardV2, careVersions), not 2. No concurrent feature pressure on this file today. Priority P5 — defer until the store grows past ~400 lines or two features start colliding.

- **Files** — `frontend/src/store/useFloreren.ts`
- **Problem** — One Zustand store carries Accounts, Maps, Plants, dashboard care state, Alerts, picker UI, and version counters. The interface is wide (18 actions, 12 fields) but each call does its own thing — there's no leverage from the bundling, only coupling. `markCareDone` reaches into care + warning state at once, which makes refactors and tests risky.
- **Solution** — Split into domain slices (Maps slice, Plants slice, Care slice, Session slice) composed at the top level. Mutations stay close to the state they own.
- **Benefits** — Each slice is testable in isolation through its actions. UI code imports only the slice it needs, narrowing the surface that re-renders on unrelated updates. Concurrent feature work stops fighting one file.

## 4. Species knowledge service vs. Plant onboarding

> **Verified 2026-05-24 — confirmed, highest payoff:** `plant_care.py` is 865 lines. Private `_get_rain_data` / `_get_temp_data` cross-imported from 4 callers: `routers/alerts.py`, `routers/maps.py`, `routers/warnings.py`, `services/weather_task_service.py` (and the dead `routers/routers/` copies). Bundle with #5 (same file). Priority P2.

- **Files** — `backend/routers/plant_care.py` (Trefle calls, curated fallback, Haiku threshold generation, weather getters, last-watered/fertilised), called from `routers/alerts.py`, `routers/maps.py`, `routers/care.py`
- **Problem** — `plant_care.py` is doing four jobs: fetching Species knowledge from external sources, generating Care thresholds via Haiku, computing per-Plant Care schedules, and serving as a weather/env utility. Other routers cross-import its `_`-prefixed helpers. Deletion test: removing this file would scatter complexity into every caller, but the file's interface gives no clue about that depth — it looks like a router.
- **Solution** — Two deep modules: a **Species knowledge** service (Trefle + curated + Haiku thresholds, cached on Species per CONTEXT.md) and a **Plant onboarding** service (turn Species knowledge into a Plant with Care schedule + Care thresholds). Weather lives elsewhere (candidate 5).
- **Benefits** — Routers call domain services instead of importing private helpers from a sibling router. Species knowledge can be tested without onboarding a Plant; onboarding can be tested with a fake Species knowledge adapter. The CONTEXT.md sentence "Care thresholds are generated by Claude Haiku and cached on the Species" finally has a single home in code.

## 5. Environment service (weather + cache)

> **Verified 2026-05-24:** Lives in the same 865-line file as #4. Real consumers: `alerts.py`, `maps.py`, `warnings.py`, `services/weather_task_service.py` (not `care.py` as originally listed — `care.py` is only 116 lines and doesn't touch weather). Treat as part of the #4 split. Priority P2 (bundled).

- **Files** — `_get_rain_data`, `_get_temp_data` in `plant_care.py`; module-level dict caches; consumers in `alerts.py`, `maps.py`, `care.py`
- **Problem** — Weather fetching is a shallow utility with hidden state (module-level cache dicts, no invalidation seam). Three callers means three independent assumptions about freshness.
- **Solution** — An environment service with one query method per environmental signal (rain over window, temp range, etc.), explicit cache policy, and a single seam the Alert pipeline can fake in tests.
- **Benefits** — Alert tests stop needing live network calls or monkey-patching. Cache lifetime becomes a property of the service, not an accident of import order.

## 6. Icon resolution (Form + Phase + Variant)

> **Verified 2026-05-24 — original framing wrong, reframe before doing:** `find_variant` is NOT dead code — `backend/routers/plants.py` calls it 3× (lines 240, 259, 277). But all call sites pass only `target_form` (`"bare"` or computed) — no Phase argument, no Zone-based auto-selection. So the real gap isn't "dead code" but "shallow function — the CONTEXT.md selection rules aren't implemented anywhere." Priority P4 — re-scope before planning. Don't pick this one up without redefining the seam.

- **Files** — `backend/routers/icons.py::find_variant` (defined, never called), `frontend/src/utils/icons.ts::resolveIconUrl` (URL formatter only), `frontend/src/components/map/PlantMarker.tsx`
- **Problem** — CONTEXT.md defines Icon, Icon variant, Form, and Phase as four distinct concepts with selection rules (e.g. a Plant placed in a "plant bed" Zone uses `bare` form). The code stores Form and Phase as fields, but no module actually picks a variant from them. `find_variant` is dead code; the frontend just uses `plant.icon_key` directly.
- **Solution** — One icon-resolution module: given `(icon_key, form?, phase?, zone_type?, container?)` it returns the right variant filename from the manifest. Both backend payload assembly and frontend rendering go through it.
- **Benefits** — The glossary distinction becomes a real seam. Adding a new auto-selection rule (e.g. Phase suggestion from age) is one place. Tests assert "Monstera in a Container resolves to potted/mature" without rendering.

## 7. Care task generation as a domain service

> **Verified 2026-05-24:** Originally listed `care.py` as the source — actually wrong location. `care.py` is only 116 lines and handles done/skip/log/delete-schedule only. The Care **task generation** (overdue / due_today / upcoming classification) lives inline in `backend/routers/dashboard.py` (~80 lines, duplicated across 2 endpoints — both `dashboard_v1` and `dashboard_v2` paths re-implement the same classification). Extracting a `care_task_service` mirroring `alert_service` is a real win. Priority P3 — do after #4 so it inherits the service-extraction pattern.

- **Files** — `backend/routers/care.py` (Care task SQL inline), `backend/services/alert_service.py` (Alert compute), `backend/models.py` (`CareTask`, `PlantAlert`, `TopAlert`)
- **Problem** — Alerts have a service module; Care tasks don't. Per CONTEXT.md they're parallel concepts — both surface on the dashboard, both attach to a Plant — but only one has a seam. Dashboard V2 conflates them into `top_alert` on `MapPlantOut`, blurring the schedule-triggered vs. condition-triggered distinction CONTEXT.md is careful to preserve.
- **Solution** — A Care scheduler service mirroring `alert_service`: given a Plant and its Care schedule, produce due/overdue Care tasks. Dashboard router composes both.
- **Benefits** — Symmetry with Alerts makes the dashboard wiring obvious. Care task rules (grace periods, skip behaviour) get one home. Tests on Care schedule rollover stop needing the dashboard endpoint.

## 8. Store mutation test seam

> **Verified 2026-05-24:** Still true — no tests on the store. Consequence of #3. Priority P5 — defer with #3.

- **Files** — `frontend/src/store/useFloreren.ts` actions (`markCareDone`, `updatePlant`, `createMap`, `_removeTask`), no tests
- **Problem** — Geometry utils are well-tested, but the store — which holds the real coordination logic — has none. `markCareDone` quietly updates both care and warning state; a regression here is invisible.
- **Solution** — Consequence of slicing (candidate 3): once slices exist, their pure reducers can be tested directly. Listed separately because even without slicing, extracting the surgical mutations into pure helpers would unlock tests.
- **Benefits** — A test surface where there is none today. Catches the kind of subtle coupling (`markCareDone` touching warnings) that the current interface hides.

---

## Strongest deletion-test signal

Candidates **1 (shadow casters)** and **4 (Species knowledge vs Plant onboarding)** show the clearest "real complexity living in the wrong place" pattern — start there if picking purely on architectural payoff.

> **Revised 2026-05-24:** Candidate 1 turned out to be essentially already done — the deletion-test signal is real but the work is mostly behind us. **Candidate 4 (bundled with 5)** stands alone as the strongest live signal.
