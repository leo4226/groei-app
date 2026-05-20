# Groei Alert Icons — Claude Code Session Plan

## Context

The Groei garden app currently shows a red banner "X planten hebben aandacht nodig" that's too blunt — a small dryness issue triggers the same alarm as a real emergency. We want to replace this with a nuanced icon system that communicates *what kind* of attention is needed at a glance, both in the banner and on individual plant map markers.

Current weather/temperature is already fetched by the app. Custom SVG icons will be designed separately and dropped in after this session.

---

## Goal

Replace the generic alert banner with a **summary icon row**, and add **per-plant status icons** to map markers. Icons should be SVG-based so they can be custom-designed. Use placeholder emoji or simple SVG shapes for now.

---

## Part 1: Alert States

### Watering states
Based on days since last watered vs. plant's watering interval:

| State | Condition | Icon (placeholder) |
|---|---|---|
| `hydrated` | Within schedule | Happy/blooming plant |
| `thirsty` | Within 1 day of due | Drooping plant |
| `dry` | Overdue | Dried/wilted plant |

### Temperature states
Based on current fetched temp vs. plant's `min_temp` / `max_temp` stress thresholds:

| State | Condition | Icon (placeholder) |
|---|---|---|
| `comfortable` | No concern | *(no icon shown)* |
| `chilling` | Within 3°C above `min_temp` | Shivering plant |
| `freezing` | At or below `min_temp` | Frozen/icy plant |
| `heatstress` | At or above `max_temp` | Scorched plant |

Each plant gets **one watering icon** + optionally **one temperature icon**.

---

## Part 2: Banner Changes

Replace the current red bar with a **compact summary icon row**:

```
🌱×12  🥀×3  💧×1  🥶×2
```

- Show a count per alert type
- Clicking a category filters the plant list to that group
- Remove the single "aandacht nodig" red bar
- Use a neutral/warm background by default; only use warning colour if `freezing` or `dry` alerts are present

---

## Part 3: Map Marker Changes

Each plant marker on the map gets a small **status badge** in the bottom-right corner of the marker circle:

- Watering icon is **always shown** (hydrated, thirsty, or dry)
- Temperature icon is **only shown** if state is not `comfortable`
- If both alerts are active, show the more urgent one or stack them
- Badge size: 16–20px — should not overwhelm the marker

Extend the existing marker component with a badge overlay. Do not rewrite the marker from scratch.

---

## Part 4: `PlantStatusIcon` Component

Create `src/components/PlantStatusIcon.tsx` that accepts a `status` prop and renders an SVG placeholder. Must be easy to swap in final artwork later.

```tsx
type WaterStatus = 'hydrated' | 'thirsty' | 'dry'
type TempStatus = 'comfortable' | 'chilling' | 'freezing' | 'heatstress'

interface PlantStatusIconProps {
  waterStatus: WaterStatus
  tempStatus: TempStatus
  size?: number
}
```

Store icon assets in `/src/assets/icons/plant-status/` — one SVG file per state, named e.g. `hydrated.svg`, `dry.svg`, `freezing.svg`.

---

## Part 5: `usePlantAlerts` Hook

Add `src/hooks/usePlantAlerts.ts` that centralises all alert logic:

- Input: plant data + last-watered date + current temperature
- Output: `{ waterStatus: WaterStatus, tempStatus: TempStatus }`
- Used by both the banner summary and the map markers
- Check whether `min_temp` / `max_temp` are already stored on the plant model; add to schema if not

---

## Files Likely Involved

- Banner component (current alert bar)
- Map marker component
- `src/components/PlantStatusIcon.tsx` *(new)*
- `src/hooks/usePlantAlerts.ts` *(new)*
- Plant data types / DB schema (if temp thresholds not yet stored)
- `/src/assets/icons/plant-status/` *(new directory)*

---

## Out of Scope

- Final icon artwork (SVGs will be dropped in after design)
- Push notifications
- Watering schedule changes
