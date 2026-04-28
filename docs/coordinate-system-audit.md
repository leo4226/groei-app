# Coordinate System Audit — Hoofdweg 358 Garden App

**Date:** 2026-04-23  
**Status:** Complete — no code was changed during this investigation.  
**Feeds into:** `PLAN-sun-model-correction.md`

---

## 1. Raw SVG File

### Answer

The garden SVG canvas is **square: `0 0 680 680`**. The garden content within it is
portrait-shaped: the usable garden area spans x=157–438 (width 281 px ≈ 6.1 m) and
y=55–640 (height 585 px ≈ 12.7 m), making the content roughly 2.1× taller than wide.

There are **three copies** of the same file (source, backend static, and build output):

| Role | Path |
|------|------|
| Source (canonical) | `groei/frontend/public/maps/garden_background.svg` |
| Backend static | `groei/backend/static/maps/garden_background.svg` |
| Build output | `groei/frontend/dist/maps/garden_background.svg` |

There is **one SVG file** — no separate file for structures vs. the garden outline.

### Key coordinate ranges

| Feature | SVG coordinate | Numeric range |
|---------|----------------|---------------|
| Back fence (far end) | top edge, `y=55` | y ≈ 55 |
| House wall (near end) | bottom edge, `y=626` | y = 626, bottom of wall y=640 |
| Brick wall (NNE side) | left edge, `x=157` | x = 157 |
| Wooden fence (SSW side) | right edge, `x=438` | x = 438 |

**File citation — `groei/frontend/public/maps/garden_background.svg`:**
```xml
<!-- line 1 -->
<svg width="100%" viewBox="0 0 680 680" xmlns="http://www.w3.org/2000/svg">

<!-- lines 17–21: embedded orientation comment -->
<!-- Perspective: looking out from the house       -->
<!-- Bottom = house wall + doors                   -->
<!-- Top = back fence + shed + tree                -->
<!-- Left = brick wall, Right = fence              -->

<!-- line 25: back fence at y=55 -->
<line x1="162" y1="55" x2="438" y2="64" stroke="rgba(222,220,209,0.4)" .../>

<!-- line 55: house wall at y=626 -->
<rect x="162" y="626" width="276" height="14" ... fill="#262624"/>
```

---

## 2. Render-time Transforms

### Answer

The rendering component is **`groei/frontend/src/components/map/MapView.tsx`**.

A wrapper `<div>` (lines 358–366) applies a **90° clockwise CSS rotation** around the
centre of the viewport. Critically, the div also **swaps its own width and height**
(`width: ch, height: cw` where `ch`/`cw` come from the container's measured
client-height and client-width), so the element is already physically landscape-shaped
before the rotation is applied.

```tsx
// MapView.tsx lines 358–366
<div
  style={{
    position: 'absolute',
    top: '50%',
    left: '50%',
    width: ch,       // ← container height used as width
    height: cw,      // ← container width used as height
    transform: 'translate(-50%, -50%) rotate(90deg)',
  }}
>
```

The `<svg>` element inside that div (line 386) carries a **portrait** viewBox:

```tsx
// MapView.tsx line 388
viewBox={`${GARDEN_CLIP.x - 15} ${GARDEN_CLIP.y - 15} ${GARDEN_CLIP.width + 30} ${GARDEN_CLIP.height + 30}`}
// = "142 40 315 615"  (315 wide × 615 tall — portrait)
```

After the CSS `rotate(90deg)`, the directions are:

| SVG edge | Compass direction | Rendered map edge |
|----------|------------------|-------------------|
| top (y=55) | ESE back fence ≈ 112° | **right** |
| bottom (y=626) | WNW house ≈ 292° | **left** |
| left (x=157) | NNE brick wall ≈ 22° | **top** |
| right (x=438) | SSW wooden fence ≈ 202° | **bottom** |

The background garden SVG is loaded as an `<image>` tag inside the SVG element
(MapView.tsx line 398), so it is rotated together with everything else:

```tsx
return <image href={`/maps/${map.svg_file}`} x="0" y="0" width={w} height={h} />
```

### Counter-rotations applied to keep text readable

Because the parent rotates 90° CW, child elements that need to appear upright apply
`rotate(-90)`:

| Location | Purpose |
|----------|---------|
| `MapView.tsx:375` | Zone name hover banner |
| `MapView.tsx:500` | Floating "Remove" button |
| `FixedPlantsLayer.tsx:65` | Fixed-plant label text |
| `DebugSvfOverlay.tsx:81` | SVF debug info box |

### Coordinate re-projection

