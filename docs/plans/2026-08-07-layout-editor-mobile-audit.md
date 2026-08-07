# Layout editor audit — new users, on a phone

**Date:** 2026-08-07
**Scope:** `/maps/:id/edit-layout` — the first thing a new account must do, and the
most complex screen in the app. Audited as a first-time user on a 390×844 phone
(iPhone 15-class), with the desktop layout checked as the secondary case.

**Method:** the editor was driven in a real browser (Chromium, touch emulation)
against a seeded outdoor map. Touch targets were measured from the live DOM, not
read off the Tailwind classes. Screenshots of each step are attached to the PR.

---

## The core loop is broken on touch

Everything else in this document is secondary to this. On a phone, the sequence
*"tap a shape → change its size"* — the single most common thing anyone does in a
layout editor — cannot be completed without knowledge the UI never gives you.

Tapping a zone selects it (dashed outline, a delete button appears in the dock)
and then: **nothing else happens.** No handles, no panel, no dimensions.

### E1 — Selecting a shape shows no resize handles

`EditorCanvas.tsx:1179` renders the resize overlay only when
`activeTool === 'select'`. The editor opens with `activeTool: 'draw'`
(`useEditorState.ts:112`), and the reducer flips to `'select'` **only after adding**
a zone, wall element or shadow caster (`useEditorState.ts:158, 214, 250`) —
never on `SELECT_ZONE`.

So on any map you come back to, tapping a shape selects it with the draw tool
still active, and no handles appear. To resize you must independently notice the
arrow icon in the bottom dock, tap it, then tap the shape again.

The handles themselves are good: `EditorResizeOverlay` gives each a 44px hit
target that stays constant at any zoom (`HIT_PX = 22` radius). The mechanism is
fine — it is simply unreachable.

### E2 — The size fields are behind an unrelated palette

The properties panels are rendered *inside the sidebar* (`LayoutEditorPage.tsx:659-720`),
which on touch is a drawer that is `hidden` until you press the layers button.
Opening it puts you at the **top of the drawing palette**, not at the selected
shape. Between you and the size of the zone you just tapped:

| | |
|---|---|
| MODUS | Tuin / Huis map-type switch |
| ZONES TEKENEN | nine zone types, each with a two-line description |
| ACHTERGROND | underlay image controls |
| — | "Omhein de tuin" action |
| OBJECTEN | collapsed section |
| SCHADUWEN | collapsed section |
| **ZONE** | label, then the fields you wanted |

Measured: `Lengte` sits at **y ≈ 719** after `scrollIntoView`, i.e. roughly 1400px
of unrelated palette above it. The selected zone gets no priority whatsoever.

### E3 — The drawer hides the thing you are editing

The drawer is **224px wide on a 390px viewport — 57% of the screen** — full
height, and it dims the canvas behind it. So while typing "how many metres wide
is this bed" you cannot see the bed. Every numeric edit is blind, and you must
close the drawer to check the result, then reopen it (back to the top of the
palette) to adjust again.

This is the loop the request describes as needing to work well. Right now it is:
*tap shape → tap layers → scroll past six sections → type blind → close → look →
reopen → scroll again.*

---

## Touch targets

Measured from the live DOM at 390×844. The iOS/Material minimum is 44×44.

| Control | Measured | |
|---|---|---|
| Zoom − / + / fit | **28×28** | far below |
| Mode switch (Tuin / Huis) | 97×**30** | below |
| Tool buttons (select, draw, wall) | **36×36** | below (`EditorToolbar.tsx:38,50,62`) |
| Properties panel inputs | 199×**37** | below — and these are the size fields |
| Legend zone row | 199×42 | marginal |
| Delete button | 44×44 | ✅ |
| Layers button | 44×44 | ✅ |
| Resize handles | 44×44 hit area | ✅ |

The two controls that are correctly sized are *delete* and *layers*. The tools
you use constantly — pick tool, zoom, and every numeric field — are the small
ones. Zoom at 28px is the worst: it sits in the top pill next to the notch, is
needed constantly on a small canvas, and is half the minimum.

---

## First run

A new outdoor map opens the **StarterWizard** (`pages/editor/StarterWizard.tsx`):
shape → size in metres → compass bearing → GPS. That is a genuinely good flow and
the right four questions. Findings are about its edges.

### F1 — Indoor maps get no wizard

`LayoutEditorPage.tsx:102` — outdoor gets the wizard, indoor falls through to the
tour. Indoor is arguably the harder model (rooms, wall thickness, doors, windows
placed *on* edges), and it gets the weaker onboarding.

### F2 — The tour describes a UI the phone does not have

`t.editor.tour.outdoor.step2`: *"Pick a zone type **in the sidebar** … and
**click** on the canvas."* On a phone there is no sidebar — there is a layers
button that opens a drawer — and you tap. The indoor step 2 has the same problem.
The first instruction a new mobile user reads refers to furniture that is not on
screen.

### F3 — Step 1 of the wizard has no way out

The shape step has no back, no cancel, and the overlay has no dismiss handler
(`StarterWizard.tsx:156` — the card stops propagation, the backdrop does nothing).
The only exits are picking a shape or picking "Draw my own". Steps 2-4 all have
Back. There is also no "step 2 of 4" indicator, so the length of the flow is
unknowable while you are in it.

