# MapPage redesign — implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the MapPage chrome (top pill-toolbar + right sidebar + always-on biodiversity card) with floating elements over a full-bleed map, per `docs/plans/2026-05-27-mappage-redesign-design.md`.

**Architecture:** Build four new self-contained components — top-bar, action-cluster, bottom-sheet, biodiversity-pill — each mounted independently over a 100%-width MapView. Existing logic (sun engine, plant pins, water/fertilize sheets, identify nav) is reused unchanged; only the UI shell around it changes.

**Tech Stack:** React 19 + TypeScript + Tailwind + Floreren custom CSS tokens. No new dependencies.

**Sequencing rationale:** Build each new component in isolation first (Tasks 1–5), then a single Task 6 commit that swaps the page to use them. That way the page is never broken mid-task — if the user reverts mid-implementation, the old page still works because the new components aren't yet wired in. Tasks 7–10 are cleanup and docs.

---

## File structure (what changes)

| Path | Action | Responsibility |
|---|---|---|
| `frontend/src/components/map/MapTopBar.tsx` | **Create** | Garden pill (top-left) + chevron sub-menu (switch maps / settings) |
| `frontend/src/components/map/MapActionCluster.tsx` | **Create** | Icon-only action cluster (top-right) with ⋯ dropdown for overflow |
| `frontend/src/components/map/MapBottomSheet.tsx` | **Create** | Multi-state sheet (peek / expanded). Accepts `mode: 'care' \| 'sun' \| 'closed'`. |
| `frontend/src/components/map/CareNeedsList.tsx` | **Create** (rename from `MapLegend.tsx`) | Care-needs grouped by type. Container-less; consumed by sheet. |
| `frontend/src/components/map/MapLegend.tsx` | **Delete** | Replaced by `CareNeedsList`. |
| `frontend/src/components/GardenBiodiversityCard.tsx` | **Modify** | Add `mode: 'pill' \| 'card'` prop. Pill is the small floating chip; card is the existing full view, now openable as a modal from the pill. |
| `frontend/src/pages/MapPage.tsx` | **Modify** | Strip old toolbar + right sidebar; mount new components. ~696 → ~400 lines. |
| `frontend/src/index.css` | **Modify** | Drop dead pill-toolbar utility classes; keep `landscape-mobile-hide`. |
| `frontend/src/i18n/nl.ts`, `en.ts`, `translations.ts` | **Modify** | Add `mapPage.switchMap` + sub-menu / sheet labels. |
| `CLAUDE.md` | **Modify** | Remove stale 90°-rotation note; document floating-elements pattern. |

---

## Task 1: Create MapTopBar component

**Files:**
- Create: `frontend/src/components/map/MapTopBar.tsx`
- Modify: `frontend/src/i18n/translations.ts`, `nl.ts`, `en.ts`

**Outcome:** A self-contained floating top-left pill component with a chevron dropdown menu. Not yet mounted on MapPage.

- [ ] **Step 1: Add i18n keys for the sub-menu**

In `frontend/src/i18n/translations.ts`, locate the `mapPage` block and add two new keys to its type definition:

```typescript
  mapPage: {
    // ...existing keys...
    switchMap: string         // "Wisselen…" / "Switch map…"
    mapSettingsLabel: string  // "Instellingen…" / "Settings…"
  }
```

In `frontend/src/i18n/nl.ts`, inside the `mapPage` block, add:

```typescript
switchMap: 'Wisselen…',
mapSettingsLabel: 'Instellingen…',
```

In `frontend/src/i18n/en.ts`, inside the `mapPage` block, add:

```typescript
switchMap: 'Switch map…',
mapSettingsLabel: 'Settings…',
```

- [ ] **Step 2: Create the MapTopBar component**

Write `frontend/src/components/map/MapTopBar.tsx`:

