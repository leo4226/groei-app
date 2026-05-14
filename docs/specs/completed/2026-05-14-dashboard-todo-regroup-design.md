# Dashboard To-Do Regroup & Weather-Driven Tasks

**Date:** 2026-05-14
**Status:** approved

## Summary

Regroup the dashboard "Vandaag" to-do grid: move fertilise into the Water column (renamed "Water & Voeding"), and add weather-triggered ephermal tasks (cold/heat protection) to the Aandacht column.

## Motivation

- "Bemesten" (fertilise) logically pairs with watering — both are nourishment
- Weather-driven tasks (bring indoors when cold, shade when hot) should be actionable to-do items, not just passive alerts

## Column regrouping

| Column | Care types |
|--------|-----------|
| **Water & Voeding** | `water`, `fertilize` |
| **Aandacht** | `mist`, `rotate`, `repot_check`, `prune`, `protect_cold`, `protect_heat` |

The binary split in `TodayGrid` changes from `care_type === 'water'` vs rest to a set membership check.

### Labels (nl.ts)

- `dashboard.columns.waterFeed: "Water & Voeding"`
- `care.protect_cold: "Beschermen tegen kou"`
- `care.protect_heat: "Beschermen tegen hitte"`

## Weather-driven ephemeral tasks

### New care types

- `protect_cold` — min 24h temperature drops below plant's threshold
- `protect_heat` — max 24h temperature exceeds plant's threshold

### Schema change

`care_schedules` gets `is_ephemeral INTEGER DEFAULT 0` (SQLite boolean).

### Thresholds (already exist in `care_thresholds_json`)

```json
{
  "min_temp_c": 0,
  "max_temp_c": 35,
  "bring_inside_below_c": 5
}
```

These are per-plant, already set for tomato, avocado, etc.

### Generation flow

```
weather (open-meteo) → weather_task_service → create/delete ephemeral schedules
                                                         ↓
                                            appear in dashboard Aandacht
                                                         ↓
                                            user clicks "Gedaan"
                                                         ↓
                                       care_log inserted, next_due = tomorrow
                                                         ↓
         ┌─ condition still holds + plant still outdoor → re-appears tomorrow
         └─ condition resolved OR plant moved indoor → schedule deleted
```

### Service: `services/weather_task_service.py`

- Called before dashboard query
- For each outdoor plant with thresholds set:
  - If `bring_inside_below_c` set + weather min < threshold → ensure ephemeral `protect_cold` schedule exists
  - If `min_temp_c` set + weather min < threshold → ensure ephemeral `protect_cold` schedule exists
  - If `max_temp_c` set + weather max > threshold → ensure ephemeral `protect_heat` schedule exists
- Delete ephemeral schedules where condition no longer holds, OR plant has moved to indoor map
- Don't duplicate — skip if active ephemeral schedule already exists for that plant+care_type

### Done/skip behavior

`POST /api/care/done` handler:
- Ephemeral schedules (`is_ephemeral=1`): set `next_due = today + 1 day` (re-check tomorrow)
- Normal schedules: use existing `calculate_next_due()` logic

### Visual indicator

Ephemeral task rows show:
- Weather icon: 🥶 for `protect_cold`, 🌡️ for `protect_heat`
- Trigger context, e.g., "Min 2°C (grens 5°C)" below the care type label

## Files touched

| Layer | File | Change |
|-------|------|--------|
| DB | `database/schema.py` | `is_ephemeral` column on `care_schedules` |
| Backend | `services/weather_task_service.py` | **New** — create/delete ephemeral schedules |
| Backend | `routers/dashboard.py` | Call weather service before query; add `is_ephemeral` to response |
| Backend | `routers/care.py` | Done handler: ephemeral = tomorrow, not interval calc |
| Backend | `models.py` | Add `is_ephemeral` to models |
| Frontend | `types/index.ts` | `CareType` union + `'protect_cold' \| 'protect_heat'`, CARETYPE_INFO, add `is_ephemeral` to CareTask |
| Frontend | `i18n/nl.ts` | New labels |
| Frontend | `pages/Dashboard.tsx` | Regroup split logic, weather icon + context in TodayTaskRow |
| Frontend | `store/useGroeiStore.ts` | No changes (same markCareDone flow) |

## Out of scope

- Generalising weather thresholds for all users (currently Leon's Amsterdam garden only)
- Mobile push notifications for weather alerts
- Per-plant custom threshold UI (existing plant edit form already supports this)
- Adding UI for creating weather-triggered scheduling (thresholds set in plant edit, not as care schedules)
