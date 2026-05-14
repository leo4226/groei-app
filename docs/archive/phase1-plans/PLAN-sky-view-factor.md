# 🌱 Groei — Feature Plan: Sky View Factor (Diffuse Light) Layer

**Goal:** Add a second light-availability layer that measures how open the sky is above each point on the map, so "0h direct sun" spots can still be distinguished as *bright shade* vs *deep shade* for plant-matching purposes.

**Depends on:** `PLAN-sun-model-correction.md` (must be landed and validated first — the SVF layer reuses the same shadow-caster geometry, so it needs to be correct before SVF is meaningful).

---

## The problem

The current zonkaart reports direct beam sun hours per cell. This is the standard horticultural metric and matches how nurseries label plants ("full sun 6+ hrs"). But it collapses two very different situations into the same `0h` value:

- **Bright shade** — a spot with open sky overhead but no direct sun (e.g. the middle bed, blocked from direct sun by the neighbour's building but with most of the hemisphere visible)
- **Deep shade** — a spot with both the sun's path and most of the sky blocked (e.g. directly under the poplar canopy, or in the narrow gap behind the shed)

Plants respond very differently to these. Hostas, ferns, heucheras, Japanese maples, and most woodland species thrive in bright shade on diffuse + reflected light. The same plants struggle in deep shade. Our current model can't tell Leon which is which.

## The metric: Sky View Factor (SVF)

SVF is the fraction of the upper hemisphere, as seen from a given point, that is unobstructed by solid geometry. Range: `0.0` (fully enclosed) to `1.0` (open field, no obstructions anywhere).

Properties that make it a good fit here:

- **Time-independent.** Computed once per cell per map. No azimuth, no altitude, no date. Cacheable indefinitely until the map geometry changes.
- **Reuses existing ray-casting.** The sun model already casts rays from each cell toward the sun position and tests intersection with shadow-caster geometry (house, shed, fence, neighbour's building, poplar, Norway Spruce). SVF uses the exact same intersection test — just with a different set of ray directions (a hemisphere sample, not a single sun vector).
- **Proxy for diffuse PAR.** Under a uniformly overcast sky (the Amsterdam default), incoming radiation at a point scales roughly linearly with SVF. Under clear sky it's less linear but still monotonic.
- **Well-understood.** Standard in urban-climate research, green-roof design, and solar-access analysis. Not experimental.

## Sampling strategy

We sample `N` rays pointing up into the hemisphere and count the fraction that escape without hitting any shadow-caster mesh.

**Two weighting options:**

1. **Uniform** — rays distributed evenly over the hemisphere by solid angle. Gives the geometric SVF. Simple, unambiguous.
2. **Cosine-weighted** — rays weighted by `cos(zenith)`, because radiation from near the horizon contributes less per unit solid angle than radiation from overhead (Lambert's law). This matches incident diffuse flux on a horizontal surface and is the more physically meaningful number for plants.

Recommendation: **cosine-weighted**, and call it "sky openness" in the UI (plain-language term, avoids the jargon). Store the uniform SVF too if it's cheap — useful for debug.

**Sample count:** 64 rays per cell is the sweet spot. A Fibonacci lattice over the hemisphere gives well-distributed samples without clustering artifacts. At 64 rays × ~2000 cells × ~15 shadow-caster meshes, the full map computes in well under a second in a Web Worker.

**Ray generation** (Fibonacci lattice on the hemisphere, cosine-weighted):

```ts
function cosineHemisphereSamples(n: number): Vec3[] {
  const samples: Vec3[] = [];
  const goldenAngle = Math.PI * (3 - Math.sqrt(5));
  for (let i = 0; i < n; i++) {
    const y = 1 - (i / (n - 1)); // 1 at top, 0 at horizon — cosine weighting via z-stratification
    const radius = Math.sqrt(1 - y * y);
    const theta = goldenAngle * i;
    samples.push({
      x: Math.cos(theta) * radius,
      y: Math.sin(theta) * radius,
      z: y, // up
    });
  }
  return samples;
}
```

## Data model

New column on the existing sun-grid cells table (or wherever the heatmap cache lives):

```sql
ALTER TABLE sun_grid_cells ADD COLUMN sky_openness REAL;
-- 0.0 to 1.0, cosine-weighted SVF. NULL = not yet computed.
```

If the sun grid is recomputed client-side and not cached server-side, add `skyOpenness: number` to the per-cell type and the JSON blob that ships to the frontend.

SVF is invalidated only when shadow-caster geometry changes (trunk moved, height edited, new fixed plant added). It does **not** need recomputation when the date, time, or sun position changes.

## UI

Two approaches. I suggest shipping **both** and letting Leon pick.

### Approach A — separate toggle

A new layer toggle alongside the existing sun hours toggle:

```
[ ] Direct sun hours
[ ] Sky openness
[ ] Suitability (existing composite)
```

When "Sky openness" is on, render a heatmap using a different palette from the Magma sun heatmap so they're never visually confused. **Viridis** (blue-green-yellow) reads as "light availability" without competing with the Magma sun palette. Legend: `0.0 = fully enclosed → 1.0 = open sky`.

### Approach B — combined "light quality" view

A single derived heatmap that combines both signals into four buckets:

| Direct sun | Sky openness | Bucket | Color |
|---|---|---|---|
| ≥ 4 h | any | **Full sun** | Magma yellow |
| 2–4 h | any | **Part sun** | Magma orange |
| < 2 h | ≥ 0.5 | **Bright shade** | Light green |
| < 2 h | < 0.5 | **Deep shade** | Dark green |

This is the view that directly answers "what can I plant here?" and is probably the one Leon will use day-to-day. The separate toggles are for debugging and for understanding *why* a bucket came out the way it did.

Thresholds (2h, 4h, 0.5) should be constants at the top of the component so they're easy to tune after a season of observation.

## Validation

Same approach as the sun-model-correction plan: a `?debug=svf` mode.

- Click any cell on the map to see its computed SVF, the 64 sample ray directions, and which ones are blocked (red) vs clear (green) — rendered as small lines radiating from the clicked point.
- Sanity checks with expected values:
  - A cell in the open middle of the garden, mid-afternoon, with the poplar leafless: SVF should be high (~0.7+). The neighbours' building and his own roofline block the lower portions of the hemisphere but the zenith is clear.
  - A cell directly under the poplar trunk: SVF should be low (~0.15–0.3 depending on canopy density assumption).
  - A cell in the narrow corridor between the shed and the back fence: SVF should be low (~0.2), independent of sun position.
  - A cell on the back deck to the left of the shed, open to the south: SVF medium-high (~0.55).

If any of these are off, either the shadow-caster meshes are wrong (same bug class as the sun-model-correction plan) or the hemisphere sampling has a bug.

## Canopy density — deferred

The poplar is modeled as a solid mesh. In reality it's a bare-branched tree in April (low occlusion), leafing out in May, fully leafed June–October, bare again by December. SVF under the canopy changes significantly across the year.

For Phase 1 of this plan: treat all shadow casters as fully opaque. This gives correct SVF for leafless conditions and a worst-case (darkest) reading for leafed-out conditions.

For a future follow-up: add a `canopy_density_by_month: number[12]` field on the fixed_plant (0.0 = bare, 1.0 = fully opaque). During SVF ray-casting, a ray passing through a canopy mesh is stochastically blocked by its density rather than definitely blocked. This also feeds back into the direct sun model, so it's a cross-cutting change worth planning separately once Leon has observed a full growing season.

## Files touched

- `backend/migrations/NNNN_add_sky_openness.sql` — new column
- `backend/models/sun_grid.py` — include `sky_openness` in serialization
- `frontend/src/sun/skyViewFactor.ts` — new file, exports `computeSkyOpenness(cellCenter, obstructions)` and `cosineHemisphereSamples(n)`
- `frontend/src/sun/sunWorker.ts` — extend the worker to compute SVF in the same pass as direct-sun hours; emit both in the result payload
- `frontend/src/sun/SunOverlay.tsx` — add "Sky openness" layer toggle; add combined "Light quality" mode
- `frontend/src/sun/lightQuality.ts` — new file, exports `bucketFor(directHours, svf)` returning `'full' | 'part' | 'bright_shade' | 'deep_shade'`
- `frontend/src/sun/debugSvfMode.ts` — new file, visualizes rays from a clicked cell (guarded by `?debug=svf`)
- `frontend/src/sun/__tests__/skyViewFactor.test.ts` — unit tests: open cell → 1.0; fully enclosed → 0.0; half-blocked by a wall → ~0.5 cosine-weighted

## Suggested Claude Code session breakdown

**Session 1** — ray generation + unit tests. Get `cosineHemisphereSamples` and `computeSkyOpenness` working against a simple synthetic scene (one box obstruction) with numeric assertions. Don't touch the UI yet.

**Session 2** — wire into the sun worker. Compute SVF alongside direct-sun hours using the real garden geometry. Add `sky_openness` to the DB migration and the serialization. Confirm the values look sane by logging a few known cells.

**Session 3** — UI. Add the "Sky openness" layer toggle with Viridis palette. Add the combined "Light quality" four-bucket view with the table above.

**Session 4** — `?debug=svf` mode + photo-match validation. Leon clicks cells, confirms expected SVF values, tunes thresholds for the light-quality buckets based on what "bright shade" vs "deep shade" actually looks like in his garden.

---

## Claude Code session starter prompt

```
Read PLAN-sky-view-factor.md in full.

Prerequisites: PLAN-sun-model-correction.md must already be landed. The shadow-
caster geometry (poplar trunk position, heights, neighbour's building, etc.)
must be validated — SVF inherits whatever errors are in that geometry.

Start with Session 1 only: pure computation + unit tests. Create
frontend/src/sun/skyViewFactor.ts with cosineHemisphereSamples(n) and
computeSkyOpenness(cellCenter, obstructions). Use the Fibonacci lattice
approach from the plan. Write frontend/src/sun/__tests__/skyViewFactor.test.ts
with these cases:

1. Empty scene → SVF ≈ 1.0 (tolerance 0.02 at N=64)
2. Ground-plane-only (no obstructions above horizontal) → SVF ≈ 1.0
3. Cell fully enclosed in a cube → SVF ≈ 0.0
4. Cell adjacent to a tall vertical wall covering exactly half the hemisphere
   → cosine-weighted SVF ≈ 0.5 (tolerance 0.05 at N=64)
5. Ray count convergence: N=256 result within 0.02 of N=64 result for case 4

Reuse the ray-intersection code from the existing sun model. Don't duplicate
mesh-intersection logic. If the existing code isn't structured to be shared,
refactor it into a shared module first and update the sun model to use the
shared module. Don't touch the worker, DB, or UI in this session.

Stop after Session 1 tests pass. Leon will review and start Session 2 separately.
```
