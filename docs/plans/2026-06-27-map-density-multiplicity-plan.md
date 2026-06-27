# Map density & plant multiplicity — plan

> **Status:** Plan of approach (ready for execution)
> **Author:** design brainstorm with Leon, 2026-06-27
> **Goal:** Let the map represent *how many* of a plant you have, *where* they
> actually are (incl. opposite sides), and roughly *what age*, **without**
> overloading a canvas that is already busy at 20–30+ unique plants.

## 1. The problem (from the field)

Leon's outdoor garden rarely has a single specimen of a type — e.g. 6 ferns,
but the app is logged **once** so only one icon appears. Two distinct
real-world situations are conflated by today's "one plant record = one point":

1. **Abundance in one place** — several specimens clumped together. One icon
   under-represents how full that bed is. → a **quantity** problem.
2. **Spatial spread** — the same species on opposite sides of the garden,
   forcing an arbitrary choice of where the single icon goes. → a
   **placement / one-to-many** problem.

Add to this:

3. **Mixed age** — some specimens older/younger than the others. Today a record
   has a single `phase`, so a clump of mixed ages can't be expressed.
4. **Canvas is already crowded.** Even with unique plants, the map is busy.
   The two biggest space consumers are **per-plant name labels** and **per-plant
   care-warning badges** (see §3). Any multiplicity feature must *reduce* net
   clutter, not add to it.

## 2. Design principle: one shared "visual budget"

Labels, warning badges, and multiplicity hints all compete for the same scarce
space around each icon. Treat them as **one system**, with a strict hierarchy of
what may render on the canvas vs. what moves into the tap sheet
(`PlantQuickSheet`) / bottom sheet (`CareNeedsList`):

| Tier | Shows on canvas | Where the detail lives |
|---|---|---|
| Always | plant icon, status halo | — |
| On demand | name label, full warning list, exact count, per-specimen ages | tap sheet / bottom sheet |
| Subtle hint only | "has multiple" mark, single most-urgent warning | — |

The plan **declutters first** (labels, warnings), which frees the budget that
the multiplicity hints then spend.

## 3. Current implementation (grounding for executors)

- **Marker rendering:** `frontend/src/components/map/PlantMarker.tsx`
  renders, per plant: status halo, sun-fit ring, selection ring, the icon
  (`<image>`), the **name label** (`<text>` below the icon, gated by
  `showLabel`), a drag pill, and **alert badges** — every warning in
  `markerBadgesForPlant(plant)` is drawn as a small circle arced around the top
  of the icon. Multiple warnings ⇒ multiple badges per plant (the main warning
  clutter).
- **Orchestration:** `frontend/src/components/map/PlantsLayer.tsx` maps over
  `plants` and passes `showLabels` → `showLabel` to each marker.
  `displayName` comes from `plantDisplayName(plant, locale)`.
- **Label toggle already exists:** `MapPage.tsx` holds
  `const [showLabels, setShowLabels] = useState(true)` and passes it down.
  Default is **on**.
- **Data model (frontend):** `frontend/src/types/index.ts`
  - `Plant` (full) has `phase: 'seed'|'sprout'|'seedling'|'young'|'established'`,
    `map_x|map_y: number|null`.
  - `MapPlant` (map payload) has `map_x|map_y`, `warnings`, `top_warning`,
    `is_locked`, `display_radius_cm`, `icon_key`, etc. **No `quantity`,
    no `phase`** today.
  - `CreatePlantInput` (line ~130) carries `phase`, `map_x|map_y`, etc.
- **Map plant query (backend):** `backend/routers/maps.py`
  - `GET /maps/{slug}/plants` → SELECT at ~line 112.
  - `GET /maps/{slug}/items` → free-standing SELECT at ~line 149, contained
    SELECT at ~line 174. All three feed `enrich_plants(...)`.
  - **No `quantity` column exists** anywhere (`grep quantity` is empty).
