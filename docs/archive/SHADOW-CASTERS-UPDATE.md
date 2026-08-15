# Shadow Casters Update — Groei Garden App

**Context:** The previous `gardenStructures.ts` modeled individual structures (house wall at 3.2m, shed, fences). This was wrong — both the user's building and the neighbours' building are continuous 4-story row houses spanning the full block width. These two massive walls dominate all shadow behavior.

## Updated Shadow Casters

### 1. `own_building` — Your building (west side)
- **Height:** 12.5m (4 stories, Amsterdam row house)
- **Width:** Full 6m garden width (extends beyond both fences — it's a continuous row)
- **Position:** The back wall of the main building (not the extension). In the SVG this is approximately where the extension meets the original house — about 2.5m behind the extension's garden-facing wall.
- **Shape:** A straight east-facing wall, full width. Model as a thin rectangle spanning the full garden width at the main building's back wall line.
- **Note:** The 2.5m extension (with skylight) is only 3.2m high. The main building rises to 12.5m *behind* it. For shadow purposes, the building casts shadows over the extension roof. The extension itself is NOT a separate shadow caster — it's too low relative to the building above it.

### 2. `neighbours_building` — Neighbours' building (east side)  
- **Height:** 12.5m (4 stories, same as yours)
- **Width:** Full block width (extends beyond both fences)
- **Position:** Approximately 12–13m east of your back fence. Total house-to-house distance is ~25m, your garden is 12.4m from extension wall to back fence, so the neighbours' building wall is ~12.5m beyond your back fence.
- **Shape:** A straight west-facing wall, full width. Model as a thin rectangle.
- **Note:** This is the wall that blocks early morning sun. The sun must rise high enough to clear this 12.5m wall at ~25m distance before it hits your garden.

### 3. `norway_spruce` — Large conifer in neighbour's garden
- **Height:** 18m
- **Position:** ~5–6m east of your back fence (so in the middle of the neighbours' garden space), ~3m from the right (south) fence line
- **Canopy:** Conical, approximately 5m diameter at widest. Model as a circle with radius ~2.5m, or as a narrow polygon.
- **Evergreen:** Yes — casts shadow year-round (unlike deciduous trees)
- **Note:** At 18m this is taller than the neighbours' building (12.5m) so it pokes above the roofline and casts additional shadow, particularly affecting the right side of your garden in the morning.

### 4. `left_fence` — North boundary fence
- **Height:** 1.5m
- **Position:** Full length of the north (left) garden boundary
- **Note:** Minor caster. Only affects the ground within ~1–2m of the fence when sun is very low.

### 5. `right_fence` — South boundary fence
- **Height:** 1.5m  
- **Position:** Full length of the south (right) garden boundary
- **Note:** Minor caster. Same as left fence.

### 6. `shed` — Garden shed (back-right corner)
- **Height:** 2.3m
- **Position:** Back-right corner, flush against back fence and right fence
- **Footprint:** ~2.2m wide × ~1.5m deep (extract exact coords from SVG)
- **Note:** Largely redundant — its shadow is swallowed by the neighbours' building shadow in the morning, and by the right fence shadow at low angles. Keep it for correctness but it won't materially affect the heatmap.

## Removed Shadow Casters

- ~~`house_wall` (3.2m)~~ → replaced by `own_building` (12.5m full height)
- ~~`skylight_roof`~~ → too low (3.2m) to matter independently; the building above it is the real caster
- ~~`big_tree` (poplar)~~ → in the back-left corner, shadow falls away from the garden (north/northwest), never into it

## Key Insight: Shadow Direction

The garden faces east. The two dominant shadow patterns are:

1. **Morning:** The neighbours' building (east) blocks the low eastern sun. Sun won't reach the garden floor until it clears that 12.5m roofline. At 25m distance, sun needs to be at `arctan(12.5/25) ≈ 27°` altitude before it clears. In April this happens around 9:30–10:00 AM. In December the sun barely gets above 15° altitude so the neighbours' building may block direct sun for most of the day.

2. **Afternoon/evening:** Your own building (west, behind you) blocks the western sun as it descends. Same math applies — once the sun drops below ~27° altitude in the west, your building blocks it.

3. **The Norway Spruce** adds targeted shadow on the right side of the garden, especially in morning hours when the sun is in the east/southeast and the spruce is silhouetted between your garden and the rising sun.

## Claude Code Session Instructions

Update `gardenStructures.ts` with these casters. The key changes:
- Replace `house_wall` and `skylight_roof` with single `own_building` at 12.5m
- Add `neighbours_building` at 12.5m, positioned ~12.5m east of the back fence
- Add `norway_spruce` at 18m, positioned in the neighbour's garden
- Remove `big_tree` (poplar) — no shadow impact on garden
- Keep fences and shed as minor casters
- Both buildings extend beyond the garden's left/right boundaries (they're continuous rows) — make the wall polygons wider than 6m so shadows from oblique sun angles are captured correctly
