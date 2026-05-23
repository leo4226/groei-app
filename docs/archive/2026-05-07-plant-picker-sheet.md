# Plant Picker Bottom Sheet Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the direct navigate-to-form on +Toevoegen with a bottom sheet that lets users pick from the LOCAL_PLANTS database or type a custom name before landing on the pre-filled AddPlant form.

**Architecture:** New `PlantPickerSheet` component (bottom sheet pattern matching existing sheets), modified `Plants.tsx` (button opens sheet instead of linking), modified `AddPlant.tsx` (reads route state and pre-fills fields). No backend changes.

**Tech Stack:** React 19, TypeScript, Tailwind CSS, React Router v6+

---

### Task 1: Create PlantPickerSheet component

**Files:**
- Create: `groei/frontend/src/components/sheets/PlantPickerSheet.tsx`

- [ ] **Step 1: Define the type-to-color mapping and write the component shell**

Create `groei/frontend/src/components/sheets/PlantPickerSheet.tsx`:

```tsx
import { useState, useMemo } from 'react'
import type { LocalPlant } from '../../data/plants-dataset'
import { LOCAL_PLANTS } from '../../data/plants-dataset'

const TYPE_COLOR: Record<string, string> = {
  vaste_plant: '#d98199',
  heester: '#2544a0',
  klimmer: '#2544a0',
  gras: '#24e34c',
  bol: '#d64e2e',
  eenjarig: '#ff7701',
  boom: '#160572',
}

interface Props {
  onClose: () => void
  onSelectPlant: (plant: LocalPlant) => void
  onCustomName: (name?: string) => void
}

export default function PlantPickerSheet({ onClose, onSelectPlant, onCustomName }: Props) {
  const [query, setQuery] = useState('')

  const filtered = useMemo(() => {
    if (!query.trim()) return LOCAL_PLANTS
    const q = query.toLowerCase()
    return LOCAL_PLANTS.filter(
      (p) =>
        p.dutchName.toLowerCase().includes(q) ||
        p.latinName.toLowerCase().includes(q)
    )
  }, [query])

  const handleCustom = () => {
    onCustomName(query.trim() || undefined)
  }

  return (
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 bg-black/40 z-40" onClick={onClose} />

      {/* Sheet */}
      <div className="fixed bottom-0 left-0 right-0 bg-surface rounded-t-2xl z-50 pb-[env(safe-area-inset-bottom)] animate-slide-up">
        {/* Drag handle */}
        <button
          onClick={onClose}
          aria-label="Sluiten"
          className="block mx-auto mt-3 mb-4 px-6 py-2 -my-1 group"
        >
          <div className="w-10 h-1 bg-border rounded-full group-active:bg-text-muted transition-colors" />
        </button>

        <div className="px-5 pb-5">
          {/* Header */}
          <h3 className="text-base font-bold text-text mb-1">Kies een plant</h3>
          <p className="text-xs text-text-muted mb-3">
            Uit onze database of typ zelf een naam
          </p>

          {/* Search bar */}
          <div className="relative mb-3">
            <svg
              className="absolute left-3.5 top-1/2 -translate-y-1/2 text-text-muted pointer-events-none"
              width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor"
              strokeWidth="2" strokeLinecap="round"
            >
              <circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" />
            </svg>
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Zoek op naam…"
              autoFocus
              className="w-full pl-10 pr-4 py-2.5 rounded-full bg-bg border border-border text-text text-sm
                         placeholder:text-text-muted/50 focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary/40"
            />
          </div>

          {/* Custom name row */}
          <button
            onClick={handleCustom}
            className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl border border-dashed border-border/60
                       hover:border-primary/40 hover:bg-primary/5 transition-colors mb-3"
          >
            <div className="w-9 h-9 rounded-lg bg-bg flex items-center justify-center text-lg shrink-0">
              ✨
            </div>
            <div className="text-left">
              <span className="text-sm font-semibold text-primary">
                {query.trim() ? `"${query.trim()}" toevoegen` : 'Typ zelf een naam…'}
              </span>
              <p className="text-xs text-text-muted">
                Plant niet in de lijst? Voer zelf in.
              </p>
            </div>
          </button>

          {/* Plant grid */}
          {filtered.length === 0 ? (
            <div className="text-center py-8">
              <p className="text-sm text-text-muted">Geen planten gevonden</p>
              <button
                onClick={handleCustom}
                className="mt-2 text-sm text-primary font-medium hover:underline"
              >
                {query.trim() ? `"${query.trim()}" als nieuwe plant toevoegen` : 'Typ zelf een naam…'}
              </button>
            </div>
          ) : (
            <div
              className="grid gap-2 overflow-y-auto"
              style={{
                gridTemplateColumns: 'repeat(auto-fill, minmax(100px, 1fr))',
                maxHeight: '40vh',
              }}
            >
              {filtered.map((plant) => (
                <button
                  key={plant.id}
                  onClick={() => onSelectPlant(plant)}
                  className="flex flex-col items-center gap-1.5 p-3 rounded-xl bg-bg
                             hover:bg-primary/10 active:scale-[0.97] transition-all text-center"
                >
                  <div
                    className="w-8 h-8 rounded-md shrink-0"
                    style={{ background: TYPE_COLOR[plant.type] ?? '#909090' }}
                  />
                  <span className="text-xs font-semibold text-text leading-tight line-clamp-2">
                    {plant.dutchName}
                  </span>
                  <span className="text-[10px] text-text-muted italic leading-tight line-clamp-1">
                    {plant.latinName}
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </>
  )
}
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `cd groei/frontend && npx tsc --noEmit --pretty`

Expected: No errors related to `PlantPickerSheet.tsx`.

- [ ] **Step 3: Commit**

```bash
cd "C:\Users\leon_\Projects\Plant APP"
git add groei/frontend/src/components/sheets/PlantPickerSheet.tsx
git commit -m "feat: add PlantPickerSheet bottom sheet component"
```

---

### Task 2: Wire +Toevoegen button to the sheet in Plants.tsx

**Files:**
- Modify: `groei/frontend/src/pages/Plants.tsx`

- [ ] **Step 1: Replace the Link with a button that opens the sheet**

In `Plants.tsx`, change the + Toevoegen button from a `<Link>` to a `<button>` that opens `PlantPickerSheet`:

```tsx
// Add import at top:
import { useNavigate } from 'react-router-dom'
import PlantPickerSheet from '../components/sheets/PlantPickerSheet'
import type { LocalPlant } from '../data/plants-dataset'

