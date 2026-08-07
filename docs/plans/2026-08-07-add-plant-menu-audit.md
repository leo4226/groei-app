# Add-plant menu audit — "Kies uit lijst" and "Handmatig invullen"

**Date:** 2026-08-07
**Scope:** the two non-photo entry paths of the Add Plant flow, reached from
`/plants` ("+ plant") and from the map screen (`MapActionCluster → onAddPlant`).
The photo-ID path (`/identify`) is explicitly out of scope.

## Flow as built

Both entry points navigate to `/plants/add` with **no** `location.state.from`
(the map screen adds `{ fromMap: <pathname> }`). `AddPlant.tsx` sees
`locState?.from == null` and renders the three-button entry screen
(`AddPlant.tsx:400`):

| Button | Action |
|---|---|
| Identificeer met foto | `navigate('/identify')` |
| **Kies uit lijst** | `navigate('/plants/add', { state: { from: 'pick' }, replace: true })` |
| **Handmatig invullen** | `navigate('/plants/add', { state: { from: 'manual' }, replace: true })` |

- **pick** → `from: 'pick'` and no prefill renders `PlantPickerSheet`
  (`AddPlant.tsx:457`). Selecting a plant re-navigates with
  `prefill: LocalPlant`; "type a name" re-navigates as `from: 'manual'` with
  `{ name }`.
- **manual** → straight to the form with empty state.

Both paths then converge on the same form and the same submit
(`buildCreatePayload` → `POST /api/plants`).

---

## Findings

Severity: **P1** = data loss / user-visible incorrectness, **P2** = broken or
dead UI, **P3** = polish.

### P1-1 — Six form sections are collected and then silently discarded

`buildCreatePayload` (`pages/addPlant/prefill.ts:290`) and `PlantCreateInput`
(`types/index.ts:104`) have no field for any of these, so nothing the user
enters in them is ever sent:

| Field | State | UI |
|---|---|---|
| Form type (pot/ground/seedling/tree) | `formType` | Identity card, always visible |
| Pot material | `potMaterial` | Placement, under DETAILS |
| Pot diameter | `potDiameter` | Placement, under DETAILS |
| Pot height | `potHeight` | Placement, under DETAILS |
| Drainage hole | `hasDrainage` | Placement, under DETAILS |
| Substrate | `substrate` | Placement, under DETAILS |
| Acquired-at location | `locationText` | Identity card, always visible |

The whole "Pot — material + dimensions" block and the substrate chips exist
purely as write-only UI. This hits pick and manual equally.

Sharpest instance: `PlantCreateInput.pot_size_cm` **does** exist and the payload
does send `potSize`, but `potSize` has no setter wired to any input
(`const [potSize] = useState('')` at `AddPlant.tsx:94`) — while `potDiameter`,
the field the user actually fills, goes nowhere. One line of wiring apart.

Knock-on: the potted/bare icon-variant switcher (`AddPlant.tsx:298-309`) keys
off `potSize`, which is permanently `''`, so it always resolves to the `_bare`
variant regardless of what the user selected under Pot.

### P1-2 — Submit failures are swallowed and the user is navigated away

```ts
} catch (e) {
  console.error('AddPlant: add failed', e)
} finally {
  navigate(finalReturnPath)   // runs on success AND on failure
}
```
(`AddPlant.tsx:379-386`)

A 422 (e.g. a malformed `sown_date`), a 500, or an offline POST all end the same
way as success: the user is dropped back on `/plants` or the map with no plant
and no message. The store's `error` banner in `App.tsx:232` is never populated
because `addPlant` rethrows into this catch. Any submit-side bug in this flow is
invisible by construction.

### P1-3 — The zone advice is a fixed sentence presented as species advice

```ts
advice={species ? t.addPlant.zoneAdvice(species) : undefined}
```
(`AddPlant.tsx:750`) →
`"Tip: {species} prefers a bright spot without direct sunlight."`

It is rendered for **every** species as soon as the species field is non-empty,
including full-sun plants picked straight from the list. A user picking
*Lavandula* is told it prefers no direct sun, in a sparkle-iconed advice box that
reads as species knowledge. The app already knows better: the pick path fetches
real thresholds via `speciesApi.lookupLatin`, and `SUN_DB_TO_TILE` maps the
dataset's own `sunRequirement`.

