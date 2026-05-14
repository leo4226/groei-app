# Plants Page Redesign — Botanical Field Guide

**Date:** 2026-05-07
**Status:** Approved

## Overview

Redesign the Plants list page (`Plants.tsx`) with a botanical field-guide aesthetic inspired by the Plant Icons reference design. Full palette shift from the "Handsome Frank" navy/orange brand to warm paper tones with green and terracotta accents.

## Color Palette

Global CSS variable changes in `index.css`:

| Variable | Current | Proposed | Purpose |
|---|---|---|---|
| `--color-bg` | `#fef9ee` | `#F5F0E3` | Page background |
| `--color-surface` | `#ffffff` | `#FBF7EE` | Cards, modals |
| `--color-primary` | `#160572` (navy) | `#2F5D3A` (green) | Buttons, active states |
| `--color-primary-dark` | (new) | `#1E3F26` | Hover states |
| `--color-primary-highlight` | (new) | `#8FA882` | Glow accents, hover borders |
| `--color-secondary` | `#ff7701` (orange) | `#B2664A` (terra) | Form filter active, secondary accents |
| `--color-text` | `#2c2c2c` | `#1F2A1E` | Primary text |
| `--color-text-muted` | `#909090` | `#8A9482` | Secondary labels |
| `--color-text-soft` | (new) | `#4A5A44` | Scientific names, lede text |
| `--color-border` | `#f2ebe6` | `#D9CFB8` | Borders, dividers |
| `--color-overdue` | `#ea0706` | `#B2664A` | Overdue indicator |
| `--color-due` | `#ff7701` | `#D9A418` | Due today indicator |
| `--color-good` | `#24e34c` | `#2F5D3A` | Good status indicator |

Old brand colors preserved as `--color-type-*` tokens for fallback icon backgrounds only (used when a plant has no custom SVG icon assigned).

## Typography

| Role | Current | Proposed |
|---|---|---|
| Headings | Playfair Display 700 | Fraunces 500 |
| Body/UI | Inter | Inter (unchanged) |
| Labels/metadata | (none, uses monospace fallback) | JetBrains Mono |

Font loading via Google Fonts with PWA service-worker caching:

```html
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?
  family=Fraunces:ital,opsz,wght@0,9..144,400;0,9..144,500;0,9..144,600;1,9..144,400&
  family=Inter:wght@400;500;600&
  family=JetBrains+Mono:wght@400;500&
  display=swap" rel="stylesheet">
```

CSS variable updates:
- `--font-heading`: `'Fraunces', serif`
- `--font-body`: `'Inter', sans-serif` (unchanged)
- New `--font-mono`: `'JetBrains Mono', monospace`

## Page Structure

### Header
- Eyebrow: mono label with decorative lines on both sides (`— Mijn Tuin · Est. 2026 —`)
- Title: "Planten *Icons*." — Fraunces 48-56px, italic green accent on "Icons"
- Lede: italic Fraunces description below title
- Stats: two stat blocks (plant count + category count), Fraunces numbers + mono labels

### Search Bar
- Pill-shaped input with search icon (left) and keyboard shortcut hint (right, "Ctrl K")
- "+ Toevoegen" ghost button aligned right (border + text, fills on hover)

### Filters (three rows)
Each row has a mono label on the left + pill chips:

1. **Locatie** — Alle | Huis | Tuin (from `plant.location_name`)
2. **Type** — Alle | Kamerplant | Varen | Vetplant | Bloem | Kruid | Struik | Boom | Eetbaar | etc. (from `plant.plant_type` + existing `CATEGORY_LABELS`)
3. **Vorm** — Alle | In pot | Zonder pot (from icon's `form` field)

Active chip = filled (green for rows 1-2, terra for row 3). Chips with zero count are disabled (dimmed, not clickable). All three filters AND together.

### Results Bar
- Left: italic count label ("Toon **alle 12** planten" / "Gevonden: **3**")
- Right: mono section label with § prefix ("§ De Collectie" / "§ De Tuin")
- Separated from grid by a `1px solid` border

### Card Grid
- `grid-template-columns: repeat(auto-fill, minmax(200px, 1fr))` (up from 140px)
- Gap: 16px

## Card Anatomy

Each card is a `<Link to={/plants/:id}>`:

```
┌──────────────────────┐
│ ┌──────────────────┐ │
│ │  cat-tag  index# │ │  ← index# visible on hover only
│ │                  │ │
│ │   warm gradient  │ │  ← linear-gradient(145deg, #FDFAF1, #F4EEDB)
│ │   icon well      │ │
│ │                  │ │
│ │         form-tag │ │  ← "potted" / "bare" color-coded
│ └──────────────────┘ │
│                      │
│ Plant Name           │  ← Fraunces 500, 16-18px
│ Scientific name      │  ← Fraunces italic, --color-text-soft
│ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ │  ← dashed border
│ FAMILY               │  ← JetBrains Mono 9px uppercase
└──────────────────────┘
```

### Hover State
- `translateY(-2px)`
- Stronger shadow (`0 2px 6px + 0 16px 40px`)
- Green radial gradient overlay via `::before` (opacity 0 → 1)
- Border color shifts to `--color-primary-highlight` (#8FA882)
- Icon scales 1.08x and rotates -2deg
- Index number appears (opacity 0 → 1)

### Fallback Icons
When a plant has no `icon_key` (custom SVG), use the existing `TYPE_BG` colors but applied subtly — a small color accent bar or tinted gradient rather than a full saturated background. The icon well retains its warm gradient base.

## Status Indicators (deferred)

The current color dot (green/orange/red) is removed from the card. The reference design's richer alert states (watering ring styles, temperature indicators) will be integrated in a follow-up change, since they require the `window.stateIconWithRing` SVG generation that lives in the reference's `plants.js`.

## Responsive

Single breakpoint at `max-width: 720px`:
- Header stacks vertically, title shrinks to 36px
- Stats align left
- Search and add button stack
- Filter rows wrap naturally (chips already scroll horizontally)
- Grid min width drops to 150px

## Files Changed

| File | Change |
|---|---|
| `index.css` | Replace color palette, update font variables, add `--font-mono` |
| `index.html` | Add Google Fonts link tags |
| `Plants.tsx` | Full redesign: header, search, 3-tier filters, results bar, card grid |
| `IconPicker.tsx` | Extract `CATEGORY_LABELS` to a shared constants file (or re-export) |

No other pages are modified. They inherit the new palette through CSS variables.

## Out of Scope

- Detail page (`/plants/:id`) redesign
- Alert state banner from the reference
- Map page or dashboard palette updates
- Removing the existing `TYPE_BG` color map (kept for fallback icons)