- **Migrations:** Alembic, numbered, latest `alembic/versions/0026_*.py`. Next
  is `0027_*`. Prod runs `alembic upgrade head` on deploy; **dev branch must be
  migrated manually** (`alembic upgrade head` from `backend/`).
- **Add/edit forms:** `frontend/src/pages/AddPlant.tsx` (has a `phase`
  `SegmentedControl`; no quantity). Edit path: `frontend/src/pages/EditPlant.tsx`.
- **Tap sheet:** `frontend/src/components/sheets/PlantQuickSheet.tsx`.

## 4. Locked decisions (the "needs")

These are the defaults we are building to. Each is a deliberate choice to keep
the canvas calm and the logging effort low.

1. **Declutter labels first.** Names become **contextual**: hidden by default,
   shown for the **selected** plant, with the existing toggle repurposed to
   "show all names". (§Phase 1)
2. **Quantity is one number per record.** Add `quantity` (int, default 1). You
   still log once; you just type how many. (§Phase 2)
3. **Quantity is hinted subtly on the icon, exact count in the sheet.** When
   `quantity > 1`: a faint "stacked" silhouette behind the icon + a tiny count;
   nothing when `quantity = 1`. (§Phase 2)
4. **One representative age per record.** Keep the single `phase`. We do **not**
   track per-specimen age in the common case. Per-placement age is only possible
   via the advanced multi-placement feature. (§Phase 4)
5. **Warnings are capped on the canvas.** Show at most **one** badge per plant
   (the most-urgent); the full list stays in the tap sheet / `CareNeedsList`.
   Add an optional "warnings" visibility toggle. (§Phase 3)
6. **Spread is modelled as extra placements, not extra records.** A plant may
   have secondary placements (small dots) that open the same plant; each
   placement can optionally carry its own `phase`. Advanced / last. (§Phase 4)
7. **Quantity feeds biodiversity later.** The biodiversity score may use
   `quantity`, but that integration is a follow-up and must not block the
   visual MVP. (§Phase 5)

### Open questions for Leon (do not block Phase 1–2)
- **Q1 — selected-label behaviour:** when labels are off, is showing the name
  only for the *selected* plant enough, or do you also want labels to appear at
  high zoom? (Default we build: selected-only + manual "show all" toggle.)
- **Q2 — multiplicity glyph:** stacked-silhouette + tiny number (default) vs. a
  plain count badge "×6". We'll mock both in Phase 2 and pick.
- **Q3 — biodiversity weighting:** should 6 ferns count more than 1 toward the
  score, and if so, linearly or with diminishing returns? (Phase 5.)

## 5. Data model changes

### 5.1 `plants.quantity` (Phase 2)
- **Migration `0027_add_quantity_to_plants.py`:** add column
  `quantity INTEGER NOT NULL DEFAULT 1`.
