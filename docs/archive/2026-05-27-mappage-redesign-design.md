# MapPage redesign — design

**Date:** 2026-05-27
**Status:** Approved, ready for implementation plan.

## Goal

Make the map the page. Today the MapPage is dominated by chrome — a top
toolbar of large coloured pills, a right-side legend panel, an
always-on biodiversity card, and (when sun-mode is active) a wide
bottom control bar. The actual map shrinks to whatever rectangle is
left over.

Per the product-direction note (`2026-05-27-product-direction.md`),
Floreren's discriminator is that the garden is a *place*, not a list.
The page should reflect that: the map fills the viewport, and every
piece of UI sits on top of it or slides over it on demand.

## Direction (decided)

**A — Fullscreen map with floating elements.** Rejected alternatives:
B (thin always-visible side rail) keeps too much chrome; C (collapsible
drawer) makes the legend feel out-of-the-way without the simplicity
gain of fully floating.

## Layout

```
┌─────────────────────────────────────────────────────────────┐
│ ⌄ Garden                              💧 🌿 ☀ 📸 + ⋯       │
│                                       ╭───╮ Biodiversiteit  │
│                                       │ 45│                 │
│                                       ╰───╯                 │
│                                                             │
│                                                             │
│                       [ the map ]                           │
│                                                             │
│                                                             │
│                                                             │
│                  ━━━━                                       │
│       ● 3 planten hebben aandacht — tap om uit te klappen   │
└─────────────────────────────────────────────────────────────┘
```

### Top-left — Garden pill

A compact rounded pill with the map name and a `⌄` chevron. Clicking
the chevron opens a sub-menu:

- List of other maps in the household (switch)
- Separator
- "Instellingen…" (opens `/maps/:id/settings`)

No long-press interactions. The hard-to-discover behaviour we
considered earlier is rejected.

### Top-right — Action cluster

Compact icon-only cluster, rounded-pill background. Tooltips on hover
(desktop) / long-press (mobile). The icons match the actions the user
takes most often, in this order:

- 💧 Water (toggle the water sheet)
- 🌿 Fertilise (toggle the fertilise sheet)
- ☀ Sun mode (toggle — outdoor maps only)
- 📸 Identify (opens `/identify` with map context)
- ➕ Add plant (primary, filled background)
- ⋯ More (opens dropdown: Labels toggle · Inspect mode · + Pot)

**Mobile reduction:** the cluster drops to four icons —
💧 · 🌿 · ➕ · ⋯ — and the ⋯ menu absorbs the rest (☀, 📸, Labels,
Inspect, + Pot). The pattern is already in place via
`map-more-trigger` and the existing `Meer` dropdown. ☀ is one tap
deeper on mobile, accepted as a known cost; mobile users rarely
toggle sun mode several times in a session.

### Top-right secondary — Biodiversity pill

Sits directly below the action cluster (~10px gap). A small floating
pill showing the score number inside a mini conic-gradient ring, plus
the word "Biodiversiteit" (NL) / "Biodiversity" (EN).

- Outdoor maps only (no score for indoor).
- Click opens the existing `GardenBiodiversityCard` as a sheet/modal.
- Hidden entirely when species_count is 0 (empty garden has nothing
  to brag about yet).

### Bottom — Multi-purpose sheet

A single bottom container with a 32×3px drag handle. Two states:

- **Default — peek:** ~44px high, shows
  `● N planten hebben aandacht` (or `✓ Alles op schema`).
- **Expanded — ~75% viewport:** shows the current `MapLegend`
  content — plants grouped by `top_warning.care_type`, plus an
  "Op schema" group. Tap plant rows to focus on the map.

Drag up, drag down, or tap the handle to toggle. The sheet floats over
the map; opaque-ish background (95% surface) with backdrop blur.

### Sun mode — same container, different content

When the user toggles sun mode, the bottom sheet's content swaps from
care-needs to `SunControls` (month picker, hour slider, view-mode
toggles, sun-position display). The sheet auto-expands when sun mode
activates. Toggling sun off always collapses the sheet to peek and
restores the care-needs content — prior expanded state is *not*
remembered, to keep the behaviour predictable. **Both UIs share the
container; they never stack.**

### Landscape mobile

The existing `landscape-mobile-hide` class already hides BottomNav and
the top toolbar in landscape-mobile so the map fills the viewport.
That stays. The new floating elements (garden pill, action cluster,
bio pill, bottom sheet) remain visible — they're the chrome we
intentionally kept compact.

The 90° SVG rotation noted in older docs (CLAUDE.md §Map system) is
already gone from the code. CLAUDE.md will be corrected as part of
this work.

