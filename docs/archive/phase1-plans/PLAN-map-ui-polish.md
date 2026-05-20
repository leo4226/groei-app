# 🌱 Groei — Feature Plan: Map UI Polish

**Goal:** Fix a batch of small-but-annoying interaction and rendering issues on the map view that have accumulated. Each item below is independent — these can land as separate PRs or in one session.

**Depends on:** existing `MapView`, `PlantMarker`, `ObjectShape`, and sheet components.

---

## 1. Show plant name, not container name

**Problem:** When a plant lives in a container (e.g. Oleander in Terracotta pot, Framboos in Round pot), the label rendered on the map reads `"Terracotta pot"` or `"Round pot"` — the container's name. What should render is the *plant* name.

**Fix:**
- In the map layer render loop, the label for any position on the map should come from the plant living there, not the container. If multiple plants sit in one container, show the plant name(s); the container itself shouldn't render its own text label at all when it's a "planted" container.
- Only show the object's own name as a label when the object is empty (no plants inside).
- Keep the object name accessible in the edit sheet and plant list — just don't print it over the map.

**Implementation sketch:**
```tsx
// In the map render — simplified
const labelForObject = (obj: MapObject, plantsInside: Plant[]) => {
  if (plantsInside.length === 0) return obj.name;      // empty pot
  if (plantsInside.length === 1) return plantsInside[0].name;
  return `${plantsInside[0].name} +${plantsInside.length - 1}`; // cluster
};
```

Tap-target behaviour: tapping the object still opens the *object* sheet (so you can edit the pot). Tapping the inner plant cluster opens the plant sheet. If they overlap visually, plant cluster wins the tap.

---

## 2. Double-tap → Remove button

**Problem:** There's no quick way to delete an object from the map. Currently requires opening the edit sheet.

**Fix:**
- **Double-tap** (or double-click on desktop) on any object or plant marker → shows an inline floating "Remove" button near it, plus a subtle red outline on the item.
- Tapping "Remove" → confirmation toast with Undo ("Removed Round pot · Undo"), then `DELETE /api/objects/:id` or `DELETE /api/plants/:id`.
- Tapping anywhere else dismisses the Remove button.
- Undo restores it via a `POST /api/.../restore` that the backend keeps for ~10s (soft-delete with a `deleted_at` timestamp, purged on next restore-window expiry).

**Edge case:** Deleting an object that has plants inside → the confirmation should mention it: *"Remove Round pot and 2 plants inside?"* with options *[Remove all]* / *[Move plants to ground]* / *[Cancel]*.

**Why double-tap and not long-press?** Long-press is already used for drag-to-reposition (see existing `PLAN.md` Step 6). Double-tap is free and feels natural for "do something to this specific thing."

---

## 3. Resizable plant icons

**Problem:** Objects (pots, planters) already support drag-corner resize. Plant icons are fixed-size. Want the same resize affordance for plants — useful for e.g. showing an established shrub vs a seedling at realistic scale.

**Fix:**
- Add a `display_radius_cm` field on `plants` (nullable — defaults to the existing fixed marker size).
- Tap-to-select a plant marker → show the same 4-corner resize handles used for objects.
- Dragging a corner updates `display_radius_cm` optimistically, debounced PATCH to the API.
- The care-status ring scales with it proportionally.
- Minimum: 10cm (keeps markers visible). Maximum: 400cm (big shrubs/trees like the fig).

**Data migration:**
```sql
ALTER TABLE plants ADD COLUMN display_radius_cm INTEGER;
-- NULL = use default marker size in the renderer
```

---

## 4. Label font size & contrast

**Problem:** Plant/object labels are inconsistently sized — some too big, some too small — and white text disappears over the cream/dotted "planting bed" fill.

**Fix — pick one of these two approaches; I lean toward option B:**

**Option A: Black text, sized relative to the marker/object.**
- Font size = `clamp(10px, markerRadius × 0.45, 16px)`
- Color: `#1f2937` (near-black) on all backgrounds
- Drop-shadow / text outline: `paint-order: stroke; stroke: rgba(255,255,255,0.85); stroke-width: 3px;` — gives a soft white halo so it's legible on both dark deck and light bed.

**Option B (recommended): Single fixed-size label with halo, positioned below the marker.**
- Fixed `12px` font (the map already has plenty of signal in marker size & color; labels should be quiet).
- Black text with white halo as above.
- Always below the marker, not centered on it — means it never overlaps the care-status ring.
- Long names: truncate at 14 chars with `…` (tapping the marker still shows full name in the sheet).

Option B is what Google Maps / Apple Maps do and it scales much better when the map gets busy. Your current issue (white text disappearing on white background) is solved purely by the halo; the size inconsistency is solved by fixing it at 12px.

**Implementation:**
```tsx
<text
  x={x}
  y={y + markerRadius + 14}
  textAnchor="middle"
  fontSize={12}
  fill="#1f2937"
  style={{
    paintOrder: 'stroke',
    stroke: 'rgba(255,255,255,0.9)',
    strokeWidth: 3,
    strokeLinejoin: 'round',
  }}
>
  {truncate(name, 14)}
</text>
```

---

## 5. Copy-paste plants

**Problem:** You often plant the same species in multiple spots (e.g. `bruine boon` planted twice). Currently re-entering all the fields is painful.

**Fix:**
- Plant sheet gets a **"Duplicate"** action (alongside Edit / Delete).
- Duplicating copies: name, species, type, watering interval, season multipliers, notes, photo reference, `display_radius_cm`. Does **not** copy: position, container, care log, unique id.
- After duplication, the new marker appears at the map center with a subtle pulse animation and immediately enters drag mode — the user positions it and lifts their finger to place.
- Optional: on the map, long-press + "Duplicate here" from a floating menu also works — creates the duplicate at the pointer location directly.

**API:**
```
POST /api/plants/:id/duplicate
Body: { x?: number, y?: number, container_id?: string }
Returns: new plant
```

If no position/container given, backend leaves them null and frontend places the marker at viewport center.

---

## Claude Code Session Starter

```
Read PLAN-map-ui-polish.md.

We're adding five small UI improvements to the Groei map:
1. Label shows plant name (not container name) when a plant lives in a container
2. Double-tap an object/plant → floating Remove button with undo
3. Plant markers become resizable via corner drag (like objects already are)
4. Fix label font: 12px, black with white halo, positioned below marker
5. Duplicate action on plant sheet, places copy in drag mode at map center

All five are independent — land them as separate commits. Don't touch the sun
overlay or the base garden_background.svg. Start with (1) and (4) since they're
the most visible daily-use issues, then (2), (3), (5) in any order.

For (3), add the `display_radius_cm` column migration first.
```
