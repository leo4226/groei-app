# Map Thumbnails Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Generate abstract zone-block thumbnails for maps on save, display them on the homepage with an inline fallback for maps without zone data.

**Architecture:** New `render_thumbnail()` in `svg_renderer.py` computes zone bounding box and renders colored rects (no patterns, no scale bar). Called from `PUT /maps/{map_id}` when canvas_data changes. Written to `frontend/public/maps/{slug}-thumb.svg`, served statically. Frontend falls back to an inline SVG pattern when `thumbnail_file` is null.

**Tech Stack:** Python (FastAPI), TypeScript (React), SQLite

---

### File Structure

| File | Action | Responsibility |
|---|---|---|
| `backend/database/migrations.py` | Modify | Add `thumbnail_file` column |
| `backend/services/svg_renderer.py` | Modify | Add `render_thumbnail()` function |
| `backend/models.py` | Modify | Add `thumbnail_file` + `map_type` to `MapOut` |
| `backend/routers/maps.py` | Modify | Generate thumbnail on PUT, include in SELECT queries |
| `frontend/src/types/index.ts` | Modify | Add `thumbnail_file` + `map_type` to `MapInfo` |
| `frontend/src/pages/MapsListPage.tsx` | Modify | Display thumbnail image or inline fallback |

---

### Task 1: Database Migration

**Files:**
- Modify: `groei/backend/database/migrations.py:7-19`

- [ ] **Step 1: Add thumbnail_file column migration**

Add after the `bearing` migration block (line 19):

```python
    if "thumbnail_file" not in map_cols:
        await db.execute("ALTER TABLE maps ADD COLUMN thumbnail_file TEXT")
```

- [ ] **Step 2: Run the backend to trigger migration**

Start the backend and verify it starts without errors:

```bash
cd groei && npx wait-on http://localhost:8000/api/maps && echo "Backend running"
```

- [ ] **Step 3: Verify column exists**

```bash
python3 -c "
import sqlite3
db = r'C:\Users\leon_\Projects\Plant APP\groei\backend\groei.db'
cols = {row[1] for row in sqlite3.connect(db).execute('PRAGMA table_info(maps)')}
print('thumbnail_file' in cols)
"
```

Expected: `True`

- [ ] **Step 4: Commit**

```bash
git add groei/backend/database/migrations.py
git commit -m "feat: add thumbnail_file column to maps table"
```

---

### Task 2: Thumbnail Renderer

**Files:**
- Modify: `groei/backend/services/svg_renderer.py:80-103` (after `render_canvas_data`)

- [ ] **Step 1: Add `render_thumbnail()` function**

Add this function after `render_canvas_data` (after line 103):

```python
def render_thumbnail(canvas_data_json: str) -> str:
    """Render a compact zone-block thumbnail SVG — no patterns, no scale bar."""
    data = json.loads(canvas_data_json)
    zones: list[dict] = data.get("zones", [])

    if not zones:
        return ""

    # Compute bounding box of all zone rects
    min_x = min(z["x"] for z in zones)
    min_y = min(z["y"] for z in zones)
    max_x = max(z["x"] + z["width"] for z in zones)
    max_y = max(z["y"] + z["height"] for z in zones)

    bw = max_x - min_x
    bh = max_y - min_y
    pad = max(bw, bh) * 0.10
    min_x -= pad
    min_y -= pad
    bw += pad * 2
    bh += pad * 2

    parts = [
        f'<svg viewBox="{min_x} {min_y} {bw} {bh}" xmlns="http://www.w3.org/2000/svg">',
    ]

    for zone in zones:
        ztype = zone.get("type", "soil")
        style = ZONE_STYLES.get(ztype, ZONE_STYLES["soil"])
        x, y, w, h = zone["x"], zone["y"], zone["width"], zone["height"]
        fill = style["fill"]
        opacity = style.get("opacity", 1)
        parts.append(
            f'  <rect x="{x}" y="{y}" width="{w}" height="{h}" '
            f'fill="{fill}" opacity="{opacity}" rx="2"/>'
        )

    parts.append("</svg>")
    return "\n".join(parts)
```

