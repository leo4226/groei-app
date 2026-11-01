# Floreren → LAveren: API reference

LAveren is Leon's local dashboard for all his projects. It runs on his own
computer and Floreren runs in the cloud, so LAveren **pulls** data from
Floreren, keeps it locally and shows that local copy. The one write is
"mark this care task done", sent only when the user clicks.

```
LAveren (local)                                   api.floreren.app
  ├─ on open + hourly ── GET  /api/integrations/snapshot ──────────►  JSON (cached 15 min, ETag)
  │                     GET  /api/integrations/maps/{id}/thumbnail.svg
  ├─ on click ───────── POST /api/integrations/care/done ─────────►  logs care, drops the cache
  ├─ data/floreren/snapshot.json
  ├─ data/floreren/images/*.jpg        ◄── photos from public R2 URLs (no token)
  └─ data/floreren/thumbnails/*.svg
```

Handing this to an agent? Start with [`AGENT_HANDOFF.md`](AGENT_HANDOFF.md).

## Files

| File | What it is |
|---|---|
| `floreren_sync.py` | Standard-library client: `sync()`, `mark_done()`, and a CLI around both. Copy it into LAveren. |
| `README.md` | This reference: auth, endpoints, the snapshot format, errors. |
| `AGENT_HANDOFF.md` | The task brief for the agent that builds the LAveren side. |

## 1. Tokens

Make one in Floreren → **Settings → App → Connected dashboards** (owners and
editors only). The token (`flo_…`) is shown once. Send it as
`Authorization: Bearer flo_…`.

| Scope | Made with | Can |
|---|---|---|
| `read` | default | snapshot, map thumbnails |
| `care` | "Also allow marking care as done" ticked | the above + `POST /care/done`, logged under the token owner's name |

- A token is not a login: every other Floreren route rejects it.
- Its scope is fixed. To get a wider scope, make a new token.
- **A password change or reset ends every token.** Revoking takes effect
  at once on the server that handles the revoke. A cached response elsewhere
  can last up to 15 minutes.
- A `care` token stops writing as soon as its account is made a viewer.
- Each account can have at most 5 active tokens.
- Keep it in LAveren's secret or env store (`FLOREREN_TOKEN`), never in the browser or in git.

## 2. Endpoints

Base: `https://api.floreren.app/api/integrations`

### `GET /snapshot[?lang=nl|en]`

Everything a dashboard needs, in one JSON document (section 3). `lang` defaults
to the token owner's account language. The response carries an `ETag`: send it
back as `If-None-Match` and an unchanged snapshot answers `304` with no body.
The server keeps each token's snapshot for 15 minutes and starts fresh each day.

### `GET /maps/{map_id}/thumbnail.svg`

A small SVG of one map: the zones in editor colours, and each plant as a dot
coloured by care status. It contains no text and no names.

| Dot | Meaning |
|---|---|
| `#C2410C` (rust) | care overdue |
| `#D97706` (amber) | care due today |
| `#3F7D20` (green) | nothing due |

Take the URL from the snapshot's `maps[].thumbnail_url`. It needs the token,
works with ETag/304, and is cached for 15 minutes like the snapshot.

### `POST /care/done` (`care` scope)

```json
{ "schedule_id": 1, "notes": "optional, ≤ 500 chars" }
```

`schedule_id` comes from any snapshot care item. The server runs the same code
as the app's own "done" button: one care-log row under the token owner's name,
and the next due date computed from the interval and season. It then drops the
cached snapshots of the whole household, so the next `GET /snapshot` already
shows the task done.

```json
{ "ok": true, "schedule_id": 1, "plant_id": 1, "care_type": "water",
  "next_due": "2026-11-08", "care_log_id": 812 }
```

There is no undo through this API. Link to the plant (`url`) so the user can
undo in Floreren itself.

### Errors

Errors carry a machine-readable `detail.code`. Branch on it, never on the text.

| Status | `detail.code` | Meaning / what to show |
|---|---|---|
| 401 | `integration_token_invalid` | Revoked, password changed, or not a `flo_` token. Ask for a new token. |
| 403 | `integration_token_read_only` | `care/done` with a `read` token. |
| 403 | `integration_account_read_only` | The token owner is now a viewer. |
| 404 | `care_schedule_not_found` | The task is gone (deleted/archived) or belongs to another household. Re-sync. |
| 404 | `map_not_found` | The thumbnail's map is gone. Re-sync. |
| 422 | (validation) | Bad body, e.g. a missing `schedule_id`. |
| 503 | `detail` is the string `database_unavailable` or `database_quota_exceeded` | Floreren's database is unreachable. Keep showing the last snapshot. |

## 3. The snapshot (`schema_version` 1)

