# Plant Detail Page — Editorial Redesign

**Date:** 2026-05-13  
**Status:** Ready for implementation  
**Files:** `groei/frontend/src/pages/PlantDetail.tsx`, `groei/frontend/src/components/PlantCareInfo.tsx`

## Problem

`PlantDetail` uses functional Tailwind card structure but lacks the editorial typography system present in `Plants.tsx` and `Dashboard.tsx`. The gap is most visible in the identity card (system font headings, pill metadata) and the `PlantCareInfo` widget (gray `bg-bg` container that feels bolted in).

## Decisions

### 1. Hero image stays

The full-width hero photo / icon well at the top is kept as-is. The editorial upgrade starts at the identity card below it.

### 2. Identity card: four-line editorial hierarchy

Replace the current name + pills layout with a structured four-line block:

```
[eyebrow]   🏠 Woonkamer · Kamerplant        ← font-mono, 10px, uppercase, text-text-muted
[name]      Monstera Deliciosa                ← font-heading, serif, large
[species]   Monstera deliciosa                ← font-heading italic, text-text-muted
[meta]      🪴 14 cm · 📅 Maart 2024          ← font-mono, 10px, text-text-muted
```

- Eyebrow: `{location_icon} {location_name} · {plant_type}` — only rendered when at least one field is present
- Name: switch `text-xl font-extrabold` → `font-heading` with appropriate size
- Meta line: pot size + acquired date formatted in Dutch; omit fields that are null
- **Remove** the pill flex-wrap row entirely

### 3. Section headers: explicit font-mono

The `Section` component's title `<p>` gets `font-mono` added so every section label (`JAARKALENDER`, `VERZORGING`, `ZORGGESCHIEDENIS`) uses the actual monospace typeface, matching the identity card eyebrow and Plants.tsx section labels.

### 4. PlantCareInfo: restyle to match Section pattern

Keep the collapsible expand/collapse behavior. Remove the gray wrapper:

- **Before:** `<div className="mt-4 rounded-xl bg-bg overflow-hidden">` with an internal `px-4 py-3 border-b` header
- **After:** Header restyled as a `Section`-equivalent — `font-mono text-[11px] uppercase tracking-widest text-text-muted` — with the "Meer info →" toggle aligned right (same as current). Content area uses card border instead of bg-bg background.

### 5. Out of scope

- `PhaseCalendar` — specialized visualization, untouched
- Notes italic block — functional, leave as-is
- Archive button — leave as-is
- Care history list — leave as-is
- Hero controls (back, edit, duplicate buttons) — leave as-is
