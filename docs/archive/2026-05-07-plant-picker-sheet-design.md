# Plant Picker Bottom Sheet

## Goal

Replace the direct "AddPlant form only" flow with a two-step flow: pick from the plant database (or type a custom name) via a bottom sheet, then complete the remaining fields on the AddPlant form.

## User flow

1. User on `/plants` taps **+ Toevoegen** → `PlantPickerSheet` slides up
2. Sheet contains: search bar, "Typ zelf een naam..." option, scrollable grid of plants from `LOCAL_PLANTS`
3. Typing in the search bar filters the grid in real-time by `dutchName` and `latinName` (case-insensitive)
4. Tapping a plant card → navigates to `/plants/add` with `LocalPlant` data via route state
5. Tapping "Typ zelf een naam..." → navigates to `/plants/add` with the search text as pre-filled name, or blank if nothing typed
6. On `/plants/add`: fields are pre-filled from the database plant. Location remains manual. A banner indicates the source.
7. User picks location, reviews, submits → redirected to `/plants`

## Components

### PlantPickerSheet (new)

- File: `frontend/src/components/sheets/PlantPickerSheet.tsx`
- Bottom sheet, ~60% viewport height, drag handle to dismiss
- Owns: search input, "Typ zelf" row, scrollable plant grid
- Props:
  - `open: boolean`
  - `onClose: () => void`
  - `onSelectPlant: (plant: LocalPlant) => void`
  - `onCustomName: (name?: string) => void`
- Filters `LOCAL_PLANTS` on every keystroke
- Empty search results → "Geen planten gevonden" + highlighted "Typ zelf" option
- Each plant card shows: type-color dot, dutchName, latinName (italic)

### Plants.tsx (modified)

- + Toevoegen button: remove `<Link to="/plants/add">`, replace with `onClick` that opens `PlantPickerSheet`
- `onSelectPlant` → `navigate('/plants/add', { state: { prefill: plant } })`
- `onCustomName` → `navigate('/plants/add', { state: { prefill: { name: searchText } } })` (or no state if empty)

### AddPlant.tsx (modified)

- Read route state via `useLocation().state?.prefill`
- If `prefill` is a `LocalPlant`: pre-fill name, species, plant_type, sun_requirement
- If `prefill` is `{ name: string }`: pre-fill only the name
- Show banner "Ingevuld uit plantendatabase — pas aan waar nodig" when pre-fill from database
- No changes to submit behavior or navigation

## Data mapping

| LocalPlant field | PlantCreateInput field |
|---|---|
| `dutchName` | `name` |
| `latinName` | `species` |
| `sunRequirement` | `sun_requirement` |
| `type` | `plant_type` |

`icon_key` is not set from the database — the existing `PlantIconWell` renders the correct type-based SVG+color from `plant_type`.

`care_schedules` ships as `[]` (unchanged from current behavior).

### Plant card type colors

`LocalPlant.type` uses Dutch keys. A mapping constant in `PlantPickerSheet.tsx` maps them to the card dot colors:

| type | color |
|---|---|
| `vaste_plant` | `#d98199` (flower) |
| `heester` | `#2544a0` (shrub) |
| `klimmer` | `#2544a0` (climber) |
| `gras` | `#24e34c` (grass) |
| `bol` | `#d64e2e` (bulb) |
| `eenjarig` | `#ff7701` (annual) |
| `boom` | `#160572` (tree) |

Uses the same hex values as `TYPE_BG` in `Plants.tsx`, keyed by the Dutch `LocalPlant.type`.

## Edge cases

- **No maps exist**: location picker shows "Nog geen kaarten beschikbaar" (existing behavior, unchanged).
- **Search with no matches**: grid shows empty state, "Typ zelf" option is highlighted.
- **User types a name then taps "Typ zelf"**: the typed text is passed as the pre-filled name.
- **User dismisses sheet**: returns to `/plants` unchanged.
- **User navigates directly to `/plants/add`** (no route state): form behaves exactly as today — blank fields.

## Non-goals

- No backend changes
- No changes to `LOCAL_PLANTS` dataset
- No multi-select or batch-adding plants
- No editing of database plant data from this flow