- [ ] **Step 2: Verify the function is importable**

```bash
cd groei/backend && python3 -c "from services.svg_renderer import render_thumbnail; print('imported')"
```

Expected: `imported`

- [ ] **Step 3: Commit**

```bash
git add groei/backend/services/svg_renderer.py
git commit -m "feat: add render_thumbnail for zone-block thumbnail SVGs"
```

---

### Task 3: Update Backend Models and API

**Files:**
- Modify: `groei/backend/models.py:168-177` (MapOut)
- Modify: `groei/backend/routers/maps.py:1-27,169-250` (import, SELECT queries, PUT handler)

- [ ] **Step 1: Add fields to MapOut model**

In `models.py`, update `MapOut` (lines 168-177):

```python
class MapOut(BaseModel):
    id: int
    name: str
    slug: str
    svg_file: str
    viewbox: str
    scale_info: str | None = None
    sort_order: int = 0
    canvas_data: str | None = None
    thumbnail_file: str | None = None
    map_type: str | None = None
```

- [ ] **Step 2: Update import in maps.py**

In `maps.py`, line 11, update the import to include `render_thumbnail`:

```python
from services.svg_renderer import render_canvas_data, render_thumbnail
```

- [ ] **Step 3: Update all SELECT queries to include thumbnail_file**

In `maps.py`, update every maps SELECT query. The column list appears 5 times:

Line 25 (`list_maps`):
```python
    rows = await db.execute_fetchall(
        "SELECT id, name, slug, svg_file, viewbox, scale_info, sort_order, canvas_data, map_type, lat, lon, bearing, thumbnail_file FROM maps ORDER BY sort_order"
    )
```

Line 33 (`get_map`):
```python
    row = await db.execute_fetchall(
        "SELECT id, name, slug, svg_file, viewbox, scale_info, sort_order, canvas_data, map_type, lat, lon, bearing, thumbnail_file FROM maps WHERE slug = ?",
        (slug,),
    )
```

Line 129 (`get_map_by_id`):
```python
    rows = await db.execute_fetchall(
        "SELECT id, name, slug, svg_file, viewbox, scale_info, sort_order, canvas_data, map_type, lat, lon, bearing, thumbnail_file FROM maps WHERE id = ?",
        (map_id,),
    )
```

Line 163 (`create_map`):
```python
    rows = await db.execute_fetchall(
        "SELECT id, name, slug, svg_file, viewbox, scale_info, sort_order, canvas_data, map_type, lat, lon, bearing, thumbnail_file FROM maps WHERE id = ?",
        (map_id,),
    )
```

Line 220 (`update_map`):
```python
    rows = await db.execute_fetchall(
        "SELECT id, name, slug, svg_file, viewbox, scale_info, sort_order, canvas_data, map_type, lat, lon, bearing, thumbnail_file FROM maps WHERE id = ?",
        (map_id,),
    )
```

- [ ] **Step 4: Generate thumbnail on PUT when canvas_data changes**

In `update_map` (lines 180-200), after the viewbox computation block and before `if data.map_type is not None:`, add:

```python
            # Generate thumbnail SVG from zone blocks
            try:
                thumb_svg = render_thumbnail(data.canvas_data)
                if thumb_svg:
                    thumb_filename = f"{existing_row['slug']}-thumb.svg"
                    thumb_path = os.path.join(_MAPS_PUBLIC, thumb_filename)
                    os.makedirs(_MAPS_PUBLIC, exist_ok=True)
                    with open(thumb_path, "w", encoding="utf-8") as f:
                        f.write(thumb_svg)
                    updates.append("thumbnail_file = ?")
                    params.append(thumb_filename)
                else:
                    # canvas_data has no zones — clear stale thumbnail
                    updates.append("thumbnail_file = ?")
                    params.append(None)
            except (json.JSONDecodeError, TypeError):
                pass
```

