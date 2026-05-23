# Shadow Caster Panel Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace raw pixel coordinate inputs and confusing opacity slider in `ShadowCasterPropertiesPanel` with human-readable metre values, a direction picker for external buildings, and three labelled density presets.

**Architecture:** Conversion utilities (pure functions) live in a new `utils/shadowCasterConversions.ts`. The panel reads these to display human-readable values, and writes them back to raw SVG pixels via `onUpdate`. `LayoutEditorPage` computes `gardenBounds` from editor zones and passes it as a new prop.

**Tech Stack:** React 19 + TypeScript, Vitest for tests. All changes are frontend-only — no backend or DB schema changes.

---

### Task 1: Fix visual opacity rendering

**Files:**
- Modify: `groei/frontend/src/utils/shadowGeometry.ts`
- Modify: `groei/frontend/src/components/map/ShadowLayer.tsx`
- Test: `groei/frontend/src/utils/__tests__/shadowGeometry.test.ts` (run existing tests, no changes needed)

Remove the `Math.min(opacity, 0.65)` render-cap that was added as a workaround, and set the ShadowLayer multiplier to `0.35` so the three density presets produce a meaningful visual spread (0.09 / 0.21 / 0.35 alpha).

- [ ] **Step 1: Remove render-cap from `computeRectShadow` in `shadowGeometry.ts`**

Find (around line 100):
```ts
  // Cap render opacity below 1 so solid buildings don't render as pitch-black;
  // heatmap block factor is derived separately from the raw caster.opacity.
  const renderOpacity = Math.min(caster.opacity ?? 0.35, 0.65)
  return { id: caster.id, pathD: pointsToPath(hull), opacity: renderOpacity }
```

Replace with:
```ts
  return { id: caster.id, pathD: pointsToPath(hull), opacity: caster.opacity ?? 0.35 }
```

- [ ] **Step 2: Remove render-cap from `computePolygonShadow` in `shadowGeometry.ts`**

Find (around line 122):
```ts
  const renderOpacity = Math.min(caster.opacity ?? 0.35, 0.65)
  return { id: caster.id, pathD: pointsToPath(hull), opacity: renderOpacity }
```

Replace with:
```ts
  return { id: caster.id, pathD: pointsToPath(hull), opacity: caster.opacity ?? 0.35 }
```

- [ ] **Step 3: Change ShadowLayer multiplier from `0.4` to `0.35`**

In `groei/frontend/src/components/map/ShadowLayer.tsx`, find:
```tsx
            fill={`rgba(20, 40, 70, ${s.opacity * 0.4})`}
```

Replace with:
```tsx
            fill={`rgba(20, 40, 70, ${s.opacity * 0.35})`}
```

- [ ] **Step 4: Run existing shadow geometry tests**

```bash
cd groei && npx vitest run src/utils/__tests__/shadowGeometry.test.ts
```

