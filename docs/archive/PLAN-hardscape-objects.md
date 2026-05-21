# 🌱 Groei — Plan Addition: Hardscape & Utility Objects

**Extends the existing PLAN.md objects system with non-plantable object types.**

---

## What's Changing

The existing `objects` table only tracks plantable containers (pots, raised beds, planters).
This addition introduces a `category` field that distinguishes three object types:

| Category    | Can hold plants? | Examples                              |
| ----------- | ---------------- | ------------------------------------- |
| `container` | ✅ Yes           | pot, raised bed, planter box          |
| `hardscape` | ❌ No            | stepping stone, bench, table, chair   |
| `utility`   | ❌ No            | rain barrel                           |

`container` is the default — existing objects are unaffected.

---

## Database Migration

```sql
-- Add category column with default so existing rows stay valid
ALTER TABLE objects ADD COLUMN category TEXT NOT NULL DEFAULT 'container'
  CHECK (category IN ('container', 'hardscape', 'utility'));

-- Add label column for named hardscape items
ALTER TABLE objects ADD COLUMN label TEXT;
```

The `label` field is optional but useful for things like "terrace bench" vs "back bench".
For containers the existing `name` field already serves this purpose.

---

## New Object Presets (added to the palette)

### Hardscape
| Preset          | Shape     | Default size (cm) | Color        |
| --------------- | --------- | ----------------- | ------------ |
| Stepping stone  | rounded rect | 60 × 40        | #a8a090      |
| Bench           | rect + end caps | 180 × 40   | #8b7355      |
| Table           | rect      | 80 × 80           | #8b7355      |
| Chair           | rect + back indicator | 50 × 50 | #8b7355  |

### Utility
| Preset     | Shape  | Default size (cm) | Color   |
| ---------- | ------ | ----------------- | ------- |
| Rain barrel | circle | 60 diameter      | #3d5a6b |

All sizes are real-world cm that get converted to SVG px at the map's 46px/m scale.

---

## Rendering Logic

Each object type gets a distinct SVG shape. All are rendered in `ObjectShape.tsx`.

### Stepping Stone
```tsx
// Rounded rectangle, slightly transparent, stone texture via fill pattern
<rect
  rx={8} ry={8}
  width={w} height={h}
  fill="#a8a090"
  fillOpacity={0.85}
  stroke="#8a8070"
  strokeWidth={1.5}
/>
```

### Bench
```tsx
// Thin rectangle (seat) with two small end rectangles (legs/armrests)
<g>
  <rect width={w} height={h} fill={color} rx={3} />         {/* seat */}
  <rect x={0} y={-6} width={8} height={h + 12} rx={2}      {/* left end */}
    fill={color} />
  <rect x={w - 8} y={-6} width={8} height={h + 12} rx={2}  {/* right end */}
    fill={color} />
</g>
```

### Chair
```tsx
// Small square seat + thinner rectangle as back
<g>
  <rect width={w} height={h * 0.65} fill={color} rx={3} />  {/* seat */}
  <rect y={-(h * 0.35)} width={w} height={h * 0.3}          {/* back */}
    fill={color} fillOpacity={0.7} rx={2} />
</g>
```

### Table
```tsx
// Rectangle with subtle inner border to suggest surface
<g>
  <rect width={w} height={h} fill={color} rx={4} />
  <rect x={4} y={4} width={w - 8} height={h - 8}
    fill="none" stroke="#fff" strokeOpacity={0.2} strokeWidth={1} rx={2} />
</g>
```

### Rain Barrel
```tsx
// Circle with horizontal band lines to suggest barrel staves
<g>
  <circle r={r} fill={color} />
  <line x1={-r + 4} x2={r - 4} y1={-r * 0.3} y2={-r * 0.3}
    stroke="#fff" strokeOpacity={0.2} strokeWidth={1.5} />
  <line x1={-r + 4} x2={r - 4} y1={r * 0.3} y2={r * 0.3}
    stroke="#fff" strokeOpacity={0.2} strokeWidth={1.5} />
</g>
```

---

## UI / Interaction Changes

### Palette
The object palette gets a second section below containers:

```
[ Containers ]          [ Hardscape & Utility ]
🪴 Round pot            🪨 Stepping stone
🪴 Square pot           🪑 Bench
🪴 Raised bed           🪑 Chair
                        🪑 Table
                        🛢 Rain barrel
```

### On Tap / Select
- `container` → existing behavior: bottom sheet shows plant list + "add plant" button
- `hardscape` / `utility` → bottom sheet shows: **label** (editable), **dimensions** (editable), **Move** and **Delete** buttons. No plant section.

### AddObjectSheet
The sheet shown when dropping a new object gains a read-only "type" display at the top
(no need to change it after placement — type is set by the preset chosen from the palette).

For hardscape/utility: hide the "material" and "color" fields (use preset defaults),
show only **label** and **dimensions**.

---

## TypeScript Type Changes

```typescript
// Extend existing ObjectCategory or create it
export type ObjectCategory = 'container' | 'hardscape' | 'utility';

export type HardscapePreset =
  | 'stepping_stone'
  | 'bench'
  | 'table'
  | 'chair'
  | 'rain_barrel';

// Add to existing GardenObject type
export interface GardenObject {
  // ... existing fields ...
  category: ObjectCategory;       // NEW — default 'container'
  label?: string;                 // NEW — optional display name
  preset?: HardscapePreset;       // NEW — for rendering shape variant
}
```

---

## API Changes

### `POST /api/objects` — already handles new fields via the migration
Just ensure `category`, `label`, and `preset` are accepted in the request body
and stored. No new endpoints needed.

### `PATCH /api/objects/{id}` — add `label` to patchable fields
```python
class ObjectPatch(BaseModel):
    name: str | None = None
    label: str | None = None      # NEW
    category: str | None = None   # NEW (though unlikely to change post-creation)
    x: float | None = None
    y: float | None = None
    width_cm: float | None = None
    height_cm: float | None = None
    rotation: float | None = None
```

---

## What Doesn't Change

- Plant model — untouched
- Container objects — fully backward compatible, `category` defaults to `'container'`
- Map rendering pipeline — just new branches in `ObjectShape.tsx`
- Drag-to-place interaction — same for all object types

---

## Claude Code Session Starter

```
Read PLAN.md and PLAN-hardscape-objects.md.

We're adding hardscape and utility object types to the Groei garden app.
Existing container objects must remain fully backward compatible.

Work through these steps in order:

1. Run the DB migration (add `category` and `label` columns to objects table)
2. Update the GardenObject TypeScript type with `category`, `label`, `preset`
3. Update ObjectShape.tsx to render the 5 new shapes:
   stepping_stone, bench, chair, table, rain_barrel
4. Add the new presets to the object palette (second section: "Hardscape & Utility")
5. Update the tap/select bottom sheet:
   - containers → existing behavior unchanged
   - hardscape/utility → show label, dimensions, move, delete (no plant section)
6. Update POST /api/objects and PATCH /api/objects/{id} to accept new fields

Test: place a stepping stone, a bench, and a rain barrel on the garden map.
Confirm tapping each shows the right bottom sheet. Confirm existing pots unchanged.
```

---

## Future: Icon Upgrade Path

When Leon is ready to replace the SVG shapes with custom icons:
- Add an `icon_url` field to the objects table
- ObjectShape.tsx checks for `icon_url` first; falls back to shape rendering
- Upload icons via a simple admin screen or just drop them in `/public/icons/`
- No data model changes needed beyond the one new nullable column

This means the SVG shapes built now are a clean placeholder, not a dead end.
