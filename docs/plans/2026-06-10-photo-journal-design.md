# Plant Photo Journal ("Groeidagboek") — Design

**Date:** 2026-06-10
**Status:** Approved by Leon (full-vision scope, BioCLIP = sanity-check + embeddings)

## Goal

Track plants over time through photos: a per-plant photo timeline with notes,
photos attached to care events, an optional progress-photo reminder, and a
free species sanity-check via the existing BioCLIP GPU worker.

## Research summary

- **Planta / Greg / Gardenize** all converge on the same model: plant → dated
  photos + optional note, shown as a chronological journal. Gardenize
  additionally attaches photos to care *events* — we adopt that.
- **Cost:** rides the existing free Cloudflare R2 bucket. 10 GB storage,
  free egress. With client-side compression (~200–400 KB/photo at 1600 px
  JPEG q0.8) that is ~30,000 photos — years of headroom for a few users.
  No Cloudflare Images, no transformations product. €0/month.
- **BioCLIP** is a species classifier, not a health model. It can flag
  "this doesn't look like your Strelitzia" and produce embeddings for future
  features; it cannot diagnose disease. Health analysis is out of scope.

## Phasing — three independently shippable PRs

1. **PR 1 — Core journal:** `plant_photos` table, upload/list/edit/delete
   endpoints, client-side compression, timeline UI on PlantDetail, newest
   photo becomes the plant thumbnail.
2. **PR 2 — Care integration:** attach a photo when logging care; optional
   per-plant progress-photo reminder via the existing `care_schedules`
   machinery (`care_type = 'photo'`).
3. **PR 3 — BioCLIP:** background species sanity-check + embedding stored
   per photo; subtle dismissible mismatch hint in the UI.

## Data model (migration 0013)

```sql
CREATE TABLE plant_photos (
    id                  SERIAL PRIMARY KEY,
    plant_id            INTEGER NOT NULL REFERENCES plants(id) ON DELETE CASCADE,
    household_id        INTEGER NOT NULL,            -- denormalised for cheap auth checks
    r2_key              TEXT NOT NULL,               -- object key, needed for deletion
    url                 TEXT NOT NULL,               -- public R2 URL
    note                TEXT,
    taken_at            TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    care_log_id         INTEGER REFERENCES care_log(id) ON DELETE SET NULL,  -- PR 2
    bioclip_species_id  INTEGER,                     -- PR 3, nullable = not checked
    bioclip_confidence  REAL,                        -- PR 3
    species_mismatch    BOOLEAN DEFAULT FALSE,       -- PR 3
    embedding           BYTEA,                       -- PR 3, raw worker bytes
    created_at          TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX idx_plant_photos_plant ON plant_photos(plant_id, taken_at DESC);
```

`plants.photo_path` stays but becomes **derived state**: always the URL of the
newest journal photo (or NULL when the journal is empty). Map view, dashboard
and plant cards keep working unchanged.

## Backend — `routers/plant_photos.py`

All endpoints verify the plant belongs to the caller's household (this also
fixes the existing gap in `POST /plants/{id}/photo`, which only checks
existence).

| Endpoint | Behaviour |
|---|---|
| `POST /plants/{id}/photos` | Multipart upload. R2 key `photos/{household_id}/{plant_id}/{timestamp}.jpg`. Inserts row, re-syncs `plants.photo_path`, marks an active `photo` care schedule done (PR 2), schedules BioCLIP check as a FastAPI background task (PR 3). Optional form fields: `note`, `taken_at`, `care_log_id`. |
| `GET /plants/{id}/photos` | Timeline, newest first. |
| `PATCH /photos/{photo_id}` | Edit `note` / `taken_at`. |
| `DELETE /photos/{photo_id}` | Deletes the R2 object too (no orphans), then re-points `plants.photo_path` at the next-newest photo. |

The legacy `POST /plants/{id}/photo` is reworked to create a journal entry
through the same code path, so existing frontend callers keep working until
they are migrated; it gains the household check.

**R2 hygiene:** replaced/deleted photos always delete their R2 object.
`Storage` gains a `delete(key)` method (boto3 `delete_object`).

## Frontend

- **`utils/compressImage.ts`** — canvas-based: load file → downscale so the
  long edge ≤ 1600 px → `toBlob('image/jpeg', 0.8)`. No new dependency.
  EXIF orientation is handled by `createImageBitmap(file, { imageOrientation:
  'from-image' })`.
- **PlantDetail — Groeidagboek section:** photo grid (3-col, lazy-loaded)
  with date + note; add-photo button (`<input type="file" accept="image/*"
  capture="environment">`); full-screen viewer with swipe between photos and
  a two-photo before/after compare mode.
- **Care logging (PR 2):** the care-done flow gets an optional "foto
  toevoegen" affordance; the resulting photo carries `care_log_id` and shows
  in the timeline tagged with the care type ("📷 bij verpotten").
- **Progress reminder (PR 2):** per-plant toggle in plant settings creates a
  `care_schedules` row (`care_type='photo'`, default `interval_days=30`,
  off by default). It then appears on the dashboard and calendar exactly like
  watering — zero new scheduling code. Uploading any photo for the plant
  marks the schedule done.
- **BioCLIP hint (PR 3):** photos with `species_mismatch=true` show a small
  dismissible badge ("Dit lijkt niet op je <species>"). Never blocking —
  close-ups of soil/flowers will legitimately mismatch.
- **i18n:** all new strings in both `nl.ts` and `en.ts`.

## BioCLIP integration (PR 3)

Background task after upload (never blocks the response):

1. POST image bytes to `{BIOCLIP_WORKER_URL}/embed-image` and `/identify`
   with the `X-Worker-Token` header (same pattern as `routers/plant_id.py`).
2. Store `embedding`, top `bioclip_species_id` + `bioclip_confidence`.
3. If the plant has a `species_id`, the top match differs, and confidence ≥
   threshold (start at 0.35, tune later) → `species_mismatch = true`.
4. Worker unreachable / token missing → leave fields NULL, log a warning,
   no retry queue. The feature degrades to a plain journal.

## Error handling

- Upload size cap (e.g. 10 MB post-compression guard server-side) → 413.
- Non-image content type → 415.
- R2 failure → 502 with a clear message; no DB row written.
- DB row write failure after R2 put → best-effort R2 delete of the
  just-uploaded key.

## Testing

- **Backend (per PR):** household-ownership rejection (401/403/404),
  upload → row + `photo_path` sync, delete → R2 delete called (mock
  Storage) + thumbnail re-point, legacy endpoint creates journal entry,
  schedule auto-complete on upload, mismatch-flag logic with a mocked
  worker (match, mismatch, low-confidence, worker-down).
- **Frontend:** `cd frontend && npm run build` (per CLAUDE.md, tsc alone is
  not sufficient).

## Out of scope (explicitly)

- Health/disease detection (needs paid vision LLM or a different model).
- Social/feed features (Greg-style).
- Cloudflare Images / transformations — unnecessary at this scale.
- Time-lapse video generation (possible later from the stored timeline).
