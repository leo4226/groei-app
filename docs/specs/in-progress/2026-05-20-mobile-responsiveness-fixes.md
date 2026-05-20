# Mobile Responsiveness Fixes — Spec

**Date:** 2026-05-20  
**Status:** Ready to implement

## Context

Audit of the app on a 375px phone (iPhone SE / standard Android). Most pages are already mobile-friendly. Two pages have concrete issues that need fixing before sharing the app with external users.

---

## Fix 1 — Calendar: hardcoded 48px padding + 76px heading (HIGH priority)

### Problem

`calendar.css` uses `48px` horizontal padding across the masthead, legend, and main content area. On a 375px screen this leaves only **279px** of usable width, making the 7-column month grid unreadable (~40px per day cell) and causing the `76px` month heading to overflow.

There is only one responsive breakpoint at `max-width: 1200px` — no mobile-specific rules.

`PlanningCalendarPage.tsx` also has a hardcoded inline style `padding: '24px 48px 0'` on the view-toggle bar that suffers the same problem.

### Fix

**In `calendar.css`** — add a `@media (max-width: 768px)` block:

```css
@media (max-width: 768px) {
  .cal-page .masthead {
    padding: 24px 16px 12px;
  }

  .cal-page .title-block h1 {
    font-size: 36px;
  }

  .cal-page .legend {
    padding: 12px 16px 0;
  }

  .cal-page main {
    padding: 16px 16px 48px;
    gap: 16px;
  }

  .cal-page .title-row {
    gap: 16px;
  }
}
```

**In `PlanningCalendarPage.tsx`** — replace the inline `padding` on the view-toggle wrapper with a Tailwind class or a narrower value:

```tsx
// Before
style={{ maxWidth: 1480, margin: '0 auto', padding: '24px 48px 0', ... }}

// After — use clamp or a responsive CSS var, or switch to Tailwind px-4 md:px-12
style={{ maxWidth: 1480, margin: '0 auto', padding: 'clamp(16px, 4vw, 48px) clamp(16px, 4vw, 48px) 0', ... }}
```

### Result

- Masthead padding drops from 48px → 16px on phones — content area widens from 279px to 343px
- Month heading scales from 76px → 36px — no overflow
- Day cells go from ~40px → ~49px each — event dots are visible
- Agenda list renders full-width below the grid as intended

---

## Fix 2 — Settings: 2-column grid with no mobile breakpoint (MEDIUM priority)

### Problem

Two sections in `Settings.tsx` use `className="grid grid-cols-2 gap-3"` with no responsive variant. On a 375px phone with typical padding, each cell is ~160px wide — functional but cramped, especially for icon grids with labels.

Affected sections (line ~60 and ~87 approximately):
- Location list
- Icon category grid

### Fix

Change `grid-cols-2` to `grid-cols-1 sm:grid-cols-2` for both grids. This gives single-column rows on phones (easier to tap, more label space) and reverts to 2-column on tablets/desktop.

```tsx
// Before
<div className="grid grid-cols-2 gap-3">

// After
<div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
```

Tailwind's `sm:` breakpoint is 640px, which is the right cut-off here.

---

## Pages confirmed fine — no changes needed

| Page | Status | Notes |
|---|---|---|
| Dashboard | ✅ | Single-column mobile, 2-col grid only at 900px+ |
| Login | ✅ | `maxWidth: 360px`, centered card |
| Plants | ✅ | `auto-fill minmax(180px)` collapses to 1 col on phone |
| PlantDetail | ✅ | Tailwind layout, `overflow-x-auto` on care type row |
| AddPlant | ✅ | Standard stacked form |
| BottomNav | ✅ | `env(safe-area-inset-bottom)`, 64px min touch targets |
| MapPage | ✅ | Has explicit mobile SVG rotation handling |

---

## Out of scope

- Making the 7-column calendar grid scroll horizontally (the scaled-down cells at 49px are sufficient)
- Responsive font scaling beyond the heading fix
- Any layout changes to pages already rated fine above
