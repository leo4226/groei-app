# Shadow Caster Panel Redesign

**Date:** 2026-05-14  
**Status:** Approved

## Problem

The `ShadowCasterPropertiesPanel` exposes raw pixel coordinates and two confusingly named "Hoogte" fields, making it impossible for non-technical users to place external shadow casters correctly. The opacity/density control is a raw 0–1 slider with no guidance. Static hardcoded shadow casters in the DB (`own_building`, `neighbours_building`, three trees) bypassed the editor entirely and have been removed.

## Goals

1. Replace raw pixel inputs with human-readable metre values and a direction picker for external buildings.
2. Eliminate the dual-"Hoogte" confusion with a single number input.
3. Replace the raw opacity slider with three labelled presets.
4. Fix the visual opacity spread so presets look meaningfully different from each other.
5. Enable any user (not just Leon) to configure shadow casters for their own garden without understanding the SVG coordinate system.

## Out of scope

- Adding tree shadow casters directly to the canvas as a new zone type (future work).
- Polygon shadow casters.
- Shadow caster placement for indoor maps.

---

## Architecture

### Data model — no changes

`ShadowCaster` in `types/index.ts` stays unchanged. All storage is in `canvas_data.shadowCasters[]`. The panel converts between human-readable metres/direction and raw SVG pixel coordinates at read/write time — no new fields on the type.

### New prop: `gardenBounds`

`ShadowCasterPropertiesPanel` gains one new required prop:

```ts
gardenBounds: { minX: number; minY: number; maxX: number; maxY: number }
```

Passed down from `LayoutEditorPage` (which already computes it via `deriveGardenBounds`). Used to:
- Detect which side of the garden a rect caster is closest to → drives the Kant dropdown.
- Convert Afstand + Breedte + Diepte → raw x/y/width/height on save.

### Direction ↔ pixel coordinate conversions

**Kant detection** (for display):
- `x + width < gardenBounds.minX` → Links
- `x > gardenBounds.maxX` → Rechts
- `y + height < gardenBounds.minY` → Boven
- `y > gardenBounds.maxY` → Onder
- Falls inside garden or straddles boundary → default to Links

External buildings almost always span the full garden side (and beyond), so only two spatial inputs are needed: **Afstand** (gap between building and garden) and **Dikte** (building thickness perpendicular to the garden edge). The building's span along the garden side is auto-computed as `3 × garden dimension` centered on the garden — large enough to never clip a shadow angle.

**Pixel → metres** (for display):
- Links: `afstand = (gardenBounds.minX - (x + width)) / scalePxPerM`, `dikte = width / scalePxPerM`
- Rechts: `afstand = (x - gardenBounds.maxX) / scalePxPerM`, `dikte = width / scalePxPerM`
- Boven: `afstand = (gardenBounds.minY - (y + height)) / scalePxPerM`, `dikte = height / scalePxPerM`
- Onder: `afstand = (y - gardenBounds.maxY) / scalePxPerM`, `dikte = height / scalePxPerM`

**Metres → pixels** (on user edit — building auto-spans full garden side × 3):
- Links: `width = diktePx`, `x = gardenBounds.minX - afstandPx - diktePx`, `height = gardenH × 3`, `y = gardenCenterY - height / 2`
- Rechts: `width = diktePx`, `x = gardenBounds.maxX + afstandPx`, `height = gardenH × 3`, `y = gardenCenterY - height / 2`
- Boven: `height = diktePx`, `y = gardenBounds.minY - afstandPx - diktePx`, `width = gardenW × 3`, `x = gardenCenterX - width / 2`
- Onder: `height = diktePx`, `y = gardenBounds.maxY + afstandPx`, `width = gardenW × 3`, `x = gardenCenterX - width / 2`

Where `gardenW = maxX - minX`, `gardenH = maxY - minY`, `gardenCenterX/Y` = garden center.  
All pixel values rounded to nearest integer before calling `onUpdate`.

---

## Panel UI — Gebouw

```
Type:   [ Gebouw ]  [ Boom ]

Naam:   [ Buurman's huis          ]

Kant:   [ Links ▼ ]
Afstand van tuin: [ 2.0 ] m
Dikte:            [ 8   ] m   ← building thickness (depth away from garden)

Hoogte: [ 7.0 ] m

Schaduw:  [ Lichte boom ]  [ Dichte boom ]  [ Gebouw / Muur ]
                                                    ↑ active

[ Verwijderen ]
```

- **Kant** dropdown: Links / Rechts / Boven / Onder — auto-detected from current pixel position on first render.
- **Afstand, Breedte, Diepte** — `<input type="number" step="0.5" min="0">` in metres; convert on `onChange`.
- **Hoogte** — `<input type="number" step="0.5" min="0.5" max="30">` in metres; converts to `heightCm` on save.
- **Schaduw presets** — three buttons; active preset highlighted with primary colour. Selecting a preset sets `opacity` immediately via `onUpdate`. Active preset detected from current opacity value (nearest match).

## Panel UI — Boom

```
Type:   [ Gebouw ]  [ Boom ]

Naam:   [ Spar                    ]

X: [ 5.8 ] m     Y: [ 11.0 ] m
Straal: [ 1.7 ] m

Hoogte: [ 14.0 ] m

Schaduw:  [ Lichte boom ]  [ Dichte boom ]  [ Gebouw / Muur ]
          ↑ active

[ Verwijderen ]
```

- **X / Y** — `cx / scalePxPerM` and `cy / scalePxPerM`; edits convert back to px on `onChange`.
- **Straal** — `radius / scalePxPerM`; min 0.5m.
- X/Y are relative to SVG canvas origin (same as before, now shown in metres with clear unit label).

---

## Dichtheid presets

| Label | opacity value | Heatmap block factor | Visual alpha (× 0.35) |
|---|---|---|---|
| Lichte boom | 0.25 | 25% | ~0.09 |
| Dichte boom | 0.60 | 60% | ~0.21 |
| Gebouw / Muur | 1.00 | 100% | ~0.35 |

Active preset is the nearest match: `< 0.4` → Lichte boom, `0.4–0.8` → Dichte boom, `> 0.8` → Gebouw.

---

## Visual opacity fix

Two changes to clean up the rendering chain:

**`shadowGeometry.ts`** — remove the `Math.min(caster.opacity, 0.65)` render-cap added earlier (it was a workaround; presets now control density explicitly).

**`ShadowLayer.tsx`** — change multiplier from `0.4` → `0.35`:
```tsx
fill={`rgba(20, 40, 70, ${s.opacity * 0.35})`}
```

This gives Gebouw/Muur a visible alpha of 0.35 (was 0.40 pre-session, now correct for the preset range).

---

## Files changed

| File | Change |
|---|---|
| `components/editor/ShadowCasterPropertiesPanel.tsx` | Full rewrite of position/size/height/opacity controls |
| `pages/LayoutEditorPage.tsx` | Pass `gardenBounds` prop to `ShadowCasterPropertiesPanel` |
| `utils/shadowGeometry.ts` | Remove `Math.min(opacity, 0.65)` cap from rect/polygon compute functions |
| `components/map/ShadowLayer.tsx` | Multiplier `0.4` → `0.35` |

No backend changes. No type changes.

---

## Static data migration

The 5 hardcoded shadow casters (`own_building`, `neighbours_building`, `norway_spruce`, `populier`, `populier_canopy`) were removed from the Tuin map's `canvas_data.shadowCasters` on 2026-05-14. They will be recreated via the editor after the panel is shipped.
