# Plant Game — Mobile UI Design (GameSetupSheet focus)

Date: 2026-08-18
Author: @design (Design bot)
Status: Ready for implementation
Related files:
- `frontend/src/components/game/GameSetupSheet.tsx` (primary)
- `frontend/src/pages/GameHostPage.tsx`, `frontend/src/pages/GamePlayerPage.tsx` (secondary — same type scale applies)
- `frontend/src/components/game/GameQuizRound.tsx` (secondary)
- `frontend/src/i18n/{translations,en,nl}.ts` (copy)

## Problem

The bottom sheet that opens when starting a plant game from map mode
(`GameSetupSheet`) looks cramped and unbalanced on phones:

- **Clue-mode toggle**: three equal-width buttons each pack an icon + a long
  Dutch label ("Foto aanwijzing" / "Naam aanwijzing" / "Logboek-quiz", 12–16
  chars) at `text-sm`. At 320–375px these overflow/wrap — the visible
  "too many letters" effect.
- **Question-count row**: label "Aantal vragen" and four pills (5 / 10 / 15 /
  Alle) share one `justify-between` row; cramped at 360px and under.
- **Create button**: "Maak spel aan (15)" at `text-sm` — a long, weak-looking
  primary action.
- **Header**: `h2 font-bold` gets an implicit weight that fights the app's
  Fraunces heading treatment (weight 500).
- **Copy lies**: subtitle and `selectMax` say "3–10", the code caps at 50.
  Rounds cap at 15 — the button must be honest about both.
