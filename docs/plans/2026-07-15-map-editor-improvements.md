# Map editor — improvement plan

Origin: full editor audit (2026-07-15). Leon's mother finds the editor hard;
Leon flagged that shadow objects couldn't be resized and that plant-on-plant
shade isn't modelled.

**Shipped in the audit PR** (context for what remains):
- **#1 Resize handles for shadow objects** — `EditorResizeOverlay` generalised
  to a bounding box; rect + circle shadow casters now drag-resize on the canvas.
- **#6 Download the garden as a framed PNG** — `utils/mapExport.ts`, action in
  the map top-bar menu.

This doc specs the four larger items (#2–#5) plus two fast-follows.

---

## #2 — Manual per-plant sun exposure (highest realism win)

**Problem.** The sun heatmap is derived only from fences, structures, raised
beds and manually-added shadow casters (`deriveAllShadowCasters`). Plants never
cast shade, so roses tucked under tall perennials read as full sun. No model
beats the gardener's own observation.

**Design.** Add an optional **measured sun** override on a plant that, when set,
takes precedence over the modelled heatmap everywhere sun fit is shown
(`getSunFit`, `PlantMarker`, `PlantQuickSheet`, `GrowHereSheet`).

- **Data.** New nullable column `plants.measured_sun_hours REAL` (Alembic
  migration). `NULL` = use the model.
- **API.** Extend the existing plant update endpoint; no new route. Return the
  field in `PlantOut`.
- **UI.** In `PlantQuickSheet` sun row, a small "Measured?" control: a 0–8h
  chip row or stepper ("How many hours of direct sun does this spot really
  get?"). Setting it shows a "measured" badge; clearing reverts to modelled.
- **Fit logic.** `getSunFit(sunRequirement, measured ?? modelledHours)`. When
  `measured` is set, the plant marker uses it and labels the source ("measured"
  vs "estimated") so the map is honest.

**Effort:** S–M (one column, one sheet control, thread through fit). **Ships
independently.**

## #3 — Auto shade from plant height (model, do after #2)

**Problem.** Same as #2 but automatic: tall plants should shade shorter
neighbours without the user marking anything.

**Design.** We already generate `max_height_cm` in phenology. At heatmap build
time, emit a soft, low-opacity **circle shadow caster** for every plant whose
`max_height_cm` exceeds a threshold (e.g. >120 cm), radius ≈ canopy from growth
form, `heightCm = max_height_cm`, `excludeSelf = true` so a plant doesn't shade
itself. Feed these into `deriveAllShadowCasters` (view-time only — not persisted
to `canvas_data`).

- **Risks.** Double-counting with #2 (manual override wins — gate auto-shade off
  when `measured_sun_hours` is set). Performance: N extra casters in the SVF
  ray-march; cap and cache. Growth-form → canopy radius table needs tuning.
- **Toggle.** Ship behind a per-map setting ("estimate plant shade") default off
  until validated against real gardens.

**Effort:** M–L. **Depends on #2 landing first** (shared "source of truth" rule).

## #4 — Starter templates + first-run wizard (biggest "less work" lever)

**Problem.** The blank canvas is the scariest moment; the compass bearing (that
the heatmap needs) lives on a separate settings page and is easily skipped.

**Design.** Replace the empty-canvas cold start with a short wizard on first
open of a new map:

1. **Name** (already collected at creation — skip if present).
2. **Shape**: pick a starter — Rectangle, L-shape, Balcony/narrow, or "Draw my
   own". Selecting one seeds `zones` with a filled outline sized to step 3.
3. **Size**: width × depth in metres → sets `scale_px_per_m` and the template
   dimensions.
4. **Orientation**: point "up" to north (the compass control currently in Map
   Settings, moved inline). Writes `bearing`.

Then the editor opens already useful, with the bearing captured. Templates are
pure client-side `EditorZone[]` factories; no backend.

**Effort:** M. Reuses `NewMapModal`, `CompassBearingPicker`, and the editor
reducer. **Removes the top UX complaint.**

## #5 — Photo / satellite trace underlay (fun + accuracy)

**Problem.** Drawing an accurate outline freehand is hard.

**Design.** Let the user drop a screenshot (Google Maps satellite, a hand
sketch) as a faint, locked background layer in the editor to trace over.

- **Data.** Store the image in R2 (reuse `services/storage`), keep
  `underlay_url` + a transform (scale/opacity/offset) in `canvas_data`.
- **UI.** "Add background" in the legend panel → upload → a semi-transparent
  `<image>` behind all zones, with an opacity slider and a lock toggle so it
  isn't selected while drawing. A calibration step (drag a known 1 m / fence
  length) aligns scale.
- **Privacy.** Underlay is per-map, never shown on the public share page.

**Effort:** M–L (upload + transform UI + calibration). **Independent.**

---

## Fast-follows (small, from the audit)

- **Object resize on canvas.** Placed pots/furniture (`MapObject`) still resize
  only via presets. They're center-anchored and rotatable, so a corner-drag
  needs to resolve the AABB against `object.rotation` and write back cm
  (`diameter_cm` / `width_cm` / `depth_cm`) via `client.objects.update`. Do the
  unrotated case first (rotation = 0), fall back to numeric for rotated.
- **Read-only shared garden link.** Like the field-journal `/s/{token}` pages:
  a public, non-editable render of a garden to show off (or hand to family)
  without edit access. Pairs naturally with the PNG download (#6).
- **Editor i18n.** The editor still has baselined hardcoded Dutch
  ("Bekijken →", "Meer", "Rondleiding", the fence confirm dialog, "Schaduw
  objecten", "Buiten canvas"). Translate when next touching those files and
  drop them from `eslint.i18n.config.js`.

## Suggested order

#2 (measured sun) → #4 (wizard + templates) → object-resize fast-follow →
#5 (photo underlay) → #3 (auto plant shade) → shared garden link.
