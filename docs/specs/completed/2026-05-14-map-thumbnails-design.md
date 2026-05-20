# Map Thumbnails — Design

Homepage map cards get abstract, zone-based thumbnails. Backend generates them on save.

## Visual Design

- **Style:** Colored rectangles positioned proportionally to real zones, auto-cropped to bounding box
- **Zone colors:** Reuse existing `ZONE_STYLES` from `svg_renderer.py`
- **No whitespace:** Thumbnail viewBox = bounding box + 10% padding
- **No patterns, textures, or scale bar:** Just filled `<rect>` elements
- **Card layout:** Large preview (~180px rounded area at top) with name + buttons below

## Architecture

### Thumbnail generation (backend)

New function `render_thumbnail(canvas_data_json: str) -> str` in `svg_renderer.py`:

1. Parse zones from canvas_data JSON
2. Compute bounding box of all zone rects (x, y, width, height)
3. Add 10% padding
4. Render each zone as `<rect>` with fill from `ZONE_STYLES`
5. Return compact SVG string

Called from `PUT /maps/{map_id}` after canvas_data is saved. Thumbnail written to `frontend/public/maps/{slug}-thumb.svg`.

### Data flow

```
Editor save → PUT /maps/:id → update DB
                              → render_thumbnail() → write {slug}-thumb.svg

Homepage → GET /api/maps → MapInfo[] (with thumbnail_file)
         → <img src="/maps/{slug}-thumb.svg" />
```

### New field

`thumbnail_file: str | null` added to:
- Backend `MapOut` model (maps.py)
- Frontend `MapInfo` type (types/index.ts)
- Backend reads this from the `thumbnail_file` column (new DB migration)

## Frontend

### Type

```ts
// types/index.ts — MapInfo
thumbnail_file: string | null
```

### MapsListPage

Each card gains a thumbnail area:

- If `thumbnail_file` is set: `<img src={`/maps/${map.thumbnail_file}`} />` in a rounded container
- If null: inline `<svg>` fallback — subtle pattern using `map_type`-appropriate colors

Card structure:
```
┌──────────────────┐
│   thumbnail      │ ~180px
│   (rounded)      │
├──────────────────┤
│ Map name         │
│ [View] [Edit]    │
└──────────────────┘
```

## Edge Cases

| Case | Behavior |
|---|---|
| No zones (garden, static SVG) | `thumbnail_file` null → inline fallback |
| Single zone | Single rect, still cropped — fine |
| Existing maps pre-thumbnail | Show fallback until next save |
| New maps (empty canvas) | Default placeholder rect from initial canvas_data |

## Database Migration

```sql
ALTER TABLE maps ADD COLUMN thumbnail_file TEXT;
```

## Files Touched

- `backend/services/svg_renderer.py` — add `render_thumbnail()`
- `backend/routers/maps.py` — call thumbnail render on PUT, include `thumbnail_file` in response
- `backend/models.py` — add `thumbnail_file` to `MapOut`
- `backend/database/migrations.py` — add column
- `frontend/src/types/index.ts` — add `thumbnail_file` to `MapInfo`
- `frontend/src/pages/MapsListPage.tsx` — add thumbnail image + fallback
