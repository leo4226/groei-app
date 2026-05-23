# C2 — Map View: halos, badges, legend

## 1. Backend — Add `top_warning` + `warnings` to MapPlantOut

**models.py**: Add `top_warning: dict | None = None` and `warnings: list[dict] = []` to `MapPlantOut`.

**services/plant_reader.py**: In `enrich_plants()`, after computing legacy `top_alert`/`alerts`, call `compute_plant_warnings()` per plant and attach `top_warning` (dict) and `warnings` (list[dict]). Keep old fields for backward compat.

**routers/maps.py**: Change `get_map_plants` and `get_map_items` to pass `care_profile` column in the SELECT (already passing `care_thresholds`). Pass rain_data to `_fetch_weather_safely` equivalent.

## 2. Frontend types

**types/index.ts**: Add `top_warning: CareWarningOut | null` and `warnings: CareWarningOut[]` to `MapPlant`.

## 3. PlantMarker.tsx — Halo from `top_warning.color`

- Halo color: `plant.top_warning?.color ?? null`
- Badges: `plant.warnings[]` with icon from `CareWarningOut.icon`
- Keep outdoor ground suppression (only weather halos for in-ground)
- Fallback dot/selection ring: `plant.top_warning?.color` with fallback to old `getCareDisplay().badgeColor`

## 4. MapLegend.tsx — Group by care type

- Group plants by `top_warning.care_type` within environment
- Show: care type icon + Dutch label + count (💧 Water (3))
- Within each group: plant rows sorted by severity
- Replace "Attention Needed" / "All Good" split

## 5. ObjectShape.tsx — Container plants

- Update `getCareDisplay(plant).badgeColor` to prefer `plant.top_warning?.color`

## Order

1a. models.py — add fields
1b. plant_reader.py — compute warnings in enrich_plants
2. types/index.ts — add MapPlant fields
3. PlantMarker.tsx — halo + badges from new fields
4. MapLegend.tsx — group by care type
5. ObjectShape.tsx — minor update
6. Verify