// Inside the Plants component, add state:
const [showPicker, setShowPicker] = useState(false)
```

Replace the existing `<Link to="/plants/add" ...>` block (lines 76-90) with:

```tsx
<button
  onClick={() => setShowPicker(true)}
  style={{
    background: 'var(--color-primary)',
    color: '#fff',
    padding: '9px 18px',
    borderRadius: 100,
    fontWeight: 600,
    fontSize: 13,
    boxShadow: '0 1px 3px rgba(0,0,0,0.12)',
    border: 'none',
    cursor: 'pointer',
  }}
>
  + Toevoegen
</button>
```

Remove the `Link` import if it's no longer used elsewhere in the file (check if PlantCard still uses it — it does for the plant detail link, so keep it).

- [ ] **Step 2: Add the sheet render and callbacks**

Add at the bottom of the JSX, just before the closing `</div>` of the outermost container:

```tsx
{showPicker && (
  <PlantPickerSheet
    onClose={() => setShowPicker(false)}
    onSelectPlant={(plant: LocalPlant) => {
      setShowPicker(false)
      navigate('/plants/add', { state: { prefill: plant } })
    }}
    onCustomName={(name) => {
      setShowPicker(false)
      navigate('/plants/add', { state: name ? { prefill: { name } } : undefined })
    }}
  />
)}
```

- [ ] **Step 3: Verify TypeScript compiles**

Run: `cd groei/frontend && npx tsc --noEmit --pretty`

Expected: No errors in Plants.tsx.

- [ ] **Step 4: Commit**

```bash
cd "C:\Users\leon_\Projects\Plant APP"
git add groei/frontend/src/pages/Plants.tsx
git commit -m "feat: wire +Toevoegen button to PlantPickerSheet"
```

---

### Task 3: Pre-fill AddPlant form from route state

**Files:**
- Modify: `groei/frontend/src/pages/AddPlant.tsx`

- [ ] **Step 1: Read route state and pre-fill fields**

In `AddPlant.tsx`, add imports and read route state. Change the state initialization block:

```tsx
// Add import:
import { useLocation } from 'react-router-dom'
import type { LocalPlant } from '../data/plants-dataset'

