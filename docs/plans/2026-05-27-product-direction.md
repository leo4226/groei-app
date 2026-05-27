# Floreren — product direction

**Date:** 2026-05-27
**Status:** Strategy note. Not a plan. To revisit and turn into concrete
work when we have bandwidth.

## The framing

PictureThis, Planta, PlantIn and the rest are *plant-list apps with a
camera*. Floreren has, almost by accident, started building something
different: a 2D representation of a real garden, with sun position,
shadow geometry, plant placement, weed sightings, and care state all
attached to *places* on a map.

The strategic question is whether to keep racing on the same axes as
those apps (identification accuracy, plant database breadth, care
notifications) or commit to the axis nobody else is competing on
(the garden as a place).

This document argues for the second.

## What Floreren already has that nobody else does

1. **The map as the home screen.** `MapView.tsx`, `useSunVisualization`,
   `useSunAt`, `lightEngine.ts`, `heatmapCalc.ts` — Floreren can compute
   sun-hours per square metre per month for any outdoor map, using
   real shadow casters derived from the user's drawn zones. PictureThis
   can't tell you "this corner gets 4 hours of sun in May". Floreren
   can.
2. **Self-hosted BioCLIP** (`backend/bioclip_worker.py` + Cloudflare
   tunnel). No per-day quota, no subscription pressure, no
   "you've used your 20 IDs today" frustration. The PlantNet fallback
   exists for completeness.
3. **Household model.** Accounts belong to a household; one shared
   garden. Couples and families don't have to fight over whose phone
   "owns" the tomato plant.
4. **Weed-sightings on the map** (`WeedSightingSheet`, weed-catalog +
   sighting tables). Pinned spatially, not just listed. Nobody else
   does this.

These are not features. They are the product. Every other point of
parity with PictureThis is incidental.

## The bet

Make the map the workhorse, not a side feature. Every other surface
(dashboard, plant list, calendar, identify flow) is in service of
*the garden as a place*.

## Concrete shifts that follow from the bet

### 1. Care state visualised on the map, not next to it

Today, the dashboard is a list of overdue/due-today/upcoming tasks
(`useFloreren.dashboardV2`). Plant warnings live in
`useFloreren.warningSummary`. The map shows plant positions but not
their care state.

Shift: a thirsty zone glows orange *on the map*. A plant overdue for
fertilising has a halo. The dashboard shrinks to a day-summary; the
map becomes how you see "what's going on in my garden right now".

Why this matters: every list-based plant app loses users who forget
to open it. A map view that visibly changes ("look, the back-left
corner needs water") creates a different kind of glance-able
attachment to the garden.

### 2. Sun + care, explicitly coupled

`growHere` (the AISuggestion endpoint) already takes `sun_hours` and
returns Claude-generated planting suggestions. Care thresholds come
from a separate LLM call. These should be one system.

Shift: "water tonight because tomorrow is 28°C *in this zone* and
this plant is in the high-sun corner". Touch sun-hours, care
thresholds, weather forecast, and zone position in a single
recommendation. Nobody else has the inputs to do this.

Risk: the care-threshold values today are LLM-generated and
unvalidated. This shift depends on threshold quality. See
"calibration debt" below.

### 3. Weed sightings as a time-layer

Today, a sighting is a single pin on a map. The information dies
after the user logs it.

Shift: a 12-month heatmap of weed sightings is a *story* — "here
comes the dandelion patch every spring". Useful for the user (plan
ahead), and a hook for re-engagement that doesn't depend on
notifications.

### 4. Care-outcome data over more features

`care_log` / `care/done` already records what got watered, fertilised,
when. Plant deaths and successes are not currently recorded in a
structured way.

Shift: capture outcome ("this plant died", "this plant flowered")
and tie it back to the care log + sun-hours + zone. Over a year of
Leon's garden, that is real calibration data for the care thresholds
— which today are pure LLM guesses. Without it, "AI care" stays as
generic as everyone else's.

This is the hardest of the four shifts and has the lowest
short-term visible payoff, which is exactly why it tends not to get
done. It is also the only one that compounds.

## What to deprioritise

- **ID accuracy as a headline feature.** BioCLIP is good enough as
  *input to map-based reasoning*. Don't chase PictureThis on
  identification benchmarks; that race is lost on data scale alone.
- **Social/community features.** Sharing plants with strangers,
  community feeds, friend-of-friend tips. Different product, different
  audience, different team. Will dilute focus.
- **Generalising prematurely away from the Amsterdam garden.** The
  scale constant `PX_PER_M = 46` is still hardcoded. That is fine
  *today* because there is one garden in the system. The next user's
  garden — friends, family — should drive when this becomes per-map,
  not abstract "future-proofing".

## What to keep doing

- **One PWA, mobile-first.** Browser-installable, no app-store gate.
  Already removes the install-friction PictureThis has.
- **Household auth.** Sticky once both partners are on it.
- **Boring infrastructure for the inference path.** Cloudflare tunnel
  → home GPU is unusual but cheap and works.

## Calibration debt — the unglamorous critical path

This deserves its own callout. Three subsystems currently rest on
LLM-generated values:

1. **BioCLIP confidence thresholds** (`_HIGH_TOP1`, `_HIGH_MARGIN`,
   `_MEDIUM_TOP1`, `_CONFIDENCE_FLOOR` in `routers/plant_id.py`).
   Calibrated once on 126 iNat photos.
2. **Care thresholds per species** (Claude Haiku-generated, stored
   in `plant_species.care_thresholds`). Never validated against actual
   outcomes.
3. **BioCLIP inference path itself** (memory note: current code in
   `backend/services/bioclip_id.py` and `backend/bioclip_worker.py`
   was Deepseek-written and is flagged as unreviewed).

Each is individually a "we'll get to it" item. Together they are the
foundation everything else stands on. Recommend: a separate review
session per item, before doubling down on map-driven care reasoning
which depends on them.

## What this is not

This is not a roadmap. It is not a quarter-plan. There are no dates,
no priorities ranked against each other, no resourcing. It is a
direction note: "if Floreren is going to be the best plant app, it
will be because the map and care reasoning are one system, not
because the identification accuracy is 2% higher than PictureThis".

When we want to act on this, the next step is picking *one* of the
four shifts above and writing a real spec for it — most likely
shift #1 (care visualised on the map), because it requires the least
calibration work and has the most visible payoff. Shift #4 (outcome
data) is the slow-compound one to start *quietly* in parallel.

## Open questions to revisit

- Is there room for a "garden profile" page that's not the map but
  also not a list — something like "this garden's character"? Sun
  exposure summary, soil notes, dominant species, recurring weeds.
  Could be the public-facing shareable surface.
- Indoor maps: how does this strategy apply? Today indoor maps have
  no sun, no weeds, no real "place character". They get the care-state
  visualisation (shift #1) but not the rest. Is that fine?
- At what point does it make sense to let users browse *other*
  households' map views (read-only)? Not as a social feature — as a
  "look at how other Amsterdam balcony gardens are doing in May"
  reference. Probably never, but worth deciding rather than drifting
  into it.
