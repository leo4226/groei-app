# Public gardens + biodiversity score

**Date:** 2026-05-27 (revised same day)
**Status:** Strategy note. Parent: `2026-05-27-product-direction.md`.
**Revision:** Two constraints from Leon: no manual data curation,
relaxed anonymity for public gardens.

Two ideas that reinforce each other:

1. **Biodiversity score:** per-plant and per-garden, used to surface
   recommendations like "this one's pretty but doesn't contribute
   much to pollinators" or "this plant fills your June pollinator gap".
2. **Public gardens:** other Floreren users can browse opt-in
   gardens. Not a social feature — a reference surface for
   "how are other Amsterdam gardens doing in May?"

These reinforce each other: an atlas filtered by biodiversity score
turns "look at someone else's garden" into "find ecologically
interesting gardens worth learning from". But each is valuable on
its own.

## Decision: start with biodiversity, not the atlas

Biodiversity scoring delivers value on day one for a single user
(Leon's own garden). The atlas needs network effects. Biodiversity
also makes the atlas worth filtering once it exists — without
ecological signal, "browse other gardens" is just visual
voyeurism.

So: **biodiversity first, atlas second.**

## Constraint 1: no manual data curation

Earlier draft proposed manual curation of ~50 species against
authoritative sources. Off the table. Replaced with **automated
multi-source enrichment**, layered by trustworthiness:

1. **GBIF** (Global Biodiversity Information Facility) — free API,
   already in use (`plant_species.gbif_taxon_key`,
   `scripts/import_gbif_species.py`). Provides distribution data
   and taxonomy. Native/non-native flag per country is derivable
   from `distributions` endpoint (`establishmentMeans = NATIVE |
   INTRODUCED`).
2. **iNaturalist** — observation data, `establishment_means` per
   place, validates GBIF.
3. **Wikidata SPARQL** — pollinator/host relationships (`pollinated
   by`, `host of`). Patchy coverage but free and high-signal where
   it exists.
4. **LLM fallback** (Claude Haiku / Deepseek — same plumbing as
   existing `_generate_species`). Only for fields no API provided.
   Tag with `data_source = 'llm'` so calls-to-action can mark them
   as unverified.

First-hit wins. Cache the result permanently with a `data_source`
field per attribute (or per row, simpler).

This is honest about a trade-off: GBIF/iNat give native-flags well;
they don't directly give pollinator-value. So pollinator-value will
end up partly LLM-guessed unless Wikidata covers it (sparse). That's
acceptable as long as the UI is honest about provenance.

## Constraint 2: less-strict anonymity

Leon's call: don't need the heavy-anonymity treatment (wijk-level
GPS jitter, layout-obfuscation). Still keep:

- **No PII shown.** No account name, no household name, no email.
  Map gets an anonymous handle.
- **EXIF stripped on photo upload.** This is privacy hygiene
  regardless of public-gardens — verify it's happening today; fix
  if not.
- **Opt-in per map, default off.** No surprise public visibility.

What *can* now be shown that earlier draft hid:

- Actual map layout, zones, plant positions, scientific names.
- Approximate GPS (e.g. neighbourhood centre) so users can see
  "this is an Amsterdam-West balcony" — useful context, doesn't
  expose street address.
- Real photos from the household (with EXIF stripped) if the user
  opts in to photo-sharing as a separate setting.

The earlier "anonymity-set" risk (5 public gardens in one
neighbourhood → identifiable by layout) is now moot — users opting
in have implicitly accepted that their garden is recognisable.

## Biodiversity scoring (unchanged in spirit)

### Per-plant attributes

Stored as columns on `plant_species` (no need for a separate table
yet — schema is already wide and these are 1:1):

| Field | Source | Notes |
|---|---|---|
| `is_native_nl` | GBIF distributions API | `establishmentMeans` per NL |
| `flowering_months` | LLM (Wikidata too sparse) | Array of months 1–12 |
| `pollinator_value` | LLM + Wikidata | 0–3 ordinal |
| `host_plant_for` | Wikidata | Array of species IDs |
| `invasive_nl` | GBIF (`establishmentMeans = INVASIVE`) | Negative weight |
| `ecology_data_source` | computed | `gbif`/`inat`/`wikidata`/`llm`/`mixed` |
| `ecology_enriched_at` | timestamp | For staleness checks later |

### Per-garden score

Not a simple average — that punishes ornamental additions. Instead:

- **Pollinator coverage:** for each month, is ≥1 plant with
  `pollinator_value ≥ 2` flowering? 12 × 5 = 60 points max.
- **Native ratio:** percent of plants with `is_native_nl`, scaled
  to 30 points.
- **Diversity bonus:** distinct species count, log-scaled, max 10
  points.

Total 0–100. Encourages coverage + variety, not species-arms-race.

### Where it surfaces

1. **Plant-detail page** — ecology card showing facts
   (no score). Validates data quality before scoring.
2. **`growHere` endpoint** — bias Claude suggestions toward
   biodiversity gains relative to current garden state. Reasoning
   becomes "fills your June pollinator gap", not just "looks nice".
3. **Post-identify, pre-add** — surface ecology context before the
   user commits the plant. "FYI great for butterflies" or "Pretty
   but pollinator-neutral, here's a similar alternative".
4. **Public garden atlas filter** (once that exists).

### Anti-purism (unchanged)

Native-only purism is wrong: lavender/salvia are non-native but
top-tier for bees. The score weights pollinator value independently
of native flag. Tips should celebrate that — "non-native, but great
for bees" is positive, not a hedge.

## Sequencing

1. **Spec + ship: ecology enrichment + plant-detail card.** GBIF/iNat/
   Wikidata/LLM chain, lazy backfill on species-load, fact display.
   *No score yet.* See companion spec
   `2026-05-27-species-ecology-enrichment-spec.md`.
2. **Watch the data.** Use Leon's own garden as the calibration set
   — when the ecology cards stop containing obvious errors for the
   plants he actually has, the data is trusted enough to score.
3. **Per-garden score** — compute from the ecology fields. Show on
   plant-list / map.
4. **`growHere` enriched** — bias toward biodiversity gains.
5. **Post-identify ecology nudge** — friction-free way to surface
   context at add time.
6. **EXIF audit** — verify photo uploads strip GPS. Fix if not.
   Independent of the atlas; just good hygiene. Can happen any time.
7. **Public-garden opt-in flag** — per-map setting, anonymise account
   data on the public read endpoint.
8. **Atlas UI** — browse, filter by city / biodiversity score / month.

Steps 1–5 are valuable for a solo user. Steps 6–8 unlock the
network-effect feature.

## Risks worth flagging

- **Automated data is noisy.** GBIF native-flags for NL are mostly
  reliable; pollinator-value from LLM is not. Surface
  `ecology_data_source` in the UI (small icon or tooltip) so users
  can mentally discount LLM-only facts. Track `enriched_at` for
  staleness.
- **Biodiversity score as authority claim.** Once shown, users
  trust it. Methodology must be visible (link to a `/about/
  biodiversity-score` page). Cite sources. Acknowledge limits.
- **Native-purism backlash.** Tips must be additive ("here's how to
  add wins") not subtractive ("you're doing it wrong"). Especially
  for plants already in the garden.
- **Bias loop in `growHere`.** If we always recommend high-score
  plants, gardens converge on the same 30 species. Add randomness
  / diversity-pressure to the suggestion mix.
- **GBIF distribution data lag.** GBIF aggregates from datasets that
  update at different cadences; a recently-naturalised species may
  still flag as INTRODUCED. Low impact for ornamentals; flag in
  methodology page.

## Open questions

- Score: one number or three (pollinator / native / diversity)?
  One is shareable; three is honest. Probably show all three, lead
  with the total.
- Indoor maps: biodiversity scoring almost certainly doesn't apply
  (tropical ornamentals, no ecological role in NL context). Public
  sharing of indoor maps is a separate privacy proposition. Most
  likely: both features are outdoor-only.
- Moderation: read-only atlas has very little to moderate, but
  inappropriate plant icons / zone names are still possible. Likely
  not worth building a flagging UI until something actually goes
  wrong.
- "Similar alternative" suggestions in post-identify nudge — needs
  a similarity metric (visual? taxonomic? size/colour?). Defer to
  the LLM with structured prompt for now.

## What this is still not

- A social network. No comments, no follows, no DMs.
- A photo feed. Atlas shows maps; photos remain private unless
  separately opted in.
- A monetisation hook. Not "premium tier for atlas access".
- A gamified scoring system. Biodiversity score is information,
  not points. No badges, no streaks.