`groei/frontend/src/utils/svgCoords.ts` provides `screenToSVG()` (line 5) which uses
`svg.getScreenCTM().inverse()` — this automatically accounts for the CSS rotation via
the browser's transform matrix, so click → SVG coordinate conversion is correct in the
current setup. No manual `useTransform`-style hook exists.

---

## 3. Shadow Math

### Answer

**`getShadowVector`** lives in `groei/frontend/src/utils/shadowGeometry.ts`, lines 28–43.

```ts
// shadowGeometry.ts line 36
const svgAngleRad = (azimuthDeg - 90) * Math.PI / 180

// lines 39–40: shadow direction (opposite of sun)
const dx = -shadowLenPx * Math.sin(svgAngleRad)
const dy =  shadowLenPx * Math.cos(svgAngleRad)
```

The **`- 90` offset** implements the mapping documented in the comment above the
function (lines 14–26):

> Garden SVG orientation: top=East, bottom=West, left=North, right=South.

So the code's mental model is: **SVG-top (y=55) points due East (compass 90°)**.

**Reality from the photo analysis:** SVG-top is the back fence, which points
**ESE ≈ 112°**, not 90°. The code is off by ≈ 22°. (This is the fix targeted by
`PLAN-sun-model-correction.md` Fix 2.)

### How `computeShadows()` output is consumed

`computeShadows()` returns `ShadowPolygon[]` (paths computed entirely in raw SVG
coordinates). They are passed unchanged to `<ShadowLayer>` at MapView.tsx:403 — no
additional transform is applied before drawing. The polygons live in the same coordinate
frame as the casters and are rotated together with the entire SVG wrapper.

```tsx
// MapView.tsx line 402–404
{sunModeActive && shadows && shadows.length > 0 && (
  <ShadowLayer shadows={shadows} />
)}
```

`computeShadowRegions()` (shadowGeometry.ts:176) is used for heatmap hit-testing and
`getSunFraction()` (line 229). Both operate in raw SVG coordinates — the same frame as
the casters. No post-transform conversion happens before the hit-test.

---

## 4. Plant + Caster Coordinates

### Answer

**Yes, plants and casters share the same coordinate frame**: raw SVG pixels,
`PX_PER_CM = 0.46` (46 px = 1 m).

Plants are stored in the database as `map_x` / `map_y` columns (raw SVG coords).
The database record for the garden map confirms:

```python
# groei/backend/database.py (maps seed insert)
VALUES (1, 'Garden', 'garden', 'garden_background.svg', '0 0 680 680',
        '{"px_per_meter": 46, "origin_x": 162, "origin_y": 54}', 0)
```

**No coordinate migration was found.** The current portrait coordinates are the
original coordinate system — the CSS `rotate(90deg)` has always been the rotation
mechanism, applied at render time only.

`gardenStructures.ts:5` records `GARDEN_CLIP = { x: 157, y: 55, width: 285, height: 585 }`,
consistent with the SVG geometry (portrait-shaped clip region).

There are no migration files, comments, or git messages describing a prior coordinate
rotation. The PLAN-viewport-fit-and-rotation.md planning document mentions Option A
(coordinate migration) as a future option but records the current state as Option B
(CSS rotate), which was the initial implementation choice.

---

## 5. Specific Landmark Check

### `populier` — cx=180, cy=90

**Citation:** `gardenStructures.ts:148–149`

```ts
cx: 180,   // close to left/brick wall (x=157)
cy: 90,    // close to back fence (y=55)
```

Position in the **rendered landscape map** (after 90° CW CSS rotation):
- x=180 (near left, brick wall side) → maps to the **top** of the rendered viewport
- y=90 (near top, back fence side) → maps to the **right** of the rendered viewport

**`populier` appears in the top-right corner of the rendered map** — the corner where
the brick fence meets the back fence. This is the NNE–ESE corner, which matches the
real-world location of the poplar.

### `norway_spruce` — x=507

**Citation:** `gardenStructures.ts:82`

```ts
x: 507, y: 350, width: 184, height: 276,
```

`GARDEN_CLIP.x` range is 157–442 (= 157 + 285). At x=507 the caster is **65 px
beyond the right edge of the clip region**. After CSS rotate(90deg), the SVG right
(large x) maps to the rendered **bottom**. So the norway spruce extends **off the
bottom** of the rendered landscape map — off the wooden fence / SSW side.

This is intentional: the tree is in the southern neighbour's garden, outside our
clipped garden area.

### `right_fence_vegetation` — x=438

**Citation:** `gardenStructures.ts:124`

```ts
x: 438, y: 55, width: 4, height: 585,
```

