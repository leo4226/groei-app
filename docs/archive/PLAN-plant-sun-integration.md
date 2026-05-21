# PLAN: Plant–Sun Integration & "What Could Grow Here?"

## Overview

This plan adds two interconnected features to Groei:

1. **Sun-fit indicator** — each placed plant shows whether its current spot matches its sun requirements, based on live heatmap data
2. **"What could grow here?"** — tap any spot on the map to get AI-powered plant suggestions tailored to that location's actual sun hours, with a local pre-filter for hard constraints

The tap-to-inspect mechanic already exists and returns sun hours per month (e.g. "Dit punt krijgt ~5.2u directe zon in Mei"). Both features hook into this same data.

---

## Before Starting This Session

Ask Claude Code to inspect:
- Where plant sun requirements are stored (DB schema + model) — specifically whether there's a numeric value (1–10 scale visible in UI) or only a categorical field (volle zon / halfschaduw / schaduw)
- How the heatmap data is structured in-memory and whether sun hours per coordinate are accessible outside the heatmap rendering component
- Where the tap-to-inspect handler lives (the one that shows "Dit punt krijgt X.Xu directe zon in Mei") — this is the hook for "what could grow here"
- Whether there's a `plant_requirements` or `care_info` table/model that holds the sun bar value

---

## Sun Requirement Mapping

Once Claude Code confirms the data shape, use this mapping (adjust if a numeric field already exists):

| Category | Hours threshold | Meaning |
|---|---|---|
| Volle zon | ≥ 6 hrs | Needs direct sun most of the day |
| Halfschaduw / Half zon | 3–6 hrs | Tolerates partial shade |
| Schaduw | < 3 hrs | Prefers shade, struggles in full sun |

If a 1–10 numeric scale exists in the DB, map it as:
- 7–10 → volle zon (≥ 6 hrs)
- 4–6 → halfschaduw (3–6 hrs)  
- 1–3 → schaduw (< 3 hrs)

---

## Feature 1: Sun-Fit Indicator on Plant Markers

### What it does
Each plant marker gets a small sun-fit badge/ring that shows whether the plant's sun requirement matches the actual heatmap hours at its coordinates. Uses the **currently selected month** from the heatmap controls.

### Fit logic
```
actualHours = heatmapData[plant.x][plant.y][selectedMonth]
requiredCategory = plant.sunRequirement  // volle/half/schaduw

fit = match(actualHours, requiredCategory):
  - "good"    → within range
  - "partial" → borderline (±1 hr from threshold)  
  - "poor"    → clearly outside range
```

### Visual design
- **Good fit**: existing green status ring, no change needed
- **Partial fit**: amber/orange ring pulse (same ring, different color)
- **Poor fit**: red ring + small ☀️ warning icon on the marker

Keep it subtle — the existing marker design shouldn't be disrupted. This is a secondary indicator, not the primary status.

### Sidebar plant list
Add a small sun icon next to each plant's "Good" status label that reflects fit:
- ☀️ green = good
- ☀️ amber = partial  
- ☀️ red = poor

Tapping the indicator in the plant detail sheet should explain: "This plant needs volle zon (6+ hrs) but gets ~3.2u here in April."

### Implementation notes
- Only show fit indicator when the **Zonkaart is active** (not in live mode) — otherwise there's no heatmap data to compare against
- Use the same month the user has selected in the heatmap time controls
- Compute fit client-side, no API call needed
- Cache fit results per plant per month (recompute on month change or plant move)

---

## Feature 2: "What Could Grow Here?"

### Entry point
Extend the existing tap-to-inspect handler. After showing "Dit punt krijgt ~5.2u directe zon in Mei", add a **"Wat kan hier groeien? →"** button below the sun hours display.

### Flow

```
User taps spot
  → existing: show sun hours for selected month
  → new: show "Wat kan hier groeien?" button

User taps button
  → open suggestion sheet (bottom drawer, same pattern as plant detail)
  → Phase A: instant local filter results (no loading)
  → Phase B: Claude AI suggestions load in (streaming if possible)
```

### Phase A — Local pre-filter

Compute immediately from existing plant database + a bundled plant list:

**Input:**
- `sunHoursByMonth`: array of 12 values for this coordinate from heatmap cache
- `existingPlantDB`: all plants already in the user's system

