# Plant details pane — audit (2026-08-09)

> **Status.** Tracked as #878. Every finding in this document is implemented.
> The weather charts moved to the map's weather popover
> (`components/garden/GardenWeatherHistory.tsx`); the passport keeps a one-line
> summary. The pane was verified rendering in **both languages** at phone and
> desktop widths against a stubbed API, which turned up two further NL/EN
> defects fixed here: flower colours were printed as raw English API values
> ("Bloemen: Pink, Blue"), and the photo-reminder hint still promised a task on
> the retired dashboard.
>
> Deliberately not done: aligning the passport's 720px breakpoint with the
> sheet's 1024px. They differ because the sheet has three min-width columns to
> fit while a page only has to reflow; both are named, documented constants now.
> `PLANT_QUICK_SHEET_ACTIONS_CLASS` and `..._DESKTOP_ONLY_ACTION_CLASS` also
> stay: no component renders them, but the only way to delete them is to delete
> the tests that pin their shape, which needs a human's
> `tests-intentionally-removed` label. Not worth blocking on.

Scope: everything a user sees after tapping a plant, from either entry point.

| Entry point | Component | Lines |
|---|---|---|
| Map marker → sheet | `components/sheets/PlantQuickSheet.tsx` (+ `plantQuickSheetLayout.ts`, `plantQuickSheet.css`) | 631 |
| Plants list → passport, and the sheet's "More info" link | `pages/PlantDetail.tsx` | 899 |
| Orphan route `/plants/:id/care` | `pages/PlantCareDetail.tsx` | 317 |

Sub-components in the passport: `PlantCareInfo`, `PhaseCalendar`, `EcologyCard`,
`PhotoJournal`, `PlantCareSignals` (defined inline in `PlantDetail.tsx`).

---

## 1. What is on the page today

**PlantQuickSheet** (bottom sheet, 85 dvh mobile / 42 dvh 3-column desktop):
identity + photo-upload tile + "More info", overdue-count status line, one-tap care
chips (water/feed always, plus anything scheduled), sun fit with a measured-sun
editor, container / ground zone, extra placements, overflow menu (edit, move,
duplicate, lock, remove).

**PlantDetail** mobile order:
hero photo → identity card → sun fit → **year calendar** → **ecology** → weather
alerts → care schedules → care info (collapsed) → growth journal → care history →
archive.

**PlantDetail** desktop (≥721px) order:
masthead (eyebrow, name, species, notes, stats, prev/next/back/copy/edit) → hero
photo + identity panel with the care pills → full-width year calendar → 3 columns
(alerts + care | species profile + garden weather | journal + ecology) → care
history → archive.

---

## 2. Findings

### 2.1 The care-info dropdown with the weather — why it feels wrong

`components/PlantCareInfo.tsx`

1. **The card's title does not describe half its contents.** On mobile the card is
   "Verzorgingsinfo / Care info" (`PlantCareInfo.tsx:306`), but behind the *More
   info* toggle sit two garden-wide charts: 14-day rainfall and 7-day temperature.
   Those are not care info and not plant-specific. Desktop already fixes this by
   splitting into `speciesProfile` + `gardenWeather` (`PlantCareInfo.tsx:276–297`),
   so the two breakpoints name and group the same data differently.

2. **The weather is unreachable on mobile for exactly the plants that need it.**
   The toggle only renders when `!isLoading && !noData && care.data`
   (`PlantCareInfo.tsx:308`), and the charts only render when `expanded`
   (`:323–324`). A plant whose species has no Trefle/care row (`source ===
   'not_found'`) or whose care-info request errored gets no toggle at all — so the
   rainfall and temperature charts can never be opened. The desktop split layout has
   the opposite (correct) behaviour and renders the weather section regardless
   (see the comment at `:273–275`).

3. **The visible teaser is the weakest content.** Un-expanded, the card shows a
   light bar and "600–1200 mm/jaar" — annual precipitation preference is close to
   meaningless to a user with a watering can, while the genuinely actionable
   "it rained 22 mm in 14 days, the soil is well watered" is hidden.

