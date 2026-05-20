# Sun Calibration — Hoofdweg 358 Garden

## Garden orientation

| SVG edge | Compass bearing | Real-world feature |
|----------|----------------|--------------------|
| Left     | WNW ≈ 292°     | House / Hoofdweg   |
| Right    | ESE ≈ 112°     | Back fence / Mercatorstraat |
| Top      | NNE ≈ 22°      | Brick wall         |
| Bottom   | SSW ≈ 202°     | Wooden fence       |

`GARDEN_SVG_TOP_AZIMUTH = 22` in `gardenStructures.ts` encodes the top-edge bearing.
The shadow formula `(azimuthDeg − GARDEN_SVG_TOP_AZIMUTH)` converts compass to SVG angle.

## Validation timestamps

These four photos established the shadow geometry:

| Timestamp (local) | Solar azimuth | Solar altitude | Expected shadow direction |
|---|---|---|---|
| 2026-04-19 10:04 CEST | ≈ 113° (ESE) | ≈ 30° | Toward house (SVG-left) |
| 2026-04-19 11:02 CEST | ≈ 135° (SE)  | ≈ 38° | Toward house-brick corner |
| 2026-04-19 13:15 CEST | ≈ 171° (near S) | ≈ 48° | Toward brick fence (SVG-top) |
| 2026-04-22 09:40 CEST | ≈ 107° (ESE) | ≈ 28° | Toward house (SVG-left) |

## Using `?debug=sun`

Open the app with `?debug=sun` appended to the URL. The overlay shows:

- **Yellow arrow** — sun direction from garden centre
- **Grey dashed arrow** — shadow direction (opposite)
- **Compass rose** (top-left of garden) — N is rotated 22° CCW from SVG-top
- **Blue dots** — shadow tip of each caster at the current sun position
- **Time picker** (bottom-left) — pick any date/time for spot-checking

Combine with a URL timestamp for reproducible checks:
```
?debug=sun&t=2026-04-19T13:14:52+02:00
```
Expected at 13:15: yellow arrow points down-right (toward back fence / SSW), grey arrow
points up-left (toward brick fence / NNE, i.e. SVG-top).

## Photo-match procedure

1. Open the app at the timestamp of the reference photo.
2. Enable `?debug=sun`.
3. Compare the grey shadow arrow with the actual shadow direction in the photo.
4. If the grey arrow is off by angle θ, adjust `GARDEN_SVG_TOP_AZIMUTH` by −θ
   (rotate CCW to fix a CW error in the rendered shadow).
5. Re-run `npm test` to confirm the regression tests still pass.