### P1-4 — "Bladeren door 2 891 soorten" — the picker has 68

`speciesCount={2891}` is hardcoded at `AddPlant.tsx:519`. The picker is
`LOCAL_PLANTS`, a bundled static dataset of **91** entries, of which
`PlantPickerSheet` shows only those with an `iconKey` — **68**
(`PlantPickerSheet.tsx:30`). The banner also calls it "de database", which reads
as the backend species table; it is not.

### P1-5 — The nickname "code" field re-randomises on every keystroke

```tsx
value={species ? species.replace(/[^a-zA-Z].*$/, '').slice(0,4).toUpperCase()
       + '-' + String(Math.floor(Math.random()*1000)).padStart(3,'0') : ''}
```
(`AddPlant.tsx:638`)

`Math.random()` is evaluated inside render, so the read-only identifier next to
the nickname reshuffles on every character typed anywhere in the form. It is
also never submitted or persisted — it is a decorative field that looks like a
record ID.

### P2-1 — The EntryBanner tabs are decorative dead ends

`EntryBanner` renders two tabs, "Uit database" and "Met foto", both clickable
(`EntryBanner.tsx:52`), but `onRouteChange` only swaps which static body panel
is shown. Neither body has any control:

- In pick/manual, clicking **Met foto** shows "Upload een foto om te
  identificeren" with a camera glyph and **no upload control** (`PhotoBody`,
  `EntryBanner.tsx:272`).
- In manual, clicking **Uit database** shows "Bladeren door 2 891 soorten in de
  database" and **no way to browse** (`DatabaseBody`, `EntryBanner.tsx:154`).

Both are invitations to an action that cannot be performed from there.

### P2-2 — No way back to the picker or the entry menu

Every entry-screen transition uses `replace: true`, and the pick→prefill
transition replaces again. Once the form is showing, the history entry for both
the entry menu and the picker is gone: Cancel / back exits to `/plants` or the
map. A user who picked the wrong species must abandon the form and start over —
and the banner tab (P2-1) is exactly where they'd look for the way back.

### P2-3 — Stale `addPlant_returnPath` sends later adds to the wrong screen

`sessionStorage.setItem('addPlant_returnPath', fromMapState)` runs during render
(`AddPlant.tsx:67-68`) and is only removed in `handleSubmit`'s `finally`. If the
user opens Add Plant from a map and then cancels — or navigates away — the key
survives. The next add started from `/plants` reads it and, on submit, redirects
to the old map instead of the plant list.

### P2-4 — Zone picker: no zones, no message; no way to deselect

- `zoneList` is built from the user's maps. With zero maps it is `[]` — not
  `undefined` — so `ZonePicker`'s `DEFAULT_ZONES` fallback does not apply and the
  Zone row renders an **empty grid with no explanation**
  (`ZonePicker.tsx:32`, `AddPlant.tsx:58`). New users hit this first.
- There is no "no zone / unplaced" option and clicking a selected zone does not
  clear it (`onChange(zone.id)` unconditionally, `ZonePicker.tsx:58`), even
  though `AddPlant`'s handler has a `if (!zoneId) return` branch for it.
- `translations` (`plantsLabel`) is declared in `ZonePickerProps` and passed by
  `AddPlant.tsx:738`, but is never destructured or rendered — `plantCount` is
  computed per zone and never shown. The grid reserves a third `auto` column for
  it that stays empty.

### P2-5 — Picker search does not match English names

`PlantPickerSheet` renders `englishName` when the account language is `en`
(`PlantPickerSheet.tsx:146`) but filters on `dutchName` and `latinName` only
(`PlantPickerSheet.tsx:35-39`). An English-mode user searching for the name they
can see on screen gets "No plants found". Same class of bug the 2026-07 language
audit was about.

### P2-6 — Picker renders over a blank page

At `from: 'pick'` with no prefill, `AddPlant` returns *only* the sheet
(`AddPlant.tsx:457`). The `fixed inset-0 bg-black/40` backdrop dims an empty
page rather than the screen the user came from, and dismissing it
(`onClose → navigate(-1)`) leaves `/plants/add` entirely instead of returning to
the entry menu.