4. **The weather is identical for every plant, every map, every household.**
   `OPEN_METEO_URL` is hardcoded to 52.3715 / 4.8499 (`backend/services/environment.py:17–20`)
   and both endpoints are unauthenticated and take no map/household
   (`backend/routers/plant_care.py:184–190`). The frontend hooks module-cache the
   result for the session, so it is one fetch — fine for Leon & Lisbeth, wrong the
   day a second garden exists. It also means repeating the same chart inside every
   plant's page is pure duplication of a garden-level fact.

5. **Indoor plants get garden rainfall.** `PlantCareInfo` renders the weather
   unconditionally, while the backend already knows better and skips weather alerts
   for indoor maps (`backend/services/alert_service.py:41–53`). A Monstera in the
   living room currently shows a 14-day rainfall chart.

6. **Precision theatre.** Per-day mm labels at 8px (`:201`) and per-day min/max at
   8px (`:247, :254`) on a 14-bar / 7-bar chart squeezed into a phone width. Below
   ~360px these are unreadable and the daily granularity carries no decision value —
   the badge and the total do.

### 2.2 Duplication

7. **"What can you do now?" repeats the year calendar.** `PlantCareSignals` merges
   warnings with the current month's phenology actions (`PlantDetail.tsx:79–90`,
   `utils/plantCareRecommendations.ts:19–48`) — and `PhaseCalendar` already prints
   the same `actions_nl/actions_en` for the current month in its "Nu (aug)" callout
   (`components/PhaseCalendar.tsx:76–82`, `utils/suitability.ts:71–82`). On mobile
   both sit within one scroll of each other. Only the warning-derived actions are
   new information.

8. **Care pills + care rows say the same thing twice on mobile.**
   `PlantDetail.tsx:502–515` renders a pill per schedule, then `:457–497` renders a
   row per schedule right below. Desktop deliberately avoids this (pills live in the
   hero, rows in the column — see the comment at `:455–456`); mobile kept both.

9. **Three sun-fit renderings, two of which can disagree.** The sheet computes fit
   from the heatmap cell *and honours `measured_sun_hours`* (`PlantQuickSheet.tsx:246–271`),
   `PlantMarker` uses `effectiveSunHours(plant.measured_sun_hours, cell.sunHours)`
   (`components/map/PlantMarker.tsx:151`), but `PlantDetail` uses `useSunAt` alone
   (`PlantDetail.tsx:180, 355–360`) and never reads `measured_sun_hours`. After a
   user corrects the sun in the sheet (#645), the passport still shows the modelled
   value with no way to fix it — the two panes contradict each other on the same
   plant.

10. **Species facts are scattered over three components.** `PlantCareInfo` (light,
    precipitation, bloom months, duration, leaf retention, flower colours),
    `PhaseCalendar` (phase per month, sow/transplant/harvest, fun fact) and
    `EcologyCard` (native, pollinator value, flowering months, host plant) all
    describe the species; bloom/flowering months appear in two of them.

### 2.3 Dead and unreachable

11. **`/plants/:id/care` is orphaned.** `PlantCareDetail` is routed
    (`App.tsx:335–338`) but nothing links to it — the only `/care` string in the
    whole `src` tree is the route definition itself. It is 317 lines carrying data
    that exists nowhere else in the UI: **toxicity, edible, average height, family,
    the 12-month flowering calendar, tree specs and the boomkeuring**. Users can't
    reach any of it.

12. **A bug inside that dead page:** it draws all 14 rain bars but labels the total
    `total_7day_mm` (`PlantCareDetail.tsx:279–300`), while `PlantCareInfo` uses
    `total_14day_mm` for the same chart. Whatever happens to the page, the two must
    not disagree.

### 2.4 Mobile / desktop layout

13. **Mobile buries the actionable content.** Order is calendar → ecology → alerts →
    care (`PlantDetail.tsx:871–881`). The user opens a plant to answer "does this
    need water", and scrolls past a year calendar and a biodiversity card to find
    out. Desktop's column 1 gets it right (alerts + care first,
    `PlantDetail.tsx:751–758`). Mobile should follow: sun fit → alerts → care →
    calendar → journal → species/ecology → history.

