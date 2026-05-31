# Floreren Dashboard — Redesign Plan

> Gebaseerd op de critique van Claude Code. De originele feedback staat hieronder
> bewaard zodat je het geheel aan een andere model kunt voeren.

---

## 📋 Originele Critique (bewaard)

What's working

Genuinely a lot. The warm paper palette, the Fraunces/Inter/mono type system, the editorial "label on the right, italic count on the left" section headers — this is a confident, cohesive aesthetic. It doesn't feel like a generic SaaS dashboard, and that's hard to pull off. Keep the bones.

The big things

1. The numbers don't add up — and that erodes trust fast. Your header says "20 planten wachten op verzorging," the status banner says Collectie 37 / Op schema 17 / Dorst 8 / Droog 12, and the care section says "20 signalen." 17 + 8 + 12 = 37 ✓, but Dorst (8) + Droog (12) = 20 "needing care," yet the buckets below read 5 + 8 + 7 = 20 with different framing (Nu/Vandaag/Deze week). A user can't reconcile "8 thirsty / 12 dry" with "5 now / 8 today / 7 this week." Pick one mental model for urgency and use it everywhere. I'd drop the Dorst/Droog split and let the time buckets be the single source of truth.

2. You have three competing "summary" zones stacked on top of each other. The header 2×2 grid (sunrise/sunset/outside/next care), the 4-up status banner, and the KPI pills (Water 12 / Bemesten 4 / Misten 4) all do overview duty before the user reaches a single actionable item. That's three rows of stats and ~1.5 screens of scrolling before "Gedaan." Collapse to one. The header should answer "what do I do right now," not make me read a weather almanac first.

3. Lead with the action, not the inventory. The most valuable thing here is "5 planten need water now." That's buried below maps and stat bars. Consider flipping the hierarchy: greeting → the Nu care list (the job to be done) → everything else (gardens, log, weather) as supporting context. A care app should open on the watering can, not the filing cabinet.

Medium things

4. Emoji as plant identity. 🌿🌵🌱 as the avatar for every plant is the one spot that undercuts the otherwise premium feel — and 🔫 for "misten" (misting) reads as a gun, which is jarringly off. Swap to real plant thumbnails (you clearly intend to, given the framed-image treatment) or a small set of custom line icons. Same for the 🔴🟡🟢 bucket dots — a colored pill or left-border would feel more designed than literal emoji circles.

5. The garden "maps" are placeholder-grade. The SVG blobs with woonkamer/tuin text labels look like wireframe stand-ins next to the polish everywhere else. Either render real top-down room layouts or, if that's not ready, use a cleaner abstract treatment than scattered circles.

6. Type sizes are running very small. 8–9px mono labels and 12px body are below comfortable reading size, especially the weather card (8px stat labels). The editorial look doesn't require microscopic text — bump the mono labels to 10–11px and you lose nothing but strain.

7. Two near-identical button rows everywhere. Every care item has Gedaan / Overslaan. On a list of 20 that's 40 buttons. Consider making the whole row swipe/click to complete, with "overslaan" as a secondary affordance on hover — quieter, faster, less visual noise.

Small polish

    Logboek section header has an empty italic count ("") where every other section has one — looks like a bug.
    Status-banner colors: Dorst is amber, Droog is terracotta, Buiten temp is also terracotta — terracotta is doing double duty as both "alert" and "neutral data," which muddies the color language.
    The fixed "⚠️ huidige dashboard" badge — assume that's a review artifact, not shipping.
    Card hover lift (translateY + big shadow) is a little strong for dense list items; fine for the map cards.

My one-sentence version: the look is already excellent — the problem is information hierarchy. You're showing three layers of summary stats before the user can do the one thing they came to do, and the counts across those layers don't reconcile. Tighten to a single urgency model and lead with the action.

---

## 🧠 Analyse & Concrete Code Changes

### P0 — Must fix (trust & usability)

#### 1. Fix number reconciliation: één urgentiemodel

**Probleem:** Statusbanner toont Dorst/Droog (toestand), buckets tonen Nu/Vandaag/Deze week (tijd). Beide tellen 20 maar op een andere manier, dus kunnen niet makkelijk gereconcilieerd worden.

