# Design language unification — "Herbarium editorial"

**Date:** 2026-06-12
**Status:** Approved direction (Leon, 2026-06-12)
**Reference implementation:** `frontend/src/pages/Plants.tsx` (the page Leon called out as the look to match), with `Dashboard.tsx` as a second conforming example.

## Goal

Every page should feel like one app. Today there are two coexisting dialects:

- **Herbarium editorial** — Plants, Dashboard, (partially) AddPlant. Serif mastheads, mono micro-labels, pill buttons, warm card wells.
- **Generic app** — Settings, MapsListPage, MapSettingsPage: plain `text-2xl font-extrabold` titles, square-ish buttons, no eyebrow/masthead.
- **Neither** — PlantDetail: mobile-native scroll page, no masthead, no desktop layout (see #175).

We standardize on the herbarium editorial language. **Plants and Dashboard must not change visually** — they are the spec.

## The language (extracted from Plants.tsx)

All colors/fonts via CSS variables (Tailwind theme tokens map to the same vars: `font-heading`, `font-mono`, `text-text-soft`, `text-text-muted`, `border-border`, `text-primary`, `bg-paper`, …). New shared components should be written in Tailwind (consistent with the existing `components/ui/` kit), resolving to the same vars.

### 1. Masthead (desktop)

```
┌──────────────────────────────────────────────────────────────┐
│ ── EYEBROW TEXT ─────────────────────────────  (mono, rules) │
│ Big serif title with one italic accent.        123  45       │
│ Italic serif lede, max-width ~440px.           STAT STAT     │
└──────────────── border-b border-border ─────────────────────┘
```

- **Eyebrow:** `var(--font-mono)`, 10px, uppercase, `letter-spacing: 0.2em`, `--color-text-muted`, flanked by 1px hairlines (`--color-border`). Plants.tsx:211–225.
- **Title:** `var(--font-heading)`, weight 500, `clamp(36px, 5vw, 56px)`, `line-height 0.95`, `letter-spacing -0.02em`. Exactly **one accent word** in `<em>` — italic, `--color-primary`, weight 400 — and the title ends with a period. Examples: "Plant *Icons*.", "Goedemiddag, *Leon*.". Plants.tsx:226–236.
- **Lede:** `var(--font-heading)` italic, 15px, `line-height 1.5`, `--color-text-soft`, `max-width 440px`. Plants.tsx:237–247.
- **Stats (optional, right-aligned):** serif 34px weight-500 number in `--color-primary` over a mono 9px uppercase microlabel. Plants.tsx:249–270.
- **Container:** `padding: 40px 24px 20px`, `border-bottom: 1px solid var(--color-border)`, flex space-between, items flex-end.

### 2. Masthead (mobile, <720px)

Sticky compact header (Plants.tsx:451–497): 22px serif title + optional count badge (mono 10px in a bordered pill), pill action buttons on the right, `background: var(--color-bg)`, safe-area spacer above. No eyebrow, no lede, no stats on mobile.

### 3. Buttons & inputs

- Everything interactive is a **pill** (`border-radius: 100px`).
- Primary action: outline `--color-primary` that fills on hover (desktop, Plants.tsx:302–312) or solid primary (mobile).
- Secondary: outline `--color-border`, `--color-text-soft`.
- Text inputs: pill, `--color-surface` background, focus ring `0 0 0 4px rgba(47,93,58,0.12)` + primary border.

### 4. Mono micro-labels

Section markers, filter row labels, tags: `var(--font-mono)`, 9–10px, uppercase, `letter-spacing 0.15–0.2em`, `--color-text-muted`. The `§` glyph in `--color-primary` may prefix a section name (AddPlant/EditPlant already do this).

### 5. Cards

`.card .card-glow`, `border-radius: 14px`. Image/icon wells use the warm gradient `linear-gradient(145deg, #FDFAF1 0%, #F4EEDB 100%)` with `border-bottom: 1px solid var(--color-border-soft)`. Metadata separated by `border-top: 1px dashed var(--color-border)` with mono micro-text.

### 6. Page states

Empty/loading copy is serif italic (`font-heading`, italic, `--color-text-soft`) with a plain muted hint line below — never bare bold sans text. Plants.tsx:757–772.

## Page-by-page gap analysis

| Page | State | What's needed |
|---|---|---|
| Plants | ✅ Reference | Nothing. Do not touch. |
| Dashboard | ✅ Conforms | Nothing. |
| AddPlant | 🟡 Close | Already has eyebrow/serif masthead in Tailwind. Title is `text-2xl/3xl font-bold` — smaller and bolder than spec (spec is weight 500, clamp to 56px). Acceptable for now; align opportunistically when touched. |
| EditPlant | 🟡 Close but broken | Duplicate h1s + ghost field (#176). After #176, masthead should match AddPlant; the `max-w-2xl` straitjacket should widen to AddPlant's `max-w-[1380px]` grid. |
| PlantDetail | ❌ Outlier | No masthead, full-bleed phone hero, no desktop layout. #175 specs the desktop two-column layout; the header treatment in #175 should be this masthead (plant name as title, species as accent/lede, care stats as stat blocks). |
| Settings | ❌ Generic | `text-2xl font-extrabold` h1, ten `text-base font-bold` h2 sections. Needs masthead + mono micro-label section headers. |
| MapsListPage | ❌ Generic | `text-xl font-bold` title, `rounded-lg` primary button. Needs masthead + pill buttons. |
| MapSettingsPage | ❌ Generic | Same as MapsListPage. |
| LogboekPage | 🟡 Body conforms | Serif-italic entries already on-language; header check when touched. |
| Login / ResetPassword | ✅ Acceptable | Fraunces wordmark on a card; auth pages may stay minimal. |
| MapPage / LayoutEditor | ⛔ Out of scope | Full-bleed canvas with floating chrome is its own documented design (2026-05-27 redesign). Leave alone. |

## Rollout plan

Sequenced so each step is one small PR, mobile-first (verify both layouts):

1. **`PageMasthead` shared component** (`frontend/src/components/ui/PageMasthead.tsx`) — extract the pattern from Plants.tsx into a Tailwind component: props `eyebrow`, `title`, `accent` (the italic word), `lede?`, `stats?: {value, label}[]`, `actions?` (right-side buttons on mobile), `compact?` (mobile sticky variant). Plants/Dashboard are NOT migrated to it (zero-regression rule) — they stay as the visual spec it is tested against.
2. **Settings adopts the masthead** + section h2s become mono micro-labels. First consumer proves the component.
3. **MapsListPage + MapSettingsPage** adopt masthead + pill buttons.
4. **PlantDetail** gets the masthead as part of the #175 desktop layout work.
5. **EditPlant** conformance after #171/#172/#176 land (don't touch `handleSubmit` in a styling PR).

## Guardrails

- **Never restyle Plants or Dashboard** in these PRs. They are the reference; a diff touching them is a smell.
- One page per PR. Styling PRs change no behavior — no handler, store, or API edits.
- Both breakpoints: check ~390px and ~1280px. The 720px `matchMedia` split in Plants is the de-facto mobile boundary.
- All text through `useT()` — no new hardcoded strings (see #173).
- Colors/fonts only via tokens (CSS vars or their Tailwind names). Hex values in a PR are a smell (the warm gradient + focus ring rgba above are the only sanctioned literals).