14. **The loading skeleton is mobile-shaped at every width** (`:336–349`): a
    full-bleed 208px block and one narrow card, rendered even on a 1800px masthead
    layout — a visible jump when data lands.

15. **Two breakpoint systems disagree about "desktop".** The passport splits at
    720px (`useIsMobile(720)`, `:182`), the quick sheet at 1024px
    (`plantQuickSheet.css:6`) plus `sm:`/`lg:` utilities inside the same component
    (`plantQuickSheetLayout.ts:19`, `PlantQuickSheet.tsx:348, 380`). Between 721 and
    1023px the passport is in desktop mode while the sheet is still the phone sheet.

16. **The quick sheet's desktop grid scrolls as one block.** `max-height:
    min(42dvh, 380px)` with a 3-column body (`plantQuickSheet.css:8, 12–19`) means
    opening the measured-sun editor (~200px, `PlantQuickSheet.tsx:476–518`) or a
    plant with several placements scrolls the *identity and care columns* out of
    view too, even though they have room to spare.

17. **`PLANT_QUICK_SHEET_TITLE_ROW_CLASS`, `..._ACTIONS_CLASS` and
    `..._DESKTOP_ONLY_ACTION_CLASS` are exported but unused** — the header was
    rewritten to inline styles (`PlantQuickSheet.tsx:304–388`) and the constants
    were left behind.

### 2.5 Correctness and copy

18. **`today` is computed in UTC.** `new Date().toISOString().slice(0,10)`
    (`PlantDetail.tsx:353`) versus the local-midnight arithmetic the quick sheet
    uses (`PlantQuickSheet.tsx:144, 162`). Between 00:00 and 02:00 CEST the passport
    considers a task due today to be in the future, and shows it green.

19. **Due dates are raw ISO strings.** `sched.next_due` prints as `2026-08-21`
    (`PlantDetail.tsx:480`) while the care history two sections down formats via
    `toLocaleDateString` (`:591`). Same page, two date formats, one of them not
    localized at all.

20. **"Archive" is labelled "Delete plant"** (`t.plantDetail.archivePlant`, EN
    `'Delete plant'`) and confirms with "This cannot be undone"
    (`t.plantDetail.deleteConfirm`), but `archivePlant` is a soft delete
    (`is_active = false`) and the plant is recoverable. The copy is scarier than the
    action.

21. **Hardcoded user-facing strings in `PlantDetail.tsx`** — `'No year calendar
    available yet'`, `'Fetch species data'`, `'Bezig...'`, the retry-failure
    sentence (`:423, 431–438`). The file is *not* in the i18n baseline
    (`frontend/eslint.i18n.config.js`); it passes only because the guard is
    `markupOnly` and cannot see literals inside `{isEN ? … : …}` expressions.
    Per CLAUDE.md these belong in the catalog. `PhaseCalendar.tsx` and
    `PlantCareInfo.tsx` are baselined but hold the same pattern
    (`'Sow'/'Zaaien'`, `'Rainfall — 14 days'`, the five badge dictionaries at
    `PlantCareInfo.tsx:18–66`) — worth clearing while these files are open anyway.

22. **A11y gaps.** `aria-label="Sluiten"` hardcoded Dutch on the sheet handle
    (`PlantQuickSheet.tsx:291`); the passport's mobile back button and the `⎘`
    duplicate button have no accessible name (`PlantDetail.tsx:818–833`); prev/next
    arrows carry `title` but the desktop `NavArrow` is the only one with
    `aria-label`; the sheet is a `createPortal` div with no `role="dialog"`,
    `aria-modal` or focus trap, and no Escape handler.