**Logic:**
```typescript
interface SpotProfile {
  sunHoursByMonth: number[]  // [jan, feb, ..., dec]
  avgSunHours: number        // mean across growing season (apr-sep)
  peakSunMonth: string
  sunCategory: 'schaduw' | 'halfschaduw' | 'volle_zon'
}

function preFilter(spot: SpotProfile, allPlants: Plant[]): Plant[] {
  return allPlants.filter(p => {
    const req = p.sunRequirement
    if (req === 'volle_zon' && spot.avgSunHours < 4) return false
    if (req === 'schaduw' && spot.avgSunHours > 5) return false
    return true
  })
}
```

Show the pre-filtered plants from the user's own DB first: "Plants you already have that would fit here: [list]"

### Phase B — Claude AI suggestions

Call the Anthropic API with a rich context prompt. This is the main value: nuanced, Amsterdam-climate-aware suggestions the local filter can't provide.

**Prompt structure:**
```
You are a garden planning assistant for a garden in Amsterdam, Netherlands (52.37°N).
The garden faces east, with the house wall to the west.

This spot gets the following direct sun hours per month:
Jan: Xu, Feb: Xu, Mar: Xu, Apr: Xu, May: Xu, Jun: Xu,
Jul: Xu, Aug: Xu, Sep: Xu, Oct: Xu, Nov: Xu, Dec: Xu

Average growing season (Apr-Sep): X.Xh/day
Sun category: [volle zon / halfschaduw / schaduw]

The user already has these plants in their garden: [comma-separated list]

Suggest 5-8 plants that would thrive in this exact spot. For each plant provide:
- Common name (Dutch if possible) + Latin name
- Why it suits this specific sun profile (mention seasonal patterns if relevant)
- Any caveats for Amsterdam climate (cold winters, wet springs)
- Companion planting notes if relevant to existing plants

Be specific and practical. Prefer plants that are available in Dutch garden centers.
Do not suggest plants already in their garden unless as companions.

Respond in JSON:
{
  "suggestions": [
    {
      "commonName": "string",
      "latinName": "string", 
      "dutchName": "string",
      "sunFit": "perfect | good | acceptable",
      "reasoning": "string (2-3 sentences)",
      "caveat": "string | null",
      "companionNote": "string | null"
    }
  ],
  "spotSummary": "string (1 sentence characterizing this spot)"
}
```

**API call details:**
- Model: `claude-sonnet-4-20250514`
- Max tokens: 1500
- Parse JSON response, render cards
- Error state: show only Phase A results if API fails

### UI — Suggestion Sheet

```
┌─────────────────────────────────────┐
│ ☀️ Dit punt: ~5.2u · Half zon       │
│ Goed voor planten die gedeeltelijke  │
│ schaduw tolereren                    │
├─────────────────────────────────────┤
│ UW TUIN                              │
│ [Camellia chip] [Fargesia chip]      │  ← plants from their DB that fit
├─────────────────────────────────────┤
│ SUGGESTIES                           │
│ [loading spinner → then cards]       │
│                                      │
│ 🌿 Astilbe                           │
│ Astilbe × arendsii                   │
│ "Perfect voor 3–6u zon. Bloeit..."   │
│                                      │
│ 🌿 Digitalis purpurea                │
│ Vingerhoedskruid                     │
│ "Gedijt goed in wisselende zon..."   │
│                                      │
│ [+ Voeg toe aan tuin]  [Meer info]  │
└─────────────────────────────────────┘
```

The "+ Voeg toe aan tuin" button should pre-populate the add-plant flow with the suggested plant's name/latin name and the tapped coordinates.

---

## Implementation Sessions

### Session 1 — Data plumbing + sun-fit indicator

**Goal:** Get fit data flowing, show indicator on markers.

Starter prompt for Claude Code:
```
I'm adding a sun-fit indicator to plant markers in the Groei garden app.

First, please inspect:
1. The plant model/schema — specifically how sun requirements are stored 
   (numeric 1-10? categorical volle_zon/halfschaduw/schaduw? both?)
2. The heatmap data structure — how are sun hours per grid cell stored 
   and can I access them by meter coordinates outside the heatmap component?
3. The tap-to-inspect handler that shows "Dit punt krijgt X.Xu directe zon in Mei"

Then implement:
- A `getSunFit(plant, heatmapData, month)` utility function that returns 
  'good' | 'partial' | 'poor' based on the plant's sun requirement vs 
  actual hours at its coordinates
- Sun requirement thresholds: volle_zon ≥ 6hrs, halfschaduw 3-6hrs, schaduw < 3hrs
  (adjust if a numeric scale already exists in the DB)
- Update plant markers to show fit: green ring = good, amber = partial, red = poor
- Only show fit indicator when Zonkaart mode is active
- Add sun-fit icon to the sidebar plant list

Keep it subtle — secondary indicator only, don't disrupt existing marker design.
Reference: PLAN-plant-sun-integration.md
```

