# Streek-aware biodiversity: localise the score & advice to the Dutch ecological region

**Date:** 2026-07-18
**Status:** Design / plan. Extension of issue #444 (biodiversity audit).
**Source that triggered this:** [streektuinen.nl](https://streektuinen.nl/) — a Dutch
initiative (Urgenda, De Vlinderstichting, Cruydt-Hoeck e.a.) that divides the
Netherlands into **25 ecological *streken*** and, per streek, curates the native
plants and animals that belong there.

> "Een streek wordt gevormd door de plek en de bodem. Op veen en klei groeien
> immers andere planten dan op zand." — streektuinen.nl

## Why this matters for Floreren

The current biodiversity model (`garden_biodiversity.py`) is **nationally flat**:
`native_to_nl` is one boolean for the whole country. But a plant that is native
and ecologically valuable in the Limburg chalk hills can be out of place in an
Amsterdam peat meadow. Streektuinen encodes exactly the *regional* nuance we're
missing: which natives are the right natives **here**.

Leon's garden (Amsterdam, 52.3715 N, 4.8499 E) falls under **Hollands en
Utrechts laagveengebied**. Today the app can't know that. This plan makes the
app map any Dutch garden's GPS to its streek, then use the streek's curated
species to (a) enrich recommendations with *streekeigen* advice and (b) add a
"belongs to your region" signal to the biodiversity picture.

This is Netherlands-only. That's acceptable — all current users are a Dutch
family — as long as the feature degrades gracefully for any garden that falls
outside the 25 streken (see "Out-of-NL & EN handling").

---

## Part 1 — Investigation of streektuinen.nl (findings)

The site is a WordPress install with a **fully open REST API**. No scraping of
rendered HTML is needed; the structured data is directly queryable.

### The 25 streken (region taxonomy)

`GET /wp-json/wp/v2/regions-categories?per_page=100` → 25 terms, each with a
clean slug and a species `count`. The slugs match the interactive-map polygon
ids exactly. Full list (slug → name, icon-species count):

| slug | Name | # species |
|---|---|---|
| achterhoek | Achterhoek | 112 |
| brabantse-maasstreek | Brabantse Maasstreek | 69 |
| brabantse-zand-en-leemstreek | Brabantse zand- en leemstreek | 184 |
| centrale-stuwwallen | Centrale stuwwallen | 183 |
| de-peel | De Peel | 52 |
| drents-plateau-en-friese-wouden | Drents Plateau en Friese Wouden | 222 |
| friese-en-groningse-zeeklei | Friese en Groningse zeeklei | 109 |
| friese-meren-tot-weerribben | Friese Meren tot Weerribben | 48 |
| gelderse-poort-en-pannerden | Gelderse Poort en Pannerden | 84 |
| hollands-en-utrechts-laagveengebied | Hollands en Utrechts laagveengebied | 251 |
| ijsseldal | IJsseldal | 135 |
| ijsselmeerpolders-en-zuiderzeedijken | IJsselmeerpolders en Zuiderzeedijken | 49 |
| kalkrijke-hollandse-duinstreek | Kalkrijke Hollandse duinstreek | 113 |
| laaglandrivieren | Laaglandrivieren | 178 |
| limburgs-heuvelland | Limburgs heuvelland | 73 |
| limburgse-maasstreek | Limburgse Maasstreek | 64 |
| reestdal | Reestdal | 50 |
| regge-en-sallandse-heuvelrug | Regge en Sallandse Heuvelrug | 51 |
| rijk-van-nijmegen | Rijk van Nijmegen | 68 |
| twente | Twente | 73 |
| vechtstreek | Vechtdal | 149 |
| wadden-en-noordelijke-duinstreek | Wadden en noordelijke duinstreek | 36 |
| west-friesland | West-Friesland | 90 |
| zeeuwse-zandgronden | Zeeuwse zandgronden | 41 |
| zuidwestelijke-zeekleipolders | Zuidwestelijke zeekleipolders | 97 |

> Note: two slugs differ between the taxonomy term and the public page URL
> (`vechtstreek` term = `/streken/vechtdal/` page; `zeeuwse-zandgronden` term =
> `/streken/zeeuwse-zandgronden/` labelled "Zuidwestelijke duingronden" in the
> map legend). The **map-polygon id** is the stable join key, not the URL.

### Icon species (icoonsoorten) per streek

`GET /wp-json/wp/v2/species?per_page=100&page={1..3}` → **215 icoonsoorten**
total (`X-WP-Total: 215`), split by `species-category` into **Flora (136)** and
**Fauna (79)**. Each species carries `regions-categories: [ids]` — i.e. every
species is tagged with the streken it belongs to. So the region→species mapping
is a simple many-to-many we can materialise with two API sweeps.

Filtering example — flora in Leon's streek:
`/wp-json/wp/v2/species?species-category=14&regions-categories=49` returns
Pinksterbloem, Grote kattenstaart, Zwanenbloem, Moerasspirea, Gelderse roos,
Heemst, Klokjesgentiaan, Spaanse ruiter, … — a curated, regionally-correct
planting list.

**Caveat:** species pages store the **Dutch common name only** — no Latin
binomial in the API payload or page body. We resolve Latin names on our side
(see Part 3, "Name resolution"). The counts above include fauna and are the
*full* icoonsoort set; the flora subset per streek is the plantable list.

### Geographic boundaries (the hard part)

There is **no GeoJSON** and no postcode/address lookup on streektuinen.nl — the
site tells users to eyeball the map and "pick the streek that fits you best".
The only machine-readable boundary is the **inline SVG map** on `/streken/`:

- `<svg id="map" viewBox="0 0 482.25 586.47">` with exactly **25**
  `<g id="{slug}" class="open-region-popup">` groups, each wrapping the
  `<path>`(s) for that streek. All 25 slugs present and clean.
- It's a stylised (smoothed) map of the Netherlands, not a survey-grade
  boundary — good enough to place a garden in the right streek, not good enough
  for cadastral precision. That's the right accuracy target for us.

The 25 streken are a **custom grouping derived from soil / physical-geographic
regions** (bodemkaart / fysisch-geografische regio's). There is no official
open dataset for *these exact 25* polygons, so the streektuinen SVG is the
authoritative definition and our boundary source.

---

## Part 2 — Geolocation → streek (the mapping engine)

**Approach: georeference the SVG once, offline, into WGS84 GeoJSON; commit it;
do point-in-polygon at runtime.** No runtime dependency on streektuinen.nl.

### Build step (one-off script, `backend/scripts/build_streken_geojson.py`)

1. Parse the 25 `<g id>`/`<path d>` polygons from the saved SVG.
2. Fit an **affine (or Helmert) transform** from SVG pixel space → WGS84 using
   ≥4 control points: recognisable coastline/border anchors whose real
   lat/lon we know (e.g. Vaalserberg SE corner, Den Helder tip, Rotterdam,
   Groningen, Maastricht, Zeeland SW). SVG north is up and unrotated, so a
   plain affine fit (least-squares over the control points) is sufficient;
   residuals give us an error estimate to record in the file.
3. Apply the transform to every path vertex → lon/lat rings.
4. Emit `backend/data/streken.geojson` (FeatureCollection; each feature =
   `{ slug, name, soil_types }` + polygon). Simplify with a small tolerance to
   keep the file lean.
5. **Validate**: assert known cities land in the expected streek (Amsterdam →
   `hollands-en-utrechts-laagveengebied`, Maastricht → `limburgs-heuvelland`,
   Groningen → `friese-en-groningse-zeeklei`, Enschede → `twente`, …). These
   assertions become a committed fixture test.

The georeferencing is manual-ish but done **once**; the output is static data
in the repo. Precision at streek borders is inherently soft (the source map is
stylised) — acceptable, and documented.

### Runtime lookup (`backend/services/streek.py`)

```python
def streek_for(lat: float, lon: float) -> Streek | None:
    # point-in-polygon over the 25 features (shapely, or a tiny ray-cast
    # so we avoid a heavy geo dependency). Returns None outside all polygons.
    # Fallback for near-border/offshore points: nearest polygon within ~2 km,
    # else None.
```

- Pure-Python ray casting over 25 simplified polygons is microseconds — no need
  for shapely/GEOS in the request path (keeps the 256 MB Fly image slim). We
  can use shapely in the *build* script only.
- Returns `None` for gardens outside NL → feature simply doesn't render.

### When we compute it

Streek is a function of the map's `lat`/`lon`, which are set at garden creation
and rarely change. So resolve **at write time**, not per request:

- `maps` gains `streek_slug TEXT NULL` (+ maybe `streek_resolved_at`).
- On garden create / lat-lon update (`routers/maps.py`), call `streek_for()` and
  persist the slug. One-line, synchronous, no external call.
- Backfill existing gardens in the migration / a small script.

---

## Part 3 — Data model

Three new tables (bilingual-ready per the CLAUDE.md language rules), plus one
column on `maps`.

```
streken
  slug            TEXT PRIMARY KEY      -- map-polygon id, e.g. 'hollands-en-utrechts-laagveengebied'
  name_nl         TEXT NOT NULL
  name_en         TEXT NULL             -- endonym; EN often == NL (proper noun)
  soil_types      JSONB                 -- ['veengrond', ...] from soil-types taxonomy
  description_nl  TEXT
  description_en  TEXT NULL

streek_species                          -- streektuinen icoonsoorten, as sourced
  id              SERIAL PK
  streek_slug     TEXT REFS streken(slug)
  name_nl         TEXT NOT NULL         -- Dutch common name from streektuinen
  category        TEXT                  -- 'flora' | 'fauna'
  source          TEXT DEFAULT 'streektuinen'
  species_id      INTEGER NULL REFS plant_species(id)   -- resolved link, nullable
  UNIQUE(streek_slug, name_nl, category)

maps.streek_slug  TEXT NULL REFS streken(slug)
```

### Name resolution (streektuinen Dutch name → our `plant_species`)

streektuinen gives Dutch names only. To connect a streek's flora to our scored
catalog we resolve `name_nl → plant_species.id`:

1. **Exact/fuzzy match** on `plant_species.common_name_nl` (normalise case,
   strip diacritics, singular/plural). Cheap, covers most.
2. **Latin lookup for the rest** via our existing GBIF plumbing
   (`scripts/import_gbif_species.py` / `ecology_enrichment`): Dutch name →
   GBIF → `latin_name` → match or seed a new `plant_species` row.
3. Leave `species_id NULL` when unresolved — the streek list still displays
   the Dutch name as advice text; it just isn't wired into scoring until a
   species row exists. Honest and incremental.

This runs in an **ingest script** (`backend/scripts/import_streken.py`) that
sweeps the two API endpoints, upserts `streken` + `streek_species`, and attempts
resolution. Re-runnable; idempotent. Data is small and near-static, so a manual
re-run when streektuinen updates is fine (see "Keeping data current").

---

## Part 4 — How streek feeds the biodiversity model

Guided by issue #444's principles: **additive, anti-purist, not gamified,
honest about uncertainty.** Streek should *inform and recommend*, not punish.

### 4a. Recommendations (highest value, do first)

`plant_suggestions.py` already ranks enriched candidates by ecology + light fit.
Add a **streek boost** and a **streek surface**:

- When a map has a `streek_slug`, tag candidates whose `species_id` is in that
  streek's `streek_species` as **streekeigen**, and add a modest score term
  (in the spirit of the existing `is_native` +3, e.g. `+4` for streek match).
  It nudges ordering; it never removes non-streek picks.
- Add a dedicated **"Planten uit jouw streek" / "Plants from your region"**
  recommendation mode: `recommend_for_streek(map_id)` returns the streek's flora
  not yet in the garden, ranked by pollinator/gap value — a regionally-correct
  planting list, which is exactly streektuinen's own value proposition.
- Reason strings gain a streekeigen clause: *"hoort thuis in het Hollands en
  Utrechts laagveengebied"* / *"belongs in your region"* (bilingual via the
  template reasons already in `plant_suggestions.py`).

### 4b. Score — additive streek bonus (decided)

**Decision (Leon, 2026-07-18): streek plants score extra.** Add a new,
**purely additive** component to the model — streekeigen plants earn bonus
points, non-streek plants are never penalised. This keeps the anti-purism
principle (a great non-native pollinator plant still scores on pollinator
coverage) while rewarding gardens that plant what belongs in their region.

**Streek bonus (0–15)** — count-based, capped, mirrors the existing
`native_count` shape so *adding* a streek plant can only ever raise the score:

```
streek_native_count = # distinct species in the garden that are tagged
                       to the garden's streek (via streek_species.species_id)
streek_score        = min(15, streek_native_count * 3)   # 5 streek species = max
```

Folded into the additive total (which stays capped at 100, consistent with the
existing over-100 pre-cap headroom of 60+30+10+10). Because it's additive-only,
low name-resolution coverage just means fewer bonus points available — never a
penalty — so it doesn't need to be gated behind a coverage threshold the way a
subtractive signal would.

Always surface `streek_score` / `streek_native_count` as **its own visible line**
in the card (not just absorbed into the headline number), so it stays legible
even when a strong garden saturates at 100. Cite streektuinen as the
regional-provenance source in the methodology text.

> Note: the *exact* weight (3 pts/species, 15 cap) is a starting proposal. Final
> calibration ties into the #444 weight audit — treat these as tunable, and
> document them on the methodology page alongside the other components.

`GardenBiodiversity` gains `streek_slug`, `streek_native_count`, and a
`components["streek"]` subscore for transparency.

---

## Part 5 — UI (frontend)

- **MapPage / `GardenBiodiversityCard`**: show the streek name as a line of
  context ("Streek: Hollands en Utrechts laagveengebied") and, in the modal, a
  streekeigen count. All strings through the typed i18n catalog
  (`useT()` + `i18n/{translations,en,nl}.ts`) — no hardcoded JSX text
  (`lint:i18n` guard).
- **Recommendations sheet**: a "Uit jouw streek" section listing streek flora to
  add, reusing the existing suggestion card. Each item links to the plant if we
  have a `species_id`.
- **New-garden onboarding**: once lat/lon is entered we already know the streek —
  echo it back ("Je tuin ligt in …") as a small confirmation and teaser.
- Verify in **both NL and EN** (flip account language) per the language-audit
  rule — English mode shows endonym streek names + translated chrome.

### Out-of-NL & EN handling

- Garden outside all 25 polygons → `streek_slug` NULL → streek UI hidden, core
  score unchanged. No errors, no empty sections.
- streektuinen content is Dutch. Streek **names are endonyms** (proper nouns) —
  render as-is in EN, consistent with the existing `place_name` endonym rule.
  Advice/description strings we author get NL+EN; sourced Dutch species names
  display as-is with an English gloss where our catalog has `common_name_en`.

---

## Part 6 — Attribution, licensing, data ethics

streektuinen.nl is a non-commercial biodiversity initiative. Before shipping:

- **Credit the source** visibly wherever streek data appears ("Streekindeling &
  soorten: streektuinen.nl — Urgenda, De Vlinderstichting, Cruydt-Hoeck").
- We **derive** boundaries (georeferenced from their public map) and **reference**
  their curated species lists for private use by a family app — we do not
  republish their content wholesale or commercially. Keep it that way.
- Note the SVG map is © the site's designers (Change the Story); we use it as a
  georeferencing input to produce our own coordinate data, not as a redistributed
  asset. **Open question for Leon:** do we want to reach out to streektuinen for
  explicit blessing / a data feed? Low urgency for a private app, worth doing if
  this ever goes public.

---

## Part 7 — Implementation roadmap

Ordered; each phase is independently shippable.

1. **Data ingest (offline).**
   `import_streken.py` sweeps `regions-categories` + `species` (3 pages),
   upserts `streken` + `streek_species`. Commit a snapshot JSON under
   `backend/data/` so we're not live-dependent on the site.
2. **Boundaries.** `build_streken_geojson.py` (georeference SVG → GeoJSON) +
   committed `streken.geojson` + city-assertion fixture test.
3. **Migration + resolver.** Alembic: `streken`, `streek_species`,
   `maps.streek_slug`. `services/streek.py` point-in-polygon. Wire
   `streek_for()` into garden create / lat-lon update; backfill existing maps.
4. **Name resolution.** Resolve `streek_species.name_nl → plant_species.id`
   (fuzzy NL + GBIF Latin fallback). Report coverage %.
5. **Recommendations.** `recommend_for_streek()` + streekeigen boost/tag/reason
   in `plant_suggestions.py`; new API field.
6. **Score bonus.** Add additive `streek_score` (0–15) + `streek_native_count`
   to `GardenBiodiversity`; expose via the maps biodiversity endpoint.
7. **Frontend.** Streek line + streek bonus/count in `GardenBiodiversityCard`;
   "Uit jouw streek" recommendation section; onboarding echo; NL+EN i18n; verify
   `npm run build`.

---

## Keeping data current

streektuinen's streken/species set is near-static (25 regions; species lists
grow slowly). No live dependency in the request path. Strategy:

- The ingest script is **re-runnable**; schedule a **manual quarterly re-run**
  (or a low-frequency cron) that diffs against the committed snapshot and opens a
  PR when counts change. Cheap, auditable, no runtime coupling.
- Boundaries change only if streektuinen redraws the map — rare; re-run the
  georeference build if the SVG's polygon set changes.

---

## Decisions & open questions

**Decided (Leon, 2026-07-18):**
1. ✅ **Score treatment** — an additive **streek bonus** (0–15), plants that
   belong to your streek score extra; non-streek plants are never penalised.
   See Part 4b.
2. ✅ **Fauna** — **plants-only for v1.** streektuinen tags 79 fauna icoonsoorten
   per streek (bees, butterflies), but fauna are *attracted by* the flora (host
   plants, nectar), so planting the streek flora already delivers them. Fauna
   can later be a "who you'll attract here" teaser — not a scored input.

3. ✅ **Reach out to streektuinen** — Leon will contact them to ask if they're OK
   with us using the streek indeling + species lists. Gate the public/shipping
   step on their answer; internal design work continues meanwhile.
4. ✅ **Precision bar** — "right streek, soft borders" is acceptable, **with a
   visual-verification checkpoint**: after the georeference build (Phase 2),
   render the georeferenced polygons + known-city markers as an overlay so Leon
   can eyeball it against streektuinen's own map before anything is built on top.
   See "Visual verification" below.

### Visual verification (Phase 2 gate)

Because the boundary source is a stylised SVG, the georeference is fit-by-eye and
must be sanity-checked visually, not just by assertions. Deliverable of Phase 2:

- A self-contained overlay that plots the 25 georeferenced streek polygons in
  lat/lon space alongside markers for known cities (Amsterdam, Maastricht,
  Groningen, Enschede, Rotterdam, Zwolle, …), each marker coloured by the streek
  the point-in-polygon test places it in. Mismatches are then obvious to the eye.
- Leon signs off that the shapes and city placements track streektuinen's own
  map before Phases 3+ build on the coordinates. An early proof-of-concept of
  this overlay is produced now (2026-07-18) to de-risk the transform up front.

## References

- streektuinen.nl — [/streken/](https://streektuinen.nl/streken/),
  REST API `/wp-json/wp/v2/{regions-categories,species,species-category}`
- `backend/services/garden_biodiversity.py` — current score
- `backend/services/plant_suggestions.py` — recommender to extend
- `backend/services/ecology_enrichment.py` — GBIF plumbing for name resolution
- `backend/routers/maps.py` — where `lat`/`lon`/`streek_slug` live
- `frontend/src/components/GardenBiodiversityCard.tsx` — score UI
- `docs/plans/2026-05-27-public-gardens-and-biodiversity.md` — original strategy
- Issue #444 — biodiversity audit (this is its regional extension)
