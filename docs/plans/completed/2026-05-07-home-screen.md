# Home Screen Plan

**Date:** 2026-05-07  
**Status:** Ready for implementation  
**Implementer:** Deepseek

## Goal

Replace the existing `Dashboard.tsx` (`/dashboard`) with a richer, garden-vibed home screen. Redirect `/` to `/dashboard`. Replace the Maps tab in BottomNav with a Home tab.

## What stays the same

- `/dashboard` route path — no URL change
- `Dashboard.tsx` filename — edit in place, no new file
- `loadDashboard()` store action and all care task logic
- `CareTaskCard` sub-component — restyle, do not remove
- `getGreeting()` Dutch time-based greeting function

---

## Design constraints

Stay within the existing "Handsome Frank" design system. Do **not** introduce new colors, fonts, or radii.

**Palette to foreground** (garden feel from existing tokens):
- Page base: `#fef9ee` (Cream Canvas)
- Section strips: `#f2ebe6` (Fog Canvas)
- Earthy accent: `#e29675` (Warm Ginger) — for the plant fact card
- Bold accent: `#d64e2e` (Terracotta Orange) — type badges, section labels
- Success: `#24e34c` (Emerald Green) — "done" button
- Primary text: `#000000` (Absolute Black)
- Muted text: `#909090` (Midtone Gray)

**Typography:**
- Section greeting: Millik (Playfair Display fallback), `font-size: 42px`, `line-height: 0.98`, `letter-spacing: -0.882px`
- Section labels: Klarheit Grotesk (Inter fallback), `font-size: 12px`, `font-weight: 600`, uppercase, letter-spacing wide
- Body / task names: Klarheit Grotesk, 16px
- Plant fact text: Klarheit Grotesk, 14px

**Radii:** 10px for cards, 30px for pill badges and done button. No box shadows.

**Layout:** Mobile-first. `max-w-lg mx-auto`. Section `gap: 24px`. Element `gap: 20px`. Card `padding: 24px`.

---

## Page structure (top to bottom)

### 1 — Header

```
┌─────────────────────────────────────────┐
│ Fog Canvas background, px-4 pt-8 pb-6  │
│ [scattered plant icons, low opacity]    │
│                                         │
│  Goedemorgen Leon 🌱     [UserSwitcher] │
│  Woensdag 7 mei                         │
└─────────────────────────────────────────┘
```

- Greeting: `getGreeting() + ' ' + activeUser.name` in Millik, 42px, Absolute Black
- Waving leaf emoji: `animate-[wave_2s_ease-in-out_infinite]` (existing keyframe)
- Date line: Dutch formatted date (`new Date().toLocaleDateString('nl-NL', { weekday: 'long', day: 'numeric', month: 'long' })`), Klarheit Grotesk 14px, Midtone Gray
- UserSwitcher: existing component, top-right

#### Icon scatter layer

The header section is `position: relative; overflow: hidden`. A set of plant icon `<img>` elements is absolutely positioned behind the text (`z-index: 0`), with the text content at `z-index: 1`.

All icons use `pointer-events: none` and `user-select: none`. Icons are served from `/api/icons/{name}.svg`.

Use the following 15 icons with exact positions (percentages are relative to the header container width/height):

| Icon file      | left    | top     | width  | rotate   | opacity |
|----------------|---------|---------|--------|----------|---------|
| `monstera`     | `-4%`   | `-20%`  | `72px` | `-12deg` | `0.12`  |
| `fiddle`       | `-2%`   | `45%`   | `56px` | `8deg`   | `0.10`  |
| `sunflower`    | `12%`   | `-25%`  | `48px` | `6deg`   | `0.13`  |
| `basil`        | `22%`   | `55%`   | `28px` | `-22deg` | `0.14`  |
| `tulip`        | `34%`   | `-18%`  | `36px` | `-8deg`  | `0.11`  |
| `cactus`       | `42%`   | `50%`   | `32px` | `14deg`  | `0.13`  |
| `daisy`        | `52%`   | `-22%`  | `40px` | `5deg`   | `0.12`  |
| `snake`        | `58%`   | `40%`   | `36px` | `-10deg` | `0.11`  |
| `tomato`       | `68%`   | `-15%`  | `32px` | `18deg`  | `0.12`  |
| `strawberry`   | `72%`   | `55%`   | `28px` | `-16deg` | `0.13`  |
| `hydrangea`    | `80%`   | `-20%`  | `44px` | `-5deg`  | `0.11`  |
| `maple`        | `88%`   | `30%`   | `52px` | `22deg`  | `0.10`  |
| `rose`         | `94%`   | `-10%`  | `40px` | `-18deg` | `0.12`  |
| `lavender`     | `30%`   | `30%`   | `32px` | `10deg`  | `0.10`  |
| `pothos`       | `62%`   | `-5%`   | `38px` | `-6deg`  | `0.11`  |

