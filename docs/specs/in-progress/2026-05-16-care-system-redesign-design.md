# Care System Redesign — Unified Warning Pipeline + Indoor Care Types

**Date:** 2026-05-16
**Status:** approved

## Summary

Replace today's four-way fragmented care warning system (computed independently in `dashboard.py`, `plant_reader.py`, `calendar.py`, and the frontend `usePlantStatus.ts`) with a single backend pipeline that produces a canonical `PlantWarningState` object consumed by every UI surface. Expand the care vocabulary with first-class indoor care types (repot, mist, rotate, pest_check, dust) activated per plant via a species-defaulted care profile.

## Motivation

The current system works but is architecturally fragmented:

- **Care status is computed 4×** in different files with slightly different logic. They drift.
- **Two priority orderings** for which warning wins on the map halo: `_ALERT_TYPE_PRIORITY` in `alert_service.py` and `getHaloStatus()` in `usePlantStatus.ts`. They can disagree.
- **Ephemeral protect-tasks** are a side-effect of hitting `/dashboard` — visit the map directly and they're stale.
- **Indoor plants are second-class**: today's model is "outdoor with weather suppressed". No first-class care types for repotting, misting, rotation, dusting, or pest checks.
- **Hardcoded thresholds** (`thirsty = 1–2d`, `dry = 3+d` in `dashboard.py:170`) with no equivalent for indoor signals.
- **No canonical `PlantWarningState`** — every consumer pulls a different subset (`care_status`, `temp_status`, `most_urgent`, `top_alert`, `alerts[]`) and re-interprets it.

Adding a new care type today requires changes in `models.py`, `dashboard.py`, `plant_reader.py`, `alert_service.py`, `weather_task_service.py`, plus 3+ frontend components. After this redesign, it requires one entry in `care_types.py` plus localisation strings.

## Design principles

1. **One pipeline, one state object.** The backend computes warnings once per plant and returns a structured object. The frontend renders; it does not re-derive priority.
2. **Plant-data-driven activation.** A plant's care profile (auto-populated from species, overridable per plant) decides which care types are active. Inactive care types are invisible across every surface for that plant.
3. **Environment shapes triggers, not vocabulary.** The same `water` care type exists for indoor and outdoor; what differs is *what fires the warning* (rainfall override for outdoor, heating-season boost for indoor).
4. **Schedules in DB, weather warnings derived live.** Ephemeral protect-tasks are removed from `care_schedules`. They become live-computed `weather_event` warnings inside `compute_plant_warnings()`. No DB writes from GET requests.

## Care type catalog

The 10 universal care types, defined as constants in `backend/care_types.py`:

| Care type | Outdoor (ground) | Outdoor (container) | Indoor | Default trigger |
|---|---|---|---|---|
| `water` | ✓ | ✓ | ✓ | schedule + rainfall override (outdoor) / schedule only (indoor, +heating boost) |
| `fertilize` | ✓ | ✓ | ✓ | schedule, gated by `months` array |
| `frost_protect` | ✓ | ✓ | — | weather: `min_temp ≤ threshold` |
| `heat_protect` | ✓ | ✓ | — | weather: `max_temp ≥ threshold` |
| `prune` | ✓ | ✓ | ✓ | schedule, gated by season |
| `repot` | — | ✓ | ✓ | schedule (long interval, 1–3 years) |
| `mist` | — | — | ✓ | schedule, heating-season boost (Nov–Mar NL) |
| `rotate` | — | — | ✓ | schedule (weekly default) |
| `pest_check` | ✓ | ✓ | ✓ | schedule (monthly default) |
| `dust` | — | — | ✓ | schedule (monthly default) |

Each entry in `care_types.py` defines: icon, default intervals by environment, severity rules, localised labels, and which environments may activate it.

`sun` is not in this list — it stays in the existing sun overlay system, which is positional/spatial, not warning-driven.

## Data model

### `plants.care_profile` (JSON, replaces `care_thresholds`)