x=438 is the right fence (wooden fence / SSW side). After CSS rotate(90deg), SVG-right
maps to rendered **bottom**. So the vegetation sits along the **bottom edge of the
rendered landscape map**, which is the wooden fence / SSW side. This matches the
real-world location (dense bamboo/ivy on the SSW fence).

---

## 6. Shadow Direction Spot-Check at 2026-04-19 13:14:52

### What the math predicts (no visual inspection required for this one)

At 13:15 CEST on 19 Apr, the sun is approximately:
- **Azimuth ≈ 171°** (near due south, slightly west of south)
- **Altitude ≈ 48°**

Using `getShadowVector` with `(azimuthDeg - 90) = 81°`:
```
svgAngleRad = 81° * π/180 ≈ 1.413 rad
dx = -shadowLen * sin(81°) ≈ -shadowLen * 0.988   (strong negative X = toward SVG left)
dy =  shadowLen * cos(81°) ≈  shadowLen * 0.156   (slight positive Y = toward SVG bottom)
```

In the raw SVG: shadows point strongly toward **SVG-left (x decreasing, toward brick
wall x=157)** with a small component toward SVG-bottom (house side).

After CSS rotate(90deg): SVG-left → rendered **top**. So the rendered shadow arrows
point **toward the top of the rendered map, which is the brick fence (NNE) side** —
with a slight component toward the right (back fence side).

**This matches the real-world expectation**: at 13:15 the sun is nearly due south
(≈ 171°), so shadows fall approximately NNW. The brick fence is NNE (≈22°), close
enough to "north" that the shadows land near that side. The prediction is consistent
with the photo taken at 13:15.

**TODO: needs visual check** — Confirm by running `npm run dev`, setting
`new Date('2026-04-19T13:14:52+02:00')` as the sun time, and verifying the shadow
polygons fall toward the top-of-screen (brick fence) side. The math strongly predicts
this; a screenshot would close the loop.

---

## ⚠ Critical Discrepancy: Plan's H=695 vs SVG canvas H=680

The correction plan (`PLAN-sun-model-correction.md`, Fix 1c) uses **H = 695**,
derived as "55 + 640" (y_back_fence + y_house_wall_bottom). The SVG canvas height is
**680**, not 695.

The rotation formula for a rect is `(x, y, w, h) → (H - y - h, x, h, w)`. With H=680
(canvas height):

```
GARDEN_CLIP: (157, 55, 285, 585) → (680-55-585, 157, 585, 285) = (40, 157, 585, 285)
```

But the plan states the result should be `(55, 157, 585, 285)`, which requires H=695.

Using H=695 shifts all coordinates by 15 px and produces a new canvas that is 695×680
(no longer square). The plan's examples check out *if H=695 is used consistently*, so
the plan author may have intentionally chosen H=695 to preserve the same 55 px margin
at both ends of the garden. **Confirm the intended H before executing Fix 1c.**

Options:
- **H=680** (canvas height): keep the SVG square `0 0 680 680`, garden clip starts at x=40
- **H=695** (plan's value): new canvas becomes `0 0 695 680`, garden clip starts at x=55 (symmetric margins)

Either is valid; the plan's hand-computed numbers assume H=695.

---

## Current Coordinate Model in One Paragraph

The garden SVG (`garden_background.svg`) has a square canvas `0 0 680 680`. The garden
content is portrait-shaped within that square: the back fence is at y=55 (top), the
house wall is at y=626 (bottom), the brick/NNE wall is at x=157 (left), and the
wooden/SSW fence is at x=438 (right). To display the garden in landscape orientation,
`MapView.tsx` wraps the `<svg>` in a div that is dimensioned landscape (width=ch,
height=cw) and applies `rotate(90deg)` CSS. This makes SVG-left (brick fence, NNE,
≈22°) appear at the rendered top, SVG-right (wooden fence, SSW) at the bottom,
SVG-top (back fence, ESE, ≈112°) at the rendered right, and SVG-bottom (house, WNW)
at the rendered left. All coordinate data — plant `map_x`/`map_y` in the database,
shadow casters in `gardenStructures.ts`, and shadow geometry in `shadowGeometry.ts`
— live in this raw portrait SVG frame; no coordinate transform is applied before
storage or computation. `getShadowVector` corrects for orientation via the constant
`(azimuthDeg - 90)`, which assumes SVG-top points due East (90°); the true bearing is
ESE (≈112°), an error of ≈22° that the correction plan addresses by parameterising
this offset as `GARDEN_SVG_TOP_AZIMUTH`. The fix goal is to bake the 90° rotation into
the SVG file itself and remove the CSS rotation, so that the file, the caster
coordinates, and the rendered view all share one landscape frame — eliminating the
counter-rotations and the hidden orientation assumption in shadow math.