```jsonc
{
  "schema_version": 1,
  "generated_at": "2026-11-01T10:00:00Z",
  "today": "2026-11-01",              // the garden's (Amsterdam) date
  "language": "nl",
  "app_url": "https://floreren.app",
  "household": { "name": "Thuis" },
  "token": { "scope": "care", "can_log_care": true },   // show "done" buttons only when true

  "weather": {                         // null: no garden with a location, or no forecast at all
    "stale": false,                    // true = Open-Meteo is down; this is the last cached forecast
    "source_timestamp": "2026-11-01T09:00:00+00:00",
    "location": { "lat": 52.3715, "lon": 4.8499 },
    "current": { "temperature_c": 6.5, "humidity_pct": 80, "weather_code": 61, "condition": "rain" },
    "days": [                          // today first, up to 5 days
      { "date": "2026-11-01", "min_c": 3.0, "max_c": 9.0, "precipitation_mm": 4.2,
        "weather_code": 61, "condition": "rain" }
    ],
    "frost_risk": true,                // min ≤ 0 °C within today + 2 days
    "heat": false                      // max ≥ 30 °C within today + 2 days
  },

  "counts": {
    "plants": 35, "species": 28, "maps": 3, "photos": 212,
    "care_overdue": 2, "care_due_today": 4, "care_upcoming": 9
  },
  "care": {                            // each list capped at 50, sorted by due date
    "overdue":   [ /* care item */ ],
    "due_today": [ /* care item */ ],
    "upcoming":  [ /* care item, next 7 days */ ]
  },
  "recent_activity": [                 // last 15 care-log entries, newest first
    { "plant_id": 1, "plant_name": "Vijg", "care_type": "water", "label": "Water", "icon": "💧",
      "done_at": "2026-10-30T08:00:00Z", "done_by": "Lisbeth", "skipped": false,
      "url": "https://floreren.app/plants/1" }
  ],
  "recent_photos": [                   // last 12 journal photos, newest first
    { "id": 9, "plant_id": 1, "plant_name": "Vijg", "url": "https://…r2…/p.jpg",
      "note": null, "taken_at": "2026-10-29T10:00:00Z", "plant_url": "https://floreren.app/plants/1" }
  ],
  "maps": [
    { "id": 4, "name": "Tuin", "type": "outdoor", "plant_count": 21,
      "url": "https://floreren.app/map/tuin",
      "thumbnail_url": "https://api.floreren.app/api/integrations/maps/4/thumbnail.svg",
      "biodiversity": {                // outdoor maps only; null for indoor (or if it failed)
        "score": 62,                   // 0–100, same number as the map page
        "species_count": 12, "native_count": 7, "invasive_count": 0,
        "drachtplant_count": 5,        // bee-forage species
        "pollinator_months": 7,        // months with something in flower for pollinators
        "pollinator_coverage_months": [false, false, false, true, true, true, true, true, true, true, false, false],
        "streek_name": "Laagveengebied"
      } }
  ],
  "plants": [                          // active plants, by name
    { "id": 1, "name": "Vijg", "common_name": "Vijg", "latin_name": "Ficus carica",
      "plant_type": "shrub", "phase": "established", "photo_url": "https://…",
      "map_id": 4, "map_name": "Tuin",
      "next_care": { "care_type": "water", "label": "Water", "icon": "💧", "due": "2026-10-30" },
      "url": "https://floreren.app/plants/1" }
  ]
}
```

A **care item**:

```jsonc
{ "schedule_id": 1,                    // → POST /care/done
  "plant_id": 1, "plant_name": "Vijg",
  "care_type": "water", "label": "Water", "icon": "💧",
  "due": "2026-10-30", "days_overdue": 2,
  "weather_driven": false,             // true = a frost/heat task the weather created
  "photo_url": "https://…", "map_name": "Tuin", "url": "https://floreren.app/plants/1" }
```

`floreren_sync.py` adds local paths next to the URLs:
- `local_image` on photos, plants and care items
- `local_thumbnail` on maps

Each is relative to the output folder, or `null` if the download failed.

**Weather `condition`** is one language-free key: `clear`, `partly_cloudy`,
`cloudy`, `fog`, `drizzle`, `rain`, `snow`, `thunderstorm`, or `null` for an
unknown code. Translate it in LAveren. The raw WMO `weather_code` is there too.

### Rules you can rely on

- Every item has an absolute `url` into floreren.app. Clicks open the real app.
- `common_name` and `label` are in the snapshot's `language` and are **null**
  when that language is missing. Floreren never fills one language in from the
  other. Fall back to `latin_name` or `care_type`.
- Snoozed care and archived plants are left out.
- Timestamps are UTC with a `Z`. `due`, `today` and `days[].date` are plain
  garden-local dates.
- `weather` and `biodiversity` fail soft (`null`); the snapshot itself never
  fails because of them.
- New fields can appear at any time, so ignore fields you don't know. A
  breaking change bumps `schema_version`, and `floreren_sync.py` refuses a
  version it doesn't know.

## 4. Being a good client

- **Fetch from LAveren's backend or a script, never from browser JavaScript.**
  CORS only allows floreren.app, and keeping it server-side keeps the token
  out of the page.
- **Poll gently: on open, then at most hourly.** Floreren's database (Neon)
  is billed per wake-up. The 15-minute server cache and ETags soften a tight
  loop but don't make it free.
- **Keep the last good snapshot** and show its age (`generated_at`) when a sync fails.
- **After a mark-done, re-sync** instead of patching the local JSON. The
  server has already dropped its cache, so the re-sync is fresh.
- **Photo URLs never change for the same photo.** Download each once and keep it.

## 5. Not in v1

- Undo, skip or snooze from LAveren (open the plant in Floreren instead).
- Push from Floreren to LAveren. There is nothing listening on the PC, and
  hourly pulls are enough.
- Thumbnails of photos. They come full size; if LAveren's image cache gets
  heavy, Floreren should make a thumbnail at upload time.
