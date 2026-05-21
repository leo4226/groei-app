# Care System Phase B — Data Migration

**Date:** 2026-05-17
**Depends on:** Phase A complete (pipeline + parity)
**Status:** in progress

## Summary

Add `species_care_defaults` table, `plants.care_profile` JSON column, backfill from existing Trefle/Claude species data, migrate legacy `care_thresholds` → new `care_profile` format, delete ephemeral schedules, and update the pipeline to read `care_profile` directly.

## Tasks

### Task 1: Create `species_care_defaults` table

**Files:**
- Create: `backend/db_migrations/002_species_care_defaults.sql`
- Create: `backend/db_migrations/003_care_profile_column.sql`

**Step 1: Write migration SQL**

```sql
CREATE TABLE IF NOT EXISTS species_care_defaults (
  scientific_name TEXT PRIMARY KEY,
  profile_json    TEXT NOT NULL,
  source          TEXT NOT NULL DEFAULT 'manual'
    CHECK (source IN ('trefle', 'claude_ai', 'manual', 'migrated')),
  fetched_at      TEXT NOT NULL DEFAULT (datetime('now'))
);
```

**Step 2: Add `plants.care_profile` column**

```sql
ALTER TABLE plants ADD COLUMN care_profile TEXT;
```

**Step 3: Run migrations**

Apply both to floreren.db.

### Task 2: Build backfill script for species defaults

**Files:**
- Create: `backend/scripts/backfill_species_defaults.py`

The script reads `plant_species.care_thresholds` (old JSON format) and `plant_care_cache` (Trefle environment data), then produces a full `profile_json` in the new care-profile shape for each species.

**Transformation logic:**

Old format → new format mapping:

| Old field | New care type | New field |
|---|---|---|
| `min_temp_c` | `frost_protect.thresholds` | `min_temp_c` |
| `max_temp_c` | `heat_protect.thresholds` | `max_temp_c` |
| `bring_inside_below_c` | `frost_protect.thresholds` | `bring_inside_below_c` |
| `drought_mm_per_week` | `water` | `rainfall_override` (boolean, true if set) |
| `waterlog_mm_per_week` | `water` | used for waterlog detection |
| `fertilise_months` | `fertilize` | `months` |
| `water_interval_days` | `water` | `interval_days` (or fallback to care_types default) |

For care types with no data in old species record (mist, rotate, pest_check, dust, prune, repot), use the global defaults from `care_types.py` (only activate if valid for an environment that has at least one plant of that species — for now, activate indoor types for all species since we can't determine environment at species level; per-plant migration will override).

**How it's populated:**
- Source = `trefle` if data came from `plant_care_cache`
- Source = `claude_ai` if data came from AI-generated species thresholds
- Source = `manual` if no existing data found (just global defaults)

### Task 3: Build plant migration script

**Files:**
- Create: `backend/scripts/migrate_care_thresholds.py`

For each plant:
1. Look up `species_care_defaults` by `plants.species` (Latin name)
2. If found, deep-copy the species defaults as base profile
3. If not found, build base profile from `care_types.py` global defaults (using plant's container_id / ground_zone_id to determine environment)
4. Overlay plant-specific `care_thresholds` (old JSON) — this overwrites only the fields that existed in the old format
5. Mark types with `is_weather_triggered` as active only if the plant has corresponding thresholds
6. Write final `profile_json` to `plants.care_profile`

### Task 4: Update warnings pipeline

**Files:**
- Modify: `backend/services/warnings.py`

Replace the `_load_care_profile` shim (which reads `care_thresholds` and builds profile) with a new function that reads `care_profile` JSON column directly.

The function `_load_care_profile(care_profile_json, environment)` should:
1. Parse the JSON
2. For each care type, check `active` and environment validity
3. Apply any runtime environment-specific flags (heating-season boost, rainfall override)
4. Return a profile dict in the same shape the rest of the pipeline expects

Also **fallback**: if `care_profile` is null/empty, fall back to the old `_load_care_profile` shim behavior for backward compatibility.

### Task 5: Delete ephemeral schedules

```sql
DELETE FROM care_schedules WHERE is_ephemeral = 1;
```

### Task 6: Run tests + verify

1. Run existing test suite to confirm nothing broke
2. Spot-check a few plants by hitting `GET /api/plants/{id}/warnings`
3. Verify the parity test still passes

## Order of execution

1. Migration SQL (Task 1)
2. Backfill species defaults (Task 2)
3. Migrate plant care_thresholds → care_profile (Task 3)
4. Update warnings pipeline (Task 4)
5. Delete ephemeral schedules (Task 5)
6. Verify (Task 6)