This needs the `existing` row's slug. Add after line 172 (after confirming map exists):

```python
    existing_row = dict(existing[0])
```

And update the later references from `existing` to use `existing_row` for the id check.

Wait — the current code only uses `existing` to check existence (line 171). The `existing_row` variable replaces `existing[0]` usage. Let me rewrite the handler section properly.

Actually, looking more carefully at the code, `existing` is only used once on line 172 to check `if not existing`. After that, `existing[0]` is never used. So I just need to store the row:

Change the existing query on line 171 from `SELECT id` to `SELECT id, slug`, and store the row.

Replace lines 171-173:
```python
    existing = await db.execute_fetchall("SELECT id FROM maps WHERE id = ?", (map_id,))
    if not existing:
        raise HTTPException(404, "Map not found")
```

with:
```python
    existing = await db.execute_fetchall("SELECT id, slug FROM maps WHERE id = ?", (map_id,))
    if not existing:
        raise HTTPException(404, "Map not found")
    existing_row = dict(existing[0])
```

Then the thumbnail generation block (after viewbox computation, before `if data.map_type`) uses `existing_row["slug"]`.

- [ ] **Step 5: Restart backend and verify API returns new fields**

```bash
# Hit the API
curl -s http://localhost:8000/api/maps | python3 -m json.tool | head -30
```

Expected: Each map object includes `"thumbnail_file": null` or `"thumbnail_file": "huis-thumb.svg"` and `"map_type": "indoor"`.

- [ ] **Step 6: Commit**

```bash
git add groei/backend/models.py groei/backend/routers/maps.py
git commit -m "feat: generate thumbnail on map save, include thumbnail_file in API"
```

---

### Task 4: Frontend Types

**Files:**
- Modify: `groei/frontend/src/types/index.ts:111-120` (MapInfo)

- [ ] **Step 1: Add new fields to MapInfo**

```typescript
export interface MapInfo {
  id: number
  name: string
  slug: string
  svg_file: string
  viewbox: string
  scale_info: string | null
  sort_order: number
  canvas_data: string | null
  thumbnail_file: string | null
  map_type: string | null
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
cd groei/frontend && npx tsc --noEmit 2>&1 | head -10
```

Expected: No new errors from this change.

- [ ] **Step 3: Commit**

```bash
git add groei/frontend/src/types/index.ts
git commit -m "feat: add thumbnail_file and map_type to MapInfo type"
```

---

### Task 5: MapsListPage Thumbnails

**Files:**
- Modify: `groei/frontend/src/pages/MapsListPage.tsx:98-133` (map card loop)

- [ ] **Step 1: Add fallback thumbnail component**

At the top of `MapsListPage.tsx`, after imports, add a helper that renders either the thumbnail image or a fallback inline SVG:

```tsx
function MapThumbnail({ map }: { map: MapInfo }) {
  const baseColor = map.map_type === 'outdoor' ? '#7A9E5A' : '#E8E0D0'
  const accentColor = map.map_type === 'outdoor' ? '#C8A96A' : '#C8A060'

  if (map.thumbnail_file) {
    return (
      <div className="bg-[#f5f3ef] rounded-xl h-44 flex items-center justify-center overflow-hidden mb-3">
        <img
          src={`/maps/${map.thumbnail_file}`}
          alt={map.name}
          className="w-full h-full object-contain"
        />
      </div>
    )
  }

  // Inline fallback: subtle geometric pattern
  return (
    <div className="bg-[#f5f3ef] rounded-xl h-44 flex items-center justify-center overflow-hidden mb-3">
      <svg viewBox="0 0 120 80" width="150" height="120">
        <rect x="0" y="0" width="120" height="80" fill={baseColor} opacity="0.08" />
        <rect x="10" y="8" width="100" height="64" rx="4" fill={baseColor} opacity="0.25" />
        <rect x="20" y="18" width="38" height="22" rx="3" fill={accentColor} opacity="0.45" />
        <rect x="62" y="18" width="38" height="22" rx="3" fill={accentColor} opacity="0.35" />
        <rect x="20" y="46" width="38" height="20" rx="3" fill={accentColor} opacity="0.30" />
        <rect x="62" y="46" width="38" height="20" rx="3" fill={accentColor} opacity="0.40" />
        <line x1="10" y1="8" x2="110" y2="72" stroke={baseColor} strokeWidth="0.4" opacity="0.15" />
        <line x1="110" y1="8" x2="10" y2="72" stroke={baseColor} strokeWidth="0.4" opacity="0.15" />
      </svg>
    </div>
  )
}
```