**Oplossing:** Drop Dorst/Droog uit de statusbanner. De statusbanner wordt simpeler:

| Collectie | Op schema | Achter | Nu | Vandaag | Deze week |
|-----------|-----------|--------|----|---------|-----------|
| 37        | 17        | 12     | 5  | 8       | 7         |

Of nog simpeler: alleen **Collectie** + **Openstaand** (20) als banner, en de tijdverdeling staat al in de buckets eronder.

**Bestand:** `Dashboard.tsx` — `StatusBanner` component (regel 300-317) + `leadCopy` functie (regel 58-62) + de `overdueCount` / `dueTodayCount` variabelen (regel 52-54).

**Wijzigingen:**
- `StatusBanner` ontvangt nieuwe props: `nu: number`, `vandaag: number`, `deze_week: number` uit de dashboardV2 data
- Of: maak één compacte banner met `{ total: 37, open: 20 }`
- `leadCopy()` update naar: "5 planten nu, 8 vandaag, 7 deze week" — geen "overdue/due today" meer

#### 2. Collapse summary zones — actie eerst

**Probleem:** Header grid (4 vakjes) + StatusBanner + KPI pills = drie lagen samenvatting voordat je bij een actie komt.

**Oplossing:** Herstructureer de pagina:

```
┌─────────────────────────────────────┐
│ Greeting + date                     │
│ "Goedemiddag, Leon."                │
│ 5 planten nu, 8 vandaag, 7 deze wk  │
├─────────────────────────────────────┤
│ ┌─ NU ──────────────────────────┐   │
│ │ 💧 Water · Monstera    [Done] │   │
│ │ 🌿 Bemesten · Ficus   [Done] │   │
│ │ ...                          │   │
│ └───────────────────────────────┘   │
│ ┌─ VANDAAG ─────────────────────┐   │
│ │ ...                           │   │
│ └───────────────────────────────┘   │
├─────────────────────────────────────┤
│ Mijn tuinen (scroll)               │
│ Logboek                             │
│ Weer / tip / identify (sidebar)    │
└─────────────────────────────────────┘
```

**Concreet:** Verplaats de `CareWarningsSection` boven de kaarten-sectie. De header wordt compacter — alleen greeting + lede + de 2×2 grid wordt overbodig of gaat naar de sidebar. De statusbanner kan weg of wordt een hele kleine regel.

**Bestand:** `Dashboard.tsx` — de `return()` JSX structuur (regel 64-166). De volgorde is nu:

1. Header (greeting, 2×2 grid, user switcher)
2. StatusBanner
3. WelcomeChecklist
4. Maps
5. CareWarnings
6. Logboek
7. Sidebar (weer, tip, identify)

**Nieuwe volgorde:**

1. Header (greeting, **geen 2×2 grid**, user switcher) — compact
2. CareWarnings (NU → VANDAAG → DEZE WEEK) — meteen actie
3. Maps (indien minder dan X openstaand, anders ingeklapt)
4. Sidebar: Logboek, weer, tip, identify
5. De 2×2 grid **verhuist naar de sidebar** of wordt één regel "Zon op 05:27 · Zon onder 21:53 · 18°C"

### P1 — Important

#### 3. Header 2×2 grid vereenvoudigen / verplaatsen

**Probleem:** Sunrise/sunset/temp/next care is een leuke almanak maar niet wat iemand als eerste wil zien.

**Oplossing:** Verplaats naar de sidebar óf maak er één subtiele regel van boven de actielijst:

> ☀️ 05:27 — 21:53 · 15u58 daglicht · 18°C buiten

Of hou het zoals critici zeggen: de header moet antwoorden "wat moet ik nu doen" — dus vervang next care door een telling.

**Bestand:** `DashboardHeader` (regel 250-298).

#### 4. Emoji vervangen door custom line icons of thumbnails

**Probleem:** 🔫 voor misten, 🌿🌵🌱 voor planten — ondergraaft de premium feel.