```typescript
import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useT } from '../../context/LanguageContext'
import type { MapInfo } from '../../types'

interface Props {
  map: MapInfo
  allMaps: MapInfo[]
}

export default function MapTopBar({ map, allMaps }: Props) {
  const t = useT()
  const navigate = useNavigate()
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    function onDown(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [open])

  const otherMaps = allMaps.filter((m) => m.id !== map.id)

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-1.5 px-3 py-1.5 bg-surface/92 backdrop-blur-sm rounded-full border border-border/60 shadow-sm text-sm font-semibold text-text hover:bg-surface transition-colors"
        style={{ backdropFilter: 'blur(6px)' }}
      >
        <span className="text-text-muted text-xs">⌄</span>
        <span className="truncate max-w-[180px]">{map.name}</span>
      </button>

      {open && (
        <div className="absolute left-0 top-full mt-1 min-w-[200px] bg-surface border border-border rounded-xl shadow-lg py-1 z-50">
          {otherMaps.length > 0 && (
            <>
              <div className="px-3 pt-1.5 pb-1 text-[10px] font-mono uppercase tracking-widest text-text-muted">
                {t.mapPage.switchMap}
              </div>
              {otherMaps.map((m) => (
                <button
                  key={m.id}
                  onClick={() => { setOpen(false); navigate(`/map/${m.slug}`) }}
                  className="flex items-center gap-2 px-3 py-2 text-sm text-text hover:bg-bg/60 w-full text-left transition-colors"
                >
                  {m.map_type === 'outdoor' ? '🌿' : '🏠'} {m.name}
                </button>
              ))}
              <div className="h-px bg-border mx-3 my-1" />
            </>
          )}
          <button
            onClick={() => { setOpen(false); navigate(`/maps/${map.id}/settings`) }}
            className="flex items-center gap-2 px-3 py-2 text-sm text-text-muted hover:bg-bg/60 w-full text-left transition-colors"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="3" />
              <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
            </svg>
            {t.mapPage.mapSettingsLabel}
          </button>
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 3: Type-check**

Run from repo root:

```bash
cd frontend && npx tsc --noEmit
```

Expected: exits clean (no output).

- [ ] **Step 4: Commit**

```bash
git add frontend/src/components/map/MapTopBar.tsx frontend/src/i18n/translations.ts frontend/src/i18n/nl.ts frontend/src/i18n/en.ts
git commit -m "feat(map): add MapTopBar component with chevron sub-menu"
```

---

## Task 2: Create MapActionCluster component

**Files:**
- Create: `frontend/src/components/map/MapActionCluster.tsx`

**Outcome:** Icon-only cluster with responsive shrink to four icons on mobile. The cluster delegates all actions via callback props; no business logic inside.

- [ ] **Step 1: Create the component**

Write `frontend/src/components/map/MapActionCluster.tsx`:

```typescript
import { useEffect, useRef, useState } from 'react'
import { useT } from '../../context/LanguageContext'
import WaterStatusIcon from '../map/WaterStatusIcon'
import type { GardenWaterStatus } from '../../api/client'

interface Props {
  isOutdoor: boolean
  waterStatus: GardenWaterStatus['status']
  showLabels: boolean
  sunActive: boolean
  sunAvailable: boolean
  inspectorMode: boolean
  onWater: () => void
  onFertilize: () => void
  onToggleSun: () => void
  onToggleLabels: () => void
  onToggleInspector: () => void
  onIdentify: () => void
  onAddPot: () => void
  onAddPlant: () => void
}

