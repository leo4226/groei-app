# Dashboard Redesign — Design Spec
_2026-05-10_

## Goal

Redesign the `/dashboard` page to match the editorial style of the "Floreren Dashboard" reference design. The new dashboard has a richer header (almanac data), a status overview banner, a two-column task layout, a recent care logbook, live weather, and two under-construction placeholders — all in a responsive layout: single column on mobile, two-column on desktop (≥900px).

## Sections

| Section | Mobile position | Desktop position | Status |
|---|---|---|---|
| Header (greeting + almanac) | Top | Main col top | New |
| Status banner | 2 | Main col | New |
| Mijn Tuinen (map strip) | 3 | Main col | Keep existing |
| Vandaag (2-col task grid) | 4 | Main col | Redesign |
| Logboek | 5 | Main col | New |
| Weer & sensoren | 6 | Sidebar | New |
| Tip van de dag | 7 | Sidebar | Replaces "Wist je dat" |
| 🚧 Detectie | 8 | Sidebar | Placeholder |
| 📷 Foto-identificatie | 9 | Sidebar | Placeholder |

## Layout

Responsive CSS grid wrapper around the existing page body:

```
mobile  (<900px): 1 column — all sections stack vertically
desktop (≥900px): grid-template-columns: 1fr 340px
                  main column left, sidebar right
```

The header and status banner span the full width above the grid on desktop.

## Header

Replaces the current hero block. Contains:

1. **Eyebrow row** — `§ Tuinjournaal · {Dutch weekday} {day} {month}` in monospace/uppercase, with flanking rule lines (existing pattern)
2. **H1** — `{Greeting}, {userName}.` with italic green name (existing)
3. **Lede** — existing `leadCopy()` string
4. **Almanac 2×2 grid** — rendered directly below the lede, inside the header card:

| Cell | Source |
|---|---|
| Zonsopkomst | `useWeather()` → `daily.sunrise[0]` |
| Zonsondergang | `useWeather()` → `daily.sunset[0]` |
| Buitentemperatuur | `useWeather()` → `current.temperature` |
| Volgende verzorging | First overdue or due_today task name + relative time |

The almanac renders a skeleton while weather is loading. If weather fails, cells show `—`.

## Status Banner

4-cell horizontal row spanning full width, derived entirely from the new `/api/dashboard/v2` response:

| Cell | Field | Color |
|---|---|---|
| Collectie | `status_counts.total` | neutral |
| In schema | `status_counts.on_schedule` | green |
| Dorstig | `status_counts.thirsty` | amber |
| Droog | `status_counts.dry` | terra/red |

"In schema" = plants with no overdue care tasks. "Dorstig" = water schedule overdue 1–2 days. "Droog" = water schedule overdue 3+ days.

## Vandaag — Two-column task grid

Replaces the current flat overdue/due/upcoming groups. Two columns side-by-side:

- **Left — Water** (header pip: terra): tasks where `care_type === 'water'`, ordered by most overdue first
- **Right — Aandacht** (header pip: amber): overdue and due-today non-water tasks (fertilize, prune, mist, repot, rotate, etc.)

Each task row: plant icon thumbnail (44×44, with halo if applicable) · plant name · location · urgency label ("X dagen te laat" or "Vandaag") · "Gedaan" button for overdue/due items. Water amount is not stored per-task, so no volume is shown.

On mobile both columns sit side-by-side at full width. If one column is empty, it shows "Niets — alles op schema." in italic.

## Logboek

Shows the last 5 non-skipped entries from `care_log`, joined with plant name and icon key. Each row:

```
[plant icon 56×56]  [date monospace]
                    [action label · plant name]  [tag chip]
                    [notes, italic, truncated 2 lines]
```

Action label is the Dutch label from `CARE_LABEL_NL`. Tag chips: `verzorging` (default), `bloei` (green), `scan` (blue) — assigned by care_type: `repot_check`/`prune` = verzorging, any future bloei/scan entries will use those.

Footer: "Volledig logboek →" link (no target yet — links to `/plants` for now).

## Weer & sensoren (sidebar card)

Single `useWeather(lat, lon)` hook fetches Open-Meteo once on mount:

```
GET https://api.open-meteo.com/v1/forecast
  ?latitude={lat}&longitude={lon}
  &current=temperature_2m,relative_humidity_2m,weather_code
  &daily=weather_code,temperature_2m_max,sunrise,sunset
  &timezone=Europe/Amsterdam
  &forecast_days=7
```

`lat`/`lon` come from the first outdoor map in the store (`maps.find(m => m.map_type === 'outdoor')`). Falls back to Leon's hardcoded coordinates (52.3715, 4.8499) if no outdoor map exists.

Card displays:
- Large temperature + weather condition string (mapped from WMO code)
- 3-cell meta row: humidity %, (soil moisture = `—` — no sensor), light = `—`
- 7-day forecast strip: day abbreviation, weather icon, max temp

