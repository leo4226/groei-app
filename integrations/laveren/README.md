# Floreren → LAveren

LAveren is Leon's local dashboard for all his projects. It runs on his own
computer, and Floreren runs in the cloud, so LAveren **pulls** one read-only
snapshot from Floreren, keeps it locally, and shows that local copy. Floreren
never calls LAveren, and nothing on the PC has to be opened to the internet.

```
LAveren (local)  ── when opened + hourly ──►  GET api.floreren.app/api/integrations/snapshot
   │                                            Authorization: Bearer flo_…
   ├─ data/floreren/snapshot.json   ◄── snapshot (+ local_image paths)
   └─ data/floreren/images/*.jpg    ◄── photos from public R2 URLs, downloaded once
```

## 1. Get a token

Floreren → **Settings → App → Connected dashboards** → name it `LAveren` →
**Create token**. Copy the token (shown once) and the snapshot address.

- Read-only. It works on the snapshot route only, never as a login.
- Revoke it in the same place. **Changing your password ends every token**, so
  make a new one after a password change.
- Store it like a password, in LAveren's own secret/env store (`FLOREREN_TOKEN`),
  not in source control.

## 2. Pull the data

`floreren_sync.py` in this folder uses the standard library only. Copy it into LAveren.

```bash
export FLOREREN_TOKEN=flo_...
python floreren_sync.py --out ./data/floreren          # add --lang en for English labels
```

Or from LAveren's own Python backend:

```python
from floreren_sync import sync, SyncError
snapshot = sync(Path("data/floreren"), os.environ["FLOREREN_TOKEN"])
```

It sends `If-None-Match`, so an unchanged snapshot costs a 304. It downloads
every photo once to `images/` and adds a `local_image` path next to each photo
URL. When a sync fails, it leaves the last good `snapshot.json` in place.

**Fetch from LAveren's backend or a script, not from browser JavaScript.** The
API's CORS only allows floreren.app. Fetching on the server side also keeps the
token out of the browser.

**Poll gently: once when LAveren opens and at most hourly.** Floreren's
database (Neon) is billed per wake-up. The server caches each token's snapshot
for 15 minutes, but a tight loop still adds up.

## 3. The snapshot (schema_version 1)

```jsonc
{
  "schema_version": 1,
  "generated_at": "2026-11-01T10:00:00Z",
  "today": "2026-11-01",              // the garden's (Amsterdam) date
  "language": "nl",                   // ?lang=nl|en, default = account language
  "app_url": "https://floreren.app",
  "household": { "name": "Thuis" },
  "counts": {
    "plants": 35, "species": 28, "maps": 3, "photos": 212,
    "care_overdue": 2, "care_due_today": 4, "care_upcoming": 9
  },
  "care": {                            // each list capped at 50
    "overdue":   [ /* care item */ ],
    "due_today": [ /* care item */ ],
    "upcoming":  [ /* care item, next 7 days */ ]
  },
  "recent_activity": [                 // last 15 care-log entries
    { "plant_id": 1, "plant_name": "Vijg", "care_type": "water", "label": "Water", "icon": "💧",
      "done_at": "2026-10-30T08:00:00Z", "done_by": "Lisbeth", "skipped": false,
      "url": "https://floreren.app/plants/1" }
  ],
  "recent_photos": [                   // last 12 journal photos
    { "id": 9, "plant_id": 1, "plant_name": "Vijg", "url": "https://…r2…/p.jpg",
      "note": null, "taken_at": "2026-10-29T10:00:00Z", "plant_url": "https://floreren.app/plants/1" }
  ],
  "maps": [
    { "id": 4, "name": "Tuin", "type": "outdoor", "plant_count": 21,
      "url": "https://floreren.app/map/tuin" }
  ],
  "plants": [
    { "id": 1, "name": "Vijg", "common_name": "Vijg", "latin_name": "Ficus carica",
      "plant_type": "shrub", "phase": "established", "photo_url": "https://…",
      "map_id": 4, "map_name": "Tuin",
      "next_care": { "care_type": "water", "label": "Water", "icon": "💧", "due": "2026-10-30" },
      "url": "https://floreren.app/plants/1" }
  ]
}
```

A **care item** looks like this:

```jsonc
{ "schedule_id": 1, "plant_id": 1, "plant_name": "Vijg",
  "care_type": "water", "label": "Water", "icon": "💧",
  "due": "2026-10-30", "days_overdue": 2, "weather_driven": false,
  "photo_url": "https://…", "map_name": "Tuin", "url": "https://floreren.app/plants/1" }
```

Rules you can rely on:

- Every item has an absolute `url` into floreren.app. A click should open the
  real app; LAveren does not need to copy Floreren's screens.
- `common_name`/`label` are in the snapshot's `language` and are **null** when
  that language is missing; Floreren never fills one language in from the
  other. Fall back to `latin_name`.
- Snoozed care and archived plants are left out.
- Timestamps are UTC with `Z`. `due` and `today` are plain garden-local dates.
- New fields can appear without notice. A breaking change bumps
  `schema_version`, and `floreren_sync.py` refuses a version it doesn't know.

## 4. Widget ideas for LAveren

| Tile | From |
|---|---|
| "Today in the garden": overdue + due today, with plant thumbnails | `care.overdue`, `care.due_today`, `local_image` |
| Photo strip / slideshow | `recent_photos[].local_image` |
| Activity feed ("Lisbeth watered the fig") | `recent_activity` |
| Garden at a glance: plants, species, spaces | `counts`, `maps` |
| Plant of the day: pick one plant per date | `plants` (seed the pick with `today`) |
| Badge on the Floreren app tile | `counts.care_overdue + counts.care_due_today` |

## 5. Not in v1 (ask first)

- **Writes** ("mark watered" from LAveren) would need a separate `write` token
  scope. Existing tokens never get wider.
- **Weather, biodiversity score, map thumbnails** call out to other services or
  cost more compute. Each one should be its own field, added when a tile needs it.
- **Thumbnails**: photos are full size. If the image cache gets heavy, Floreren
  should make a thumbnail at upload time.