- [ ] **Step 2: Add thumbnail to each card**

Inside the `.map()` loop (line 100), add `<MapThumbnail map={map} />` before the name/buttons section. Remove the `mb-3` from the name heading since the thumbnail now separates sections visually.

Replace lines 100-131 with:

```tsx
          <div key={map.id} className="bg-surface border border-border rounded-xl p-4">
            <MapThumbnail map={map} />
            <div className="flex items-center justify-between mb-3">
              <h2 className="font-semibold text-text">{map.name}</h2>
              {map.id !== 1 && (
                <button
                  onClick={() => handleDelete(map)}
                  className="text-text-muted text-xs hover:text-overdue"
                >
                  Delete
                </button>
              )}
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => navigate(`/map/${map.slug}`)}
                className="flex-1 border border-border rounded-lg px-3 py-2 text-sm text-text font-medium"
              >
                View
              </button>
              {map.canvas_data ? (
                <button
                  onClick={() => navigate(`/maps/${map.id}/edit-layout`)}
                  className="flex-1 border border-primary/30 bg-primary/5 rounded-lg px-3 py-2 text-sm text-primary font-medium"
                >
                  Edit layout
                </button>
              ) : (
                <div className="flex-1 border border-border rounded-lg px-3 py-2 text-sm text-text-muted text-center opacity-50">
                  SVG import
                </div>
              )}
            </div>
          </div>
```

- [ ] **Step 3: Verify TypeScript compiles**

```bash
cd groei/frontend && npx tsc --noEmit
```

Expected: No errors.

- [ ] **Step 4: Verify the dev server runs**

```bash
cd groei && npm run dev
```

Open http://localhost:5173/maps — cards should show the fallback thumbnails. Open a map in the editor, make a change and save — the thumbnail should appear on the homepage after navigating back.

- [ ] **Step 5: Commit**

```bash
git add groei/frontend/src/pages/MapsListPage.tsx
git commit -m "feat: add map thumbnails with inline SVG fallback"
```

---

### Task 6: Seed Existing Maps

**Files:**
- Modify: `groei/backend/database/seeds.py` (if it exists)

Check if a seeds file exists. If maps with `canvas_data` exist in the DB, we can generate thumbnails for them on next save. No backfill script needed—the design says existing maps show the fallback until their next edit.

- [ ] **Step 1: Verify no seed changes needed**

Existing maps with `canvas_data` (Huis id=7, Tuin id=9) get thumbnails on their next save via the editor. Maps without `canvas_data` (Garden id=1) show the fallback. No backfill needed.

- [ ] **Step 2: Commit (if any seed changes)**

Skip if no changes.

---

### Verification Checklist

- [ ] `PUT /maps/7` with canvas_data → `thumbnail_file` is set in response
- [ ] `GET /maps` → `thumbnail_file` field present on all maps
- [ ] `frontend/public/maps/huis-thumb.svg` exists after saving Huis
- [ ] Homepage at `/maps` shows fallback for Garden, thumbnail for Huis/Tuin after save
- [ ] `npm run dev` starts without errors
- [ ] `npx tsc --noEmit` passes