```json
{
  "water": {
    "active": true,
    "interval_days": 7,
    "season_adjust": {"spring": 1.0, "summer": 0.7, "autumn": 1.0, "winter": 1.5},
    "rainfall_override": true
  },
  "fertilize": {
    "active": true,
    "interval_days": 30,
    "months": [3, 4, 5, 6, 7, 8]
  },
  "frost_protect": {
    "active": true,
    "thresholds": {"min_temp_c": 0, "bring_inside_below_c": 5}
  },
  "heat_protect": {
    "active": true,
    "thresholds": {"max_temp_c": 30}
  },
  "repot":      {"active": true, "interval_days": 540},
  "mist":       {"active": true, "interval_days": 3, "heating_season_boost": 2.0},
  "rotate":     {"active": true, "interval_days": 7},
  "pest_check": {"active": true, "interval_days": 30},
  "dust":       {"active": false},
  "prune":      {"active": false}
}
```

- Auto-populated on plant creation from `species_care_defaults`.
- Any field omitted by species defaults inherits from `care_types.py` global defaults.
- `active: false` removes the care type from every surface for that plant.
- `thresholds.*` only applies to weather-triggered care types.
- The example above shows every possible field. Real plants will commonly have many `active: false` entries — e.g., an indoor fiddle-leaf fig has `frost_protect.active: false`, `heat_protect.active: false`, `prune.active: false`.

### `species_care_defaults` (new table)

```sql
CREATE TABLE species_care_defaults (
  scientific_name TEXT PRIMARY KEY,    -- canonical key; matches plants.scientific_name
  profile_json  TEXT NOT NULL,         -- same shape as plants.care_profile
  source        TEXT NOT NULL,         -- 'trefle' | 'claude_ai' | 'manual'
  fetched_at    TEXT NOT NULL
);
```

Populated by the existing species lookup pipeline (Trefle + Claude AI augmentation). When a plant references an unknown species, the lookup runs and the result is cached here. If the existing species lookup already has a dedicated species table, this table joins via `scientific_name` rather than introducing a new ID column.

### `care_schedules` (kept, simplified)

- `is_ephemeral` column removed.
- All existing rows with `is_ephemeral=1` deleted in migration.
- `next_due` is now derived strictly from `care_profile.{care_type}.interval_days` + last `care_log` entry.

### `care_log` — unchanged.

## Backend pipeline

### `compute_plant_warnings(plant, weather_data, today) -> PlantWarningState`

Single entry point in `backend/services/warnings.py`. Pure function, no DB writes, no side effects.

```python
@dataclass
class PlantWarningState:
    plant_id: int
    environment: Literal["outdoor_ground", "outdoor_container", "indoor"]
    active_care_types: list[str]
    warnings: list[CareWarning]              # sorted by priority desc
    top_warning: CareWarning | None          # warnings[0] or None
    care_summary: dict[str, CareTypeStatus]  # per-care-type rollup for KPIs

@dataclass
class CareWarning:
    care_type: str
    severity: Literal["urgent", "warning", "info"]
    trigger: Literal["schedule_overdue", "schedule_due_today", "weather_event", "seasonal"]
    days_overdue: int | None
    message_nl: str
    message_en: str
    icon: str
    color: str  # the canonical halo/badge color — frontend reads this directly

@dataclass
class CareTypeStatus:
    care_type: str
    status: Literal["good", "due_today", "overdue"]
    days_until_due: int | None
    last_done: date | None
```

`care_summary` only includes care types that are `active` for the plant. KPI tiles on the dashboard render only when at least one plant in the current filter scope contributes a non-good status for that care type.

Algorithm:

1. Determine `environment` from `plant.map.type` + `plant.container_id`.
2. Filter `care_profile` to active care types valid for this environment.
3. For each active care type:
   - Compute schedule warning from `care_schedules.next_due` and effective interval.
   - Compute weather warning from `weather_data` and `care_profile.thresholds`.
   - Emit zero, one, or both warnings.
4. Sort warnings by canonical priority (see below).
5. Build `care_summary` rollup for dashboard KPIs.

### Canonical priority

Defined once in `care_types.py::WARNING_PRIORITY`:

