# Plant quick sheet — audit (2026-08-14)

> **Status.** Findings. P1-1 is fixed in this branch; the rest are proposals.
> Completes the set: `2026-08-07-add-plant-menu-audit.md` (#823, create),
> `2026-08-09-plant-details-audit.md` (#878, read), `2026-08-13-plant-edit-pane-audit.md`
> (#886/#887, edit), and now the sheet — the pane users actually touch most,
> because it is one tap from the map and it is where care gets ticked off.

**Scope:** `components/sheets/PlantQuickSheet.tsx` (619 lines) +
`plantQuickSheetLayout.ts` + `plantQuickSheet.css`, reached by tapping a plant
marker on `/map/:slug`.

Verified by driving the real map page against a stubbed API at 430px and
1440px, in both languages.

---

## 1. What the sheet holds

| Zone | Contents |
|---|---|
| Header | photo/icon tile (tap = progress photo), name, species, quantity, "Meer info →", ⋯ menu (mobile) / 6-icon row (desktop) |
| Care | status line ("4 taken te doen" / "Alles op schema"), one-tap care chips, photo chip |
| Context | sun fit + measured-sun editor, container / ground zone with a "remove" action, **Extra plekken** with a full-width "Voeg nog een plek toe" button |

Mobile: one scrolling column, `max-height: 85dvh`.
Desktop (≥1024px): three columns, `max-height: min(42dvh, 380px)`, each
scrolling independently.

---

## 2. Does the menu make sense?

**The shape does.** Identity → what needs doing → where it lives is the right
order, the chips are the right primitive for the job, and undo-by-tapping-again
is a genuinely good touch. The problems are that the care section is
**incomplete**, and that the least-used feature on the sheet is its most
prominent element.

### P1-1 — Two care types can never be ticked off here — **FIXED**

`CARE_ORDER` (`PlantQuickSheet.tsx:191`) lists eight care types:

```ts
['water', 'fertilize', 'prune', 'mist', 'rotate', 'repot', 'frost_protect', 'heat_protect']
```

`CARE_TYPES` in `backend/care_types.py` has **ten** non-photo entries. Missing:
**`pest_check`** and **`dust`** — both ordinary user-schedulable types, both
offered as toggles in the edit form, both with icons already drawn in
`CareIcon` and localized labels already in `t.careTypes`.

The chip list is `CARE_ORDER.filter(ct => ct === 'water' || ct === 'fertilize' || dueByType.has(ct))`,
so a due `pest_check` is filtered out before it can render. The status line
above it counts **all** overdue schedules. The two disagree:

> Rendered with water 3 days overdue, fertilize due today, pest_check 5 days
> overdue, dust 1 day overdue:
> **"⚠ 4 taken te doen"** — and three chips, of which one (Sproeien) is not due
> at all. The two overdue tasks the user is being told about are not on screen
> and cannot be completed from here.

A user who trusts the count taps everything available, still sees "2 taken te
doen", and has no way to discover what the other two are. `pest_check` at 30
days is a default in every environment, so this is not an exotic setup.

**Fixed** by deriving the chip order from the shared care-type list instead of
a hand-written array, so a new care type cannot be added to the model without
appearing here.

### P2-1 — ~~The chip filter asks the wrong question~~ — **withdrawn, with one real defect underneath**

Written as "neither rule, just an accident of the data structure". On a second
read that is wrong: the rule is exactly what the comment above it says — *water
and feed always, plus any care type this plant is scheduled for* — and it is
applied consistently. The mist chip appearing four days early is the rule
working, not a bug: logging care early ("I misted it today anyway") is a normal
thing to want, and the chip carries no badge, so it does not claim to be due.

The rule stands. It is now expressed as one named function, `careChipTypes`,
with the reasoning written down.

**The real defect next to it:** `dueByType` was built from
`detail.care_schedules` with no `is_active` filter, so a **deactivated**
schedule still produced a chip. Turn `mist` off in the edit form and its chip
stayed on the sheet. `dueDaysByType` skips inactive rows, which fixes it.

### P2-2 — "Extra plekken" dominates a sheet that is mostly about care — **FIXED**

The placements block renders whenever `onAddPlacement` is passed, which
`MapPage.tsx:799` does unconditionally — so **every plant, always**. It is a
mono-case heading plus a full-width dashed button, and on the everyday plant
with nothing due it is:

- roughly **a third of the mobile sheet**, and the largest interactive target
  on it — bigger than any care chip;
- **a full column of three on desktop**, usually containing nothing else.

Multi-placement is a real feature (one rhubarb, three clumps) but a rare one,
and it is *placement* — the same category as "move on map", which correctly
lives in the ⋯ menu. Meanwhile the thing users come here for gets the middle.

**Fixed** as proposed: the block renders only when `placements.length > 0`, and
"Voeg nog een plek toe" moved into the ⋯ menu and the desktop icon row beside
the other placement actions. Users of the feature keep their spots visible and
stay one tap from adding; every other plant gets the space back.

### P2-3 — The sheet never says what the rhythm is — **FIXED**

"Alles op schema" is the whole story when nothing is due. Not *when* the next
watering is, not how often this plant is watered. The passport knows; the sheet
— the pane people actually open — does not. One line under the status
("Volgende: water over 4 dagen") would answer the question most taps are
really asking.

**Fixed.** A line under the status reads "Straks: water over 4 dagen", or
"Nog geen verzorging ingesteld — stel iets in" when the plant has no schedule
at all. It is a button: it closes the sheet and lands on the passport's care
section (new `#care-schedules` anchor), which is also the answer to §3 — the
sheet now says a rhythm exists and offers the way to it.

### P3-1 — Three sources of truth for care labels — **FIXED**

The sheet builds its own `careLabelMap` (`:172-181`) covering eight types,
falls back to `CARE_TYPE_INFO[ct].label` — which is **English-only**
(`types/index.ts:521-533`, `'Wipe leaves'`, `'Pest check'`) — and ignores
`t.careTypes`, the localized map every other surface uses and which has all
eleven. Any type missing from `careLabelMap` prints English into the Dutch UI.
Folded into the P1-1 fix by using `t.careTypes` directly.

### P3-2 — The management row is glyph soup — **FIXED**

Six actions on desktop rendered as `↔`, `⇄`, `⧉` plus three Glyphs, in a
3-column grid, distinguished only by `title` tooltips. `↔` (move on map) and
`⇄` (move to another map) are one arrow apart and mean different things. They
are real `Glyph`s away from being legible.

**Fixed:** `pin` (move on map), `map` (move to another map) and a new `copy`
glyph (duplicate), and every icon-only button in that row gained an
`aria-label` — they had `title` only, which screen readers do not reliably
announce.

### P3-3 — The assistant launcher overlaps the sheet — **FIXED**

At 430px the floating Stekkie launcher (`HelpAssistant`, `zIndex: 90`) sits on
top of the sheet's controls — it covered the corner of the placement button in
every screenshot taken for this audit. The sheet is `z-[60]`. Not caused by the
stub; it is chrome the map always shows.

**Fixed** in `index.css` rather than by raising the sheet, so it covers the
class of bug rather than one instance:
`body:has([role="dialog"][aria-modal="true"]) .help-assistant-launcher { display: none }`.
That reaches all nine `role="dialog"` surfaces in the app, and is scoped to
`aria-modal` so the assistant's own panel — which is not one — keeps its
launcher.

---

## 3. Can a new user manage their care schedule?

Traced end to end, because it is the question behind the others.

A plant created through Add Plant gets **exactly one schedule: water**
(`_seed_care_schedules`, `routers/plants.py:214-247`, deliberate — "optional
care advice … never becomes a recurring commitment without an explicit
post-create user action"). Everything else is opt-in afterwards.

So a new user's path, from the map:

| Goal | Path | Taps |
|---|---|---|
| Tick water off | chip | **1** |
| Undo that | chip again | 1 |
| See the rhythm | Meer info → read the care row | 2 |
| Change the interval | Meer info → tap "Elke 7 dagen" → save | **3** |
| Add fertilizing | Meer info → "Verzorging toevoegen of weghalen" → toggle → save | **4** |

Ticking off is excellent — one tap, undoable, with the overdue count right
there. **Setting up** is workable but undiscoverable: nothing in the sheet
hints that a plant's care rhythm is editable at all, and the only route out is
a link labelled "Meer info", which sounds like reading rather than doing.

That is the honest answer to "is it easy for new users": *doing* today's care
is easy; *shaping* it is two panes away behind a word that does not suggest it.
P2-3's "next: water in 4 days" line would help, and making that line tappable
— straight to the passport's care section — would close the gap without adding
a control to the sheet.

---

## 4. Does the UI look nice?

Mostly yes, and it is the most confident-looking pane in the app: the chips are
well-proportioned, the overdue ring/badge treatment reads instantly, the
desktop three-column console is genuinely good.

Three things undercut it, all above: the dashed placement CTA out-weighing the
care chips (P2-2), the glyph soup (P3-2), and the avatar collision (P3-3). A
fourth, smaller: the status line reserves `minHeight: 18` and renders nothing
while `detail` loads, so the sheet visibly reflows on open.

---

## 5. Status

| | |
|---|---|
| P1-1 missing care types | **fixed** |
| P2-2 placement block | **fixed** — block only when spots exist, CTA into the ⋯ menu |
| P2-3 next-care line | **fixed** — also the route into care setup |
| P2-1 chip filter | **withdrawn**; the inactive-schedule leak underneath it is fixed |
| P3-1 label sources | **fixed** |
| P3-2 glyph soup | **fixed**, plus aria-labels |
| P3-3 launcher overlap | **fixed** for every modal in the app |

Still open: the status line reserves `minHeight: 18` and renders nothing while
`detail` loads, so the sheet reflows slightly on open. Cosmetic, and fixing it
properly means deciding what the sheet should show before it knows anything.