Expected: all tests pass (the render-cap removal doesn't affect shadow geometry or direction tests).

- [ ] **Step 5: Commit**

```bash
git add groei/frontend/src/utils/shadowGeometry.ts groei/frontend/src/components/map/ShadowLayer.tsx
git commit -m "fix: remove render-cap, set shadow multiplier to 0.35 for preset range"
```

---

### Task 2: Create shadow caster conversion utilities

**Files:**
- Create: `groei/frontend/src/utils/shadowCasterConversions.ts`
- Create: `groei/frontend/src/utils/__tests__/shadowCasterConversions.test.ts`

Pure functions for converting between raw SVG pixel coordinates and human-readable metre values. No React — pure TS so they're easy to test.

- [ ] **Step 1: Write the failing tests**

Create `groei/frontend/src/utils/__tests__/shadowCasterConversions.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import {
  detectKant,
  rectToDisplay,
  displayToRect,
  circleToDisplay,
  displayToCircle,
  opacityToPreset,
  PRESET_OPACITIES,
} from '../shadowCasterConversions'
import type { ShadowCaster } from '../../types'

const BOUNDS = { minX: 0, minY: 0, maxX: 400, maxY: 600 }
const SCALE = 46 // PX_PER_M

function rect(x: number, y: number, w: number, h: number): ShadowCaster & { type: 'rect' } {
  return { id: 't', label: 't', type: 'rect', x, y, width: w, height: h, heightCm: 1000 }
}

describe('detectKant', () => {
  it('caster right edge < minX → links', () => {
    expect(detectKant(rect(-300, -500, 100, 1500), BOUNDS)).toBe('links')
  })
  it('caster left edge > maxX → rechts', () => {
    expect(detectKant(rect(500, -500, 100, 1500), BOUNDS)).toBe('rechts')
  })
  it('caster bottom edge < minY → boven', () => {
    expect(detectKant(rect(-500, -200, 1500, 50), BOUNDS)).toBe('boven')
  })
  it('caster top edge > maxY → onder', () => {
    expect(detectKant(rect(-500, 700, 1500, 100), BOUNDS)).toBe('onder')
  })
  it('caster inside garden → defaults to links', () => {
    expect(detectKant(rect(100, 100, 100, 100), BOUNDS)).toBe('links')
  })
})

describe('rectToDisplay', () => {
  it('links: afstand and dikte computed correctly', () => {
    // building width=92px(2m) at x=-138 → 46px(1m) gap from minX=0
    const caster = rect(-138, -900, 92, 1800)
    const d = rectToDisplay(caster, BOUNDS, SCALE)
    expect(d.kant).toBe('links')
    expect(d.afstandM).toBeCloseTo(1, 0)
    expect(d.dikteM).toBeCloseTo(2, 0)
  })
  it('rechts: afstand from maxX', () => {
    const caster = rect(492, -900, 92, 1800) // 92px gap from maxX=400
    const d = rectToDisplay(caster, BOUNDS, SCALE)
    expect(d.kant).toBe('rechts')
    expect(d.afstandM).toBeCloseTo(2, 0)
    expect(d.dikteM).toBeCloseTo(2, 0)
  })
})

describe('displayToRect round-trip', () => {
  it('links round-trip preserves afstand and dikte', () => {
    const px = displayToRect('links', 2, 8, BOUNDS, SCALE)
    const caster = rect(px.x, px.y, px.width, px.height)
    const d = rectToDisplay(caster, BOUNDS, SCALE)
    expect(d.kant).toBe('links')
    expect(d.afstandM).toBeCloseTo(2, 0)
    expect(d.dikteM).toBeCloseTo(8, 0)
  })
  it('rechts round-trip', () => {
    const px = displayToRect('rechts', 3, 10, BOUNDS, SCALE)
    const caster = rect(px.x, px.y, px.width, px.height)
    const d = rectToDisplay(caster, BOUNDS, SCALE)
    expect(d.kant).toBe('rechts')
    expect(d.afstandM).toBeCloseTo(3, 0)
    expect(d.dikteM).toBeCloseTo(10, 0)
  })
  it('building auto-spans 3× garden height for links/rechts', () => {
    const px = displayToRect('links', 1, 5, BOUNDS, SCALE)
    expect(px.height).toBe((BOUNDS.maxY - BOUNDS.minY) * 3)
  })
  it('building auto-spans 3× garden width for boven/onder', () => {
    const px = displayToRect('boven', 1, 5, BOUNDS, SCALE)
    expect(px.width).toBe((BOUNDS.maxX - BOUNDS.minX) * 3)
  })
})

describe('circleToDisplay + displayToCircle round-trip', () => {
  it('round-trips cx/cy/radius within 1px rounding', () => {
    const caster: ShadowCaster & { type: 'circle' } = {
      id: 't', label: 't', type: 'circle', cx: 268, cy: 507, radius: 80, heightCm: 1400,
    }
    const { xM, yM, straalM } = circleToDisplay(caster, SCALE)
    const result = displayToCircle(xM, yM, straalM, SCALE)
    expect(Math.abs(result.cx - caster.cx)).toBeLessThan(2)
    expect(Math.abs(result.cy - caster.cy)).toBeLessThan(2)
    expect(Math.abs(result.radius - caster.radius)).toBeLessThan(2)
  })
  it('straal minimum is 0.5m', () => {
    const caster: ShadowCaster & { type: 'circle' } = {
      id: 't', label: 't', type: 'circle', cx: 0, cy: 0, radius: 1, heightCm: 100,
    }
    const { straalM } = circleToDisplay(caster, SCALE)
    expect(straalM).toBeGreaterThanOrEqual(0.5)
  })
})

describe('opacityToPreset', () => {
  it('0.25 → lichte-boom', () => expect(opacityToPreset(0.25)).toBe('lichte-boom'))
  it('0.0 → lichte-boom', () => expect(opacityToPreset(0)).toBe('lichte-boom'))
  it('0.39 → lichte-boom', () => expect(opacityToPreset(0.39)).toBe('lichte-boom'))
  it('0.4 → dichte-boom', () => expect(opacityToPreset(0.4)).toBe('dichte-boom'))
  it('0.6 → dichte-boom', () => expect(opacityToPreset(0.6)).toBe('dichte-boom'))
  it('0.8 → dichte-boom', () => expect(opacityToPreset(0.8)).toBe('dichte-boom'))
  it('0.81 → gebouw', () => expect(opacityToPreset(0.81)).toBe('gebouw'))
  it('1.0 → gebouw', () => expect(opacityToPreset(1.0)).toBe('gebouw'))
})

describe('PRESET_OPACITIES', () => {
  it('lichte-boom is 0.25', () => expect(PRESET_OPACITIES['lichte-boom']).toBe(0.25))
  it('dichte-boom is 0.60', () => expect(PRESET_OPACITIES['dichte-boom']).toBe(0.60))
  it('gebouw is 1.0', () => expect(PRESET_OPACITIES['gebouw']).toBe(1.0))
})
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
cd groei && npx vitest run src/utils/__tests__/shadowCasterConversions.test.ts
```

Expected: FAIL — module `shadowCasterConversions` not found.

- [ ] **Step 3: Create `groei/frontend/src/utils/shadowCasterConversions.ts`**

```ts
import type { ShadowCaster } from '../types'

export type Kant = 'links' | 'rechts' | 'boven' | 'onder'

export type GardenBounds = { minX: number; minY: number; maxX: number; maxY: number }

export const PRESET_OPACITIES = {
  'lichte-boom': 0.25,
  'dichte-boom': 0.60,
  'gebouw': 1.0,
} as const

export type DichtheidPreset = keyof typeof PRESET_OPACITIES

export function detectKant(caster: ShadowCaster & { type: 'rect' }, bounds: GardenBounds): Kant {
  const { x, y, width, height } = caster
  if (x + width <= bounds.minX) return 'links'
  if (x >= bounds.maxX) return 'rechts'
  if (y + height <= bounds.minY) return 'boven'
  if (y >= bounds.maxY) return 'onder'
  return 'links'
}

export function rectToDisplay(
  caster: ShadowCaster & { type: 'rect' },
  bounds: GardenBounds,
  scalePxPerM: number,
): { kant: Kant; afstandM: number; dikteM: number } {
  const kant = detectKant(caster, bounds)
  let afstandPx: number
  let diktePx: number
  switch (kant) {
    case 'links':
      afstandPx = bounds.minX - (caster.x + caster.width)
      diktePx = caster.width
      break
    case 'rechts':
      afstandPx = caster.x - bounds.maxX
      diktePx = caster.width
      break
    case 'boven':
      afstandPx = bounds.minY - (caster.y + caster.height)
      diktePx = caster.height
      break
    case 'onder':
      afstandPx = caster.y - bounds.maxY
      diktePx = caster.height
      break
  }
  return {
    kant,
    afstandM: Math.max(0, afstandPx / scalePxPerM),
    dikteM: Math.max(0.5, diktePx / scalePxPerM),
  }
}

export function displayToRect(
  kant: Kant,
  afstandM: number,
  dikteM: number,
  bounds: GardenBounds,
  scalePxPerM: number,
): { x: number; y: number; width: number; height: number } {
  const afstandPx = Math.round(afstandM * scalePxPerM)
  const diktePx = Math.round(dikteM * scalePxPerM)
  const gardenW = bounds.maxX - bounds.minX
  const gardenH = bounds.maxY - bounds.minY
  const centerX = (bounds.minX + bounds.maxX) / 2
  const centerY = (bounds.minY + bounds.maxY) / 2
  switch (kant) {
    case 'links': {
      const w = diktePx
      const h = gardenH * 3
      return { x: Math.round(bounds.minX - afstandPx - w), y: Math.round(centerY - h / 2), width: w, height: h }
    }
    case 'rechts': {
      const w = diktePx
      const h = gardenH * 3
      return { x: Math.round(bounds.maxX + afstandPx), y: Math.round(centerY - h / 2), width: w, height: h }
    }
    case 'boven': {
      const w = gardenW * 3
      const h = diktePx
      return { x: Math.round(centerX - w / 2), y: Math.round(bounds.minY - afstandPx - h), width: w, height: h }
    }
    case 'onder': {
      const w = gardenW * 3
      const h = diktePx
      return { x: Math.round(centerX - w / 2), y: Math.round(bounds.maxY + afstandPx), width: w, height: h }
    }
  }
}

export function circleToDisplay(
  caster: ShadowCaster & { type: 'circle' },
  scalePxPerM: number,
): { xM: number; yM: number; straalM: number } {
  return {
    xM: Math.round((caster.cx / scalePxPerM) * 10) / 10,
    yM: Math.round((caster.cy / scalePxPerM) * 10) / 10,
    straalM: Math.max(0.5, Math.round((caster.radius / scalePxPerM) * 10) / 10),
  }
}

export function displayToCircle(
  xM: number,
  yM: number,
  straalM: number,
  scalePxPerM: number,
): { cx: number; cy: number; radius: number } {
  return {
    cx: Math.round(xM * scalePxPerM),
    cy: Math.round(yM * scalePxPerM),
    radius: Math.max(1, Math.round(straalM * scalePxPerM)),
  }
}

export function opacityToPreset(opacity: number): DichtheidPreset {
  if (opacity < 0.4) return 'lichte-boom'
  if (opacity <= 0.8) return 'dichte-boom'
  return 'gebouw'
}
```

- [ ] **Step 4: Run tests to confirm they pass**

```bash
cd groei && npx vitest run src/utils/__tests__/shadowCasterConversions.test.ts
```

Expected: all tests PASS.

- [ ] **Step 5: Commit**

```bash
git add groei/frontend/src/utils/shadowCasterConversions.ts groei/frontend/src/utils/__tests__/shadowCasterConversions.test.ts
git commit -m "feat: add shadow caster coordinate conversion utilities"
```

---

### Task 3: Rewrite ShadowCasterPropertiesPanel

**Files:**
- Modify: `groei/frontend/src/components/editor/ShadowCasterPropertiesPanel.tsx`

Full rewrite of the panel. The `gardenBounds` prop is added here; `LayoutEditorPage` will pass it in Task 4.

- [ ] **Step 1: Replace the entire file content**

`groei/frontend/src/components/editor/ShadowCasterPropertiesPanel.tsx`:

```tsx
import type { ShadowCaster } from '../../types'
import {
  detectKant,
  rectToDisplay,
  displayToRect,
  circleToDisplay,
  displayToCircle,
  opacityToPreset,
  PRESET_OPACITIES,
  type Kant,
  type GardenBounds,
} from '../../utils/shadowCasterConversions'

interface Props {
  caster: ShadowCaster
  scalePxPerM: number
  gardenBounds: GardenBounds
  onUpdate: (updates: Partial<ShadowCaster>) => void
  onDelete: () => void
}

const KANT_OPTIONS: { value: Kant; label: string }[] = [
  { value: 'links', label: 'Links' },
  { value: 'rechts', label: 'Rechts' },
  { value: 'boven', label: 'Boven' },
  { value: 'onder', label: 'Onder' },
]

const PRESET_LABELS: Record<string, string> = {
  'lichte-boom': 'Lichte boom',
  'dichte-boom': 'Dichte boom',
  'gebouw': 'Gebouw / Muur',
}

function numInput(
  value: number,
  onChange: (v: number) => void,
  opts: { min?: number; max?: number; step?: number } = {},
) {
  return (
    <input
      type="number"
      step={opts.step ?? 0.5}
      min={opts.min ?? 0}
      max={opts.max}
      value={value}
      onChange={(e) => {
        const v = parseFloat(e.target.value)
        if (!isNaN(v)) onChange(v)
      }}
      className="w-full border border-border rounded-lg px-2 py-1 text-xs bg-bg text-text"
    />
  )
}

export default function ShadowCasterPropertiesPanel({ caster, scalePxPerM, gardenBounds, onUpdate, onDelete }: Props) {
  const isRect = caster.type === 'rect'

  function handleTypeChange(type: 'rect' | 'circle') {
    if (type === caster.type) return
    if (type === 'circle' && caster.type === 'rect') {
      const cx = caster.x + caster.width / 2
      const cy = caster.y + caster.height / 2
      const radius = Math.max(10, Math.min(caster.width, caster.height) / 2)
      onUpdate({ type: 'circle', cx, cy, radius, x: undefined as never, y: undefined as never, width: undefined as never, height: undefined as never })
    } else if (type === 'rect' && caster.type === 'circle') {
      onUpdate({
        type: 'rect',
        x: Math.round(caster.cx - caster.radius),
        y: Math.round(caster.cy - caster.radius),
        width: caster.radius * 2,
        height: caster.radius * 2,
        cx: undefined as never,
        cy: undefined as never,
        radius: undefined as never,
      })
    }
  }

  const heightM = caster.heightCm / 100
  const activePreset = opacityToPreset(caster.opacity ?? 1)

  // ── Gebouw (rect) display values ──
  const rectDisplay = isRect
    ? rectToDisplay(caster as ShadowCaster & { type: 'rect' }, gardenBounds, scalePxPerM)
    : null

  function handleKantChange(kant: Kant) {
    if (!rectDisplay) return
    const px = displayToRect(kant, rectDisplay.afstandM, rectDisplay.dikteM, gardenBounds, scalePxPerM)
    onUpdate(px)
  }

  function handleAfstandChange(afstandM: number) {
    if (!rectDisplay) return
    const px = displayToRect(rectDisplay.kant, Math.max(0, afstandM), rectDisplay.dikteM, gardenBounds, scalePxPerM)
    onUpdate(px)
  }

  function handleDikteChange(dikteM: number) {
    if (!rectDisplay) return
    const px = displayToRect(rectDisplay.kant, rectDisplay.afstandM, Math.max(0.5, dikteM), gardenBounds, scalePxPerM)
    onUpdate(px)
  }

  // ── Boom (circle) display values ──
  const circleDisplay = !isRect
    ? circleToDisplay(caster as ShadowCaster & { type: 'circle' }, scalePxPerM)
    : null

  function handleCircleChange(field: 'xM' | 'yM' | 'straalM', v: number) {
    if (!circleDisplay) return
    const next = { ...circleDisplay, [field]: v }
    const px = displayToCircle(next.xM, next.yM, next.straalM, scalePxPerM)
    onUpdate(px)
  }

  return (
    <div className="p-3 border-b border-border">
      <div className="flex items-center justify-between mb-2">
        <p className="text-xs font-semibold text-text-muted uppercase tracking-wide">
          Schaduw object
        </p>
        <button
          onClick={onDelete}
          className="text-overdue text-xs px-2 py-0.5 rounded border border-overdue/20 bg-overdue/5"
        >
          Verwijderen
        </button>
      </div>

      {/* Type toggle */}
      <div className="mb-3">
        <label className="text-xs text-text-muted block mb-1">Type</label>
        <div className="flex gap-1">
          <button
            onClick={() => handleTypeChange('rect')}
            className={`flex-1 text-xs py-1.5 rounded-lg border ${
              isRect ? 'bg-primary text-white border-primary' : 'bg-bg text-text-muted border-border'
            }`}
          >
            Gebouw
          </button>
          <button
            onClick={() => handleTypeChange('circle')}
            className={`flex-1 text-xs py-1.5 rounded-lg border ${
              !isRect ? 'bg-primary text-white border-primary' : 'bg-bg text-text-muted border-border'
            }`}
          >
            Boom
          </button>
        </div>
      </div>

      {/* Naam */}
      <div className="mb-3">
        <label className="text-xs text-text-muted block mb-1">Naam</label>
        <input
          value={caster.label || ''}
          onChange={(e) => onUpdate({ label: e.target.value })}
          placeholder={isRect ? "bijv. Buurman's huis" : 'bijv. Eik, Spar...'}
          className="w-full border border-border rounded-lg px-2.5 py-1.5 text-sm bg-bg text-text"
        />
      </div>

      {/* Position — Gebouw */}
      {isRect && rectDisplay && (
        <div className="mb-3">
          <label className="text-xs text-text-muted block mb-1">Positie</label>
          <div className="mb-1.5">
            <label className="text-[10px] text-text-muted">Kant</label>
            <select
              value={rectDisplay.kant}
              onChange={(e) => handleKantChange(e.target.value as Kant)}
              className="w-full border border-border rounded-lg px-2 py-1 text-xs bg-bg text-text"
            >
              {KANT_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-1.5">
            <div>
              <label className="text-[10px] text-text-muted">Afstand van tuin (m)</label>
              {numInput(Math.round(rectDisplay.afstandM * 10) / 10, handleAfstandChange, { min: 0, step: 0.5 })}
            </div>
            <div>
              <label className="text-[10px] text-text-muted">Dikte (m)</label>
              {numInput(Math.round(rectDisplay.dikteM * 10) / 10, handleDikteChange, { min: 0.5, step: 0.5 })}
            </div>
          </div>
        </div>
      )}

      {/* Position — Boom */}
      {!isRect && circleDisplay && (
        <div className="mb-3">
          <label className="text-xs text-text-muted block mb-1">Positie &amp; grootte</label>
          <div className="grid grid-cols-2 gap-1.5">
            <div>
              <label className="text-[10px] text-text-muted">X (m)</label>
              {numInput(circleDisplay.xM, (v) => handleCircleChange('xM', v), { step: 0.5 })}
            </div>
            <div>
              <label className="text-[10px] text-text-muted">Y (m)</label>
              {numInput(circleDisplay.yM, (v) => handleCircleChange('yM', v), { step: 0.5 })}
            </div>
            <div>
              <label className="text-[10px] text-text-muted">Straal (m)</label>
              {numInput(circleDisplay.straalM, (v) => handleCircleChange('straalM', v), { min: 0.5, step: 0.5 })}
            </div>
          </div>
        </div>
      )}

      {/* Hoogte */}
      <div className="mb-3">
        <label className="text-xs text-text-muted block mb-1">Hoogte (m)</label>
        {numInput(
          Math.round(heightM * 10) / 10,
          (v) => onUpdate({ heightCm: Math.max(50, Math.round(v * 100)) }),
          { min: 0.5, max: 30, step: 0.5 },
        )}
      </div>

      {/* Dichtheid presets */}
      <div>
        <label className="text-xs text-text-muted block mb-1">Schaduwdichtheid</label>
        <div className="flex gap-1">
          {(Object.keys(PRESET_OPACITIES) as Array<keyof typeof PRESET_OPACITIES>).map((preset) => (
            <button
              key={preset}
              onClick={() => onUpdate({ opacity: PRESET_OPACITIES[preset] })}
              className={`flex-1 text-[10px] py-1.5 px-1 rounded-lg border leading-tight ${
                activePreset === preset
                  ? 'bg-primary text-white border-primary'
                  : 'bg-bg text-text-muted border-border hover:bg-surface'
              }`}
            >
              {PRESET_LABELS[preset]}
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Check TypeScript compiles without errors**

```bash
cd groei && npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add groei/frontend/src/components/editor/ShadowCasterPropertiesPanel.tsx
git commit -m "feat: rewrite ShadowCasterPropertiesPanel with metre inputs and density presets"
```

---

### Task 4: Wire gardenBounds into LayoutEditorPage

**Files:**
- Modify: `groei/frontend/src/pages/LayoutEditorPage.tsx`

`gardenBounds` is computed from editor zones using the already-available `deriveGardenBounds` utility.

- [ ] **Step 1: Add import and compute gardenBounds**

In `groei/frontend/src/pages/LayoutEditorPage.tsx`, line 1 currently reads:
```ts
import { useEffect, useRef, useState, useCallback } from 'react'
```

Change it to:
```ts
import { useEffect, useMemo, useRef, useState, useCallback } from 'react'
```

Then add this import alongside the other utility imports:
```ts
import { deriveGardenBounds } from '../utils/gardenFromCanvas'
```

Then add this `useMemo` after the `editor = useEditorState()` line (around line 28):

```ts
  const gardenBounds = useMemo(
    () => deriveGardenBounds(editor.zones),
    [editor.zones],
  )
```

- [ ] **Step 2: Pass gardenBounds to ShadowCasterPropertiesPanel**

Find the `ShadowCasterPropertiesPanel` usage (around line 279):

```tsx
            {selectedShadowCaster && (
              <ShadowCasterPropertiesPanel
                caster={selectedShadowCaster}
                scalePxPerM={editor.scalePxPerM}
                onUpdate={(updates) => editor.updateShadowCaster(selectedShadowCaster.id, updates)}
                onDelete={handleDelete}
              />
            )}
```

Replace with:

```tsx
            {selectedShadowCaster && (
              <ShadowCasterPropertiesPanel
                caster={selectedShadowCaster}
                scalePxPerM={editor.scalePxPerM}
                gardenBounds={gardenBounds}
                onUpdate={(updates) => editor.updateShadowCaster(selectedShadowCaster.id, updates)}
                onDelete={handleDelete}
              />
            )}
```

- [ ] **Step 3: Check TypeScript compiles without errors**

```bash
cd groei && npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 4: Run all tests**

```bash
cd groei && npx vitest run
```

Expected: all tests pass.

- [ ] **Step 5: Commit**

```bash
git add groei/frontend/src/pages/LayoutEditorPage.tsx
git commit -m "feat: pass gardenBounds to ShadowCasterPropertiesPanel"
```

---

### Task 5: Manual verification

- [ ] **Step 1: Start the dev server**

```bash
cd groei && npm run dev
```

- [ ] **Step 2: Open the Tuin layout editor**

Navigate to `http://localhost:5173` → open the Tuin map → click the edit/layout button.

- [ ] **Step 3: Test adding a Gebouw shadow caster**

1. Select the shadow caster tool in the toolbar.
2. Draw a rectangle anywhere on the canvas.
3. In the properties panel, confirm you see: **Type** (Gebouw/Boom), **Naam**, **Kant** dropdown, **Afstand van tuin**, **Dikte**, **Hoogte**, **Schaduwdichtheid** presets.
4. Change Kant to "Rechts", set Afstand to 2, Dikte to 8, Hoogte to 9.
5. Click "Gebouw / Muur" preset — verify it highlights.
6. Confirm no raw pixel inputs are visible.

- [ ] **Step 4: Test Boom shadow caster**

1. Draw another shadow caster on the canvas.
2. Switch type to **Boom** in the panel.
3. Confirm the panel shows **X (m)**, **Y (m)**, **Straal (m)** instead of Kant/Afstand/Dikte.
4. Set X to 5.8, Y to 11.0, Straal to 1.7, Hoogte to 14.
5. Click "Lichte boom" — verify it highlights.

- [ ] **Step 5: Verify shadow rendering on map view**

1. Navigate to the Tuin map view.
2. Enable the sun overlay.
3. Confirm fence and Schuur shadows are visible and look appropriately lighter than before (building shadows ~0.35 alpha, not pitch black).

- [ ] **Step 6: Final commit if any fixes were needed**

```bash
git add -p  # stage only relevant changes
git commit -m "fix: shadow caster panel verification fixes"
```