Render them as:
```tsx
const HEADER_ICONS = [
  { name: 'monstera',   left: '-4%',  top: '-20%', size: 72, rotate: -12, opacity: 0.12 },
  { name: 'fiddle',     left: '-2%',  top: '45%',  size: 56, rotate:   8, opacity: 0.10 },
  { name: 'sunflower',  left: '12%',  top: '-25%', size: 48, rotate:   6, opacity: 0.13 },
  { name: 'basil',      left: '22%',  top: '55%',  size: 28, rotate: -22, opacity: 0.14 },
  { name: 'tulip',      left: '34%',  top: '-18%', size: 36, rotate:  -8, opacity: 0.11 },
  { name: 'cactus',     left: '42%',  top: '50%',  size: 32, rotate:  14, opacity: 0.13 },
  { name: 'daisy',      left: '52%',  top: '-22%', size: 40, rotate:   5, opacity: 0.12 },
  { name: 'snake',      left: '58%',  top: '40%',  size: 36, rotate: -10, opacity: 0.11 },
  { name: 'tomato',     left: '68%',  top: '-15%', size: 32, rotate:  18, opacity: 0.12 },
  { name: 'strawberry', left: '72%',  top: '55%',  size: 28, rotate: -16, opacity: 0.13 },
  { name: 'hydrangea',  left: '80%',  top: '-20%', size: 44, rotate:  -5, opacity: 0.11 },
  { name: 'maple',      left: '88%',  top: '30%',  size: 52, rotate:  22, opacity: 0.10 },
  { name: 'rose',       left: '94%',  top: '-10%', size: 40, rotate: -18, opacity: 0.12 },
  { name: 'lavender',   left: '30%',  top: '30%',  size: 32, rotate:  10, opacity: 0.10 },
  { name: 'pothos',     left: '62%',  top: '-5%',  size: 38, rotate:  -6, opacity: 0.11 },
] as const

// In JSX, inside the header div (position: relative, overflow: hidden):
{HEADER_ICONS.map((icon) => (
  <img
    key={icon.name}
    src={`/api/icons/${icon.name}.svg`}
    alt=""
    aria-hidden="true"
    style={{
      position: 'absolute',
      left: icon.left,
      top: icon.top,
      width: icon.size,
      height: icon.size,
      transform: `rotate(${icon.rotate}deg)`,
      opacity: icon.opacity,
      pointerEvents: 'none',
      userSelect: 'none',
      zIndex: 0,
    }}
  />
))}
```

---

### 2 — Map Thumbnails

```
┌─────────────────────────────────────────┐
│ "MIJN TUINEN" label          [Beheer →] │
│                                         │
│  ┌──────────┐  ┌──────────┐            │
│  │ SVG img  │  │ SVG img  │  ← scroll  │
│  │          │  │          │            │
│  │ Tuin     │  │ Huis     │            │
│  │ [Buiten] │  │ [Binnen] │            │
│  └──────────┘  └──────────┘            │
└─────────────────────────────────────────┘
```

- Section label: "MIJN TUINEN" in Klarheit Grotesk semibold 12px uppercase, Terracotta Orange
- Right link: "Beheer →" ghost link to `/maps`, Klarheit Grotesk 12px, Midtone Gray
- Container: `flex overflow-x-auto gap-4 pb-2 scrollbar-hide`
- Each card:
  - Width: `w-44` (176px), flex-shrink-0
  - Background: Fog Canvas `#f2ebe6`
  - Border-radius: 10px
  - Thumbnail: `<img src={`/api/maps-static/${map.svg_file}`} className="w-full h-28 object-contain rounded-t-[10px] bg-white p-2" />`
  - Footer strip: Cream Canvas, px-3 py-2
  - Map name: Klarheit Grotesk semibold 14px, Absolute Black, truncate
  - Type badge: pill, `border-radius: 30px`, `font-size: 12px`
    - `outdoor` → "Buiten", background Terracotta Orange `#d64e2e`, text white
    - `indoor` → "Binnen", background Midnight Ink `#160572`, text white
  - Full card is a `<Link to={`/map/${map.slug}`}>` 
- Empty state (no maps): a dashed-border card `w-44 h-40` with "+" and text "Voeg een tuin toe", links to `/maps`

---

### 3 — Care Tasks

Reuse the existing care task data (`dashboard.overdue`, `dashboard.due_today`, `dashboard.upcoming`) and `CareTaskCard` component. Restyle the shell only:

- Section header: "VANDAAG" label + task count badge
  - Badge: pill, Warm Ginger background, Absolute Black text, 12px
  - If `totalTasks === 0`: show "VANDAAG" with green checkmark badge
- Subsection headers: same existing dot + label pattern, keep colors (overdue=red, due=amber, upcoming=gray)
- `CareTaskCard` styling updates:
  - Card background: white (`#ffffff`)
  - Border-radius: 10px
  - Left accent border: 4px, existing colors
  - "Done ✓" button: replace `bg-primary` with Emerald Green `#24e34c`, Absolute Black text, `border-radius: 30px`
  - "Gedaan ✓" (Dutch) — rename the button label from "Done ✓" to "Gedaan ✓"
- Loading: 3 skeleton cards (existing skeleton pattern)
- Empty state:
  - Leaf icon (SVG or emoji `🌿`)
  - "Alle planten zijn blij!" in Emerald Green, Millik 24px
  - Sub-text "Geen taken op dit moment", Klarheit Grotesk 14px muted

