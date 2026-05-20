# Onboarding Welcome Checklist — Design Spec

**Date:** 2026-05-20  
**Status:** Approved, pending implementation

## Overview

New users landing on the dashboard for the first time see an empty, confusing screen. This spec adds a dismissible welcome checklist card to the dashboard that guides them through the two steps needed before Groei is useful: creating a map and adding a first plant.

## Approach

A self-contained card component renders at the top of the dashboard (below the greeting, above care tasks) whenever a user hasn't yet completed both setup steps and hasn't dismissed it. No wizard, no forced flow — the user navigates at their own pace.

## Behaviour

**Visibility rule:** Show the card when BOTH of these are true:
1. The user has not dismissed it
2. At least one step is incomplete (`!hasMap || !hasPlant`)

**Auto-hide:** When both steps are complete (`hasMap && hasPlant`), the card disappears automatically on the next render — no action needed from the user.

**Manual dismiss:** An ✕ button in the top-right corner permanently hides the card. It never returns, even if the user later deletes their map or plants.

## Steps

Two checklist items, in order:

| Step | Done when | Action |
|---|---|---|
| Create your first map | `maps.length > 0` | Calls `onCreateMap()` callback → opens the existing inline create-map modal in Dashboard |
| Add your first plant | `dashboardV2.total_plants > 0` | Navigates to `/plants/add` |

Each incomplete step shows a "Go →" link. Completed steps show a filled green checkmark and strikethrough text. The subtitle updates as progress is made ("Two quick steps to set up your garden." → "One more step to go.").

## Component

**File:** `groei/frontend/src/components/WelcomeChecklist.tsx`

Self-contained component. Responsible for:
- Reading/writing the dismissed flag from localStorage
- Reading `hasMap` and `hasPlant` from props (passed in by Dashboard)
- Rendering nothing if dismissed or both steps complete
- Rendering the card with live step state otherwise

**Props:**
```ts
interface WelcomeChecklistProps {
  hasMap: boolean
  hasPlant: boolean
  accountId: number    // used to scope the localStorage key
  onCreateMap: () => void
}
```

**localStorage key:** `groei-onboarding-dismissed-{accountId}` — scoped per account so a second household member gets their own flag.

## Data sources (no new API calls)

- `hasMap` — `maps.length > 0`. `maps` is already loaded in the Zustand store when Dashboard mounts.
- `hasPlant` — `dashboardV2.total_plants > 0`. `dashboardV2` is already fetched on Dashboard mount. If `total_plants` is not currently part of the `dashboardV2` payload, add it to the backend response (single extra count query, no new endpoint).
- `accountId` — use `activeUserId` from the Zustand store (already available in Dashboard).

## Dashboard integration

In `Dashboard.tsx`, resolve `hasMap`, `hasPlant`, and `accountId`, then render:

```tsx
<WelcomeChecklist
  hasMap={hasMap}
  hasPlant={hasPlant}
  accountId={activeUserId}
  onCreateMap={openNewMap}
/>
```

Placed between the greeting row and the care tasks section.

## Visual design

- Card background: white (`var(--color-surface)`)
- Border: `1px solid` with a subtle green tint (`--color-border` + green overlay)
- Title: "🌱 Getting started" in `--color-primary` (green), bold
- Completed step circle: filled green with white ✓
- Incomplete step circle: outlined grey
- Completed step label: strikethrough, muted colour
- ✕ button: top-right, muted colour, no background

Matches the existing card style used throughout the dashboard.

## i18n

New keys needed in `en.ts` and `nl.ts`:

| Key | English | Dutch |
|---|---|---|
| `onboarding.title` | Getting started | Aan de slag |
| `onboarding.subtitleBoth` | Two quick steps to set up your garden. | Twee stappen om je tuin in te richten. |
| `onboarding.subtitleOne` | One more step to go. | Nog één stap. |
| `onboarding.stepMap` | Create your first map | Maak je eerste kaart |
| `onboarding.stepMapHint` | A garden, room, or balcony | Een tuin, kamer of balkon |
| `onboarding.stepPlant` | Add your first plant | Voeg je eerste plant toe |
| `onboarding.stepPlantHint` | Place it on the map | Zet hem op de kaart |
| `onboarding.go` | Go | Ga |

## Out of scope

- Onboarding for the care schedule step (intentionally left out — map + plant is enough)
- Server-side persistence of dismissed state (localStorage is sufficient)
- Re-showing the card after dismissal under any condition
- Onboarding tooltips or product tours on other pages
