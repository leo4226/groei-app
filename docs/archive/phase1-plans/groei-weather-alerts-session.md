# Groei — Claude Code Session: Weather Alerts & Plant Thresholds

> Reference `PLAN.md` for project context and conventions before starting.

---

## Overview

Each plant gets AI-generated care thresholds stored in the database. An alert engine compares these against the 7-day weather data already fetched by the app, and surfaces alerts in two places: a summary banner on the home/map screen, and alert cards on the plant detail screen.

**Alert types:** drought · waterlogging · cold stress · heat stress · bring inside · fertilising tip

**Alert severities:** 💡 info · ⚠️ warning · 🔴 urgent

---

## Step 1 — DB Migration

Add a nullable `care_thresholds` TEXT column (JSON) to the `plants` table.

Existing plants without thresholds should continue to work normally — null thresholds simply means no alerts are shown yet.

---

## Step 2 — Threshold Generator

Create a reusable backend function:

```python
generate_thresholds(plant_name: str, species: str) -> dict
```

Calls the Anthropic API (`claude-haiku`) with a structured prompt instructing it to return **only** valid JSON with these exact keys:

| Key | Type | Description |
|---|---|---|
| `drought_mm_per_week` | `int` | Rainfall below this = too dry |
| `waterlog_mm_per_week` | `int` | Rainfall above this = too wet |
| `min_temp_c` | `float` | Plant experiences stress below this |
| `max_temp_c` | `float` | Plant experiences stress above this |
| `bring_inside_below_c` | `float \| null` | `null` for fully hardy outdoor plants |
| `fertilise_months` | `list[int]` | Months (1–12) when feeding is beneficial |
| `fertilise_tip` | `str` | Short Dutch tip, max 80 characters |

Validate the returned JSON before saving. Retry once if the response is malformed or missing keys.

---

## Step 3 — Backfill Endpoint

```
POST /admin/backfill-thresholds
```

Iterates all plants where `care_thresholds IS NULL`, calls the generator for each, and saves the result. Logs successes and failures individually. Returns a summary:

```json
{
  "processed": 12,
  "succeeded": 11,
  "failed": 1,
  "failures": [{ "plant_id": 4, "name": "Avocado", "error": "..." }]
}
```

> **Run this once manually after deploying the migration.** It's a one-time admin tool — keep it simple.

---

## Step 4 — Auto-generate on Plant Creation

After a new plant is successfully saved to the DB, fire `generate_thresholds()` in the background. Do **not** block the API response — the plant is usable immediately. If generation fails, thresholds remain null and the backfill endpoint can handle it later.

---

## Step 5 — Alert Engine

### Per-plant alerts

```
GET /plants/{id}/alerts
```

Uses the plant's stored thresholds combined with the existing 7-day weather data to compute a list of active alerts.

**Alert object shape:**

```json
{
  "type": "drought | waterlog | cold | heat | bring_inside | fertilise",
  "severity": "info | warning | urgent",
  "message_nl": "Bijna geen regen deze week (0.8mm). Geef extra water.",
  "icon": "💧 | 🌧️ | 🥶 | 🌡️ | 🏠 | 🌿"
}
```

**Severity logic:**

| Alert | Warning | Urgent |
|---|---|---|
| Drought | Rainfall < threshold | Rainfall < 50% of threshold |
| Waterlog | Rainfall > threshold | Rainfall > 2× threshold |
| Cold / heat | Within 3°C of limit | Beyond the limit |
| Bring inside | — | Forecast min < `bring_inside_below_c` |
| Fertilise | Current month in `fertilise_months` | — (always info) |

### Summary endpoint

```
GET /alerts/summary
```

Returns:

```json
{
  "total_count": 3,
  "worst_severity": "warning",
  "plant_ids_with_alerts": [2, 7, 11]
}
```

> Reuse the existing weather data fetch logic — do not duplicate it.

---

## Step 6 — Plant Detail UI

Fetch and render alert cards on the plant detail screen, positioned **between the yearly calendar and the Verzorgingsinfo section**.

**Card style:** coloured left border by severity (🔴 red / ⚠️ orange / 💡 blue), icon + Dutch message text. If no alerts are active, render nothing.

**Also fix in this step:** the "Meer info" button to the right of the "Verzorgingsinfo" heading currently does nothing. It should toggle an expanded care details section open/closed.

---

## Step 7 — Home Screen Alert Banner

Add a summary banner to the home/map screen.

- **With alerts:** `"⚠️ 3 planten hebben aandacht nodig →"` — tapping navigates to a plant list filtered to only plants with active alerts
- **No alerts:** banner is hidden entirely (no empty state needed)
- Banner colour reflects `worst_severity` across all plants

---

## General Notes

- All user-facing strings in **Dutch**
- Thresholds are generated once and cached in DB — do not regenerate on every alert check
- The backfill endpoint is a one-time admin tool; it doesn't need to be pretty
- After running the backfill, manually review the generated thresholds — especially check that fully hardy plants (Fargesia, Hedera, Quercus) have `bring_inside_below_c: null`, and that potted or tender plants (Camellia, any tropicals) have sensible cold limits