export default function MapActionCluster({
  isOutdoor, waterStatus, showLabels,
  sunActive, sunAvailable, inspectorMode,
  onWater, onFertilize, onToggleSun, onToggleLabels, onToggleInspector,
  onIdentify, onAddPot, onAddPlant,
}: Props) {
  const t = useT()
  const [moreOpen, setMoreOpen] = useState(false)
  const moreRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!moreOpen) return
    function onDown(e: MouseEvent) {
      if (moreRef.current && !moreRef.current.contains(e.target as Node)) setMoreOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [moreOpen])

  const iconBtn = "w-8 h-8 flex items-center justify-center rounded-full transition-colors"

  return (
    <div className="flex items-center gap-1.5">
      <div className="flex items-center gap-0.5 bg-surface/92 backdrop-blur-sm rounded-full border border-border/60 shadow-sm p-1" style={{ backdropFilter: 'blur(6px)' }}>
        {/* Always visible: water + fertilize + add plant + more */}
        <button onClick={onWater} title={t.mapPage.water} className={`${iconBtn} text-blue-600 hover:bg-blue-500/15`}>
          <WaterStatusIcon status={waterStatus} size={14} />
        </button>
        <button onClick={onFertilize} title={t.mapPage.fertilize} className={`${iconBtn} hover:bg-emerald-500/15`}>
          <span className="text-sm leading-none">🌿</span>
        </button>

        {/* Desktop-only icons: sun, identify, labels, inspect, +pot */}
        {isOutdoor && (
          <button
            onClick={sunAvailable ? onToggleSun : undefined}
            title={t.mapPage.sun}
            className={`${iconBtn} forced-hidden-mobile ${
              sunActive ? 'bg-amber-400/30 text-amber-700'
              : sunAvailable ? 'text-amber-600 hover:bg-amber-400/15'
              : 'text-amber-600/40 cursor-not-allowed'
            }`}
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="5" />
              <line x1="12" y1="1" x2="12" y2="3" /><line x1="12" y1="21" x2="12" y2="23" />
              <line x1="4.22" y1="4.22" x2="5.64" y2="5.64" /><line x1="18.36" y1="18.36" x2="19.78" y2="19.78" />
              <line x1="1" y1="12" x2="3" y2="12" /><line x1="21" y1="12" x2="23" y2="12" />
              <line x1="4.22" y1="19.78" x2="5.64" y2="18.36" /><line x1="18.36" y1="5.64" x2="19.78" y2="4.22" />
            </svg>
          </button>
        )}
        {isOutdoor && (
          <button onClick={onIdentify} title={t.weeds.identifyCard.title} className={`${iconBtn} forced-hidden-mobile text-green-700 hover:bg-green-500/15`}>
            <span className="text-sm leading-none">📸</span>
          </button>
        )}
        <button onClick={onToggleLabels} title={showLabels ? t.mapPage.labelHide : t.mapPage.labelShow} className={`${iconBtn} forced-hidden-mobile ${showLabels ? 'text-text-muted hover:bg-bg/60' : 'bg-primary text-white'}`}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="3" y="5" width="18" height="4" rx="1" />
            <rect x="3" y="11" width="12" height="4" rx="1" />
            <rect x="3" y="17" width="8" height="4" rx="1" />
          </svg>
        </button>
        <button onClick={onToggleInspector} title={t.mapPage.inspect} className={`${iconBtn} forced-hidden-mobile ${inspectorMode ? 'bg-orange-500/30 text-orange-600' : 'text-orange-500 hover:bg-orange-500/15'}`}>
          <span className="text-xs font-bold">🔍</span>
        </button>
        <button onClick={onAddPot} title={t.mapPage.pot} className={`${iconBtn} forced-hidden-mobile text-amber-800 hover:bg-amber-700/15`}>
          <span className="text-sm leading-none">🪴</span>
        </button>

        {/* Add plant — primary, always visible */}
        <button onClick={onAddPlant} title={t.mapPage.plant} className={`${iconBtn} bg-primary text-white hover:opacity-90`}>
          <span className="text-base font-bold leading-none">+</span>
        </button>

        {/* More — only visible on mobile; opens menu with desktop-only items */}
        <div ref={moreRef} className="relative forced-hidden-desktop">
          <button onClick={() => setMoreOpen((v) => !v)} className={`${iconBtn} text-text-muted hover:bg-bg/60`}>
            <span className="text-base leading-none">⋯</span>
          </button>
          {moreOpen && (
            <div className="absolute right-0 top-full mt-1 min-w-[160px] bg-surface border border-border rounded-xl shadow-lg py-1 z-50">
              {isOutdoor && (
                <button onClick={() => { setMoreOpen(false); if (sunAvailable) onToggleSun() }} className={`flex items-center gap-2 px-3 py-2 text-xs font-medium w-full text-left transition-colors ${sunActive ? 'text-amber-700 bg-amber-400/10' : 'text-text-muted hover:bg-bg/60'}`}>
                  <span className="text-sm">☀</span> {t.mapPage.sun}
                </button>
              )}
              {isOutdoor && (
                <button onClick={() => { setMoreOpen(false); onIdentify() }} className="flex items-center gap-2 px-3 py-2 text-xs font-medium text-text-muted hover:bg-bg/60 w-full text-left transition-colors">
                  <span className="text-sm">📸</span> {t.weeds.identifyCard.title}
                </button>
              )}
              <button onClick={() => { setMoreOpen(false); onToggleLabels() }} className="flex items-center gap-2 px-3 py-2 text-xs font-medium text-text-muted hover:bg-bg/60 w-full text-left transition-colors">
                <span className="text-sm">📝</span> {showLabels ? t.mapPage.labelHide : t.mapPage.labelShow}
              </button>
              <button onClick={() => { setMoreOpen(false); onToggleInspector() }} className={`flex items-center gap-2 px-3 py-2 text-xs font-medium w-full text-left transition-colors ${inspectorMode ? 'text-orange-600 bg-orange-500/10' : 'text-text-muted hover:bg-bg/60'}`}>
                <span className="text-sm">🔍</span> {t.mapPage.inspect}
              </button>
              <button onClick={() => { setMoreOpen(false); onAddPot() }} className="flex items-center gap-2 px-3 py-2 text-xs font-medium text-text-muted hover:bg-bg/60 w-full text-left transition-colors">
                <span className="text-sm">🪴</span> {t.mapPage.pot}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Type-check**

```bash
cd frontend && npx tsc --noEmit
```

Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/map/MapActionCluster.tsx
git commit -m "feat(map): add MapActionCluster component with responsive icon set"
```

---

## Task 3: Rename MapLegend → CareNeedsList, drop outer wrapper

**Files:**
- Create: `frontend/src/components/map/CareNeedsList.tsx`
- Delete: `frontend/src/components/map/MapLegend.tsx`
- Modify: `frontend/src/pages/MapPage.tsx` (import path only)

**Outcome:** Same UI, container-less. Existing MapPage temporarily imports the new path; the right-sidebar mount stays for now (gets removed in Task 6).

- [ ] **Step 1: Copy MapLegend.tsx to CareNeedsList.tsx**

Read `frontend/src/components/map/MapLegend.tsx`. Create the new file with the same contents but rename the default export `MapLegend` → `CareNeedsList` and remove the outer `<div className="bg-surface/95 backdrop-blur-sm rounded-xl border border-border shadow-sm p-3 min-w-[150px] max-h-[60vh] overflow-y-auto">` wrapper — replace with a fragment or a thin `<div className="p-1">` (the sheet provides the container in Task 4).

Specifically, in the JSX returned at the end:

```tsx
// OLD
return (
  <div className="bg-surface/95 backdrop-blur-sm rounded-xl border border-border shadow-sm p-3 min-w-[150px] max-h-[60vh] overflow-y-auto">
    {sortedGroups.map(...)}
    {goodPlants.length > 0 && (...)}
  </div>
)

// NEW
return (
  <div className="space-y-2">
    {sortedGroups.map(...)}
    {goodPlants.length > 0 && (...)}
  </div>
)
```

Keep `CareTypeGroup` and `PlantRow` sub-components inside the same file — same shape, no behaviour change.

- [ ] **Step 2: Update the import in MapPage.tsx**

In `frontend/src/pages/MapPage.tsx`, change:

```typescript
import MapLegend from '../components/map/MapLegend'
```

to:

```typescript
import CareNeedsList from '../components/map/CareNeedsList'
```

And replace the JSX usage `<MapLegend …>` with `<CareNeedsList …>`. Props are identical.

- [ ] **Step 3: Delete the old file**

```bash
rm frontend/src/components/map/MapLegend.tsx
```

- [ ] **Step 4: Type-check + visual sanity**

```bash
cd frontend && npx tsc --noEmit
```

Then visually confirm in the browser at `http://localhost:1414/map/garden` that the right-side legend still renders correctly (it'll lack the surface background now — fine, sheet will provide it in Task 4).

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/map/CareNeedsList.tsx frontend/src/pages/MapPage.tsx
git rm frontend/src/components/map/MapLegend.tsx
git commit -m "refactor(map): rename MapLegend to CareNeedsList; drop outer wrapper"
```

---

## Task 4: Create MapBottomSheet component

**Files:**
- Create: `frontend/src/components/map/MapBottomSheet.tsx`
- Modify: `frontend/src/i18n/translations.ts`, `nl.ts`, `en.ts`

**Outcome:** Self-contained sheet with peek / expanded states and a drag handle. Accepts `mode: 'care' | 'sun' | 'closed'` and renders the appropriate content via children-by-mode props.

- [ ] **Step 1: Add i18n keys for the sheet**

In `frontend/src/i18n/translations.ts`, locate `mapPage` and add:

```typescript
  mapPage: {
    // ...existing keys...
    sheetAttentionCount: (n: number) => string  // "3 planten hebben aandacht"
    sheetAllGood: string                         // "Alles op schema"
  }
```

In `nl.ts`:

```typescript
sheetAttentionCount: (n) => `${n} plant${n === 1 ? '' : 'en'} ${n === 1 ? 'heeft' : 'hebben'} aandacht`,
sheetAllGood: 'Alles op schema',
```

In `en.ts`:

```typescript
sheetAttentionCount: (n) => `${n} plant${n === 1 ? '' : 's'} need${n === 1 ? 's' : ''} attention`,
sheetAllGood: 'All on schedule',
```

- [ ] **Step 2: Create the component**

Write `frontend/src/components/map/MapBottomSheet.tsx`:

```typescript
import { useState, type ReactNode } from 'react'
import { useT } from '../../context/LanguageContext'

export type SheetMode = 'care' | 'sun' | 'closed'

interface Props {
  mode: SheetMode
  attentionCount: number             // for peek label in care mode
  careContent: ReactNode             // CareNeedsList instance
  sunContent: ReactNode              // SunControls instance
  /** When true (sun-mode activates), force open on next render. */
  autoExpand: boolean
}

export default function MapBottomSheet({ mode, attentionCount, careContent, sunContent, autoExpand }: Props) {
  const t = useT()
  // `expanded` is what the user controls. When sun-mode is just turned on
  // (autoExpand toggles true), we mirror it into expanded once.
  const [expanded, setExpanded] = useState(false)

  // Sync expanded with autoExpand transitions: opening sun = expand,
  // closing sun = collapse (per design: don't remember prior care state).
  const [prevAutoExpand, setPrevAutoExpand] = useState(autoExpand)
  if (autoExpand !== prevAutoExpand) {
    setExpanded(autoExpand)
    setPrevAutoExpand(autoExpand)
  }

  if (mode === 'closed') return null

  const peekLabel = mode === 'care'
    ? attentionCount === 0
      ? `✓ ${t.mapPage.sheetAllGood}`
      : `● ${t.mapPage.sheetAttentionCount(attentionCount)}`
    : ''   // sun mode always renders expanded; no peek text

  return (
    <div
      className="absolute bottom-0 left-0 right-0 z-30 bg-surface/96 border-t border-border/60 rounded-t-2xl shadow-[0_-2px_12px_rgba(0,0,0,0.06)] transition-[max-height] duration-200 ease-out overflow-hidden"
      style={{ backdropFilter: 'blur(8px)', maxHeight: expanded ? '75vh' : '54px' }}
    >
      {/* Drag handle row — click to toggle */}
      <button
        onClick={() => setExpanded((v) => !v)}
        className="w-full flex flex-col items-center pt-2 pb-1.5 hover:bg-bg/30 transition-colors"
      >
        <div className="w-8 h-[3px] rounded-sm bg-border" />
        {!expanded && peekLabel && (
          <span className="text-xs font-medium text-text mt-1.5">{peekLabel}</span>
        )}
      </button>

      <div className="px-4 pb-4 overflow-y-auto" style={{ maxHeight: 'calc(75vh - 32px)' }}>
        {mode === 'care' ? careContent : sunContent}
      </div>
    </div>
  )
}
```

- [ ] **Step 3: Type-check**

```bash
cd frontend && npx tsc --noEmit
```

Expected: clean.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/components/map/MapBottomSheet.tsx frontend/src/i18n/translations.ts frontend/src/i18n/nl.ts frontend/src/i18n/en.ts
git commit -m "feat(map): add MapBottomSheet with peek + expanded states"
```

---

## Task 5: Add pill mode to GardenBiodiversityCard

**Files:**
- Modify: `frontend/src/components/GardenBiodiversityCard.tsx`

**Outcome:** The component renders as a compact pill by default (small ring + label) and opens its full card as a modal on click. Existing call site (MapPage right-sidebar) will switch to the pill mode in Task 6.

- [ ] **Step 1: Refactor with mode prop**

Read the current `frontend/src/components/GardenBiodiversityCard.tsx`. Add a `mode` prop and a modal state:

```typescript
interface Props {
  slug: string
  mode?: 'pill' | 'card'   // 'pill' = compact floating chip; 'card' = full panel. Default: 'card'.
}
```

Default `mode = 'card'` keeps the existing behaviour intact for anywhere it's already used.

When `mode === 'pill'`:
- Render a small chip with a 20px ring, the score number, and the localised "Biodiversiteit" / "Biodiversity" label.
- On click, render the full card inside a fixed-positioned modal overlay.
- Pill suppresses itself if `species_count === 0` (empty garden).
- Pill fetches data once on mount and passes the cached `data` to the modal — no double fetch.

Concrete diff strategy:

```typescript
export default function GardenBiodiversityCard({ slug, mode = 'card' }: Props) {
  const t = useT()
  const [data, setData] = useState<GardenBiodiversityOut | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)
  const [modalOpen, setModalOpen] = useState(false)

  useEffect(() => { /* unchanged fetch */ }, [slug])

  if (mode === 'pill') {
    if (loading || error || !data || data.species_count === 0) return null
    const color = data.score >= 60 ? 'var(--color-good)'
                : data.score >= 30 ? 'var(--color-due)'
                : 'var(--color-overdue)'
    const r = 9; const c = 2 * Math.PI * r; const dash = (data.score / 100) * c
    return (
      <>
        <button
          onClick={() => setModalOpen(true)}
          className="flex items-center gap-2 px-3 py-1 bg-surface/92 backdrop-blur-sm rounded-full border border-border/60 shadow-sm hover:bg-surface transition-colors"
          style={{ backdropFilter: 'blur(6px)' }}
        >
          <svg width="22" height="22" viewBox="0 0 22 22" className="-rotate-90">
            <circle cx="11" cy="11" r={r} fill="none" stroke="var(--color-border-soft)" strokeWidth="3" />
            <circle cx="11" cy="11" r={r} fill="none" stroke={color} strokeWidth="3"
                    strokeDasharray={`${dash} ${c - dash}`} strokeLinecap="round" />
          </svg>
          <span className="text-xs font-semibold text-text">{data.score}</span>
          <span className="text-xs text-text-muted">{t.garden.biodiversity.title}</span>
        </button>
        {modalOpen && (
          <div onClick={() => setModalOpen(false)} className="fixed inset-0 z-50 bg-black/30 backdrop-blur-sm flex items-end sm:items-center justify-center p-4">
            <div onClick={(e) => e.stopPropagation()} className="w-full max-w-md">
              {/* re-render the existing card body inline; extract or duplicate */}
              <GardenBiodiversityCardFull data={data} />
            </div>
          </div>
        )}
      </>
    )
  }

  // mode === 'card' — existing render path, unchanged.
  // ...
}
```

Extract the existing `card` JSX (everything inside the current `<section className="card p-4">…</section>`) into an internal helper `GardenBiodiversityCardFull({ data }: { data: GardenBiodiversityOut })` so both modes reuse it.

- [ ] **Step 2: Type-check**

```bash
cd frontend && npx tsc --noEmit
```

Expected: clean. Existing `<EcologyCard>`-style call sites still work because `mode` defaults to `'card'`.

- [ ] **Step 3: Visual sanity check**

In the browser at `http://localhost:1414/map/garden`, the existing card (mounted in the right sidebar) should still render unchanged — `mode` defaults to `'card'`.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/components/GardenBiodiversityCard.tsx
git commit -m "feat(biodiversity): add pill mode that opens full card as modal"
```

---

## Task 6: Wire everything into MapPage and remove old chrome

**Files:**
- Modify: `frontend/src/pages/MapPage.tsx`

**Outcome:** The new layout is live. Right sidebar gone. Top pill-toolbar gone. Mobile ⋯ dropdown gone (replaced by ⋯ inside the action cluster). The page now mounts MapTopBar + MapActionCluster + GardenBiodiversityCard (pill) + MapBottomSheet over a 100%-width MapView.

This is the largest task. The page goes from ~696 → ~400 lines.

- [ ] **Step 1: Add imports + helper computation**

In `frontend/src/pages/MapPage.tsx`, near the top, add:

```typescript
import MapTopBar from '../components/map/MapTopBar'
import MapActionCluster from '../components/map/MapActionCluster'
import MapBottomSheet, { type SheetMode } from '../components/map/MapBottomSheet'
import GardenBiodiversityCard from '../components/GardenBiodiversityCard'
import CareNeedsList from '../components/map/CareNeedsList'   // already imported in Task 3
```

Remove (if still present) the old `import MapLegend from …`. Remove the now-unused `import SunControls from '../components/sun/SunControls'` — re-add it as a child of the sheet.

Compute the attention count inside the component body (after `plants` / `objects` are loaded, before the return). For example:

```typescript
const attentionCount = useMemo(() => {
  const containedPlants = objects.flatMap((o) => o.contained_plants ?? [])
  const all = [...plants, ...containedPlants]
  return all.filter((p) => p.top_warning !== null).length
}, [plants, objects])

const sheetMode: SheetMode = sun.active ? 'sun' : 'care'
```

- [ ] **Step 2: Replace the return JSX**

Locate the top of the rendered tree (the wrapper `<div className="flex flex-col h-[calc(100dvh-5rem)]…">`). Replace its inner structure with this shape:

```tsx
return (
  <div className="relative h-[calc(100dvh-5rem)] [@media(orientation:landscape)and(max-height:500px)]:h-dvh overflow-hidden">
    {/* Map fills viewport */}
    <div className="absolute inset-0">
      <MapView
        map={map}
        plants={plants}
        objects={objects}
        /* …all existing props… */
      />
    </div>

    {/* Top-left: garden pill */}
    <div className="absolute top-3 left-3 z-20 landscape-mobile-hide">
      <MapTopBar map={map} allMaps={maps} />
    </div>

    {/* Top-right: action cluster + biodiversity pill stacked */}
    <div className="absolute top-3 right-3 z-20 flex flex-col items-end gap-2 landscape-mobile-hide">
      <MapActionCluster
        isOutdoor={isOutdoor}
        waterStatus={water.gardenWater?.status ?? 'dry'}
        showLabels={showLabels}
        sunActive={sun.active}
        sunAvailable={sun.available}
        inspectorMode={sun.inspectorMode}
        onWater={water.togglePicker}
        onFertilize={fertilize.togglePicker}
        onToggleSun={sun.toggle}
        onToggleLabels={() => setShowLabels((v) => !v)}
        onToggleInspector={sun.toggleInspectorMode}
        onIdentify={() => navigate('/identify', { state: { mapId: map.id, mapSlug: map.slug } })}
        onAddPot={() => setShowPotPicker(true)}
        onAddPlant={() => navigate('/plants/add', { state: { fromMap: location.pathname } })}
      />
      {isOutdoor && slug && <GardenBiodiversityCard slug={slug} mode="pill" />}
    </div>

    {/* Bottom sheet — care needs OR sun controls */}
    <MapBottomSheet
      mode={sheetMode}
      attentionCount={attentionCount}
      autoExpand={sun.active}
      careContent={<CareNeedsList plants={plants} objects={objects} onPlantTap={handlePlantTap} />}
      sunContent={
        <SunControls
          viewMode={sun.viewMode}
          onViewModeChange={sun.setViewMode}
          selectedMonth={sun.month}
          selectedHour={sun.hour}
          sunPosition={sun.sunPosition}
          onMonthChange={sun.setMonth}
          onHourChange={sun.setHour}
          /* …whatever SunControls expects today… */
        />
      }
    />

    {/* Modals (water picker, fertilize picker, pot picker, plant detail sheet) stay where they were — they're already absolute/fixed. */}
    {water.pickerOpen && <WaterLogPicker /* … */ />}
    {fertilize.pickerOpen && <FertilizeLogPicker /* … */ />}
    {showPotPicker && <PotPicker /* … */ />}
    {selectedFixedPlant && <PlantDetailSheet /* … */ />}
  </div>
)
```

Crucially: **delete the old top header `<div className="flex items-center justify-between mb-2 …">…</div>` block and the old right sidebar `<div className="hidden sm:flex sm:flex-col …">…</div>` block entirely.** They are replaced by the components above.

Also delete the standalone `{isOutdoor && sun.active && (<SunControls … />)}` block at the bottom — SunControls now lives inside the sheet.

Remove the now-unused mobile dropdown (`showMoreActions`, `setShowMoreActions`) state and its JSX — replaced by the ⋯ inside `MapActionCluster`.

Re-import `SunControls` so the sheet's `sunContent` prop can render it:

```typescript
import SunControls from '../components/sun/SunControls'
```

- [ ] **Step 3: Type-check**

```bash
cd frontend && npx tsc --noEmit
```

Expected: clean. If anything errors, the most likely cause is a prop mismatch on `SunControls` — match exactly what it currently accepts in its source.

- [ ] **Step 4: Visual verification in the browser**

With backend + frontend dev servers running:

1. Open `http://localhost:1414/map/garden` (outdoor).
2. Map fills the viewport — no right sidebar, no top pill-toolbar.
3. Top-left: garden pill with chevron. Click → submenu with other maps + Settings.
4. Top-right: icon cluster. Hover each icon — tooltips show. Buttons trigger correctly (water sheet, fertilize sheet, +plant nav, etc.).
5. Below cluster: biodiversity pill showing score. Click → modal opens with full card.
6. Bottom: drag handle + "● N planten hebben aandacht". Tap → expands to ~75% height showing CareNeedsList.
7. Toggle sun mode (☀ icon) — sheet content swaps to SunControls, sheet auto-expands. Toggle off — sheet collapses, content returns to care needs.
8. Resize browser narrow (≤640px wide) — action cluster reduces to four icons, ⋯ opens menu with the rest.
9. Open `/map/<an-indoor-slug>` — no ☀ icon (`isOutdoor` is false), no biodiversity pill, no sun overlay. Other chrome works.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/pages/MapPage.tsx
git commit -m "feat(map): redesign MapPage with floating chrome + bottom sheet"
```

---

## Task 7: Drop dead CSS utility classes

**Files:**
- Modify: `frontend/src/index.css`

**Outcome:** Remove utility classes that supported the old pill-toolbar / mobile-dropdown pattern. The new components use Tailwind directly + `landscape-mobile-hide` (which stays).

- [ ] **Step 1: Identify dead classes**

Grep for these patterns:

```bash
grep -rn "map-action-primary\|map-action-desktop\|map-more-trigger\|map-more-menu\|forced-hidden-mobile\|forced-hidden-desktop\|map-toolbar" frontend/src/
```

The `forced-hidden-mobile` / `forced-hidden-desktop` classes are still referenced in the new `MapActionCluster` — keep them. Drop only classes with zero references after Task 6 changes (likely: `map-action-primary`, `map-action-desktop`, `map-more-trigger`, `map-more-menu`, `map-more-label`, `map-toolbar`).

- [ ] **Step 2: Delete the dead class definitions from index.css**

In `frontend/src/index.css`, find and delete the corresponding rule blocks for the classes confirmed dead in Step 1. Keep `.landscape-mobile-hide`. Keep any class still referenced in the new components.

- [ ] **Step 3: Type-check + visual sanity**

```bash
cd frontend && npx tsc --noEmit
```

Open the map page in the browser. The layout should look identical to after Task 6 (we're only dropping CSS that's no longer referenced).

- [ ] **Step 4: Commit**

```bash
git add frontend/src/index.css
git commit -m "chore(map): drop dead pill-toolbar CSS classes"
```

---

## Task 8: Update CLAUDE.md

**Files:**
- Modify: `CLAUDE.md`

**Outcome:** Docs reflect the new map-page architecture and the (long-removed) 90°-rotation note is gone.

- [ ] **Step 1: Find the stale section**

In `CLAUDE.md`, locate the `## Map system` block (around line 70–90). It mentions:

> On mobile, the SVG container uses a 90° CSS rotation (`rotate(-90deg) translateX(-100%)`) to present landscape maps in portrait. `screenToSVG()` handles this via `getScreenCTM()` — no manual rotation math needed.

This is stale — the 90° rotation is gone (see `index.css` and the existing `landscape-mobile-hide` pattern in `App.tsx`).

- [ ] **Step 2: Replace the SVG-canvas paragraph**

Replace the stale rotation note with:

```markdown
- The SVG `viewBox` comes from `map.viewbox` in the DB — never hardcode it.
- The SVG scales to fill its container using `preserveAspectRatio="xMidYMid meet"` (letterbox).
- In landscape-mobile (`@media (orientation: landscape) and (max-height: 500px)`), `.landscape-mobile-hide` hides the BottomNav and the MapTopBar so the map fills the viewport.
- Scale is `PX_PER_M = 46` (46 px = 1 m). This will become per-map; do not assume it is fixed.
```

- [ ] **Step 3: Add a brief MapPage layout note**

Below the SVG-canvas section, before the `### Coordinate system` heading, insert:

```markdown
### MapPage layout (floating chrome)

The MapPage is a full-bleed map with four floating components on top:

- `MapTopBar` (top-left) — garden name + ⌄ menu (switch / settings)
- `MapActionCluster` (top-right) — icon-only actions, shrinks to 4 icons on mobile + ⋯ for the rest
- `GardenBiodiversityCard mode="pill"` (top-right, below cluster) — outdoor only; click opens full card as modal
- `MapBottomSheet` — peek state shows care-needs count; expanded shows `CareNeedsList` or, in sun mode, `SunControls`

The right-side sidebar and the top pill-toolbar were removed in 2026-05-27. See `docs/plans/2026-05-27-mappage-redesign-design.md`.
```

- [ ] **Step 4: Commit**

```bash
git add CLAUDE.md
git commit -m "docs: update CLAUDE.md for MapPage redesign + drop stale rotation note"
```

---

## Task 9: Final end-to-end verification

**Files:** None modified.

**Outcome:** Confirmed the redesign meets the design-doc's verification checklist.

- [ ] **Step 1: Walk the verification checklist**

With backend + frontend dev servers running, work through each item from the design doc's "Verification" section. Mark any that fail and fix before considering the task complete.

- Open `/map/garden` on desktop — full-bleed map, no right sidebar, no pill-toolbar. ✓
- Toggle sun mode — sheet swaps to SunControls. Toggle off — returns to care needs. ✓
- Resize narrow — cluster shrinks to 4 icons + ⋯; menu shows the rest. ✓
- Mobile-landscape rotation — top floaters hidden via `landscape-mobile-hide`, sheet remains. ✓
- Open `/map/<indoor>` — no ☀, no biodiversity pill. ✓
- Click `⌄` on garden pill — submenu shows other maps + Settings. ✓
- Click biodiversity pill — modal with full card opens. ✓
- Plant tap, label toggle, water/fertilise pickers — no regressions. ✓

- [ ] **Step 2: Run any existing tests**

```bash
cd frontend && npx tsc --noEmit
# If there are jest/vitest tests in the repo for MapPage-related code, run them too.
ls frontend/src/**/__tests__/ 2>/dev/null
```

Expected: tsc clean. Existing tests (if any) still pass.

- [ ] **Step 3: No commit needed** — verification is the deliverable.

---

## Self-review

- **Spec coverage check:**
  - "Top-left: tuin-pill + chevron sub-menu" → Task 1 ✓
  - "Top-right: 6-icon cluster (desktop) / 4-icon (mobile) + ⋯ for overflow" → Task 2 ✓
  - "Biodiversity pill below cluster, opens modal on click" → Task 5 ✓
  - "Bottom-sheet: peek + expanded; care vs sun mode in one container" → Task 4 + Task 6 ✓
  - "Sun-mode replaces care-content; auto-expand on activate; collapse on deactivate; no prior-state memory" → Task 4 state logic + Task 6 wiring ✓
  - "Rename MapLegend → CareNeedsList, drop outer wrapper" → Task 3 ✓
  - "Remove right sidebar, remove pill-toolbar, remove mobile ⋯ dropdown" → Task 6 ✓
  - "Drop dead CSS utility classes" → Task 7 ✓
  - "Update CLAUDE.md to remove stale rotation note + document new pattern" → Task 8 ✓
- **Placeholder scan:** No TBDs, no "implement appropriate error handling", no "similar to". Where Step 2 of Task 6 says `/* …all existing props… */`, that's an intentional "preserve current props" instruction, not a placeholder for new code.
- **Type consistency:** `SheetMode` defined in Task 4, used in Task 6. `mode: 'pill' | 'card'` defined in Task 5, used in Task 6. Prop names on the new components match between definition and consumer.