```
1. weather_event + urgent      (frost imminent, heat extreme)
2. schedule_overdue + urgent   (water 3+ days overdue, etc.)
3. weather_event + warning     (cold approaching, drought risk)
4. schedule_overdue + warning  (water 1–2 days overdue)
5. schedule_due_today
6. seasonal / info
```

Tiebreaker within a bucket: more `days_overdue` first; on equal `days_overdue`, alphabetical `care_type` for stable ordering.

Frontend does not re-implement this. It reads `top_warning` and `warnings[]` as already sorted.

### API endpoints

**New:**
- `GET /api/plants/{id}/warnings` → `PlantWarningState`
- `GET /api/warnings/summary?env={tuin|huis|all}` → dashboard rollup (KPI counts per care type + bucket lists)

**Modified:**
- `GET /maps/{slug}/items` → `MapPlantOut.warnings[]` and `MapPlantOut.top_warning` now sourced from the new pipeline.
- `GET /calendar/events` → events derived from the same pipeline, filtered by date range.

**Deprecated, kept temporarily for migration:**
- `GET /dashboard`, `/dashboard/v2`, `/plants/{id}/alerts` — proxied to the new pipeline during Phase C, deleted in Phase D.

### Files removed

- `backend/services/weather_task_service.py` (logic absorbed into `warnings.py`)
- `backend/services/alert_service.py` (logic absorbed into `warnings.py`)
- Frontend: priority logic in `usePlantStatus.ts` and `careDisplay.ts` consolidated to thin display helpers.

## UX surfaces

### Dashboard (`/dashboard`) — Enhanced

- **Top:** filter chip — `Alles | 🏡 Tuin | 🪴 Huis`. Selected filter persists in URL query param.
- **KPI grid:** one tile per active care type with non-zero count. Tile shows: icon, count, worst severity color.
  ```
  💧 3 water    🌱 1 mest    🪴 2 verpotten    🐛 1 luizen
  ```
- **Buckets:** `Nu / Vandaag / Komende week` rendered from the same pipeline. Card rows show plant name, container, `top_warning.message_nl`, and "Gedaan" / "Skip" buttons.
- **Status banner:** total plants, on-schedule count, plus rollup by environment.

KPI thresholds are now derived from `care_types.py`, not hardcoded in the dashboard router.

### Map view

- **Halo color:** `plant.top_warning.color` directly. No frontend priority logic.
- **Alert badges:** `plant.warnings[]` rendered as emoji arc, icons from `CareWarning.icon`.
- **Legend:** plants grouped by care type within environment (`💧 Water (3) · 🪴 Verpotten (2)`), then by severity. Replaces today's "Attention Needed" vs "All Good" split.
- **Outdoor in-ground plants** continue to suppress non-weather halos (existing behavior), which becomes a property on `care_types.py::frost_protect/heat_protect` (`halo_visible_for_ground=true`) rather than a frontend `if` branch.

### Calendar (`/calendar`)

- Same filter chip (Tuin / Huis / Alles).
- Events colored by care type, sized by severity.
- Each event shows the triggering care type icon and the plant name.

### Plant detail

- New **"Verzorgingsprofiel"** section.
- Each care type in the catalog rendered as a row with:
  - Toggle (active / inactive)
  - Interval (with species-default and "(custom)" badge if overridden)
  - Thresholds (for weather-triggered types)
  - "Reset to species default" button per field
- Shows which fields came from species data vs user override.

### Localisation

All new strings added to `nl.ts` and `en.ts`. Examples:
- `care.repot: "Verpotten" / "Repot"`
- `care.mist: "Bevochtigen" / "Mist"`
- `care.rotate: "Draaien" / "Rotate"`
- `care.pest_check: "Luizen-check" / "Pest check"`
- `care.dust: "Bladeren afnemen" / "Wipe leaves"`
- `dashboard.kpi.{care_type}_overdue: "{count} {care_type} te laat"`

## Indoor-specific signals

Beyond pure schedule, these heuristics fire in `compute_plant_warnings()`:

- **Heating season boost** for indoor `water` and `mist`: from November 1 through March 31 (NL hardcoded for Phase 1, configurable later), effective interval is multiplied by `heating_season_boost` from the care profile (default 1.5 for water, 2.0 for mist).
- **Pest check escalation:** if a `care_log` entry within the last 60 days has `notes` containing "luizen" / "pest" / "mites", `pest_check` next_due is halved.
- **Repot urgency:** no auto-detection; pure schedule. (Future: image-based pot-bound detection — out of scope.)

Outdoor signals stay as today: rainfall over 7d (containers) or 14d ÷ 2 (in-ground); temperature min/max from Open-Meteo cache.

## Migration plan

Migration runs in four phases behind a `USE_UNIFIED_WARNINGS` env flag. Old code paths remain operational until each phase completes.

### Phase A — Pipeline + parity tests

- Build `compute_plant_warnings()` and dataclasses.
- Build `care_types.py` catalog.
- Add `GET /api/plants/{id}/warnings`.
- **Parity tests:** for every plant in current production data, assert old `top_alert` and new `top_warning` produce equivalent severity + care_type. Fail loud on divergence.

### Phase B — Data migration

- Add `species_care_defaults` table.
- Backfill from existing Trefle/Claude cached species data.
- Migrate `plants.care_thresholds` → `plants.care_profile` (script: shape transformation + species default fill-in).
- Delete `care_schedules` rows with `is_ephemeral=1`.

### Phase C — Surface migration

One surface at a time, each gated by `USE_UNIFIED_WARNINGS`:

1. Plant detail "Verzorgingsprofiel" section (read + edit care_profile)
2. Map view (halos, badges, legend)
3. Dashboard (filter chip, KPI grid, buckets)
4. Calendar

Each step: switch consumer to new endpoint, verify visually, delete old code path for that surface.

### Phase D — Cleanup

- Delete `backend/services/weather_task_service.py`.
- Delete `backend/services/alert_service.py`.
- Delete deprecated endpoints `/dashboard`, `/dashboard/v2`, `/plants/{id}/alerts`.
- Delete `is_ephemeral` column from `care_schedules` (SQLite: table recreate).
- Delete priority logic in frontend `usePlantStatus.ts`; keep only thin display helpers.

## Testing strategy

**Backend unit tests** (`backend/tests/test_warnings.py`):
- One fixture per environment × season × care type combination.
- Fixed `today` and weather data, assert exact `PlantWarningState` output.
- Edge cases: brand-new plant (never watered), plant moved indoor→outdoor mid-season, profile with `active: false` for all types.

**Backend integration tests:**
- Assert `/api/warnings/summary` and `/maps/{slug}/items` agree on warning counts for the same plant set.

**Frontend tests:**
- Snapshot tests of `PlantMarker` halo + badges given a canonical `PlantWarningState`.
- KPI grid renders correct count + color from `care_summary`.

**Parity tests** (Phase A only):
- For each plant in current DB, both old and new pipelines produce the same `top_alert.severity` and `care_type`. Differences logged with plant ID for manual review.

## Out of scope

- Authentication, multi-user, household isolation — Phase 1 stays single-household.
- Indoor humidity sensors or actual humidity measurement — `mist` uses heating-season heuristic only.
- Image-based pest detection or pot-bound detection — manual reminders only.
- ML-driven interval tuning — intervals stay rule-based, species-defaulted, user-overridable.
- Sun/light position reform — existing sun overlay system unchanged.
- Per-map customisable heating-season window — NL hardcoded for now.

## Open questions

None at design time. Implementation plan will surface concrete questions during Phase A parity testing.

## Related work

- `docs/specs/completed/2026-05-14-dashboard-todo-regroup-design.md` — the recent dashboard regroup partially anticipated this; the new design supersedes the column-set logic in `TodayGrid`.
- `docs/specs/completed/2026-05-10-plant-status-halos-design.md` — current halo system; replaced by `top_warning.color`.
- `docs/specs/completed/2026-05-13-plant-detail-redesign-design.md` — plant detail surface that will gain the new "Verzorgingsprofiel" section.
- Auto-memory: architecture proposal #1 "Care task derivation" — this spec is the realisation of that proposal.