## What gets removed

- `components/map/MapLegend.tsx` — content moves into the bottom-sheet.
  The file itself can stay if its sub-components (`CareTypeGroup`,
  `PlantRow`) are useful to reuse inside the sheet; otherwise inline
  them. Decide during implementation.
- The colourful action pills in the toolbar — replaced by the
  monochrome icon cluster.
- The right-side desktop sidebar (`.dashboard-sidebar`-equivalent in
  MapPage) holding `GardenBiodiversityCard` + `MapLegend`. Bio-card
  becomes a floating pill that expands into a modal; legend lives in
  the bottom sheet.

## What stays

- `MapView.tsx` and everything below it (the SVG, plant pins, shadow
  layer, sun heatmap, debug overlays) — untouched.
- `WaterPicker` / `FertilizePicker` modals — still triggered by the
  💧 / 🌿 icons.
- `SunControls.tsx` — re-used as the bottom-sheet content when sun
  mode is active. Internals untouched; new mount point only.
- All keyboard shortcuts, plant tap behaviour, and the existing
  selection model.

## File-by-file outline

| File | Change |
|---|---|
| `pages/MapPage.tsx` | Major restructure: remove top pill toolbar, remove right sidebar, replace with floating components. ~696 → ~400 lines target. |
| `components/map/MapTopBar.tsx` *(new)* | Garden pill + chevron sub-menu (switch / settings). |
| `components/map/MapActionCluster.tsx` *(new)* | Icon cluster + ⋯ dropdown. Responsive: 6 icons desktop, 4 mobile. |
| `components/map/MapBottomSheet.tsx` *(new)* | Single sheet container with peek + expanded states + drag handle. Accepts a `mode: 'care' \| 'sun' \| 'closed'` prop. |
| `components/GardenBiodiversityCard.tsx` | Two render modes: `pill` (small corner pill — new) and `card` (current full card, opened from pill click). |
| `components/map/MapLegend.tsx` | Rename to `CareNeedsList`, drop the outer `<div className="bg-surface/95 …">` wrapper (the sheet provides its container), and consume from `MapBottomSheet`. Sub-components (`CareTypeGroup`, `PlantRow`) stay as-is. |
| `pages/MapPage.tsx` (CSS) | Drop `.map-action-primary`, `.map-action-desktop`, `.map-more-trigger`, `.forced-hidden-mobile/desktop` classes that supported the pill toolbar. Keep `landscape-mobile-hide`. |
| `CLAUDE.md` | Remove the stale 90°-rotation note in §Map system. Document the new floating-elements pattern. |

## Out of scope

- The actual product features behind the icons (water logging,
  fertilising, identify, etc.) — unchanged.
- Sun-mode internals.
- Care-on-map (a thirsty zone glowing orange) — separate work,
  belongs to shift #1 from the product-direction doc.
- Indoor maps get the same icon-cluster minus the outdoor-specific
  bits (☀, biodiversity pill). No special layout.
- Animations beyond what plain CSS transitions give us. No
  motion-design pass in this redesign.

## Verification

- Open `/map/garden` on desktop — see floating elements over a
  full-bleed map. No right sidebar. No pill toolbar at top.
- Toggle sun mode — bottom sheet content swaps to SunControls.
  Toggle off — content returns to care-needs.
- Resize to mobile width — action cluster collapses to four icons,
  ⋯ menu contains the rest. Bottom sheet still works via drag/tap.
- Rotate to landscape on mobile — top-floating chrome stays, bottom
  sheet remains accessible.
- Open `/map/<indoor-map>` — no biodiversity pill, no ☀ icon. Other
  chrome present and working.
- Click `⌄` on the garden pill — sub-menu shows other household maps
  + Settings link.
- Click the biodiversity pill — full card opens as a modal/sheet.
- No regression in plant tapping, label toggle, water/fertilise
  sheets.

## Risks / open follow-ups

- **☀ discoverability on mobile.** Sun mode is one tap deeper than
  on desktop because it lives behind ⋯. Acceptable per the design
  decision above; revisit if Leon's actual use shows the extra tap
  hurts. The fix if needed is to show ☀ as a fifth cluster icon on
  outdoor mobile maps only.
- **Tap-target overlap on the smallest phones.** A 360px-wide screen
  has roughly enough room for the four-icon cluster + garden pill,
  but only with tight margins. Verify on the smallest target device.
- **Bio-pill mounted twice** if both pill and full card live on the
  page. The card view (when opened from the pill) is a modal — only
  the pill stays in the DOM continuously. No double fetch: the pill
  caches its own data and passes it to the modal on open.