### Session 2 — "Wat kan hier groeien?" — local filter

**Goal:** Tap spot → sheet appears → user's own compatible plants shown instantly.

Starter prompt for Claude Code:
```
I'm adding "Wat kan hier groeien?" to the Groei app.

Extend the tap-to-inspect handler (currently shows "Dit punt krijgt X.Xu directe zon in Mei") 
to add a "Wat kan hier groeien? →" button.

When tapped, open a bottom drawer sheet that:
1. Shows the spot's sun profile (hours by month, category label)
2. Immediately shows which plants from the user's own plant database 
   would be compatible with this spot (using the getSunFit logic from Session 1)
3. Has a placeholder/skeleton for AI suggestions (loading state)

The spot profile should include all 12 months of sun hours from the heatmap 
cache for that coordinate — we'll need this for the AI call in Session 3.

Use the same bottom drawer pattern as the plant detail sheet.
Reference: PLAN-plant-sun-integration.md
```

### Session 3 — Claude AI suggestions

**Goal:** API call, streaming response, suggestion cards with "add to garden" CTA.

Starter prompt for Claude Code:
```
I'm adding AI-powered plant suggestions to the "Wat kan hier groeien?" sheet in Groei.

The sheet already shows local plant matches. Now add Claude API integration:

1. On sheet open, call the Anthropic API (api.anthropic.com/v1/messages) with:
   - The spot's sun hours for all 12 months (from heatmap data)
   - The user's existing plants (names) for context
   - Garden context: Amsterdam, east-facing, 52.37°N
   - Request JSON response with plant suggestions (see PLAN for exact prompt)

2. Parse the JSON response and render suggestion cards showing:
   - Plant name (Dutch + Latin)
   - sunFit badge (perfect/good/acceptable)  
   - reasoning text
   - caveat if present
   - "Voeg toe aan tuin" button that pre-fills the add-plant flow

3. Show spotSummary from the API response as a subtitle in the sheet header

4. Handle errors gracefully — if API fails, show only local results with 
   a subtle "suggestions unavailable" note

Model: claude-sonnet-4-20250514, max_tokens: 1500
Expect JSON — strip any markdown fences before parsing.
Reference: PLAN-plant-sun-integration.md
```

---

## Decisions (resolved)

- **Language:** AI suggestions respond in Dutch. Add `"Reageer volledig in het Nederlands."` to the system prompt.
- **Caching:** AI suggestions cached per grid cell + month. Re-tapping the same spot never re-calls the API. Cache key: `suggestions:${gridX}:${gridY}:${month}`. Store in a `Map` in React state or a module-level singleton — survives navigation within the session.
- **"Add to garden":** "Voeg toe aan tuin" pre-fills the existing add-plant flow with `commonName`, `latinName`, and the tapped `{x, y}` coordinates. Claude Code should confirm how the add flow accepts pre-fill params (URL params? passed state? context?).
- **12-month caching:** Always compute and cache all 12 months for a coordinate when the heatmap is first requested for that spot, so the AI prompt always has the full picture. Don't lazy-load by month.

---

## Local Plant Dataset

### Check first

**Before creating anything,** Claude Code should check whether a local plant dataset already exists:

```
Search the codebase for any of these:
- A file named plants-data.ts / plantsData.ts / plant-database.ts or similar
- A const array typed as Plant[] or LocalPlant[] with 10+ entries
- Any hardcoded list of plants with latinName / sunRequirement fields
- A seeds/ or fixtures/ directory in the backend with plant data

If a dataset already exists, use it as-is and note its location.
If it doesn't exist, create it at src/data/plants-dataset.ts using the 
structure defined in PLAN-plant-sun-integration.md.
```

### Data structure

```typescript
export interface LocalPlant {
  id: string                          // slug, e.g. "astilbe-arendsii"
  dutchName: string                   // "Pluimspirea"
  latinName: string                   // "Astilbe × arendsii"
  commonName: string                  // "Astilbe" (used in UI)
  sunRequirement: 'schaduw' | 'halfschaduw' | 'volle_zon'
  minSunHours: number                 // hard minimum — below this it won't survive
  maxSunHours: number                 // above this it struggles
  waterNeeds: 'laag' | 'gemiddeld' | 'hoog'
  type: 'vaste_plant' | 'heester' | 'klimmer' | 'gras' | 'bol' | 'eenjarig' | 'boom'
  bloomMonths: number[]               // [6, 7, 8] = jun/jul/aug
  maxHeightCm: number
  amsterdamNotes: string | null       // climate caveats specific to NL/Amsterdam
  companionTags: string[]             // e.g. ["schaduw-bodembedekker", "vlindertuin"]
  availableInNL: boolean              // false = rare/hard to find
}
```