Weather condition strings are a local WMO-code→Dutch map (no extra API call). Icon set: sun, partly-cloudy, rain (inline SVG, same style as Floreren reference).

The almanac uses `daily.sunrise[0]` and `daily.sunset[0]` from the same hook response — one fetch, no duplication.

## Tip van de dag (sidebar card)

Replaces the existing "Wist je dat" section. Same data source (`plant_fact` field in the v2 response). Renders as a blockquote-style card:

```
§ Tip van de dag
[plant name in Fraunces italic]
"[fact_nl text]"
[plant icon 36×36]  [plant_name]  [species_name, italic]
```

## Under-construction placeholders (sidebar)

Two cards using a hatched/diagonal-stripe background pattern:

```
🚧  Detectie
    Onkruid & ziektes herkennen — binnenkort beschikbaar.
```

```
📷  Foto-identificatie
    Richt de camera op een plant — binnenkort beschikbaar.
```

No interaction, no links, no data.

---

## Backend: `GET /api/dashboard/v2`

New endpoint in `routers/dashboard.py`. The existing `GET /api/dashboard` is **not changed**.

### Response model `DashboardV2Response`

```python
class StatusCounts(BaseModel):
    total: int
    on_schedule: int
    thirsty: int          # water overdue 1–2 days
    dry: int              # water overdue 3+ days

class RecentLogEntry(BaseModel):
    id: int
    plant_id: int
    plant_name: str
    icon_key: str | None
    care_type: str
    done_at: str
    notes: str | None

class DashboardV2Response(BaseModel):
    overdue: list[CareTask]
    due_today: list[CareTask]
    upcoming: list[CareTask]
    status_counts: StatusCounts
    recent_log: list[RecentLogEntry]
    plant_fact: PlantFactOut | None
```

### SQL for `status_counts`

```sql
-- total active plants
SELECT COUNT(*) FROM plants WHERE is_active = 1;

-- thirsty / dry: water schedules overdue
SELECT
  SUM(CASE WHEN julianday('now') - julianday(next_due) BETWEEN 1 AND 2 THEN 1 ELSE 0 END) as thirsty,
  SUM(CASE WHEN julianday('now') - julianday(next_due) >= 3 THEN 1 ELSE 0 END) as dry
FROM care_schedules cs
JOIN plants p ON cs.plant_id = p.id
WHERE cs.care_type = 'water' AND cs.is_active = 1 AND p.is_active = 1;

-- on_schedule: plants with no overdue schedules at all
SELECT COUNT(DISTINCT p.id)
FROM plants p
WHERE p.is_active = 1
AND p.id NOT IN (
  SELECT DISTINCT plant_id FROM care_schedules
  WHERE is_active = 1 AND next_due < date('now')
);
```

### SQL for `recent_log`

```sql
SELECT
  cl.id, cl.plant_id, p.name as plant_name, p.icon_key,
  cl.care_type, cl.done_at, cl.notes
FROM care_log cl
JOIN plants p ON cl.plant_id = p.id
WHERE cl.skipped = 0
ORDER BY cl.done_at DESC
LIMIT 5;
```

### `plant_fact`

Inline the existing `/plant-fact` logic — same query, same random selection. Merged into the single v2 response so the frontend makes one fetch instead of two.

---

## Frontend: new files

| File | Purpose |
|---|---|
| `hooks/useWeather.ts` | Open-Meteo fetch + WMO code mapping |
| `hooks/useDashboardV2.ts` | Fetches `/api/dashboard/v2`, replaces `loadDashboard` + `loadPlantFact` |

### Store changes

Add `dashboardV2: DashboardV2Response | null` and `loadDashboardV2()` to `useGroeiStore`. Keep existing `dashboard` and `loadDashboard` — used by other pages if any. `Dashboard.tsx` switches to `dashboardV2`.

### Component breakdown (`Dashboard.tsx`)

Extract these sub-components (all in `Dashboard.tsx` for now, extract to files if they grow):

- `DashboardHeader` — greeting + almanac grid
- `StatusBanner` — 4 stat cells
- `TodayGrid` — 2-col water/attention layout (replaces `TaskGroup`)
- `LogboekSection` — recent log list
- `WeatherCard` — sidebar weather
- `CareTipCard` — sidebar tip
- `UnderConstructionCard` — sidebar placeholder (reusable, takes `icon` + `title` + `description`)

---

## What does NOT change

- `BottomNav`, `MapPage`, `Plants`, all other routes — untouched
- `GET /api/dashboard` endpoint — kept as-is
- `MapCard`, `NewMapCard`, `UserSwitcher` — reused unchanged
- `PageDecor` — kept (decorative plant icons)
- `CARE_LABEL_NL` map — kept and reused in logboek