### 2.6 Data volume per open

Opening the passport fires, in parallel and uncoordinated: `plants/{id}` (only if
not in the store), `plants/{id}/warnings`, `plants/{id}/care-info`,
`plants/{id}/photos`, `care/log/{id}`, `species/{id}/ecology`, plus
`garden/rain-context` and `garden/temperature-context` on first use (module-cached
afterwards). Coming from the map, `plants/{id}` was *already* fetched by the sheet
(`PlantQuickSheet.tsx:119`) and is fetched again by the passport. Nothing here is
individually slow, but there is no single "plant detail" payload and no shared
cache between the two panes.

---

## 3. Too much / too little

**Too much, on the plant:** the 14-day rainfall and 7-day temperature charts
(garden-level, identical everywhere, daily granularity nobody acts on); the
duplicated action list; the duplicated care pills; annual precipitation in mm/year.

**Too little, on the plant:** everything stranded in `PlantCareDetail` —
**toxicity** (matters with pets and children), **edible**, **average height**,
family, the flowering calendar. Also missing: last-watered-at-a-glance
("3 days ago" instead of only a next-due date), any way to *add* a schedule from
the passport (delete exists, add requires Edit), and a plant-level notes field on
desktop beyond the masthead lede.

---

## 4. Recommended plan

**Round 1 — the weather card (answers the original complaint)**
1. Move rainfall + temperature out of the per-plant card into one garden-level
   surface (the map's weather pill / dashboard), and leave in the plant page a
   single line: *"Garden: 22 mm in 14 days · well watered"* linking there.
2. Until that lands, at minimum: render the weather section on mobile even when
   the species has no care data, and rename the mobile card to match desktop's
   `speciesProfile` / `gardenWeather` split.
3. Suppress weather entirely for plants on indoor maps, mirroring
   `alert_service._INDOOR_SKIP`.
4. Drop the per-day mm and per-day min/max labels on narrow screens; keep badge +
   total + bars.

**Round 2 — deduplicate**
5. Let `PhaseCalendar` own the current-month actions; `PlantCareSignals` keeps only
   warning-derived ones and is renamed to something that isn't "Weather alerts"
   when it carries non-weather advice.
6. Drop the mobile care pills, or drop the mobile schedule rows — not both.
7. Make `PlantDetail` read `measured_sun_hours` through `effectiveSunHours` and
   expose the same measured-sun editor the sheet has (or link to it), so the two
   panes stop disagreeing.

**Round 3 — reclaim the orphan**
8. Fold the unique fields of `PlantCareDetail` (toxicity, edible, height, family,
   flowering calendar, tree specs) into the passport's species section and delete
   the page + route — or link to it from the species section and fix its
   7-day/14-day label. Deleting is preferable; nothing links there today.

**Round 4 — layout**
9. Reorder mobile to: identity → sun fit → alerts → care → calendar → journal →
   species/ecology → history → archive.
10. Give the loading skeleton a desktop variant.
11. Align the passport and sheet breakpoints (720 vs 1024).
12. Let the quick sheet's desktop columns scroll independently, or grow the sheet
    when the sun editor opens.
13. Delete the three unused layout constants.

**Round 5 — correctness / polish**
14. Local-midnight `today` in `PlantDetail`; localize `next_due`.
15. Retitle archive to match its soft-delete behaviour.
16. Move the remaining literals into the catalog and remove `PlantCareInfo.tsx`
    and `PhaseCalendar.tsx` from the i18n baseline; verify the whole pane in EN.
17. `role="dialog"` + focus trap + Escape on the sheet; accessible names on the
    passport's icon buttons.

Ordering rationale: 1–4 remove the thing that reads as "weird", 5–8 cut roughly a
third of the pane's content without losing information, 9–13 are layout work that
is much easier once the content set is settled, 14–17 are independent and can go
any time.