### Dataset — ~70 plants for Amsterdam gardens

Organized by sun category. Claude Code should use this as the seed list and fill in any missing field values based on horticultural knowledge.

```typescript
export const LOCAL_PLANTS: LocalPlant[] = [

  // ── SCHADUW (< 3u directe zon) ──────────────────────────────────────────

  {
    id: "epimedium-perralchicum",
    dutchName: "Elfenbloem",
    latinName: "Epimedium × perralchicum",
    commonName: "Epimedium",
    sunRequirement: "schaduw",
    minSunHours: 0, maxSunHours: 3,
    waterNeeds: "laag",
    type: "vaste_plant",
    bloomMonths: [4, 5],
    maxHeightCm: 30,
    amsterdamNotes: "Zeer winterhard, uitstekende bodembedekker onder bomen",
    companionTags: ["bodembedekker", "droogtetolerant"],
    availableInNL: true
  },
  {
    id: "pachysandra-terminalis",
    dutchName: "Schaduwgroen",
    latinName: "Pachysandra terminalis",
    commonName: "Pachysandra",
    sunRequirement: "schaduw",
    minSunHours: 0, maxSunHours: 3,
    waterNeeds: "gemiddeld",
    type: "vaste_plant",
    bloomMonths: [4],
    maxHeightCm: 25,
    amsterdamNotes: "Groenblijvend, ideaal onder bomen met diepe schaduw",
    companionTags: ["bodembedekker", "groenblijvend"],
    availableInNL: true
  },
  {
    id: "hosta-sieboldiana",
    dutchName: "Hartlelie",
    latinName: "Hosta sieboldiana",
    commonName: "Hosta",
    sunRequirement: "schaduw",
    minSunHours: 0, maxSunHours: 4,
    waterNeeds: "hoog",
    type: "vaste_plant",
    bloomMonths: [7, 8],
    maxHeightCm: 80,
    amsterdamNotes: "Let op slakken in natte Amsterdamse zomers",
    companionTags: ["grote-bladeren", "schaduw-accent"],
    availableInNL: true
  },
  {
    id: "astilbe-arendsii",
    dutchName: "Pluimspirea",
    latinName: "Astilbe × arendsii",
    commonName: "Astilbe",
    sunRequirement: "halfschaduw",
    minSunHours: 2, maxSunHours: 5,
    waterNeeds: "hoog",
    type: "vaste_plant",
    bloomMonths: [6, 7, 8],
    maxHeightCm: 90,
    amsterdamNotes: "Houdt van vochtige grond — past goed bij Amsterdam regenval",
    companionTags: ["vochtige-grond", "zomerbloei"],
    availableInNL: true
  },
  {
    id: "hakonechloa-macra",
    dutchName: "Japans wuivend gras",
    latinName: "Hakonechloa macra",
    commonName: "Hakonechloa",
    sunRequirement: "halfschaduw",
    minSunHours: 2, maxSunHours: 5,
    waterNeeds: "gemiddeld",
    type: "gras",
    bloomMonths: [8, 9],
    maxHeightCm: 60,
    amsterdamNotes: "Prachtige herfstkleur, verdraagt stedelijk microklimaat goed",
    companionTags: ["siergrassen", "herfstkleur"],
    availableInNL: true
  },
  {
    id: "hydrangea-anomala-petiolaris",
    dutchName: "Klimhortensia",
    latinName: "Hydrangea anomala subsp. petiolaris",
    commonName: "Klimhortensia",
    sunRequirement: "halfschaduw",
    minSunHours: 2, maxSunHours: 5,
    waterNeeds: "gemiddeld",
    type: "klimmer",
    bloomMonths: [6, 7],
    maxHeightCm: 500,
    amsterdamNotes: "Langzame starter maar zeer robuust; ideaal voor noord- of oostmuur",
    companionTags: ["muurplant", "zelfhechtend"],
    availableInNL: true
  },
  {
    id: "helleborus-orientalis",
    dutchName: "Kerstroos",
    latinName: "Helleborus orientalis",
    commonName: "Helleborus",
    sunRequirement: "schaduw",
    minSunHours: 0, maxSunHours: 3,
    waterNeeds: "gemiddeld",
    type: "vaste_plant",
    bloomMonths: [2, 3, 4],
    maxHeightCm: 50,
    amsterdamNotes: "Bloeit vroeg in het jaar wanneer weinig anders bloeit; zeer winterhard",
    companionTags: ["vroegbloei", "winterhard"],
    availableInNL: true
  },
  {
    id: "digitalis-purpurea",
    dutchName: "Vingerhoedskruid",
    latinName: "Digitalis purpurea",
    commonName: "Vingerhoedskruid",
    sunRequirement: "halfschaduw",
    minSunHours: 2, maxSunHours: 6,
    waterNeeds: "gemiddeld",
    type: "eenjarig",
    bloomMonths: [6, 7],
    maxHeightCm: 150,
    amsterdamNotes: "Zaait zichzelf uit; bijen- en hommelmagnet",
    companionTags: ["vlindertuin", "bijenvriendelijk", "zelfzaaiend"],
    availableInNL: true
  },
  {
    id: "fern-athyrium",
    dutchName: "Wijfjesvaren",
    latinName: "Athyrium filix-femina",
    commonName: "Varen",
    sunRequirement: "schaduw",
    minSunHours: 0, maxSunHours: 3,
    waterNeeds: "hoog",
    type: "vaste_plant",
    bloomMonths: [],
    maxHeightCm: 100,
    amsterdamNotes: "Houdt van vochtige, humusrijke grond; sterft af in winter maar komt sterk terug",
    companionTags: ["bodembedekker", "vochtige-grond"],
    availableInNL: true
  },

  // ── HALFSCHADUW (3–6u directe zon) ──────────────────────────────────────

  {
    id: "geranium-rozanne",
    dutchName: "Ooievaarsbek",
    latinName: "Geranium 'Rozanne'",
    commonName: "Geranium Rozanne",
    sunRequirement: "halfschaduw",
    minSunHours: 3, maxSunHours: 6,
    waterNeeds: "gemiddeld",
    type: "vaste_plant",
    bloomMonths: [5, 6, 7, 8, 9, 10],
    maxHeightCm: 50,
    amsterdamNotes: "Bloeit van mei tot november; uiterst betrouwbaar in Nederlandse tuinen",
    companionTags: ["langbloei", "bodembedekker", "bijenvriendelijk"],
    availableInNL: true
  },
  {
    id: "alchemilla-mollis",
    dutchName: "Vrouwenmantel",
    latinName: "Alchemilla mollis",
    commonName: "Vrouwenmantel",
    sunRequirement: "halfschaduw",
    minSunHours: 2, maxSunHours: 6,
    waterNeeds: "gemiddeld",
    type: "vaste_plant",
    bloomMonths: [6, 7],
    maxHeightCm: 40,
    amsterdamNotes: "Zaait zichzelf vrijelijk uit — mooi maar kan invasief worden",
    companionTags: ["bodembedekker", "randbeplanting", "zelfzaaiend"],
    availableInNL: true
  },
  {
    id: "pulmonaria-officinalis",
    dutchName: "Longkruid",
    latinName: "Pulmonaria officinalis",
    commonName: "Longkruid",
    sunRequirement: "schaduw",
    minSunHours: 0, maxSunHours: 3,
    waterNeeds: "gemiddeld",
    type: "vaste_plant",
    bloomMonths: [3, 4, 5],
    maxHeightCm: 30,
    amsterdamNotes: "Vroegste bijen-voedselplant; gevlekt blad mooi het hele jaar",
    companionTags: ["vroegbloei", "bijenvriendelijk"],
    availableInNL: true
  },
  {
    id: "aquilegia-vulgaris",
    dutchName: "Akelei",
    latinName: "Aquilegia vulgaris",
    commonName: "Akelei",
    sunRequirement: "halfschaduw",
    minSunHours: 3, maxSunHours: 6,
    waterNeeds: "gemiddeld",
    type: "vaste_plant",
    bloomMonths: [5, 6],
    maxHeightCm: 80,
    amsterdamNotes: "Zaait zichzelf jaarlijks uit in nieuwe kleuren; makkelijk en sierlijk",
    companionTags: ["zelfzaaiend", "bijenvriendelijk"],
    availableInNL: true
  },
  {
    id: "persicaria-amplexicaulis",
    dutchName: "Duizendknoop",
    latinName: "Persicaria amplexicaulis",
    commonName: "Persicaria",
    sunRequirement: "halfschaduw",
    minSunHours: 3, maxSunHours: 7,
    waterNeeds: "gemiddeld",
    type: "vaste_plant",
    bloomMonths: [7, 8, 9, 10],
    maxHeightCm: 120,
    amsterdamNotes: "Lang bloeiend, robuust, uitstekend voor late zomer en herfst",
    companionTags: ["langbloei", "herfstbloei", "bijenvriendelijk"],
    availableInNL: true
  },
  {
    id: "anemone-hupehensis",
    dutchName: "Herfstanemoon",
    latinName: "Anemone hupehensis",
    commonName: "Herfstanemoon",
    sunRequirement: "halfschaduw",
    minSunHours: 3, maxSunHours: 6,
    waterNeeds: "gemiddeld",
    type: "vaste_plant",
    bloomMonths: [8, 9, 10],
    maxHeightCm: 100,
    amsterdamNotes: "Vult de leegte in de herfst; kan invasief worden maar goed te beheersen",
    companionTags: ["herfstbloei", "bijenvriendelijk"],
    availableInNL: true
  },
  {
    id: "rosa-climbing",
    dutchName: "Klimroos",
    latinName: "Rosa (klimvariëteit)",
    commonName: "Klimroos",
    sunRequirement: "halfschaduw",
    minSunHours: 4, maxSunHours: 8,
    waterNeeds: "gemiddeld",
    type: "klimmer",
    bloomMonths: [6, 7, 8, 9],
    maxHeightCm: 400,
    amsterdamNotes: "Kies meeldauwresistente rassen zoals 'New Dawn' of 'Aloha' voor Nederlandse tuinen",
    companionTags: ["muurplant", "geurend", "bijenvriendelijk"],
    availableInNL: true
  },
  {
    id: "clematis-montana",
    dutchName: "Bergclematis",
    latinName: "Clematis montana",
    commonName: "Clematis montana",
    sunRequirement: "halfschaduw",
    minSunHours: 3, maxSunHours: 7,
    waterNeeds: "gemiddeld",
    type: "klimmer",
    bloomMonths: [5, 6],
    maxHeightCm: 800,
    amsterdamNotes: "Zeer snelle groeier; voeten in de schaduw, bloemen in de zon",
    companionTags: ["muurplant", "snelle-groeier"],
    availableInNL: true
  },
  {
    id: "salvia-nemorosa",
    dutchName: "Bossalie",
    latinName: "Salvia nemorosa",
    commonName: "Salie",
    sunRequirement: "volle_zon",
    minSunHours: 5, maxSunHours: 10,
    waterNeeds: "laag",
    type: "vaste_plant",
    bloomMonths: [6, 7, 8],
    maxHeightCm: 60,
    amsterdamNotes: "Bijzonder aantrekkelijk voor hommels; terugsnijden voor tweede bloei",
    companionTags: ["droogtetolerant", "bijenvriendelijk", "vlindertuin"],
    availableInNL: true
  },
  {
    id: "lavandula-angustifolia",
    dutchName: "Lavendel",
    latinName: "Lavandula angustifolia",
    commonName: "Lavendel",
    sunRequirement: "volle_zon",
    minSunHours: 6, maxSunHours: 10,
    waterNeeds: "laag",
    type: "heester",
    bloomMonths: [6, 7, 8],
    maxHeightCm: 60,
    amsterdamNotes: "Verdraagt Amsterdam regenval mits goed doorlatende grond; vermijd klei",
    companionTags: ["geurend", "droogtetolerant", "bijenvriendelijk"],
    availableInNL: true
  },

  // ── VOLLE ZON (≥ 6u directe zon) ────────────────────────────────────────

  {
    id: "echinacea-purpurea",
    dutchName: "Zonnehoed",
    latinName: "Echinacea purpurea",
    commonName: "Echinacea",
    sunRequirement: "volle_zon",
    minSunHours: 6, maxSunHours: 10,
    waterNeeds: "laag",
    type: "vaste_plant",
    bloomMonths: [7, 8, 9],
    maxHeightCm: 120,
    amsterdamNotes: "Zaadkoppen decoratief in winter en voedsel voor mezen",
    companionTags: ["vlindertuin", "bijenvriendelijk", "droogtetolerant"],
    availableInNL: true
  },
  {
    id: "rudbeckia-fulgida",
    dutchName: "Zonnebloem (vaste)",
    latinName: "Rudbeckia fulgida",
    commonName: "Rudbeckia",
    sunRequirement: "volle_zon",
    minSunHours: 5, maxSunHours: 10,
    waterNeeds: "gemiddeld",
    type: "vaste_plant",
    bloomMonths: [7, 8, 9, 10],
    maxHeightCm: 80,
    amsterdamNotes: "Langdurige bloei tot laat in de herfst; zeer betrouwbaar",
    companionTags: ["langbloei", "bijenvriendelijk"],
    availableInNL: true
  },
  {
    id: "agapanthus-africanus",
    dutchName: "Afrikaanse lelie",
    latinName: "Agapanthus africanus",
    commonName: "Agapanthus",
    sunRequirement: "volle_zon",
    minSunHours: 6, maxSunHours: 10,
    waterNeeds: "gemiddeld",
    type: "vaste_plant",
    bloomMonths: [7, 8],
    maxHeightCm: 100,
    amsterdamNotes: "Bescherm wortels in strenge winters met mulch; in pot makkelijker te overwinteren",
    companionTags: ["mediterraan", "pot-geschikt"],
    availableInNL: true
  },
  {
    id: "verbena-bonariensis",
    dutchName: "IJzerhard",
    latinName: "Verbena bonariensis",
    commonName: "Verbena bonariensis",
    sunRequirement: "volle_zon",
    minSunHours: 6, maxSunHours: 10,
    waterNeeds: "laag",
    type: "vaste_plant",
    bloomMonths: [7, 8, 9, 10],
    maxHeightCm: 150,
    amsterdamNotes: "Zaait zichzelf uit; transparante plant die mooi door andere planten heen groeit",
    companionTags: ["vlindertuin", "transparant", "zelfzaaiend", "droogtetolerant"],
    availableInNL: true
  },
  {
    id: "pennisetum-alopecuroides",
    dutchName: "Lampenpoetsersgras",
    latinName: "Pennisetum alopecuroides",
    commonName: "Pennisetum",
    sunRequirement: "volle_zon",
    minSunHours: 6, maxSunHours: 10,
    waterNeeds: "laag",
    type: "gras",
    bloomMonths: [8, 9, 10],
    maxHeightCm: 80,
    amsterdamNotes: "Pluimen decoratief in herfst en winter; goed winterhard",
    companionTags: ["siergrassen", "herfsteffect", "droogtetolerant"],
    availableInNL: true
  },
  {
    id: "allium-hollandicum",
    dutchName: "Sierui",
    latinName: "Allium hollandicum",
    commonName: "Allium",
    sunRequirement: "volle_zon",
    minSunHours: 5, maxSunHours: 10,
    waterNeeds: "laag",
    type: "bol",
    bloomMonths: [5, 6],
    maxHeightCm: 90,
    amsterdamNotes: "Plant bollen in het najaar; verdraagt zware kleigrond beter dan tulpen",
    companionTags: ["bol", "bijenvriendelijk", "droogtetolerant"],
    availableInNL: true
  },
  {
    id: "sedum-spectabile",
    dutchName: "Hemelsleutel",
    latinName: "Hylotelephium spectabile",
    commonName: "Sedum",
    sunRequirement: "volle_zon",
    minSunHours: 5, maxSunHours: 10,
    waterNeeds: "laag",
    type: "vaste_plant",
    bloomMonths: [8, 9, 10],
    maxHeightCm: 50,
    amsterdamNotes: "Onmisbaar voor vlinders in de late zomer; winterharde standaardplant",
    companionTags: ["vlindertuin", "droogtetolerant", "herfstbloei"],
    availableInNL: true
  },
  {
    id: "nepeta-faassenii",
    dutchName: "Kattenkruid",
    latinName: "Nepeta × faassenii",
    commonName: "Nepeta",
    sunRequirement: "volle_zon",
    minSunHours: 5, maxSunHours: 10,
    waterNeeds: "laag",
    type: "vaste_plant",
    bloomMonths: [5, 6, 7, 8, 9],
    maxHeightCm: 40,
    amsterdamNotes: "Terugsnijden na eerste bloei geeft tweede flush; bijzonder bijenvriendelijk",
    companionTags: ["droogtetolerant", "langbloei", "bijenvriendelijk", "randbeplanting"],
    availableInNL: true
  },
  {
    id: "kniphofia-uvaria",
    dutchName: "Vuurpijl",
    latinName: "Kniphofia uvaria",
    commonName: "Kniphofia",
    sunRequirement: "volle_zon",
    minSunHours: 6, maxSunHours: 10,
    waterNeeds: "gemiddeld",
    type: "vaste_plant",
    bloomMonths: [7, 8, 9],
    maxHeightCm: 120,
    amsterdamNotes: "Bescherm in strenge vorstperiodes; geeft exotisch accent aan zonnige borders",
    companionTags: ["exotisch", "bijenvriendelijk"],
    availableInNL: true
  },
  {
    id: "buddleja-davidii",
    dutchName: "Vlinderstruik",
    latinName: "Buddleja davidii",
    commonName: "Buddleja",
    sunRequirement: "volle_zon",
    minSunHours: 5, maxSunHours: 10,
    waterNeeds: "laag",
    type: "heester",
    bloomMonths: [7, 8, 9],
    maxHeightCm: 300,
    amsterdamNotes: "Jaarlijks hard terugsnijden in maart voor compact blijven en beste bloei",
    companionTags: ["vlindertuin", "droogtetolerant", "heester"],
    availableInNL: true
  },
  {
    id: "rosa-shrub",
    dutchName: "Struikroos",
    latinName: "Rosa (struikvariëteit)",
    commonName: "Struikroos",
    sunRequirement: "volle_zon",
    minSunHours: 6, maxSunHours: 10,
    waterNeeds: "gemiddeld",
    type: "heester",
    bloomMonths: [6, 7, 8, 9],
    maxHeightCm: 150,
    amsterdamNotes: "Kies ziekteresistente rassen (b.v. 'Knock Out', 'Bonica') voor minder onderhoud",
    companionTags: ["geurend", "bijenvriendelijk", "heester"],
    availableInNL: true
  },
  {
    id: "stipa-tenuissima",
    dutchName: "Vedergras",
    latinName: "Nassella tenuissima",
    commonName: "Stipa",
    sunRequirement: "volle_zon",
    minSunHours: 6, maxSunHours: 10,
    waterNeeds: "laag",
    type: "gras",
    bloomMonths: [6, 7, 8],
    maxHeightCm: 60,
    amsterdamNotes: "Waait prachtig in de wind; goed drainerend substraat essentieel",
    companionTags: ["siergrassen", "droogtetolerant", "licht-bewegend"],
    availableInNL: true
  },
  {
    id: "crocosmia-lucifer",
    dutchName: "Montbretia",
    latinName: "Crocosmia 'Lucifer'",
    commonName: "Crocosmia",
    sunRequirement: "halfschaduw",
    minSunHours: 4, maxSunHours: 8,
    waterNeeds: "gemiddeld",
    type: "bol",
    bloomMonths: [7, 8],
    maxHeightCm: 100,
    amsterdamNotes: "Vuurrode bloemen; vermenigvuldigt snel — deel elke paar jaar",
    companionTags: ["bol", "warm-kleur", "bijenvriendelijk"],
    availableInNL: true
  },
  {
    id: "phlox-paniculata",
    dutchName: "Vlambloem",
    latinName: "Phlox paniculata",
    commonName: "Phlox",
    sunRequirement: "halfschaduw",
    minSunHours: 4, maxSunHours: 7,
    waterNeeds: "hoog",
    type: "vaste_plant",
    bloomMonths: [7, 8, 9],
    maxHeightCm: 100,
    amsterdamNotes: "Kies meeldauwresistente rassen; voet in vochtige grond",
    companionTags: ["geurend", "zomerbloei", "bijenvriendelijk"],
    availableInNL: true
  },
  {
    id: "thalictrum-delavayi",
    dutchName: "Ruit",
    latinName: "Thalictrum delavayi",
    commonName: "Thalictrum",
    sunRequirement: "halfschaduw",
    minSunHours: 3, maxSunHours: 6,
    waterNeeds: "gemiddeld",
    type: "vaste_plant",
    bloomMonths: [7, 8],
    maxHeightCm: 180,
    amsterdamNotes: "Luchtige, transparante plant; mooie textuurcontrast met bredere bladeren",
    companionTags: ["transparant", "hoge-border"],
    availableInNL: true
  },
]
```

### How the dataset integrates with Phase A filtering

```typescript
import { LOCAL_PLANTS } from '@/data/plants-dataset'

// Combine user's own DB plants + local dataset for pre-filter
// Deduplicate by latinName so user's already-placed plants aren't double-suggested
const candidatePlants = [
  ...userPlants,
  ...LOCAL_PLANTS.filter(lp => 
    !userPlants.some(up => up.latinName === lp.latinName)
  )
]

const matches = preFilter(spotProfile, candidatePlants)
```

---

## Non-Goals (this plan)

- Watering schedule suggestions (separate feature)
- Soil type matching (data not yet available per spot)
- Plant health diagnosis
- Companion planting warnings between existing plants (future)