### F4 — The map-type switch sits at the top of the palette

MODUS Tuin/Huis is the first thing in the drawer, above everything else, at
97×30px. Flipping it changes the whole model (zone vocabulary, walls, sun
handling) on a map that may already have content. It is the most consequential
and least-often-needed control in the panel, and it has the most prominent
position.

---

## The metre fields

The request asks for sizes settable via a field — "how many metres high is a
fence". **That already exists**, and is better than expected:

| Field | Where | Range |
|---|---|---|
| Fence height (m) | `ZonePropertiesPanel.tsx:159` | 0.5–4, step 0.1 |
| Structure height (m) | `:181` | 1–6 |
| Raised bed height (m) | `:202` | 0.2–1.5 |
| Room height (m) | `:254` | 1–6 |
| Length / Width (m) | `:222, :235` | live, two-way with the canvas |
| Shadow caster height | `ShadowCasterPropertiesPanel.tsx:223` | |
| Door/window width (cm) | `WallElementPropertiesPanel.tsx:31` | |

So the feature is not missing — it is **unreachable** (E2) and **untranslated**
(L1). Three specific gaps remain:

### M1 — Objects have no size fields at all

`ObjectPropertiesPanel.tsx` offers rotate and delete only. A table, shed or pot
placed from the object palette is stuck at its preset dimensions; `width_cm`,
`depth_cm` and `diameter_cm` are sent at create time (`LayoutEditorPage.tsx:607-609`)
and can never be edited afterwards.

### M2 — Height fields commit on blur, size fields commit on change

Heights use `onBlur` with `defaultValue` + a `key` (`:162-167`); length/width use
`onChange` with `value` (`:225-227`). On a phone, "blur" means tapping somewhere
else — and the obvious somewhere-else is the canvas, which deselects the zone.
A user who types a fence height and taps the map to admire it may not have
committed the value. The two field groups behaving differently is worse than
either behaviour alone.

### M3 — No unit hint on the length/width fields

Height fields say `Hoogte (m)`. Length/width say `Lengte` / `Breedte` with the
current value echoed in the label (`Lengte (4.5m)`), but the input itself has no
unit and the placeholder is `bijv. 4.5`. Entering `450` (cm, as people do) is
accepted silently as 450 metres.

---

## Robustness

### R1 — An unknown zone type white-screens the editor

Found by accident while building the test fixture: a zone whose `type` is not in
`ZoneStyleType` makes a style lookup return undefined and throws
`Cannot read properties of undefined (reading 'fill')`, which the ErrorBoundary
catches as a full-page "Pagina kon niet geladen worden". The whole map becomes
unopenable, with no way to recover the other zones.

Today this needs hand-edited or legacy `canvas_data` to trigger, so it is not a
live bug — but the failure mode for the app's most valuable user data is "lose
the entire map", and a fallback style would cost one line.

### R2 — Undo is three taps deep

`editor.undo` is wired to Ctrl/Cmd+Z (`:296`) and to the **⋮ overflow menu**
(`:517`) on mobile. On a touch canvas where a stray drag resizes a zone, undo is
the most important recovery control there is, and it is behind a menu. There is
no visible undo in the dock; the ⟲ in the zoom pill is *fit to content*, which
looks like undo and is not.

---

## Language

### L1 — The editor is Dutch-only for English accounts

Six editor files are on the i18n baseline (`eslint.i18n.config.js:54-58, 79`):
`LayoutEditorPage`, `EditorCanvas`, `ZonePropertiesPanel`, `ObjectPropertiesPanel`,
`WallElementPropertiesPanel`, `DimensionArrows`.

That covers the entire properties surface — `Hoogte (m)`, `Lengte`, `Breedte`,
`Materiaal`, `Hout`/`Steen`, `bijv. 2.0` — plus the overflow menu
(`? Rondleiding`, `Toon zon-perimeter`) and the shadow-object list. The wizard and
the legend *are* translated, so an English user gets an English wizard, an English
palette, and then Dutch the moment they select anything.

Per CLAUDE.md the baseline list must only shrink, and this is the screen where it
hurts most.

---

## Priorities

Ordered by effect on a new user with a phone.

1. **E1 + E2 + E3** — the core loop. Selecting a shape should surface its own
   controls: handles without a tool change, and a compact bottom sheet with
   label / size / height / delete that leaves the shape visible. This is one
   change conceptually and it is the whole audit.
2. **Touch targets** — zoom to 44, tools to 44, panel inputs to 44+.
3. **R2** — undo into the dock.
4. **M2 + M3** — one commit behaviour, units on every numeric field.
5. **F2 + F3** — tour copy that matches the phone; a way out of wizard step 1.
6. **L1** — translate the properties panels, shrink the baseline.
7. **M1** — object dimensions.
8. **R1** — zone-style fallback.
9. **F1** — an indoor wizard.
10. **F4** — move the map-type switch out of the palette head.

Items 1-4 are what stand between a new user and a finished map. 5-10 are real but
survivable.
