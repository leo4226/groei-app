# 🌱 Groei — Feature Plan: Plant Marker Icons

**Goal:** Replace the plain coloured circle markers with recognisable plant category icons rendered as SVG glyphs inside the existing circle. No external APIs, no image generation — a curated inline SVG icon set that matches the app's existing plant categories.

**Scope:** `PlantMarker.tsx`, a new `plantIcons.ts` constants file, and minor label adjustments. No DB changes needed.

---

## Why Not the Original Plan?

The initial sketch proposed: Trefle API → Wikimedia images → AI image generation → cached per species.

**Problems with that approach:**
1. **Trefle** has a rate-limited free tier and poor coverage of ornamental/Dutch garden plants. You already store category in your own DB — Trefle adds nothing for V1.
2. **AI image generation** requires DALL-E or Stable Diffusion (not Anthropic's API), meaning another API key, per-icon cost (~$0.04 each), latency on first load, and a caching pipeline. Enormous complexity for a two-person app.
3. **Wikimedia image fetching** introduces licensing nuance and wildly inconsistent image quality — all to feed an AI generator anyway.
4. **Top-down plant photos** are not what you want in a map UI — you want silhouette icons with consistent style. AI generation from photos would need heavy prompting to achieve this.

**What you actually need:** ~12–15 clean SVG glyphs covering your existing categories, rendered inline. Zero latency, perfectly scalable, zero cost, stylistically consistent.

---

## Icon Set (maps to existing `plant_type` values)

Each icon is a compact SVG path/shape (~100×100 viewBox) drawn in a minimal flat style — recognisable as a silhouette at 20–30px.

| `plant_type` | Icon concept | Visual |
|---|---|---|
| `tree` | Rounded canopy on trunk | Lollipop silhouette |
| `shrub` | Multi-stem rounded bush | Wide low dome |
| `grass` | Three arching blades | Fan of thin arcs |
| `herb` | Small bushy clump | Compact dome with texture |
| `flower` | Simple 5-petal bloom | Daisy/circle with petals |
| `climber` | Vine with leaves on a line | Diagonal with leaf nodes |
| `bulb` | Teardrop above ground line | Tulip silhouette |
| `tomato` | Round fruit with calyx | Circle + small star top |
| `pepper` | Elongated fruit | Tapered oval + stem |
| `pot_plant` | Generic leaf burst | Spray of 3 leaves |
| `bamboo` | Three upright culms | Vertical segments |
| `cactus` | Column with arms | Classic saguaro |
| `fern` | Arching frond | Single curved frond |
| `unknown` | Leaf generic | Simple leaf outline |

The icon fills are **white** (or very light tint), so they read cleanly over the category-colour circle fill. Stroke is slightly darker than the circle's base colour.

---

## Visual Design

### Current marker anatomy
```
       ┌─ care-status ring (animated if overdue) ─┐
       │  ┌─ circle (category fill + stroke) ─┐  │
       │  │         [ dot centre ]             │  │
       │  └────────────────────────────────────┘  │
       └───────────────────────────────────────────┘
                label (below, 12px, halo)
```

### Updated marker anatomy
```
       ┌─ care-status ring (animated if overdue) ─┐
       │  ┌─ circle (category fill + stroke) ─┐  │
       │  │     [ SVG icon glyph, white ]      │  │
       │  └────────────────────────────────────┘  │
       └───────────────────────────────────────────┘
                label (below, 12px, halo)
```

The only change inside the existing component: swap the two `<circle>` dots for an `<image>` or inline `<g>` containing the icon path, clipped to the circle radius.

### Sizing
- Icon rendered at **65% of the marker circle's radius** — centred, with enough breathing room from the stroke edge.
- `display_radius_cm` (from PLAN-map-ui-polish) drives the marker size; the icon scales proportionally.
- Minimum legible icon size: ~14px rendered. Below this, fall back to the plain dot. In practice this only matters for very small seedling markers.

### Contained plants (plants inside a pot/container)
- When a plant is rendered as a small dot *inside* a container object, use a **tiny 8px version** of the icon in place of the dot. No label.
- If the container holds 2+ plants, render up to 3 mini icons in a cluster; show "+N" badge for overflow (existing logic, just swap dot → icon).

---

## Implementation

### New file: `src/constants/plantIcons.ts`

```typescript
// Each icon is an inline SVG path string, drawn on a 100×100 viewBox, centred at 50,50.
// White fill reads well over any category colour circle.

export const PLANT_ICONS: Record<string, string> = {
  tree: `<circle cx="50" cy="35" r="22" fill="white" opacity="0.9"/>
         <rect x="46" y="55" width="8" height="18" rx="2" fill="white" opacity="0.9"/>`,

  shrub: `<ellipse cx="50" cy="48" rx="28" ry="22" fill="white" opacity="0.9"/>
          <rect x="44" y="65" width="12" height="8" rx="2" fill="white" opacity="0.7"/>`,

  grass: `<path d="M50 70 Q38 45 30 20" stroke="white" stroke-width="3.5" fill="none" stroke-linecap="round"/>
          <path d="M50 70 Q50 40 50 18" stroke="white" stroke-width="3.5" fill="none" stroke-linecap="round"/>
          <path d="M50 70 Q62 45 70 20" stroke="white" stroke-width="3.5" fill="none" stroke-linecap="round"/>`,

  herb: `<ellipse cx="50" cy="52" rx="20" ry="16" fill="white" opacity="0.9"/>
         <ellipse cx="36" cy="48" rx="12" ry="10" fill="white" opacity="0.85"/>
         <ellipse cx="64" cy="48" rx="12" ry="10" fill="white" opacity="0.85"/>`,

  flower: `<circle cx="50" cy="50" r="9" fill="white"/>
           <ellipse cx="50" cy="32" rx="7" ry="11" fill="white" opacity="0.85"/>
           <ellipse cx="50" cy="68" rx="7" ry="11" fill="white" opacity="0.85"/>
           <ellipse cx="32" cy="50" rx="11" ry="7" fill="white" opacity="0.85"/>
           <ellipse cx="68" cy="50" rx="11" ry="7" fill="white" opacity="0.85"/>`,

  climber: `<path d="M30 75 Q40 55 35 35" stroke="white" stroke-width="2.5" fill="none"/>
            <ellipse cx="35" cy="35" rx="10" ry="7" fill="white" opacity="0.9" transform="rotate(-30 35 35)"/>
            <ellipse cx="38" cy="55" rx="9" ry="6" fill="white" opacity="0.85" transform="rotate(20 38 55)"/>
            <ellipse cx="55" cy="45" rx="9" ry="6" fill="white" opacity="0.85" transform="rotate(-15 55 45)"/>`,

  bulb: `<ellipse cx="50" cy="58" rx="16" ry="12" fill="white" opacity="0.9"/>
         <path d="M50 47 Q44 35 44 25 Q50 20 56 25 Q56 35 50 47Z" fill="white" opacity="0.9"/>`,

  tomato: `<circle cx="50" cy="54" r="20" fill="white" opacity="0.9"/>
           <path d="M44 36 Q50 28 56 36" stroke="white" stroke-width="2.5" fill="none" stroke-linecap="round"/>
           <line x1="50" y1="28" x2="50" y2="36" stroke="white" stroke-width="2.5" stroke-linecap="round"/>`,

  pepper: `<ellipse cx="50" cy="56" rx="13" ry="20" fill="white" opacity="0.9"/>
           <path d="M50 37 Q56 30 54 24" stroke="white" stroke-width="2.5" fill="none" stroke-linecap="round"/>`,

  pot_plant: `<path d="M50 65 Q30 50 36 30 Q50 22 64 30 Q70 50 50 65Z" fill="white" opacity="0.9"/>
              <path d="M50 65 Q40 52 44 38" stroke="white" stroke-width="1.5" fill="none" opacity="0.6"/>
              <path d="M50 65 Q60 52 56 38" stroke="white" stroke-width="1.5" fill="none" opacity="0.6"/>`,

  bamboo: `<rect x="44" y="15" width="5" height="70" rx="2.5" fill="white" opacity="0.9"/>
           <rect x="51" y="20" width="5" height="60" rx="2.5" fill="white" opacity="0.85"/>
           <line x1="44" y1="35" x2="38" y2="30" stroke="white" stroke-width="2" stroke-linecap="round"/>
           <line x1="51" y1="40" x2="62" y2="34" stroke="white" stroke-width="2" stroke-linecap="round"/>`,

  fern: `<path d="M50 72 Q32 55 22 30" stroke="white" stroke-width="2.5" fill="none" stroke-linecap="round"/>
         <path d="M36 52 Q28 44 24 38" stroke="white" stroke-width="2" fill="none" stroke-linecap="round"/>
         <path d="M30 40 Q22 34 20 28" stroke="white" stroke-width="1.5" fill="none" stroke-linecap="round"/>`,

  unknown: `<path d="M50 22 Q66 22 66 38 Q66 50 50 50 Q50 58 50 62" stroke="white" stroke-width="4" fill="none" stroke-linecap="round"/>
            <circle cx="50" cy="72" r="3.5" fill="white"/>`,
};

// Fallback: if plant_type not in the above map, use this
export const DEFAULT_PLANT_ICON = PLANT_ICONS.unknown;

export function getPlantIcon(plantType: string): string {
  return PLANT_ICONS[plantType] ?? DEFAULT_PLANT_ICON;
}
```

### Updated `PlantMarker.tsx`

The key change: replace the two `<circle>` dot elements with an inline `<svg>` icon rendered via `dangerouslySetInnerHTML` (safe here — these are hardcoded strings, not user input) or as a `<foreignObject>`. Actually the cleanest approach in SVG is to use a nested `<svg>` element with its own viewBox:

```tsx
import { getPlantIcon } from '@/constants/plantIcons';

// Inside the <g className="plant-marker"> element:

// Old:
// <circle r={8} fill={typeColor + '44'} stroke={typeColor} strokeWidth={1.5} />
// <circle r={3} fill={typeColor} />

// New:
const iconSize = markerRadius * 1.3; // icon svg is square, centred on marker

<circle r={markerRadius} fill={typeColor + '55'} stroke={typeColor} strokeWidth={1.5} />
<svg
  x={-iconSize / 2}
  y={-iconSize / 2}
  width={iconSize}
  height={iconSize}
  viewBox="0 0 100 100"
  overflow="visible"
  style={{ pointerEvents: 'none' }}
  dangerouslySetInnerHTML={{ __html: getPlantIcon(plant.plant_type) }}
/>
```

`markerRadius` comes from `display_radius_cm` if set, otherwise the existing fixed default (e.g. 8px screen units for a standard plant).

### Palette chips

The drag chips in the plant palette at the bottom should also show the icon — a small 20px version — so users see what they're dragging before it lands on the map. Update `PaletteChip.tsx` similarly.

---

## What to Check Before Starting

Ask Claude Code to inspect:
1. The exact field name for plant type in the DB/API response — is it `plant_type`, `category`, `type`, or something else?
2. What the current `PlantMarker.tsx` renders inside the circle — confirm whether it's the two-circle dot approach above or something different already.
3. Whether `display_radius_cm` from PLAN-map-ui-polish has landed yet. If not, use the fixed marker radius constant for now and note where to swap it.
4. How palette chips currently render their colour indicator — so the icon can be added consistently.

---

## What This Plan Does NOT Include

- Per-species icons (same icon for all tomato varieties, all rose species, etc.) — acceptable for now
- Custom icon upload by user — future feature
- AI-generated icons — possible future upgrade, but requires a separate image generation service (not the Anthropic API) and a caching pipeline. The SVG approach is the right foundation regardless, since AI-generated icons would slot into the same `getPlantIcon()` function as overrides.
- Animated icons — the care-status ring already provides animation; icons stay static

---

## Future Upgrade Path

When/if per-species icons become desirable:

1. Add an `icon_svg` column to the `plants` or `plant_species` table (TEXT, nullable).
2. `getPlantIcon()` checks for a species-level override first, falls back to category icon.
3. Icons can be populated by: (a) a small curated set for common species, (b) a future admin tool, or (c) a background job that calls an image generation API and stores the result as an SVG string.

The category SVG approach is the right foundation for all three upgrade paths.

---

## Claude Code Session

Single session — this is self-contained and not large.

```
Read PLAN-plant-marker-icons.md.

I want to upgrade plant markers on the Groei map from plain coloured circles to
circles with recognisable SVG category icons inside them.

Before writing any code, inspect:
1. The exact field name for plant category/type in the Plant model and DB schema
2. What PlantMarker.tsx currently renders inside the circle (the inner dot approach)
3. Whether display_radius_cm has landed from PLAN-map-ui-polish; if so, use it,
   otherwise use the existing fixed radius constant
4. How PaletteChip.tsx currently renders its colour indicator

Then implement:
1. Create src/constants/plantIcons.ts with the PLANT_ICONS map from the plan.
   The icon paths are already written in the plan — copy them verbatim, then
   fine-tune any that look off after rendering.

2. Update PlantMarker.tsx:
   - Keep the outer circle (category fill + stroke) unchanged
   - Replace the inner dot(s) with a nested <svg viewBox="0 0 100 100"> containing
     the icon path via dangerouslySetInnerHTML
   - Icon sized at ~65% of marker radius, white fill, pointerEvents: none
   - If rendered size < 14px, fall back to the plain white dot (add a size check)

3. Update PaletteChip.tsx to show a small (20px) version of the same icon next
   to or instead of the colour dot.

4. Test with at least: a grass plant, a tomato, a tree marker, and an unknown type.
   Confirm icons are legible at both small (default) and large (resized) marker sizes.

Keep the care-status ring logic completely unchanged — it wraps outside the circle
and should not be touched.
```
