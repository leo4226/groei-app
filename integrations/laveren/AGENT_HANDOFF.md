# Task: connect Floreren to LAveren

*Brief for the agent working in the LAveren repository. Give it this whole
folder (`AGENT_HANDOFF.md`, `README.md`, `floreren_sync.py`).*

## Context

- **LAveren** is Leon's local, single-entry dashboard for all his projects
  and apps. You are working in its codebase.
- **Floreren** is one of those apps: a plant-care PWA for Leon and Lisbeth's
  garden and indoor plants in Amsterdam. It runs in the cloud (frontend
  `https://floreren.app`, API `https://api.floreren.app`). It is **not** in
  this repository, and you don't change it.
- Until now Floreren sat in LAveren as a link, without its data. The goal is
  to make it a first-class tile, as rich as the other apps: real data, photos,
  a map image, weather, and one action (mark care done).

Floreren exposes a small integration API for this. It is fully specified in
`README.md`. Read that before writing code. It defines the snapshot shape,
the error codes and the polling rules.

## Before you start

1. **Learn how LAveren already integrates its other apps** and copy that
   pattern for Floreren. The Floreren side doesn't care about LAveren's stack.
   Look at:
   - where data fetchers live and how they're scheduled
   - where secrets and env vars go
   - how tiles and widgets are registered
   - how images are cached and served
   - how a detail view opens
2. **The token.** Leon makes it in Floreren → Settings → App → Connected
   dashboards and ticks **"Also allow marking care as done"** if the mark-done
   action should work. Store it the way LAveren stores its other secrets,
   under the name `FLOREREN_TOKEN`. Never commit it, never send it to the
   browser, and never log it. If it's missing, the Floreren tile shows a
   "connect Floreren" state that explains where to get a token. It must not
   crash.

## What to build

### 1. Data sync (backend or scheduled job)

- Vendor `floreren_sync.py` into LAveren (where third-party clients live),
  or call it as a subprocess. Use `sync(out_dir, token)`; don't re-implement it.
- Run it **when LAveren starts or opens**, then **at most once an hour**.
  Never on a short timer. Floreren's database is billed per wake-up (see
  README §4). A "refresh" button is fine.
- Output goes to LAveren's data directory, e.g. `data/floreren/`:
  - `snapshot.json`
  - `images/`, photos downloaded once
  - `thumbnails/map-<id>.svg`
- On failure, catch `SyncError`, keep the previous `snapshot.json` and
  surface the message. Show the data's age from `generated_at`.

### 2. Tiles and widgets (match LAveren's design)

Build these, in this order; each one uses only `snapshot.json` and the local
files. "Badge" through "Weather" are core, the rest are nice-to-have:

| Widget | Data | Notes |
|---|---|---|
| **Badge on the Floreren tile** | `counts.care_overdue + counts.care_due_today` | Red when overdue > 0. |
| **Today in the garden** | `care.overdue`, `care.due_today` | Plant thumbnail (`local_image`), `icon` + `label`, "2 days late" from `days_overdue`. A **Done** button per item only when `token.can_log_care` is true. Click the row → open `url`. |
| **Weather** | `weather` | Current temperature + `condition` icon, 3–5 day strip from `days`. Show a frost warning when `frost_risk`, a heat warning when `heat`, and an "outdated" hint when `stale`. Hide the widget when `weather` is null. |
| **Garden map** | `maps[].local_thumbnail` | Show the SVG as an image; click → `maps[].url`. Legend: rust = overdue, amber = today, green = fine. |
| **Biodiversity** | `maps[].biodiversity` | Score 0–100 as a ring or gauge, plus species, native and bee-plant counts, and a 12-month pollinator strip from `pollinator_coverage_months`. Outdoor maps only. |
| **Photo strip** | `recent_photos[].local_image` | Click → `plant_url`. |
| **Activity feed** | `recent_activity` | "Lisbeth · Water · Vijg · 2 h ago". A null `done_by` means a former member. |
| **Garden at a glance** | `counts`, `household.name` | Plants, species, spaces, photos. |
| **Plant of the day** (optional) | `plants` | Pick one with a photo, seeded by `today` so it is stable all day. |

Weather conditions are language-free keys. Map them to LAveren's own icons and
text (`clear`, `partly_cloudy`, `cloudy`, `fog`, `drizzle`, `rain`, `snow`,
`thunderstorm`, and `null` for unknown).

### 3. The "Done" action

- Call `mark_done(token, schedule_id)` from `floreren_sync.py` **from
  LAveren's backend**, then `sync()` again and re-render. Don't patch the JSON
  by hand: the server has already dropped its cache, so the re-sync is fresh.
- Disable the button while the request runs. On `SyncError`, show its message
  (it is already human-readable) and leave the item as it was.
- There is no undo in this API. After success, show a short toast with a link
  to the plant (`url`) so Leon can undo in Floreren.

### 4. Language

Snapshot labels follow the token owner's Floreren language, or `--lang` /
`sync(..., lang=)`. Pass LAveren's UI language if it has one. When
`common_name` or `label` is null, fall back to `latin_name` or `care_type`.
Never fill in the other language.

## Done means

- [ ] Floreren shows as a full tile in LAveren with a live badge.
- [ ] Sync runs on open and hourly, survives being offline, and shows data age.
- [ ] Today, weather, map thumbnail and biodiversity widgets render from local
      files, with no network call while rendering.
- [ ] Photos and thumbnails load from LAveren's local cache.
- [ ] "Done" works with a `care` token. With a `read` token it is hidden
      (`token.can_log_care` is false), and the 403 message shows if it's
      forced anyway.
- [ ] Without a token, the tile explains how to connect. With a revoked
      token, it shows the 401 message.
- [ ] The token is not in git, logs or browser code.

## Quick manual checks

```bash
export FLOREREN_TOKEN=flo_...
python floreren_sync.py --out ./data/floreren                # sync once
python floreren_sync.py --out ./data/floreren --lang en      # English labels
python floreren_sync.py --out ./data/floreren --done 123     # mark schedule 123 done (care token)
```

```bash
curl -s -H "Authorization: Bearer $FLOREREN_TOKEN" \
  https://api.floreren.app/api/integrations/snapshot | python -m json.tool | head -40
```

On Windows PowerShell use `$env:FLOREREN_TOKEN = "flo_..."` instead of `export`.

## Don'ts

- Don't scrape floreren.app pages or call its other API routes. A token works
  only on `/api/integrations/*`. Anything missing from the snapshot is a
  request for Leon, not something to work around.
- Don't poll faster than hourly, and don't fetch from the browser.
- Don't store or display the token anywhere visible.