---

### 4 — Plant Fact Card

```
┌─────────────────────────────────────────┐
│  Warm Ginger background (#e29675)       │
│                                         │
│  Wist je dat...            [plant icon] │
│                                         │
│  "Je Monstera groeit sneller als..."    │
│                                         │
│  Meer over Monstera →                   │
└─────────────────────────────────────────┘
```

- Background: Warm Ginger `#e29675`
- Border-radius: 10px
- Padding: 24px
- "Wist je dat..." label: Millik italic (use `font-style: italic`), 22px, Absolute Black
- Plant icon: `<img src={`/api/icons/${plantFact.icon_key}.svg`} className="w-12 h-12" />`, positioned top-right
  - If no icon_key: show `🌿` emoji instead
- Fact text: `plantFact.fact_nl`, Klarheit Grotesk 14px, Dark Wolf `#2c2c2c`
- Footer link: "Meer over [plantFact.plant_name] →", Klarheit Grotesk 14px semibold, Absolute Black, links to `/plants/${plantFact.plant_id}`
- Loading state: skeleton matching the card shape
- Hidden entirely if `plantFact === null` (no species data available)

---

## Backend: new endpoint

**File:** `groei/backend/routers/dashboard.py` (add to existing file) or create `groei/backend/routers/home.py` and register it in `main.py`.

**Endpoint:** `GET /api/plant-fact`

Logic:
1. Query all plants that have a `species_id` set
2. For each, load the species phenology JSON
3. Filter to plants whose species has a non-empty `interesting_facts_nl` field
4. Pick one at random (use `random.choice`)
5. Return the result

**Add to `models.py`:**
```python
class PlantFactOut(BaseModel):
    plant_id: int
    plant_name: str
    icon_key: str | None
    fact_nl: str
    species_name: str | None
```

**Return 404** if no plant with a fact exists. Frontend handles this gracefully by hiding section 4.

---

## Store changes

**File:** `groei/frontend/src/store/useGroeiStore.ts`

Add to state interface:
```ts
plantFact: PlantFactOut | null
loadPlantFact: () => Promise<void>
```

Add to initial state:
```ts
plantFact: null,
```

Add action:
```ts
loadPlantFact: async () => {
  try {
    const fact = await api.fetchPlantFact()
    set({ plantFact: fact })
  } catch {
    set({ plantFact: null }) // 404 or network error → hide card
  }
},
```

**Add to API layer** (`api.ts` or equivalent):
```ts
fetchPlantFact: async (): Promise<PlantFactOut> => {
  const res = await fetch('/api/plant-fact')
  if (!res.ok) throw new Error('No fact available')
  return res.json()
}
```

**Add type** to `types.ts`:
```ts
export interface PlantFactOut {
  plant_id: number
  plant_name: string
  icon_key: string | null
  fact_nl: string
  species_name: string | null
}
```

---

## `Dashboard.tsx` — full rewrite

Keep the filename. Replace entire file content with the new `HomePage` component (export default function name can stay `Dashboard` to avoid import changes in `App.tsx`).

Structure:
```tsx
export default function Dashboard() {
  const { dashboard, activeUserId, users, maps, plantFact, loadDashboard, loadPlantFact, isLoading } = useGroeiStore()
  
  useEffect(() => {
    loadDashboard()
    loadPlantFact()
  }, [loadDashboard, loadPlantFact])

  // ... render 4 sections
}
```

`maps` is already in the store — no extra fetch needed (loaded on app init by `load()`).

---

## `App.tsx` — one line change

```tsx
// Before:
<Route path="/" element={<Navigate to="/maps" replace />} />

// After:
<Route path="/" element={<Navigate to="/dashboard" replace />} />
```

---

## `BottomNav.tsx` — replace Maps tab

Replace the first tab entry (Maps → `/maps`) with:

```tsx
{
  to: '/dashboard',
  label: 'Home',
  icon: (active: boolean) => (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth={active ? 2.5 : 2} strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
      <polyline points="9 22 9 12 15 12 15 22" />
    </svg>
  ),
},
```

Keep `end` prop: `end={tab.to === '/dashboard'}` so it only activates on exact `/dashboard` match.

---

## Implementation order

1. `models.py` — add `PlantFactOut`
2. `routers/dashboard.py` (or new `home.py`) — add `GET /api/plant-fact` endpoint; register in `main.py` if new file
3. `types.ts` — add `PlantFactOut` interface
4. API layer — add `fetchPlantFact()`
5. `useGroeiStore.ts` — add `plantFact` state + `loadPlantFact()` action
6. `Dashboard.tsx` — full rewrite (4 sections)
7. `App.tsx` — change redirect
8. `BottomNav.tsx` — replace Maps tab with Home tab

---

## Out of scope (do not implement)

- Making `/maps` inaccessible — it stays at its route, just not in the bottom nav
- Changing any care task data logic or backend endpoints (only add the fact endpoint)
- Adding new Tailwind colors or design tokens
- Authentication or multi-user support beyond the existing `UserSwitcher`
- Animating the map thumbnails or plant fact card