### P3-1 — EntryBanner is hardcoded Dutch

Every string in `EntryBanner.tsx` is a Dutch literal: "Uit database", "Met
foto", "Bladeren door … soorten", "Kies een soort", "§ Geselecteerd",
"Verzorgingsprofielen", "Botanische familie", "Herkomst", "Trefkans",
"Beeldreferenties", "Alternatieven", "Upload een foto", "— foto —". Number
formatting is pinned to `nl-NL` (`fmtNum`). The file is on the i18n guard's
baseline ignore list (`eslint.i18n.config.js:52`), so CI is green — but per
CLAUDE.md the list must only shrink, and this banner is the first thing both
audited paths render. An English account sees a fully Dutch banner above a
translated form.

### P3-2 — Duplicate / dead species fields

The Identity card shows two side-by-side species inputs: an editable one and a
read-only `latinName` (`AddPlant.tsx:646-663`).

- Pick path: both show the same Latin name (`species` is set from
  `p.latinName`), so the row reads as a duplicate.
- Manual path: `latinName` is `''` and can never be filled, so the user stares
  at a permanently empty greyed box with the placeholder
  "Phalaenopsis amabilis".

### P3-3 — Inconsistent and unvalidated date inputs

"Acquired" is `<input type="date">` (ISO) while "Sown" is a free-text
`DD-MM-YYYY` field (`AddPlant.tsx:888`). An unparseable sown date is silently
dropped by `displayToIso` returning `''` — no validation message. In
`handleSubmit`, `acquiredDateInput.trim() || displayToIso(acquiredDateInput)`
makes the second operand dead code for a `type="date"` input.

### P3-4 — Light is hidden on BASIC, so manual adds ship with no sun requirement

The Light tile grid is inside `showDetails` (`AddPlant.tsx:754`). On the manual
path nothing prefills `sunRequirement`, so a user who never opens DETAILS
creates a plant with `sun_requirement` unset — which is what the garden-fit and
sun-matching features read. The pick path is fine (prefilled from the dataset).

### P3-5 — Dead code in the App-level picker

`App.tsx:418` renders a second `PlantPickerSheet` behind
`useFloreren.showPlantPicker`, and `setShowPlantPicker(true)` is called from
**nowhere** in the codebase. Its handlers (`App.tsx:219-227`) navigate to
`/plants/add` with a `prefill` but **no `from`**, which `AddPlant` would answer
by showing the entry-choice screen and ignoring the prefill. Dead today,
broken if revived.

### P3-6 — Minor

- `const [, setArea] = useState(...)` (`AddPlant.tsx:93`) — write-only state.
- `const [locationId] = useState<number|undefined>()` (`AddPlant.tsx:92`) —
  permanently `undefined`, always sent as `location_id`.
- Quantity may sit at `0` while typing; only corrected `onBlur`
  (`AddPlant.tsx:703`).
- Phase defaults to `established` even when Form type is `seedling`.
- The submit button label is `"Toevoegen — {name}"`, truncated at 260px — long
  nicknames render as `Toevoegen — Monstera deli…`.

---

## What is correct

- `care_schedules: []` from the form is **not** a bug: `create_plant` guarantees
  a Water schedule server-side — from cached species thresholds when available
  (`plants.py:295-303`) and otherwise a 7-day `provisional` row
  (`plants.py:309-322`), with deferred threshold generation. The Care card's
  "species-based" vs "provisional" copy matches that behaviour.
- Icon assignment is guaranteed server-side when the client sends none
  (`plants.py:251-263`).
- The dropped-fields problem is confined to the *client*: the backend contract
  simply has no columns for pot material/substrate/form.

## Suggested order of work

1. P1-2 (error handling) — it hides every other submit bug.
2. P1-1 pot wiring (`potDiameter → pot_size_cm`) — smallest fix, unblocks the
   icon variant logic.
3. P1-3 and P1-4 — both are user-facing false statements.
4. P1-5, P2-1, P2-2 — the "is this form real?" cluster.
5. P1-1 remainder: decide per field whether to persist (schema + API change) or
   remove the UI. Shipping write-only inputs is worse than not having them.