**Oplossing:** 
- 🔫 → 💦 of een custom spray icon SVG
- 🌿🌵🌱 → de echte plant thumbnails (die bestaan al via `icon_key` / `resolveIconUrl()`! De code heeft al een fallback naar emoji als er geen icon is)
- 🔴🟡🟢 → vervangen door een **colored left-border** op de bucket items, of een **colored pill** met de bucket naam

**Bestand:** 
- `Dashboard.tsx` — overal waar `icon_key` gebruikt wordt met emoji fallback (regel 555-557, 667-669, 705-708)
- `WeatherCard.tsx` — WMO iconen zijn al SVG, dat is ok
- De bucket headers 🔴🟡🟢 (regel 474-476)

#### 5. Buttons: minder visuele noise

**Probleem:** Twee buttons per item × 20 items = 40 knoppen.

**Oplossing:** 
- "Gedaan" wordt de primaire actie (hele rij klikbaar of swipe)
- "Overslaan" verdwijnt uit de default view, komt in hover of een `···` menu
- Of: alleen een checkbox icoon links, en overslaan via long-press

**Bestand:** `WarningBucket` component (regel 523-593) en `GroupedWarningRow` (regel 486-520).

### P2 — Nice to have

#### 6. Type sizes vergroten

- Mono labels van 8-9px → 10-11px
- Body van 12px → 13-14px
- Check of de `clamp()` in de header nog ok is

**Bestand:** Overal in `Dashboard.tsx` en `index.css`.

#### 7. Garden maps: beter wireframe of echt renderen

Momenteel placeholder SVG. Als er al echte thumbnails zijn (`map.thumbnail_file`) wordt die getoond, anders valt ie terug op raw SVG viewbox. De vraag is of de thumbnail al werkt of niet.

#### 8. Logboek section header fix

Lege `""` italic count op regel 135 — mist een waarde zoals "Vandaag 2 notities" of leeg (geen italic tekst).

### P3 — Polish

- **Kleur consistentie:** terracotta (`#B2664A`) nu gebruikt voor zowel `--color-overdue` als Buiten temp (neutraal). Overweeg een aparte `--color-data` of gewoon `--color-text` voor neutrale metingen.
- **Card hover:** `translateY(-2px)` voor map cards is ok, maar voor de care items in de bucket voelt het te heftig. Gebruik alleen `border-color` transition voor list items.
- **Statusbanner mobiel:** check of compacte styling consistent is met de nieuwe indeling.

---

## 📐 Implementatieplan (prioriteit volgorde)

### Fase 1: Hiërarchie omgooien (P0)
1. **CareWarningsSection verplaatsen** naar direct onder de header, boven maps
2. **StatusBanner herzien** — één model: tijd (nu/vandaag/deze week) ipv toestand (dorst/droog)
3. **Header vereenvoudigen** — 2×2 grid kleiner of naar sidebar, focus op "wat nu?"
4. **`leadCopy()` updaten** — spiegel de time-bucket taal

### Fase 2: UI verfijning (P1)
5. **Buttons reduceren** — één "Gedaan" actie per item, overslaan in hover
6. **Emoji vervangen** — 🔫 → 💦, bucket dots naar colored pills/borders

### Fase 3: Typografie & polish (P2-P3)
7. **Type sizes bump** — alle mono labels 9px → 10px min
8. **Logboek lege count fix**
9. **Kleur dubbelgebruik oplossen**
10. **Card hover temperen** voor list items

---

## 🔧 Bestanden die aangepast worden

| Bestand | Wat |
|---------|-----|
| `frontend/src/pages/Dashboard.tsx` | Hoofdcomponent — layout volgorde, StatusBanner, Header, Buttons, Emoji, Logboek |
| `frontend/src/index.css` | Type sizes, hover effects, status-banner responsive |
| `frontend/src/components/dashboard/WeatherCard.tsx` | Optioneel: type sizes, positionering in sidebar |
| `frontend/src/store/useFloreren.ts` | Optioneel: check of dashboardV2 de juiste data heeft voor nieuw banner model |
| `frontend/src/types.ts` | Optioneel: als het type van `WarningSummaryOut` of `DashboardData` moet wijzigen |

---

Wil je dat ik met Fase 1 begin? Dan herschrijf ik `Dashboard.tsx` met de action-first hiërarchie.
