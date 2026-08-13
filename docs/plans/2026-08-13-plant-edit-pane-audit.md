# Plant edit pane — audit (2026-08-13)

> **Status.** Findings landed in #886; the §4 restructure followed in a second
> pass. Everything in §3 and §4 is now implemented except the
> `PATCH /care-profile` endpoint, which needs a human's
> `tests-intentionally-removed` label. One finding (P2-4) was withdrawn on
> closer reading — the note explains why.
>
> The re-cut form was verified rendering at phone and desktop widths in **both**
> languages against a stubbed API, the same way the plant-details audit was.
> Companion to `2026-08-09-plant-details-audit.md` (#878, the read pane) and
> `2026-08-07-add-plant-menu-audit.md` (#823, the create pane). This one covers
> the third side of the same triangle: **editing** a plant that already exists.

**Scope:** `/plants/:id/edit` (`pages/EditPlant.tsx`, 758 lines) plus every other
surface in the app that writes the same data — because the answer to "do these
two menus make sense?" turns out to be that there are not two menus, there are
five (four, now that the dead one is gone).

| Surface | File | What it writes |
|---|---|---|
| Edit form | `pages/EditPlant.tsx` + `editPlantPayload.ts` + `editPlantCareSchedules.ts` | 14 plant columns + full care-schedule replacement |
| Care block in the passport | `pages/PlantDetail.tsx` (+ `plantPassportModel.ts`) | add / delete one schedule |
| Photo reminder | `components/plant/PhotoJournal.tsx` | the `photo` schedule |
| Measured sun | `components/plant/MeasuredSunEditor.tsx`, used by the passport **and** `PlantQuickSheet` | `measured_sun_hours` |
| ~~Care profile rows~~ | ~~`components/care/CareProfileSection.tsx`~~ | ~~`plants.care_profile`~~ — deleted, see P1-3 |

---

## 1. What the two panes hold today

**Passport** (`/plants/:id`) — the read pane. It answers *"does this plant need
me today?"*: hero, identity, sun fit, warnings, care rows with **mark-done**,
**delete-schedule** (×) and an **add-care** form, year calendar, journal, species
profile, history, archive.

**Edit form** (`/plants/:id/edit`) — a four-card form mirroring Add Plant:

| Card | Fields |
|---|---|
| § I Identity | nickname, id (read-only), species (free text), form tiles, life phase, quantity, acquired date |
| § II Placement | zone/map picker, light tiles, mulch toggle, last repotted |
| § III Care | 8 care types, each an on/off toggle + interval, plus the water rhythm switch |
| § IV Album | icon picker, sown date, notes |

On phones a **Basis / Details** pill toggle hides § II and most of § IV; § I and
§ III are always visible. Desktop (≥1024px) shows all four beside a live
passport-preview rail.

---

## 2. Do the two menus make sense?

**Not as they stand.** They are not "details" and "care settings" — they are two
overlapping editors of the same records with two different mental models, and the
split runs through the middle of several concepts rather than between them.

### 2.1 Care schedules are edited in two metaphors that mean the same thing — **partly fixed**

The edit form models care as **eight toggles**: every editable type for the
environment is present, off or on, with an interval. The passport models the same
data as **a list you add rows to and delete rows from**. Turning `mist` off in the
form and pressing × on the mist row in the passport are the same write
(`PUT /plants/{id}/care-schedules` deactivates any editable type not submitted),
but one is a silent switch and the other pops a `window.confirm`.

The split is also on the wrong axis. The single most common care edit — *"water
every 5 days, not 7"* — is **only** possible in the edit form; the passport shows
the interval as read-only text. Meanwhile *adding* a care type is possible in
both. So the user has to learn which of two screens holds which half of one
concept.

**Fixed for the interval.** The "every 7 days" line on each passport care row
is now a button that opens an inline editor, so the most common care edit no
longer needs the other screen. It uses `buildIntervalChangePayload`, which
deliberately omits `next_due` for the edited row — retiming must not also mean
"and water it now", so the backend recomputes the next visit from `last_done` —
while pinning every other row to its current date, since the endpoint replaces
the whole list.

**And then for the metaphors.** Adding and removing a care type is form-only
now; the passport's care block ends in one link that opens the form on its care
card, and the per-row `×` is gone. See §4.1.

### 2.2 "Sun" is split across three panes, by accident — **fixed**

- `sun_requirement` (what the plant wants) → **edit form only**.
- `measured_sun_hours` (what the spot actually gives) → **passport + quick sheet
  only**, via the pencil on the sun-fit card.
- The modelled hours behind the fit verdict → nowhere; derived.

`buildEditPlantPayload` even has to carry `measured_sun_hours` through untouched
so that saving the edit form does not wipe a value the edit form cannot show
(`editPlantPayload.ts:52-53`). The two halves of one comparison live in two
screens, and the fit verdict is shown in the pane that can only edit the half
that isn't the plant's.

**Fixed.** The form's Light section is two rows — what the plant wants and what
the spot gives — so both halves of the comparison are editable in the pane that
owns the plant's setup, and the payload no longer has to carry
`measured_sun_hours` through blind. The passport and quick sheet keep their
pencil, which is the right place to correct a measurement in context.

### 2.3 The edit form cannot edit ~40% of what Add Plant collects — **mostly fixed**

Since #823, Add Plant persists container and provenance detail. `PlantUpdate`
(`backend/models.py:110-137`) accepts all of it. `buildEditPlantPayload` sends
**none** of it:

| Field | Set at creation | Editable afterwards |
|---|---|---|
| `pot_size_cm` | ✅ | ✅ **fixed** (follows the diameter, as on create) |
| `form_type` | ✅ | ✅ **fixed** — see P2-1 |
| `pot_material`, `pot_diameter_cm`, `pot_height_cm` | ✅ | ✅ **fixed** |
| `has_drainage` | ✅ | ✅ **fixed** |
| `substrate` | ✅ | ✅ **fixed** |
| `acquired_from` | ✅ | ✅ **fixed** |
| `container_id` | map drag | ✅ **fixed** — see below |
| `location_id` | Locations feature | ❌ — owned by the Locations feature |
| `measured_sun_hours` | — | ✅ **fixed** — see §2.2 |

Repotting a plant into a bigger pot is one of the few genuinely recurring plant
events, and the only pot field in the edit form is the *date* you did it. This is
write-once data with no correction path, which is the same class of defect #823
fixed on the create side (fields collected and dropped); here they are collected
and then frozen.

**Fixed for the pot and provenance columns.** The Pot and Substrate rows moved
into a shared `PotDetailsFields` component that both forms render, so they
cannot drift apart the way the Light row did, and Edit Plant gained a "Came
from" row. `pot_size_cm` follows the diameter on save, mirroring what
`create_plant` does, rather than being left behind at its creation value.

**Also fixed: `container_id`.** The concern that it is placement-owned turned
out to be answered by the code — `PUT /plants/{id}/container` already exists and
is already how the map sets a container without moving the plant, so the form
calls it. The row only offers containers on the plant's own map.

**Still open: `location_id`.** It belongs to the Locations feature, which this
form deliberately does not touch (see the comment in `buildEditPlantPayload`).

---

## 3. Correctness findings

Severity: **P1** = wrong data persisted / silent loss, **P2** = broken or dead
UI, **P3** = copy and polish.

### P1-1 — Two of the five light options write values nothing can read — **FIXED**

The light tiles offer `dark · shade · indirect · bright · full-sun`
(`EditPlant.tsx:518-524`, identical in `AddPlant.tsx`). `SUN_TILE_TO_DB`
(`editPlantPayload.ts:10-14`) maps only three of them:

```ts
shade → shade,  indirect → partial_sun,  'full-sun' → full_sun
```

`dark` and `bright` fall through the `?? input.sunRequirement` fallback and are
persisted verbatim. `PLANT_SUN_PROFILES` has exactly three ids
(`utils/plantSunRequirements.ts:46-74`), so `getSunFit('dark', …)` returns
`null` → **the sun-fit card disappears from the passport, the quick sheet, and
the map marker's fit ring** for that plant, permanently and without a message.
Reopening the editor looks fine, because `SUN_DB_TO_TILE` also falls through and
re-selects the tile. Two of five choices are silent dead ends.

Needs a data check (`SELECT sun_requirement, count(*) FROM plants GROUP BY 1`)
plus a backfill, not just a UI fix.

**Fixed.** The tile vocabulary is gone: `SUN_REQUIREMENT_IDS` (`shade |
partial_sun | full_sun`) is now the single vocabulary shared by the forms, the
sun profiles, the species `sun_preference` column and `plants.sun_requirement`,
and both forms render it through one `sunRequirementTiles()` helper, so the
control cannot emit a value the engine can't read. `normalizeSunRequirement()`
coerces the retired spellings on read (`dark → shade`, `bright → partial_sun`,
`indirect → partial_sun`, `full-sun → full_sun`) and `getSunFit` /
`sunProfileFor` route through it, so plants already carrying a bad value render
a fit immediately. Migration `0070` rewrites the stored rows and a validator on
`PlantCreate` / `PlantUpdate` stops a stale client writing new ones. The
subtitles changed from lux ranges to hours of direct sun, which is what
`PLANT_SUN_PROFILES` actually compares — see P3-3.

### P1-2 — Clearing the species field leaves the plant linked to the old species — **FIXED**

`update_plant` treats a species rename as a re-identification and relinks
`species_id`, retracting BioCLIP anchors and regenerating phenology
(`routers/plants.py:550-600`) — good. But the guard is
`if "species" in updates and str(updates["species"] or "").strip():`. The edit
form sends `species: input.species.trim() || null` (`editPlantPayload.ts:41`), so
**emptying the field skips the relink entirely**: `species` goes NULL while
`species_id` keeps pointing at the old species, and the passport goes on showing
that species' phenology, ecology card and care thresholds. There is no way to say
"I was wrong, I don't know what this is."

**Fixed.** The pre-read now fires whenever `species` is present in the payload,
empty or not, and an emptied field takes a third branch: `_clear_species_link`,
the mirror of `_apply_species_relink`. It drops `species_id`, clears the cached
`care_thresholds` that described the withdrawn species, and retracts the
plant's anchors — while leaving the plant's own care schedules untouched, since
un-identifying should lose what the species told us, not what the user set up.

### P1-3 — `care_profile` and `care_schedules` are two sources of truth for "is this care type on" — **FIXED (frontend half)**

`services/warnings.py:588-594` gates every schedule warning on
`care_profile[type].active`. The only writer of `plants.care_profile` in the
entire backend is `PATCH /plants/{id}/care-profile`
(`routers/warnings.py:471-508`), whose only frontend caller is
`CareProfileSection` — **which no component renders**. Neither the edit form nor
the passport touches it.

Today this is latent, not broken: `care_profile` is NULL for every plant, so
`load_legacy_care_profile` marks every environment-valid type active
(`services/care_profile.py:68-75`) and the schedule rows decide the outcome. But
the wiring is live end to end — store action, api client method, endpoint,
component — so the first use of that surface would desynchronise the two models:
disabling a type there would not remove its schedule, and toggling a schedule off
in the edit form would not clear the profile.

Either delete the dead half (component + `patchCareProfile` + endpoint) or make
`sync_care_schedules` the single writer of both.

**Fixed as far as it can be without a human.** `CareProfileSection`,
`usePlantCareProfile`, `patchCareProfile` (api client + store) and the store's
`profileVersions` are gone, so nothing in the app can write the competing model
any more. The endpoint itself stays: deleting it means deleting
`test_legacy_care_profile_patch_persists_only_canonical_keys`, and the
`test-guard` CI check requires a human's `tests-intentionally-removed` label for
that. Its docstring now records that no UI calls it and what has to happen
before one does.

The read path in `services/warnings.py` is untouched — it is load-bearing, and
with the column NULL everywhere `load_legacy_care_profile` derives the active
set from the environment while the schedules decide the outcome.

### P2-1 — "Form" tiles offer four options, of which two are unreachable and none persist — **FIXED**

`formType` is documented as controlling only the potted/bare icon variant
(`EditPlant.tsx:129-131`) and the switcher only asks `formType === 'pot'`
(`:180-187`) — so **Seedling and Tree behave exactly like In-ground**. Worse, the
value is never sent: on reopen, `formType` is re-derived from the icon's actual
form and can only come back as `pot` or `ground` (`:168-174`). Pick "Boomvorm",
save, reopen → "In de grond". Four tiles with subtitles ("Young", "Standard")
that read like taxonomy, for a two-state icon switch. Meanwhile the real column,
`form_type`, is writable in `PlantUpdate` and never written from here.

**Fixed.** `form_type` is now sent on save, and `resolveFormType()` decides what
the tile shows on reopen: the icon stays authoritative on the potted/bare axis
(map placement rewrites `icon_key` but never `form_type`, so trusting the stored
value outright would resurrect the drift bug), while within the bare half the
stored value wins — which is what `tree` and `seedling` needed, since the icon
set cannot draw the difference. Seedling and Tree still share the bare icon;
that is a limit of the icon set, and now an intentional one rather than a
silently discarded choice.

### P2-2 — The mulch toggle is shown for indoor plants — **FIXED**

The comment at `EditPlant.tsx:62-64` says mulch is outdoor-only and the pressure
engine ignores it indoors; the toggle renders unconditionally in § II. It should
follow the same environment gate the care editor already uses.

**Fixed.** The row is hidden when `careEnvironment === 'indoor'`.

### P2-3 — The form is unusable if `/maps` fails

`schedules` is only initialised once both the plant and its map are available
(`EditPlant.tsx:147-156`), and Save is disabled while `schedules` is null
(`:642`). If the maps store never resolves for a plant with `map_id != null`, the
whole edit page — including the name field — becomes read-only with no error
shown.

### P2-4 — ~~`pot_size_cm` and the potted/bare icon can drift~~ — **withdrawn**

Overstated when this was written, on the strength of the first half of the
docstring at `routers/icons.py:70-79`. The second half says the opposite:
`pot_size_cm` was *deliberately* cut out of the icon decision when the
potted/bare drift bug was fixed — it "is still accepted for call-site
compatibility but no longer influences the icon". There is nothing for the two
to drift on.

What remains is not a drift bug but a gap: `pot_size_cm` simply is not editable
after creation. That is already covered by §2.3.

### P3-1 — English strings in the Dutch catalog — **FIXED**

`i18n/nl.ts:1162-1168`: `formPotSub: 'Potted'`, `formGroundSub: 'Bare'`,
`formSeedlingSub: 'Seedling'`, `formTreeSub: 'Tree'` — the Dutch UI prints
English subtitles under Dutch titles. Exactly the class of defect the 2026-07
language audit was about. (`EditPlant.tsx` is still on the i18n-guard baseline
list in `eslint.i18n.config.js:67`; a pass over it should also remove that entry.)

**Fixed.** The four subtitles are Dutch now ("In een pot", "Wortels in de
grond", "Nog jong", "Op stam"), and `EditPlant.tsx` is off the baseline list —
the guard flagged exactly one thing once the entry was removed, a `·` separator
sitting as markup text between the translated eyebrow and the plant's id, now
folded into the expression beside it.

### P3-2 — Labels that describe fields the form doesn't have, or the wrong field — **FIXED**

- **Last repotted** is described with `t.addPlant.labelSownDesc` — *"When did it
  start?"* / *"Wanneer begon de plant?"* (`EditPlant.tsx:551`). Copy-paste from
  the sown-date row.
- **Acquired** is described as *"When + where"* / *"Wanneer + waar"*
  (`labelAcquiredDesc`), but the edit form has only the date — `acquired_from` is
  not editable here (see 2.3).
- **Icon** is described as *"Pick an emoji"* / *"Kies een emoji"*; `IconPicker`
  picks illustrated SVGs from the icon catalog, not emoji.
- The NL light label is **"Lichtmeting"** (light *measurement*) where EN says
  "Light" — which brings us to the next point.

**Fixed.** Last-repotted, Acquired and Icon have their own descriptions rather
than borrowed ones — the first two live under `editPlant` precisely because Add
Plant's versions are correct *there* (it does collect `acquired_from`) and only
wrong when reused here. The light label is covered by P3-3.

### P3-3 — The light row asks about the spot and stores it as the plant's requirement — **copy fixed**

`labelLightDesc` is *"How much light it gets"* / *"Hoeveel licht de plant
krijgt"*, and the tile subtitles are lux ranges (`≤500 lx`, `10–25k`) — every
signal says **measure this spot**. The value is stored in `sun_requirement`, *the
plant's need*, which the sun engine then compares against the modelled/measured
hours **at that same spot** to grade the fit. A user who answers honestly ("this
corner is dark") is telling the app the plant *wants* darkness, and the fit
verdict becomes a comparison of the spot with itself.

The field the copy actually describes already exists — `measured_sun_hours` —
and is editable in two other panes. This is the single most confusing datum in
the form.

**Half fixed** (landed with P1-1, since it is the same row). The row is now
"Light requirement" / "Lichtbehoefte", described as *"How much direct sun this
plant wants"*, with subtitles in hours of direct sun matching the profile
buckets — so it no longer claims to be a light-meter reading of the spot. The
other half — surfacing `measured_sun_hours` as a second row so the form shows
both sides of the comparison — is still open and belongs with §4.3.

---

## 4. How I would structure it

### 4.1 One principle: the passport edits *state*, the form edits *identity*

The clean seam is not "details vs care". It is:

- **Passport = what changed today.** Log care, adjust a rhythm you are living
  with, correct a measurement, add a photo. Small, in-context, immediately
  applied, no save button.
- **Edit form = what this plant fundamentally is.** Name, species, pot,
  substrate, placement, requirements, provenance. Deliberate, explicit save.

Applied to the specific overlaps:

| Datum | Today | Proposed |
|---|---|---|
| Interval of an existing schedule | form only | **both** — inline on the passport row (tap the "every 7 days" text), canonical in the form |
| Add / remove a care type | both, two metaphors | **form only**; the passport's "+ Verzorging" becomes a link into § III |
| Mark done, undo, care photo | passport | unchanged |
| `measured_sun_hours` | passport + quick sheet | unchanged, **plus** shown read-only in the form's light row with a link |
| `sun_requirement` | form | unchanged, **plus** editable from the passport's sun-fit card, which is where the mismatch is visible |
| Photo reminder | journal | keep in the journal, **and** surface it as a row in § III so all reminders are visible in one list |

That removes the "which screen holds this?" question without collapsing the two
panes: everything about *this plant's setup* is findable in the form; everything
about *this week* is doable from the passport.

### 4.2 Re-cut the form's four cards

The current cards are inherited from Add Plant, where the ordering serves a
first-run narrative. For editing, group by **what the care engine consumes**, so
a user changing one thing can see what depends on it:

1. **Identity** — nickname, species (with a picker, see 4.3), quantity, phase,
   icon. *Album's icon belongs here; it is identity, not archive.*
2. **Where it lives** — map/zone, container vs ground, mulch (outdoor only),
   measured sun (read-only mirror + link), **pot: material, diameter, height,
   drainage, substrate**. All the environment inputs in one card, because
   together they decide the care environment and therefore card 3.
3. **Care rhythm** — the eight toggles, unchanged, *plus a line naming the
   environment they were derived from* ("Buiten, in pot → 8 typen") so the
   dependency on card 2 is visible, plus the photo reminder row.
4. **History & notes** — acquired date + where from, sown date, last repotted,
   notes.

That is the same four cards, but "Placement" stops being a junk drawer holding
last-repotted, and "Album" stops holding the sown date.

### 4.3 Specific additions

- **Species picker instead of a bare text input.** Changing this field
  re-identifies the plant, retracts BioCLIP anchors and regenerates phenology
  (#866). Autocomplete against `plant_species`, plus an explicit "Not this
  species / unknown" option that clears `species_id` (fixes P1-2), plus a
  one-line warning when the value changes.
- **Light: two rows, not one.** "This plant wants" (`sun_requirement`, three
  options matching `PLANT_SUN_PROFILES`) and "This spot gives"
  (`measured_sun_hours`, hours). Fixes P1-1 and P3-3 together.
- **Pot block**, mirroring Add Plant's, wired to the fields `PlantUpdate`
  already accepts.
- **Container / ground switch**, so the care environment can be corrected
  without dragging on the map.

### 4.4 Specific removals

- The **Form tiles** (P2-1). Either delete them and let the icon picker own the
  potted/bare choice, or reduce them to a two-state "In pot / in de grond"
  control that actually persists `form_type` and keeps `pot_size_cm` in step.
- **`CareProfileSection` + `patchCareProfile` + `PATCH /care-profile`** (P1-3),
  unless the profile is promoted to the single source of truth. Right now it is a
  loaded gun.
- The **Basis / Details toggle** on mobile. It hides placement and album behind a
  pill that reads like a wizard step but is a filter, and it means the phone user
  editing a pot size has to know it lives under "Details". With the re-cut above,
  four collapsible cards (all headings visible, first one open) do the same job
  more legibly.
- The **read-only `#003` id box** next to the nickname. It is decorative on a
  form; the passport preview rail already prints it.

### 4.5 Nice-to-have

The frontend duplicates the backend's care-type matrix: `DEFAULT_INTERVALS` in
`editPlantCareSchedules.ts:17-26` restates `CARE_TYPES` from
`backend/care_types.py`. They agree today (I checked all eight types across three
environments) but nothing enforces it, and `care_types.py`'s docstring claims
adding a care type is a one-file change. Serving the matrix from an endpoint, or
at least a parity test, would make that claim true.

---

## 5. Order of work

1. ~~P1-1 (light values)~~ — **done**, incl. migration 0070 and a backfill.
2. ~~P1-2 (un-identify)~~ — **done**.
3. ~~P2-1 (form tiles)~~ — **done**. P2-4 withdrawn; see the note there.
4. ~~2.3 / 4.3 (pot + provenance editable)~~ — **done** for the pot and
   provenance columns; `container_id` / `location_id` still need the object
   picker from §4.3.
5. ~~2.1 (interval editing on the passport row)~~ — **done**.
6. ~~P1-3 (dead care-profile path)~~ — **done** as far as it can be without a
   human; the endpoint needs a `tests-intentionally-removed` label.
7. ~~P3 copy pass + i18n baseline removal~~ — **done**.

### The §4 restructure — done

- **§4.1** — add/remove of a care type is form-only now; the passport's care
  block ends in one link into the edit form's care card (`#care`, which opens
  that card on a phone). The per-row `×` is gone with it. Interval editing
  stays in both, as the table proposed.
- **§4.2** — four cards re-cut: Identity took the icon and the Form tiles,
  "Where it lives" holds every input the care engine reads, Care names the
  environment it derived from and lists the photo reminder, and "History &
  notes" collects the dates that were scattered across the other two.
- **§4.3** — species picker with autocomplete and an explicit "I don't know",
  the second light row (`measured_sun_hours`), and the container switch.
- **§4.4** — the Basis/Details toggle and the decorative id box are gone.
- **§4.5** — `backend/tests/test_care_matrix_parity.py`.

**Deliberately not done.** §4.1 proposed surfacing `sun_requirement` from the
passport's sun-fit card as well. It is left in the form: the card is a verdict
about a spot, and the requirement is a property of the plant — putting a
species-level control on it invites editing the wrong half of the comparison,
which is the confusion P3-3 was about. The measured-sun pencil already sits
there, and the passport's edit link is two taps from the requirement.

The photo reminder is named in the care card but not editable there: it is a
`photo` schedule, which `sync_care_schedules` rejects outright, so a toggle
would need a second write path. The journal keeps the control and the card
links to it.

### Still open

Only the `PATCH /care-profile` endpoint, pending a `tests-intentionally-removed`
label — see P1-3.