- Backfill: default covers existing rows (all become 1).
- asyncpg note (see CLAUDE.md / #142): always pass `int` for this column, never
  a string/float.

### 5.2 `plant_placements` table (Phase 4 — advanced)
A plant's **primary** position stays on `plants.map_x/map_y` for backwards
compatibility. Additional positions live in a child table:

```
plant_placements
  id            INTEGER PK
  plant_id      INTEGER NOT NULL  -> plants.id (ON DELETE CASCADE)
  map_id        INTEGER NOT NULL  -> maps.id
  map_x         DOUBLE/REAL NOT NULL
  map_y         DOUBLE/REAL NOT NULL
  ground_zone_id TEXT NULL
  phase         TEXT NULL         -- optional per-placement age override
  created_at    TIMESTAMP NOT NULL
```
- Migration `0028_add_plant_placements.py`.
- The primary `plants` row is conceptually "placement 0"; the table holds
  placements 1..n. A render helper merges primary + secondary into a single list
  of points for the layer.

## 6. Phases

> Phases are independently shippable PRs. Phase 1 and 2 deliver the user value;
> 3 reduces existing clutter; 4–5 are advanced/follow-up. Each phase: verify with
> `cd frontend && npm run build` (rolldown, stricter than tsc) **and**
> `npx tsc -b --force`; backend changes verify with the `Backend · safe tests`
> suite + `alembic upgrade head` on the dev branch.

### Phase 1 — Contextual labels (declutter, frontend-only)

**Objective:** Stop drawing every name all the time; reclaim the canvas.

**Changes**
- `MapPage.tsx`: change `showLabels` default to `false`. Keep the existing
  toggle control wired to flip it (relabel UI to "Namen" / "Names" → "Toon alle
  namen" / "Show all names").
- `PlantsLayer.tsx`: pass `showLabel` per-marker as
  `showLabels || selectedId === \`plant-${plant.id}\`` so the **selected** plant
  always shows its name even when global labels are off. (Requires passing
  `selectedId` into the per-marker decision — it is already a prop.)
- `PlantMarker.tsx`: no structural change; it already honours `showLabel`.
  Optional: when rendering a selected-only label, add a subtle rounded
  background plate behind the `<text>` for legibility over busy zones.
- i18n: update the toggle label keys (find current key feeding the labels toggle
  in `MapActionCluster`/`MapPage`; add `map.showAllNames` NL/EN).

**Acceptance**
- Default map view shows icons with **no** name labels.
- Tapping/selecting a plant shows its name (and opens the sheet as today).
- The toolbar toggle turns **all** names on/off.
- `npm run build` + `npx tsc -b --force` pass.

**Out of scope:** zoom-based label reveal (tracked as Q1).

### Phase 2 — Quantity (count) + subtle "multiple" hint

**Objective:** Represent "I have N of these" with one number and a whisper-light
on-canvas hint.

**Backend**
- Migration `0027_add_quantity_to_plants.py` (see §5.1).
- `backend/models.py`: add `quantity: int = 1` to the plant create/update +
  map-plant response models.
- `backend/routers/plants.py`: accept `quantity` on create/update (validate
  `>= 1`, coerce to `int`).
- `backend/routers/maps.py`: add `p.quantity` to the three map-plant SELECTs
  (~lines 112, 149, 174) and ensure `enrich_plants` passes it through.

**Frontend**
- `types/index.ts`: add `quantity: number` to `MapPlant`, `Plant`; add
  `quantity?: number` to `CreatePlantInput`/update input.
- `AddPlant.tsx` + `EditPlant.tsx`: add a small "Aantal" / "Quantity" number
  input (default 1) in the Identity card. Send it in the payload.
- `PlantMarker.tsx`: when `plant.quantity > 1`, render the hint:
  - **Default (Q2):** a faint duplicated icon silhouette offset a few px
    behind the main icon (1–2 layers, low opacity) + a tiny count chip
    (e.g. bottom-right, `quantity` as text in a 7px circle). Gate everything
    behind `quantity > 1` so single plants are visually unchanged.
  - Keep it inside the existing `<g transform>`; do not enlarge the hit area.
- `PlantQuickSheet.tsx`: show the exact count prominently
  ("Varen · 6 stuks" / "6 plants").
- i18n: `plants.quantityLabel`, `plants.quantityShort(n)` (e.g. `${n} stuks` /
  `${n} plants`).

**Acceptance**
- Creating/editing a plant with quantity 6 persists and round-trips.
- The map shows a subtle multiple-hint for that plant and nothing different for
  quantity-1 plants.
- The tap sheet shows the exact count.
- Migrations applied on dev; `Backend · safe tests` green; frontend builds.

### Phase 3 — Warning density on the canvas

**Objective:** Cap the warning clutter that already crowds the map.

**Changes**
- `PlantMarker.tsx`: render **at most one** alert badge — the most-urgent
  (`top_warning`, else the highest-severity of `warnings`). Remove the arc
  fan-out for the multi-badge case on the canvas (keep the arc code path only if
  a future "expanded" mode wants it; default = single badge).
- The full per-plant warning list remains available in `PlantQuickSheet`, and
  the garden-wide list in `CareNeedsList` (`MapBottomSheet`).
- Add a **warnings visibility toggle** (mirrors the labels toggle) in
  `MapActionCluster`/`MapPage`: `showWarnings` (default **on**). When off, the
  canvas hides per-plant badges entirely and relies on the bottom sheet count.
- i18n: `map.showWarnings` NL/EN.

**Acceptance**
- A plant with 3 warnings shows 1 badge on the canvas, 3 in its sheet.
- The warnings toggle hides/shows all per-plant badges.
- Build + type-check pass.

### Phase 4 — Multiple placements (spread + per-placement age) [advanced]

**Objective:** Same plant in 2+ spots, optionally different ages, one record.

**Backend**
- Migration `0028_add_plant_placements.py` (see §5.2).
- New endpoints under `backend/routers/plants.py` (or a `placements.py`):
  - `POST /plants/{id}/placements` `{ map_id, map_x, map_y, ground_zone_id?, phase? }`
  - `DELETE /plants/{id}/placements/{placement_id}`
  - `PATCH` for moving a placement (reuse the existing set-position pattern).
- `maps.py`: after fetching primary plants, also fetch `plant_placements` for
  the map and emit them as lightweight secondary markers referencing the parent
  `plant_id`. Decide payload shape: either inline `placements: [...]` on each
  `MapPlant`, or a parallel `secondary_markers` array. **Recommend** a parallel
  array to keep `MapPlant` lean and the renderer simple.

**Frontend**
- `types/index.ts`: add `SecondaryMarker { plant_id, map_x, map_y, phase? }` and
  include it in the map payload type.
- New `PlantSatelliteLayer.tsx` (or extend `PlantsLayer`): render secondary
  markers as **small dots** (no label, no warning badge) that, on tap, open the
  parent plant's sheet (same `onPlantTap`).
- Placement editing: in move/edit mode, allow "add another spot" for a selected
  plant (drops a dot), and deleting a dot. Reuse drag permission helpers in
  `plantDragPermissions.ts`.
- Sheet: list the plant's placements with their optional ages
  ("Hoofdplek: established · Andere kant: young").

**Acceptance**
- A plant can have ≥1 secondary placement rendered as a dot that opens the same
  plant.
- A secondary placement can carry its own phase.
- Deleting the parent cascades (placements removed).
- Build + type-check + backend tests pass; migration applied on dev.

### Phase 5 — Biodiversity integration [follow-up]

**Objective:** Let `quantity` enrich the garden biodiversity score.

**Changes**
- `backend/services/garden_biodiversity.py` (`compute_for_map`): weight species
  presence/abundance by `quantity`. Pick a curve per Q3 (linear vs. diminishing
  returns — recommend **diminishing returns**, e.g. `1 + log` weighting, so 6
  ferns help but don't dominate).
- Surface nothing new in the UI beyond the existing score; document the change.

**Acceptance**
- Score reflects quantity per the chosen curve; existing biodiversity tests
  updated/added.

## 7. Sequencing & ownership

| PR | Phase | Surface | Depends on |
|---|---|---|---|
| 1 | Phase 1 | frontend | — |
| 2 | Phase 2 | backend + frontend | migration 0027 |
| 3 | Phase 3 | frontend | — (parallel to 1/2) |
| 4 | Phase 4 | backend + frontend | migration 0028, Phase 2 helpful |
| 5 | Phase 5 | backend | Phase 2 |

Phases 1, 2, 3 are the MVP that solves the day-to-day pain. 4 and 5 are
advanced/optional and can follow once the MVP is validated on the real map.

## 8. Non-goals
- Per-specimen tracking of individual plants (separate care logs per fern).
- Auto-clustering by proximity (placements are user-driven, not computed).
- Zoom-based label reveal (may revisit per Q1).