// Read prefill from route state
const location = useLocation()
const prefill = location.state?.prefill as LocalPlant | { name: string } | undefined

// Replace the useState initializers for name and species:
const [name, setName] = useState(prefill?.name ?? '')
const [species, setSpecies] = useState(
  prefill && 'latinName' in prefill ? prefill.latinName : ''
)
const [iconKey, setIconKey] = useState<string | null>(null)

// Pre-fill plant_type and sun_requirement when submitting:
const isFromDatabase = prefill && 'latinName' in prefill
```

- [ ] **Step 2: Include plant_type and sun_requirement in submit payload**

Modify the `addPlant` call inside `handleSubmit` to include the pre-filled fields:

```tsx
await addPlant({
  name: name.trim(),
  species: species.trim() || undefined,
  icon_key: iconKey ?? undefined,
  map_id: selectedMap?.id,
  map_x: mapPos?.x,
  map_y: mapPos?.y,
  plant_type: isFromDatabase ? (prefill as LocalPlant).type : undefined,
  sun_requirement: isFromDatabase ? (prefill as LocalPlant).sunRequirement : undefined,
  care_schedules: [],
})
```

- [ ] **Step 3: Show the "pre-filled from database" banner**

Add after the icon picker section in the form (after the `</div>` closing the icon section and before the map picker section):

```tsx
{isFromDatabase && (
  <div className="flex items-center gap-2 px-3 py-2.5 rounded-xl bg-primary/5 border border-primary/15 text-sm text-primary">
    <span className="text-base">📋</span>
    <span>Ingevuld uit plantendatabase — pas aan waar nodig</span>
  </div>
)}
```

- [ ] **Step 4: Verify TypeScript compiles**

Run: `cd groei/frontend && npx tsc --noEmit --pretty`

Expected: No errors in AddPlant.tsx.

- [ ] **Step 5: Commit**

```bash
cd "C:\Users\leon_\Projects\Plant APP"
git add groei/frontend/src/pages/AddPlant.tsx
git commit -m "feat: pre-fill AddPlant form from database plant selection"
```

---

### Task 4: Manual verification

- [ ] **Step 1: Start the dev server**

Run: `cd groei/frontend && npm run dev`

- [ ] **Step 2: Verify the golden path**

1. Open the app in browser, go to `/plants`
2. Tap **+ Toevoegen** → bottom sheet slides up with plant grid
3. Type "Laven" in search → grid filters to show Lavendel
4. Tap Lavendel → navigated to `/plants/add` with name, species, type, sun_requirement pre-filled
5. Banner "Ingevuld uit plantendatabase" is visible
6. Pick a location, submit → plant is created, redirected to `/plants`

- [ ] **Step 3: Verify custom name path**

1. Tap **+ Toevoegen** → bottom sheet appears
2. Tap "Typ zelf een naam…" → navigated to `/plants/add` with blank form (no banner)
3. Type a name manually, pick location, submit → works as before

- [ ] **Step 4: Verify custom name with search text**

1. Tap **+ Toevoegen** → type "Aloe vera" in search (no match)
2. Tap "Aloe vera toevoegen" custom row → form opens with "Aloe vera" pre-filled as name

- [ ] **Step 5: Verify direct navigation still works**

Navigate directly to `/plants/add` → form is blank (no pre-fill), no banner. Everything works as before.