- **Empty state**: `noPhotosWarning` ("Alleen planten met een foto kunnen in
  het spel.") is reused as the whole empty-state message when a map has no
  photo plants.

**Direction — no rebrand.** The palette and botanical identity are right; what
is broken is spacing, type scale, and responsive behaviour. Fix those, keep
every token from `index.css`.

## Design rules

1. **Mobile-first, all standard sizes**: 320px (old SE), 360px (Android),
   375px (SE 2/3), 390px (iPhone 14), 430px (Pro Max). Nothing may wrap or
   clip at 320px; nothing may stretch comically wide at 430px.
2. **Type scale inside the sheet** (all tokens, no new fonts):

   | Element | Class |
   |---|---|
   | Sheet title | `font-heading text-lg font-semibold` |
   | Sheet subtitle | `text-xs text-text-muted` |
   | Section labels | `text-xs font-mono uppercase tracking-widest text-text-muted` |
   | Clue-mode tile label | `text-sm font-medium` |
   | Plant name | `text-sm font-medium` (truncate) |
   | Species line | `text-xs text-text-muted` (truncate) |
   | Round-count pills | `text-xs font-semibold` |
   | Primary CTA | `text-base font-semibold` |

3. **Touch targets**: every interactive row ≥ 44px tall; clue-mode tiles ≥
   64px; pills ≥ 36px. This also floors the CTA at 16px, satisfying the
   existing iOS auto-zoom guard in `index.css`.
4. **Dark mode**: token-only colors, so parity is automatic. Match the app's
   existing `bg-primary text-white` selected-state pattern. (A broader
   dark-theme contrast pass is out of scope; do it app-wide in one later pass.)
5. **Safe area**: keep the existing footer padding
   `pb-[max(env(safe-area-inset-bottom,0px),20px)]` and `max-h-[85vh]`.

## Changes — GameSetupSheet.tsx

### 1. Clue-mode toggle → icon-first tiles (fixes suspect #1)

Replace the three `flex-1` icon+text buttons with **three equal tiles,
stacked icon-over-label**, min-height 64px:

```
[ 📷 ]   [ ✏️ ]   [ 📖 ]
 Foto     Naam     Logboek
```

- Icon `size={20}`, label `text-sm font-medium` underneath, `gap-1.5`.
- Selected: `bg-primary text-white`; unselected: `bg-bg text-text-muted
  hover:bg-surface`; container keeps `rounded-xl border border-border`.
- Labels can be short in both languages ("Foto / Naam / Logboek",
  "Photo / Name / Logbook") — the section label above
  ("Aanwijzingstype" / "Clue type") carries the context.
- Add a one-line helper under the tiles only when needed for disambiguation
  (photo mode is default → "Scan de plant" hint is unnecessary; skip).

### 2. Question-count row → label line + wrapping pills (fixes suspect #2)

Split into two lines:

- Line 1: `text-xs text-text-muted` — "Aantal vragen" / "Questions".
- Line 2: pills in a `flex flex-wrap gap-1.5` row — 5 / 10 / 15 / Alle.
- Pill style unchanged (`rounded-full text-xs font-semibold border`),
  but add `py-1.5` → `py-2` for the ≥36px target.
- Show this block only when `selected.size > 3` (as today).

### 3. Create button (fixes suspect #3)

- Label: `Start spel (15)` / `Start game (15)` — short verb, round count from
  `effectiveRounds` (already truthful: capped at 15).
- Style: `w-full py-3.5 rounded-xl bg-primary text-white text-base
  font-semibold disabled:opacity-40`.
- Keep the `(15)` suffix; it is the real round count and helps players plan.
- `creating` state keeps "Aanmaken…" / "Creating…".

### 4. Header (fixes suspect #4)

- Title: add `font-heading text-lg font-semibold` (use Tailwind's `font-heading`
  utility — already configured via `--font-heading`).
- Subtitle: `text-xs text-text-muted mt-0.5` (unchanged, verified).
- Close button: keep 8×8 pill; add `aria-label={t.common.close}` if not
  already present.

### 5. Copy truth (fixes suspect #5)

| Key | NL | EN |
|---|---|---|
| `setupSubtitle` | `Kies 3–50 planten uit je tuin` | `Pick 3–50 plants from your garden` |
| `selectMax` | `Kies maximaal 50 planten` | `Select at most 50 plants` |
| `createGame` | `Start spel` | `Start game` |
| `selectMin` | (unchanged) `Kies minimaal 3 planten` | (unchanged) `Select at least 3 plants` |

### 6. Dedicated empty state (fixes Froink's find)

- Add `noPlantsWithPhotos`:
  - NL: `Nog geen planten met een foto op deze kaart`
  - EN: `No plants with photos on this map yet`
- Use it as the empty-state message in the list body when `plants.length === 0`.
- `noPhotosWarning` stays the amber notice only when plants exist but are
  being filtered (i.e. keep it as the info banner).

### 7. Sheet width on large screens

Add `max-w-md mx-auto` to the sheet panel (with the `mt-auto rounded-t-2xl`
row kept) so tablets/desktop get a centered phone-width column instead of a
full-width strip. Add a 40×4px `bg-border` grab-handle pill at the top of the
panel (rounded-full, centered) — standard bottom-sheet affordance.

### 8. Plant list rows (verified, keep)

Rows are fine: 12×12 photo, truncated name + species, 5×5 check circle,
`border-primary bg-primary/8` selected state. Keep `p-3`; no change.

## Secondary screens (same treatment, lighter touch)

Only if the implementation budget allows — the setup sheet is the user's
complaint; these are consistency passes:

- `GameHostPage.tsx` waiting room: the `text-6xl` join code is intentional
  (a share-code display) — keep. Verify the two buttons under it use the
  `text-base` CTA treatment.
- `GameQuizRound.tsx`: option buttons are already `py-3` (44px) — keep; verify
  the pick-photo grid tiles have ≥44px min touch height on small screens.
- `GameHostPage.tsx` round header: the "RONDE 1 VAN 5" mono label is on-brand —
  keep.

## Acceptance criteria

1. Sheet renders without wrap/clip at 320, 360, 375, 390, 430px widths, NL and EN.
2. All four suspects visibly improved (toggle, count row, CTA, header).
3. Copy matches real caps: 3–50 plants, rounds ≤ 15.
4. Empty state shows the new message, amber notice only as banner.
5. `npm run build` passes; `npx tsc --noEmit` clean.
6. i18n guard passes: `npm run lint:i18n` (no baselined offenders added).
7. Screenshots captured at ≥2 phone widths (Oink's browser pass), before/after.

## Out of scope

- Gameplay logic, backend, API.
- Dark-theme contrast overhaul app-wide.
- Camera/scan screens (`IdentifyCamera`).
- The `text-6xl` join-code display.
