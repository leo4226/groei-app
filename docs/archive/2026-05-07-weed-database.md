# Weed Database Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a static `LocalWeed` dataset with ~40 common Dutch weeds for identification and removal guidance.

**Architecture:** Single file `groei/frontend/src/data/weeds-dataset.ts` following the `plants-dataset.ts` pattern. Composed interface with sub-types for appearance, habitat, and removal. No backend changes in Phase 1.

**Tech Stack:** TypeScript

---

### Task 1: Create type definitions and first lawn weeds

**Files:**
- Create: `groei/frontend/src/data/weeds-dataset.ts`

- [ ] **Step 1: Write the file with types and first 12 weeds (lawn + paving)**

```typescript
// Local weed dataset for identification and removal guidance.
// Composed schema: core identity, appearance, habitat & season, removal.

export type FlowerColor = 'geel' | 'wit' | 'paars' | 'roze' | 'rood' | 'groen' | 'bruin'
export type GrowthForm = 'staand' | 'kruipend' | 'rozettend' | 'klimmend' | 'polvormend'
export type Place = 'gazon' | 'tegels' | 'moestuin' | 'border' | 'braakliggend' | 'vochtig'
export type RootType = 'penwortel' | 'wortelstokken' | 'oppervlakkig' | 'vezelig'
export type SunPreference = 'zon' | 'halfschaduw' | 'schaduw' | 'all'
export type Difficulty = 'makkelijk' | 'gemiddeld' | 'moeilijk'
export type Urgency = 'laag' | 'gemiddeld' | 'hoog'

export interface WeedAppearance {
  flowerColor: FlowerColor
  flowerShape: string
  leafShape: string
  growthForm: GrowthForm
  maxHeightCm: number
  distinguishing: string
  lookAlikes: string[]
}

export interface WeedHabitat {
  places: Place[]
  soilTypes: string[]
  activeMonths: number[]
  bloomMonths: number[]
  sunPreference: SunPreference
}

export interface WeedRemoval {
  rootType: RootType
  reproducesVia: string[]
  removalMethod: string
  removalDifficulty: Difficulty
  urgency: Urgency
  removalTip: string
  prevention: string
}

export interface LocalWeed {
  id: string
  dutchName: string
  latinName: string
  family: string
  commonNames: string[]
  appearance: WeedAppearance
  habitat: WeedHabitat
  removal: WeedRemoval
  edible: boolean
  edibleNote: string | null
  interesting: string | null
  nativeToNL: boolean
}

export const LOCAL_WEEDS: LocalWeed[] = [

  // ── GAZON (lawn weeds) ──────────────────────────────────────────────────

  {
    id: 'paardenbloem',
    dutchName: 'Paardenbloem',
    latinName: 'Taraxacum officinale',
    family: 'Composietenfamilie (Asteraceae)',
    commonNames: ['Molsla', 'Pisbloem'],
    appearance: {
      flowerColor: 'geel',
      flowerShape: 'Grote gele bloemhoofdjes op holle stengel',
      leafShape: 'Diep ingesneden, getand',
      growthForm: 'rozettend',
      maxHeightCm: 40,
      distinguishing: 'Holle stengel met wit melksap; alles uit één rozet',
      lookAlikes: ['paardenbloem'],
    },
    habitat: {
      places: ['gazon', 'border', 'moestuin'],
      soilTypes: ['klei', 'zand', 'humus', 'voedselrijk'],
      activeMonths: [3, 4, 5, 6, 7, 8, 9, 10],
      bloomMonths: [4, 5, 6],
      sunPreference: 'zon',
    },
    removal: {
      rootType: 'penwortel',
      reproducesVia: ['zaad', 'wortelfragmenten'],
      removalMethod: 'Uitsteken met onkruidsteker of penwortel volledig uitgraven',
      removalDifficulty: 'gemiddeld',
      urgency: 'gemiddeld',
      removalTip: 'Verwijder vóór de pluisvorming, anders zaait hij zich massaal uit',
      prevention: 'Gazon dicht en gezond houden; kale plekken doorzaaien',
    },
    edible: true,
    edibleNote: 'Jong blad in salades, bloemen voor siroop of wijn, wortel voor koffie-achtige drank',
    interesting: 'Eén plant kan tot 5000 zaden produceren; pluizen leggen kilometers af',
    nativeToNL: true,
  },
  {
    id: 'madeliefje',
    dutchName: 'Madeliefje',
    latinName: 'Bellis perennis',
    family: 'Composietenfamilie (Asteraceae)',
    commonNames: ['Meizoentje', 'Koeienbloem'],
    appearance: {
      flowerColor: 'wit',
      flowerShape: 'Kleine bloemhoofdjes met wit lintbloemen en geel hart',
      leafShape: 'Spatelvormig, stomp',
      growthForm: 'rozettend',
      maxHeightCm: 15,
      distinguishing: 'Kleine witte bloempjes met geel hart; rozet plat tegen de grond',
      lookAlikes: [],
    },
    habitat: {
      places: ['gazon', 'tegels', 'border'],
      soilTypes: ['klei', 'zand', 'humus', 'voedselrijk'],
      activeMonths: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12],
      bloomMonths: [3, 4, 5, 6, 7, 8, 9, 10],
      sunPreference: 'halfschaduw',
    },
    removal: {
      rootType: 'oppervlakkig',
      reproducesVia: ['zaad', 'uitlopers'],
      removalMethod: 'Uitsteken met onkruidsteker of handmatig uittrekken',
      removalDifficulty: 'makkelijk',
      urgency: 'laag',
      removalTip: 'Makkelijk te verwijderen, maar komt snel terug in kaal gazon',
      prevention: 'Gazon niet te kort maaien; hoger gras verdringt madeliefjes',
    },
    edible: true,
    edibleNote: 'Bloemen en jong blad eetbaar in salades; bloemknoppen in azijn inmaken',
    interesting: 'Bloeit bijna het hele jaar door; bloempjes sluiten zich 's avonds en bij regen',
    nativeToNL: true,
  },
  {
    id: 'witte-klaver',
    dutchName: 'Witte klaver',
    latinName: 'Trifolium repens',
    family: 'Vlinderbloemenfamilie (Fabaceae)',
    commonNames: ['Klaver'],
    appearance: {
      flowerColor: 'wit',
      flowerShape: 'Ronde bolletjes van kleine witte bloempjes',
      leafShape: 'Drietallig, rond tot ovaal met lichte V-vormige tekening',
      growthForm: 'kruipend',
      maxHeightCm: 20,
      distinguishing: 'Kruipende stengels die wortelen op knopen; karakteristiek drietallig blad',
      lookAlikes: [],
    },
    habitat: {
      places: ['gazon', 'border', 'tegels'],
      soilTypes: ['klei', 'zand', 'arm'],
      activeMonths: [4, 5, 6, 7, 8, 9, 10],
      bloomMonths: [5, 6, 7, 8, 9],
      sunPreference: 'halfschaduw',
    },
    removal: {
      rootType: 'oppervlakkig',
      reproducesVia: ['zaad', 'uitlopers'],
      removalMethod: 'Uitsteken of handmatig uittrekken; zorg dat alle kruipstengels meegenomen worden',
      removalDifficulty: 'gemiddeld',
      urgency: 'laag',
      removalTip: 'In perken one-shot verwijderen kan; in gazon juist nuttig als natuurlijke stikstofbinder',
      prevention: 'Gazon voldoende bemesten; klaver gedijt op stikstofarme bodem',
    },
    edible: true,
    edibleNote: 'Bloemen en jong blad in salades; bloemen zoetig van smaak',
    interesting: 'Bindt stikstof uit de lucht via wortelknolletjes; een teken van stikstofarme bodem',
    nativeToNL: true,
  },
  {
    id: 'smalle-weegbree',
    dutchName: 'Smalle weegbree',
    latinName: 'Plantago lanceolata',
    family: 'Weegbreefamilie (Plantaginaceae)',
    commonNames: ['Hondsribben'],
    appearance: {
      flowerColor: 'bruin',
      flowerShape: 'Korte bruine aren op lange dunne stelen',
      leafShape: 'Lancetvormig, duidelijk generfd',
      growthForm: 'rozettend',
      maxHeightCm: 50,
      distinguishing: 'Lange smalle bladeren met diepe nerven; bruine bloemaren op kale stelen',
      lookAlikes: [],
    },
    habitat: {
      places: ['gazon', 'border', 'braakliggend'],
      soilTypes: ['klei', 'zand', 'humus', 'voedselrijk'],
      activeMonths: [3, 4, 5, 6, 7, 8, 9, 10, 11],
      bloomMonths: [5, 6, 7, 8, 9],
      sunPreference: 'zon',
    },
    removal: {
      rootType: 'penwortel',
      reproducesVia: ['zaad'],
      removalMethod: 'Uitsteken met onkruidsteker; penwortel volledig verwijderen',
      removalDifficulty: 'gemiddeld',
      urgency: 'gemiddeld',
      removalTip: 'Verwijderen vóór bloei voorkomt zaadverspreiding',
      prevention: 'Gazon gezond houden; verdichte bodem beluchten want weegbree duidt op verdichting',
    },
    edible: true,
    edibleNote: 'Jong blad in salades; zaadknoppen rauw of kort gebakken',
    interesting: 'Traditioneel gebruikt tegen hoest; blad helpt bij insectenbeten (in de huid wrijven)',
    nativeToNL: true,
  },
  {
    id: 'grote-weegbree',
    dutchName: 'Grote weegbree',
    latinName: 'Plantago major',
    family: 'Weegbreefamilie (Plantaginaceae)',
    commonNames: ['Wegblad'],
    appearance: {
      flowerColor: 'groen',
      flowerShape: 'Lange groene aren op stevige stelen',
      leafShape: 'Breed ovaal, parallel generfd',
      growthForm: 'rozettend',
      maxHeightCm: 30,
      distinguishing: 'Brede platte bladeren tegen de grond; groene bloemaren met witte meeldraden',
      lookAlikes: [],
    },
    habitat: {
      places: ['tegels', 'gazon', 'braakliggend'],
      soilTypes: ['klei', 'zand', 'voedselrijk'],
      activeMonths: [4, 5, 6, 7, 8, 9, 10],
      bloomMonths: [5, 6, 7, 8, 9],
      sunPreference: 'halfschaduw',
    },
    removal: {
      rootType: 'vezelig',
      reproducesVia: ['zaad'],
      removalMethod: 'Uitsteken of handmatig uittrekken; vezelige wortelkluit meenemen',
      removalDifficulty: 'makkelijk',
      urgency: 'laag',
      removalTip: 'Vooral tussen tegels makkelijk te verwijderen',
      prevention: 'Voegen tussen tegels vullen met voegzand',
    },
    edible: true,
    edibleNote: 'Jong blad in salades of gekookt als spinazie',
    interesting: 'Groeit waar veel wordt gelopen — vandaar de naam "wegblad". Verdraagt betreding extreem goed',
    nativeToNL: true,
  },
  {
    id: 'kruipende-boterbloem',
    dutchName: 'Kruipende boterbloem',
    latinName: 'Ranunculus repens',
    family: 'Ranonkelfamilie (Ranunculaceae)',
    commonNames: ['Boterbloem'],
    appearance: {
      flowerColor: 'geel',
      flowerShape: 'Glanzende goudgele bloemen met 5 kroonbladen',
      leafShape: 'Drietallig, donkergroen, vaak gevlekt',
      growthForm: 'kruipend',
      maxHeightCm: 40,
      distinguishing: 'Kruipende uitlopers die wortelen; glanzende botergele bloemen',
      lookAlikes: ['scherpe-boterbloem'],
    },
    habitat: {
      places: ['gazon', 'vochtig', 'border', 'moestuin'],
      soilTypes: ['klei', 'humus', 'voedselrijk'],
      activeMonths: [3, 4, 5, 6, 7, 8, 9, 10],
      bloomMonths: [5, 6, 7, 8],
      sunPreference: 'halfschaduw',
    },
    removal: {
      rootType: 'vezelig',
      reproducesVia: ['zaad', 'uitlopers'],
      removalMethod: 'Uitsteken met onkruidsteker; alle uitlopers meenemen',
      removalDifficulty: 'gemiddeld',
      urgency: 'gemiddeld',
      removalTip: 'Laat geen stukjes uitloper achter — elke knoop maakt een nieuwe plant',
      prevention: 'Bodem verbeteren (drainage); boterbloem gedijt op natte plekken',
    },
    edible: false,
    edibleNote: null,
    interesting: 'Alle boterbloemsoorten zijn giftig voor vee; het sap kan huidirritatie veroorzaken',
    nativeToNL: true,
  },
  {
    id: 'paarse-dovenetel',
    dutchName: 'Paarse dovenetel',
    latinName: 'Lamium purpureum',
    family: 'Lipbloemenfamilie (Lamiaceae)',
    commonNames: ['Dovenetel'],
    appearance: {
      flowerColor: 'paars',
      flowerShape: 'Kleine paarse lipbloempjes in kransen',
      leafShape: 'Hartvormig, gekarteld, paars aangelopen aan de top',
      growthForm: 'staand',
      maxHeightCm: 30,
      distinguishing: 'Paarse bovenste bladeren en kleine paarse lipbloemen; lijkt op brandnetel maar prikt niet',
      lookAlikes: ['brandnetel'],
    },
    habitat: {
      places: ['moestuin', 'border', 'braakliggend'],
      soilTypes: ['klei', 'zand', 'humus', 'voedselrijk'],
      activeMonths: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12],
      bloomMonths: [3, 4, 5, 6, 7, 8, 9, 10],
      sunPreference: 'halfschaduw',
    },
    removal: {
      rootType: 'oppervlakkig',
      reproducesVia: ['zaad'],
      removalMethod: 'Handmatig uittrekken; ondiep wortelend dus makkelijk',
      removalDifficulty: 'makkelijk',
      urgency: 'laag',
      removalTip: 'Bloeit al in maart; vroege bijenvoedselbron — overweeg wat te laten staan',
      prevention: 'Bodem bedekt houden; mulch aanbrengen in borders',
    },
    edible: true,
    edibleNote: 'Jonge toppen en bloemen in salades of thee',
    interesting: 'Vroegste voorjaarsbloeier; een van de eerste voedselbronnen voor hommelkoninginnen',
    nativeToNL: true,
  },
  {
    id: 'straatgras',
    dutchName: 'Straatgras',
    latinName: 'Poa annua',
    family: 'Grassenfamilie (Poaceae)',
    commonNames: ['Vogelgras'],
    appearance: {
      flowerColor: 'groen',
      flowerShape: 'Kleine groene pluimen op korte stengels',
      leafShape: 'Smal, zacht, met bootvormige bladtop',
      growthForm: 'polvormend',
      maxHeightCm: 20,
      distinguishing: 'Kleine graspolletjes die het hele jaar bloeien; bootvormige bladpunt',
      lookAlikes: [],
    },
    habitat: {
      places: ['tegels', 'moestuin', 'border', 'gazon'],
      soilTypes: ['klei', 'zand', 'humus'],
      activeMonths: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12],
      bloomMonths: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12],
      sunPreference: 'all',
    },
    removal: {
      rootType: 'vezelig',
      reproducesVia: ['zaad'],
      removalMethod: 'Handmatig uittrekken of schoffelen; ondiep wortelend',
      removalDifficulty: 'makkelijk',
      urgency: 'gemiddeld',
      removalTip: 'Bloeit het hele jaar door; verwijderen vóór zaadvorming is lastig — blijf consequent',
      prevention: 'Voegen tussen tegels vullen; dikke mulchlaag in borders',
    },
    edible: false,
    edibleNote: null,
    interesting: 'Een van de meest succesvolle planten ter wereld; groeit zelfs op Antarctica (geïntroduceerd)',
    nativeToNL: false,
  },
  {
    id: 'muurleeuwenbek',
    dutchName: 'Muurleeuwenbek',
    latinName: 'Cymbalaria muralis',
    family: 'Weegbreefamilie (Plantaginaceae)',
    commonNames: ['Muurbloem'],
    appearance: {
      flowerColor: 'paars',
      flowerShape: 'Kleine lila lipbloempjes met gele keelvlek',
      leafShape: 'Klein, rond tot niervormig, gelobd',
      growthForm: 'kruipend',
      maxHeightCm: 5,
      distinguishing: 'Kleine klimop-achtige blaadjes en lila bloempjes; groeit in muurvoegen',
      lookAlikes: [],
    },
    habitat: {
      places: ['tegels', 'border'],
      soilTypes: ['zand', 'arm'],
      activeMonths: [4, 5, 6, 7, 8, 9, 10],
      bloomMonths: [5, 6, 7, 8, 9],
      sunPreference: 'halfschaduw',
    },
    removal: {
      rootType: 'oppervlakkig',
      reproducesVia: ['zaad'],
      removalMethod: 'Handmatig uittrekken; ondiep wortelend in voegen',
      removalDifficulty: 'makkelijk',
      urgency: 'laag',
      removalTip: 'Makkelijk te verwijderen; in oude muren juist charmant — overweeg te laten staan',
      prevention: 'Voegen in muren en terrassen dicht houden',
    },
    edible: false,
    edibleNote: null,
    interesting: 'Na de bloei buigt de bloemsteel naar de muur toe om zaad in donkere spleten te deponeren',
    nativeToNL: false,
  },
  {
    id: 'varkensgras',
    dutchName: 'Gewoon varkensgras',
    latinName: 'Polygonum aviculare',
    family: 'Duizendknoopfamilie (Polygonaceae)',
    commonNames: ['Varkensgras'],
    appearance: {
      flowerColor: 'roze',
      flowerShape: 'Kleine roze-witte bloempjes in bladoksels',
      leafShape: 'Klein, ovaal, blauwgroen',
      growthForm: 'kruipend',
      maxHeightCm: 10,
      distinguishing: 'Platliggende mat met kleine blauwgroene blaadjes; groeit zelfs in voegspleten',
      lookAlikes: [],
    },
    habitat: {
      places: ['tegels', 'braakliggend', 'moestuin'],
      soilTypes: ['klei', 'zand', 'arm'],
      activeMonths: [5, 6, 7, 8, 9, 10],
      bloomMonths: [6, 7, 8, 9],
      sunPreference: 'zon',
    },
    removal: {
      rootType: 'penwortel',
      reproducesVia: ['zaad'],
      removalMethod: 'Schoffelen of handmatig uittrekken; penwortel is taai maar meestal ondiep',
      removalDifficulty: 'gemiddeld',
      urgency: 'gemiddeld',
      removalTip: 'Verwijderen vóór zaadvorming; één plant produceert tot 5000 zaden',
      prevention: 'Voegen dicht houden; bodembedekkers planten op kale plekken',
    },
    edible: true,
    edibleNote: 'Jong blad en zaden eetbaar; zaden bevatten veel zetmeel',
    interesting: 'Extreem tredbestendig; groeit op de meest belopen paden. Een van de oudste medicinale planten',
    nativeToNL: true,
  },
  {
    id: 'draadereprijs',
    dutchName: 'Draadereprijs',
    latinName: 'Veronica filiformis',
    family: 'Weegbreefamilie (Plantaginaceae)',
    commonNames: ['Ereprijs'],
    appearance: {
      flowerColor: 'paars',
      flowerShape: 'Kleine lichtblauwe bloempjes met donkere adertjes',
      leafShape: 'Klein, rond tot ovaal',
      growthForm: 'kruipend',
      maxHeightCm: 5,
      distinguishing: 'Fijne draderige stengels die een dicht matje vormen; lichtblauwe bloempjes',
      lookAlikes: [],
    },
    habitat: {
      places: ['gazon', 'border', 'tegels'],
      soilTypes: ['klei', 'zand', 'humus'],
      activeMonths: [3, 4, 5, 6, 7, 8, 9, 10],
      bloomMonths: [5, 6, 7],
      sunPreference: 'halfschaduw',
    },
    removal: {
      rootType: 'oppervlakkig',
      reproducesVia: ['uitlopers', 'wortelfragmenten'],
      removalMethod: 'Handmatig uittrekken; alle draadstengels meenemen',
      removalDifficulty: 'gemiddeld',
      urgency: 'gemiddeld',
      removalTip: 'Elk achtergebleven stengelfragment wortelt opnieuw — zorgvuldig verwijderen',
      prevention: 'Gazon niet te kort maaien; gezond gras verdringt ereprijs',
    },
    edible: false,
    edibleNote: null,
    interesting: 'Oorspronkelijk uit de Kaukasus; in Nederland pas sinds de 19e eeuw. Verspreidt zich via grasmaaiers',
    nativeToNL: false,
  },
  {
    id: 'vogelmuur',
    dutchName: 'Vogelmuur',
    latinName: 'Stellaria media',
    family: 'Anjerfamilie (Caryophyllaceae)',
    commonNames: ['Muur'],
    appearance: {
      flowerColor: 'wit',
      flowerShape: 'Kleine stervormige witte bloempjes met diep ingesneden kroonbladen',
      leafShape: 'Klein, ovaal, frisgroen',
      growthForm: 'kruipend',
      maxHeightCm: 20,
      distinguishing: 'Eén rij haartjes op de stengel (niet rondom); kleine witte sterbloempjes',
      lookAlikes: [],
    },
    habitat: {
      places: ['moestuin', 'border', 'braakliggend', 'tegels'],
      soilTypes: ['klei', 'zand', 'humus', 'voedselrijk'],
      activeMonths: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12],
      bloomMonths: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12],
      sunPreference: 'halfschaduw',
    },
    removal: {
      rootType: 'oppervlakkig',
      reproducesVia: ['zaad'],
      removalMethod: 'Schoffelen of handmatig uittrekken; heel makkelijk te verwijderen',
      removalDifficulty: 'makkelijk',
      urgency: 'hoog',
      removalTip: 'Eén plant produceert 15.000 zaden en zaait het hele jaar door; blijf consequent verwijderen',
      prevention: 'Mulchen in borders; bodem in moestuin bedekt houden in winter',
    },
    edible: true,
    edibleNote: 'Heerlijk in salades; zacht en mild van smaak; ook gekookt als spinazie',
    interesting: 'Zaad blijft tientallen jaren kiemkrachtig in de bodem. Vogels zijn dol op de zaden — vandaar de naam',
    nativeToNL: true,
  },
]
```

- [ ] **Step 2: Verify the file compiles**

```bash
cd groei/frontend && npx tsc --noEmit --strict src/data/weeds-dataset.ts
```
Expected: No errors.

- [ ] **Step 3: Commit**

```bash
git add groei/frontend/src/data/weeds-dataset.ts
git commit -m "feat: add weed dataset with types and lawn/paving weeds"
```

### Task 2: Add border and vegetable garden weeds

**Files:**
- Modify: `groei/frontend/src/data/weeds-dataset.ts` — append ~12 entries before closing `];`

- [ ] **Step 1: Append border/moestuin weeds to LOCAL_WEEDS array**

Insert before the `];` at end of file:

```typescript
  // ── BORDER & MOESTUIN (border + vegetable garden weeds) ──────────────────

  {
    id: 'zevenblad',
    dutchName: 'Zevenblad',
    latinName: 'Aegopodium podagraria',
    family: 'Schermbloemenfamilie (Apiaceae)',
    commonNames: ['Hanenpoot', 'Tuinmansverdriet'],
    appearance: {
      flowerColor: 'wit',
      flowerShape: 'Witte schermen van kleine bloempjes',
      leafShape: 'Drietallig of zeventallig samengesteld, eirond, getand',
      growthForm: 'staand',
      maxHeightCm: 80,
      distinguishing: 'Bladeren in groepjes van 7 (of 3); witte schermbloemen; verspreidt zich als een tapijt',
      lookAlikes: ['fluitenkruid'],
    },
    habitat: {
      places: ['border', 'moestuin', 'vochtig'],
      soilTypes: ['klei', 'humus', 'voedselrijk'],
      activeMonths: [4, 5, 6, 7, 8, 9, 10],
      bloomMonths: [6, 7],
      sunPreference: 'halfschaduw',
    },
    removal: {
      rootType: 'wortelstokken',
      reproducesVia: ['wortelstokken', 'wortelfragmenten'],
      removalMethod: 'Uitgraven en alle wortelstokken verwijderen; niet schoffelen (verspreidt fragmenten)',
      removalDifficulty: 'moeilijk',
      urgency: 'hoog',
      removalTip: 'Elk achtergebleven stukje wortelstok loopt opnieuw uit; herhaal verwijderen meerdere seizoenen',
      prevention: 'Worteldoek of dikke mulch als barrière; borders met dichte beplanting vullen',
    },
    edible: true,
    edibleNote: 'Jong blad in salades of gekookt als spinazie; smaakt naar selderij-peterselie',
    interesting: 'In de Middeleeuwen gekweekt als groente; de naam verwijst naar gebruik tegen jicht (podagra)',
    nativeToNL: true,
  },
  {
    id: 'grote-brandnetel',
    dutchName: 'Grote brandnetel',
    latinName: 'Urtica dioica',
    family: 'Brandnetelfamilie (Urticaceae)',
    commonNames: ['Brandnetel', 'Netel'],
    appearance: {
      flowerColor: 'groen',
      flowerShape: 'Hangende groene trossen kleine bloempjes',
      leafShape: 'Langwerpig hartvormig, scherp getand, tegenoverstaand',
      growthForm: 'staand',
      maxHeightCm: 150,
      distinguishing: 'Brandharen op stengels en bladeren; groeit in grote groepen',
      lookAlikes: ['paarse-dovenetel'],
    },
    habitat: {
      places: ['moestuin', 'border', 'braakliggend', 'vochtig'],
      soilTypes: ['klei', 'humus', 'voedselrijk'],
      activeMonths: [3, 4, 5, 6, 7, 8, 9, 10],
      bloomMonths: [6, 7, 8, 9],
      sunPreference: 'halfschaduw',
    },
    removal: {
      rootType: 'wortelstokken',
      reproducesVia: ['zaad', 'wortelstokken'],
      removalMethod: 'Uitgraven met wortelstok; handschoenen met lange mouwen dragen',
      removalDifficulty: 'gemiddeld',
      urgency: 'hoog',
      removalTip: 'Verwijderen vóór zaadvorming in juli; uitgegraven planten NIET op de composthoop gooien',
      prevention: 'Wortelstokken volledig verwijderen; kale plekken direct beplanten',
    },
    edible: true,
    edibleNote: 'Jonge toppen koken voor soep, thee of stamppot; koken neutraliseert brandharen',
    interesting: 'Waardplant voor zeker 50 vlindersoorten; brandnetelgier is een uitstekende biologische meststof',
    nativeToNL: true,
  },
  {
    id: 'heermoes',
    dutchName: 'Heermoes',
    latinName: 'Equisetum arvense',
    family: 'Paardenstaartfamilie (Equisetaceae)',
    commonNames: ['Paardenstaart', 'Aker', 'Kattenstaart'],
    appearance: {
      flowerColor: 'bruin',
      flowerShape: 'Bruine sporenaar op aparte bleke stengel in het voorjaar',
      leafShape: 'Geen echte bladeren; groene zijtakjes in kransen (lijken op bladeren)',
      growthForm: 'staand',
      maxHeightCm: 60,
      distinguishing: 'Groene kerstboom-achtige stengels; voelt ruw aan door kiezelzuur',
      lookAlikes: [],
    },
    habitat: {
      places: ['moestuin', 'border', 'braakliggend', 'vochtig'],
      soilTypes: ['klei', 'zand', 'arm'],
      activeMonths: [4, 5, 6, 7, 8, 9],
      bloomMonths: [3, 4],
      sunPreference: 'halfschaduw',
    },
    removal: {
      rootType: 'wortelstokken',
      reproducesVia: ['wortelstokken'],
      removalMethod: 'Herhaaldelijk uittrekken of schoffelen om wortelstokken uit te putten',
      removalDifficulty: 'moeilijk',
      urgency: 'hoog',
      removalTip: 'Wortelstokken kunnen tot 2 meter diep zitten; consequent bovengronds verwijderen put ze uiteindelijk uit',
      prevention: 'Bodem verbeteren met compost en kalk; heermoes wijst op arme, verdichte grond',
    },
    edible: false,
    edibleNote: null,
    interesting: 'Bestaat al 300 miljoen jaar; bevat zoveel kiezelzuur dat het vroeger als schuurmiddel werd gebruikt',
    nativeToNL: true,
  },
  {
    id: 'kleefkruid',
    dutchName: 'Kleefkruid',
    latinName: 'Galium aparine',
    family: 'Sterbladigenfamilie (Rubiaceae)',
    commonNames: ['Kleefkruid'],
    appearance: {
      flowerColor: 'wit',
      flowerShape: 'Kleine witte bloempjes met 4 kroonblaadjes',
      leafShape: 'Smal, in kransen van 6-8 rond de stengel',
      growthForm: 'klimmend',
      maxHeightCm: 120,
      distinguishing: 'Bladeren en stengels bedekt met haakvormige haartjes die aan alles blijven kleven',
      lookAlikes: [],
    },
    habitat: {
      places: ['border', 'moestuin', 'braakliggend', 'vochtig'],
      soilTypes: ['klei', 'humus', 'voedselrijk'],
      activeMonths: [3, 4, 5, 6, 7, 8, 9],
      bloomMonths: [5, 6, 7, 8],
      sunPreference: 'halfschaduw',
    },
    removal: {
      rootType: 'oppervlakkig',
      reproducesVia: ['zaad'],
      removalMethod: 'Handmatig uittrekken; door de haakjes makkelijk in één beweging te verwijderen',
      removalDifficulty: 'makkelijk',
      urgency: 'hoog',
      removalTip: 'Verwijderen vóór zaadvorming in juli; zaadjes blijven maandenlang kiemkrachtig en verspreiden zich via dieren',
      prevention: 'Borders dicht beplanten; in moestuin regelmatig schoffelen',
    },
    edible: true,
    edibleNote: 'Jonge toppen in soep of thee; zaden kunnen geroosterd worden als koffievervanger',
    interesting: 'De haakjes op de vruchtjes waren de inspiratie voor klittenband (Velcro)',
    nativeToNL: true,
  },
  {
    id: 'herderstasje',
    dutchName: 'Herderstasje',
    latinName: 'Capsella bursa-pastoris',
    family: 'Kruisbloemenfamilie (Brassicaceae)',
    commonNames: ['Lepelblad', 'Beursje'],
    appearance: {
      flowerColor: 'wit',
      flowerShape: 'Kleine witte bloempjes in trosjes bovenaan de stengel',
      leafShape: 'Rozet onderaan: veervormig gelobd; stengelbladen: pijlvormig, stengelomvattend',
      growthForm: 'rozettend',
      maxHeightCm: 40,
      distinguishing: 'Hartvormige driehoekige zaadbuisjes (de "tasjes"); rozet los van stengel',
      lookAlikes: [],
    },
    habitat: {
      places: ['moestuin', 'tegels', 'braakliggend', 'border'],
      soilTypes: ['klei', 'zand', 'voedselrijk'],
      activeMonths: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12],
      bloomMonths: [3, 4, 5, 6, 7, 8, 9, 10],
      sunPreference: 'zon',
    },
    removal: {
      rootType: 'penwortel',
      reproducesVia: ['zaad'],
      removalMethod: 'Uitsteken of handmatig uittrekken; penwortel is dun en breekt makkelijk',
      removalDifficulty: 'makkelijk',
      urgency: 'hoog',
      removalTip: 'Bloeit en zaait het hele jaar door; blijf consequent verwijderen',
      prevention: 'Bodem in moestuin bedekt houden; mulchen in winter',
    },
    edible: true,
    edibleNote: 'Jong blad in salades of gekookt; zaadbuisjes rauw als pittige snack; smaakt naar mosterd',
    interesting: 'Zaadbuisjes lijken op de tas die herders vroeger droegen (bursa pastoris = herderstas)',
    nativeToNL: true,
  },
  {
    id: 'klein-hoefblad',
    dutchName: 'Klein hoefblad',
    latinName: 'Tussilago farfara',
    family: 'Composietenfamilie (Asteraceae)',
    commonNames: ['Hoefblad'],
    appearance: {
      flowerColor: 'geel',
      flowerShape: 'Geel bloemhoofdje op schubbige steel; lijkt op kleine paardenbloem',
      leafShape: 'Groot, rond tot hartvormig, hoefvormig; verschijnt NA de bloei',
      growthForm: 'staand',
      maxHeightCm: 25,
      distinguishing: 'Bloeit op kale stengels ver vóór de bladeren verschijnen; bladeren lijken op paardenhoef',
      lookAlikes: ['paardenbloem'],
    },
    habitat: {
      places: ['braakliggend', 'border', 'tegels', 'vochtig'],
      soilTypes: ['klei', 'arm'],
      activeMonths: [3, 4, 5, 6, 7, 8, 9],
      bloomMonths: [3, 4],
      sunPreference: 'zon',
    },
    removal: {
      rootType: 'wortelstokken',
      reproducesVia: ['wortelstokken', 'zaad'],
      removalMethod: 'Uitgraven met alle wortelstokken; herhaaldelijk uittrekken om uit te putten',
      removalDifficulty: 'moeilijk',
      urgency: 'gemiddeld',
      removalTip: 'Wortelstokken kunnen meters ver uitlopen; graaf de hele kolonie uit',
      prevention: 'Bodembedekking en concurrentie van andere planten; kale grond vermijden',
    },
    edible: true,
    edibleNote: 'Jonge bloemen en bladeren voor thee (hoestthee); in kleine hoeveelheden gebruiken',
    interesting: 'Al sinds de Oudheid gebruikt als hoestmiddel; de Latijnse naam tussilago betekent "hoestverdrijver"',
    nativeToNL: true,
  },
  {
    id: 'melganzenvoet',
    dutchName: 'Melganzenvoet',
    latinName: 'Chenopodium album',
    family: 'Amarantenfamilie (Amaranthaceae)',
    commonNames: ['Wilde spinazie'],
    appearance: {
      flowerColor: 'groen',
      flowerShape: 'Groene bloempjes in dichte pluimen; weinig opvallend',
      leafShape: 'Ruitvormig tot lancetvormig, meelachtig wit bestoven',
      growthForm: 'staand',
      maxHeightCm: 150,
      distinguishing: 'Meelachtige witte bestuiving op bladeren (vooral jong); rechtopgaande groei tot manshoog',
      lookAlikes: [],
    },
    habitat: {
      places: ['moestuin', 'braakliggend', 'border'],
      soilTypes: ['klei', 'zand', 'voedselrijk'],
      activeMonths: [5, 6, 7, 8, 9, 10],
      bloomMonths: [7, 8, 9],
      sunPreference: 'zon',
    },
    removal: {
      rootType: 'penwortel',
      reproducesVia: ['zaad'],
      removalMethod: 'Uittrekken of schoffelen vóór zaadvorming; jonge planten makkelijk te verwijderen',
      removalDifficulty: 'makkelijk',
      urgency: 'hoog',
      removalTip: 'Eén plant produceert tot 100.000 zaden; verwijder zodra je ze ziet',
      prevention: 'Moestuin niet kaal laten liggen in winter; groenbemester zaaien',
    },
    edible: true,
    edibleNote: 'Jong blad en toppen koken als spinazie; zaden eetbaar (vergelijkbaar met quinoa)',
    interesting: 'Nauwe verwant van quinoa; werd in Nederland tot de 19e eeuw als groente verbouwd',
    nativeToNL: true,
  },
  {
    id: 'perzikkruid',
    dutchName: 'Perzikkruid',
    latinName: 'Persicaria maculosa',
    family: 'Duizendknoopfamilie (Polygonaceae)',
    commonNames: ['Wilgenblad', 'Roodbil'],
    appearance: {
      flowerColor: 'roze',
      flowerShape: 'Dichte roze bloemaren',
      leafShape: 'Lancetvormig, vaak met donkere vlek in het midden',
      growthForm: 'staand',
      maxHeightCm: 80,
      distinguishing: 'Donkere vlek op de bladeren; roze bloemaren; rode stengelknopen',
      lookAlikes: [],
    },
    habitat: {
      places: ['moestuin', 'border', 'braakliggend', 'vochtig'],
      soilTypes: ['klei', 'humus', 'voedselrijk'],
      activeMonths: [5, 6, 7, 8, 9, 10],
      bloomMonths: [7, 8, 9],
      sunPreference: 'halfschaduw',
    },
    removal: {
      rootType: 'oppervlakkig',
      reproducesVia: ['zaad'],
      removalMethod: 'Handmatig uittrekken of schoffelen; ondiep wortelend',
      removalDifficulty: 'makkelijk',
      urgency: 'gemiddeld',
      removalTip: 'Zaden blijven lang kiemkrachtig; consequent verwijderen gedurende het seizoen',
      prevention: 'Mulchlaag aanbrengen; concurrentie van dichte beplanting',
    },
    edible: false,
    edibleNote: null,
    interesting: 'De donkere bladvlek is een natuurlijk merkteken — vandaar de alternatieve naam "roodbil"',
    nativeToNL: true,
  },
  {
    id: 'gekroesde-melkdistel',
    dutchName: 'Gekroesde melkdistel',
    latinName: 'Sonchus asper',
    family: 'Composietenfamilie (Asteraceae)',
    commonNames: ['Melkdistel'],
    appearance: {
      flowerColor: 'geel',
      flowerShape: 'Gele bloemhoofdjes in losse tuilen',
      leafShape: 'Stijf, donkergroen, stekelig getand, stengelomvattend met afgeronde oortjes',
      growthForm: 'staand',
      maxHeightCm: 90,
      distinguishing: 'Stekelige bladranden (gekroesd); wit melksap bij breken; bladeren omvatten de stengel',
      lookAlikes: ['gewone-melkdistel'],
    },
    habitat: {
      places: ['moestuin', 'border', 'braakliggend'],
      soilTypes: ['klei', 'zand', 'voedselrijk'],
      activeMonths: [4, 5, 6, 7, 8, 9, 10],
      bloomMonths: [6, 7, 8, 9],
      sunPreference: 'zon',
    },
    removal: {
      rootType: 'penwortel',
      reproducesVia: ['zaad'],
      removalMethod: 'Uitsteken met onkruidsteker; penwortel volledig verwijderen',
      removalDifficulty: 'gemiddeld',
      urgency: 'gemiddeld',
      removalTip: 'Verwijderen vóór bloei; de pluizige zaden verspreiden zich snel',
      prevention: 'Regelmatig schoffelen in moestuin; mulch in borders',
    },
    edible: true,
    edibleNote: 'Jong blad in salades of gekookt; smaakt iets bitter',
    interesting: 'Het melksap werd traditioneel gebruikt tegen wratten; konijnen en cavia\'s zijn dol op het blad',
    nativeToNL: true,
  },
  {
    id: 'tuinwolfsmelk',
    dutchName: 'Tuinwolfsmelk',
    latinName: 'Euphorbia peplus',
    family: 'Wolfsmelkfamilie (Euphorbiaceae)',
    commonNames: ['Wolfsmelk'],
    appearance: {
      flowerColor: 'groen',
      flowerShape: 'Kleine groene schijnbloemen (cyathia) met halvemaanvormige klieren',
      leafShape: 'Klein, ovaal, gaafrandig, zachtgroen',
      growthForm: 'staand',
      maxHeightCm: 30,
      distinguishing: 'Wit melksap bij breken; kleine groene bloempjes met opvallende gele klieren',
      lookAlikes: [],
    },
    habitat: {
      places: ['moestuin', 'tegels', 'border'],
      soilTypes: ['klei', 'zand', 'voedselrijk'],
      activeMonths: [4, 5, 6, 7, 8, 9, 10],
      bloomMonths: [6, 7, 8, 9],
      sunPreference: 'halfschaduw',
    },
    removal: {
      rootType: 'penwortel',
      reproducesVia: ['zaad'],
      removalMethod: 'Handmatig uittrekken; ondiep wortelend; handschoenen dragen tegen melksap',
      removalDifficulty: 'makkelijk',
      urgency: 'gemiddeld',
      removalTip: 'Zaait snel uit maar is klein en makkelijk te verwijderen; melksap kan huid irriteren',
      prevention: 'Mulchen; regelmatig wieden voordat zaad rijpt',
    },
    edible: false,
    edibleNote: null,
    interesting: 'Het melksap wordt in de volksgeneeskunde gebruikt tegen huidkanker; bevat diterpeenesters die huid irriteren',
    nativeToNL: true,
  },
  {
    id: 'hondsdraf',
    dutchName: 'Hondsdraf',
    latinName: 'Glechoma hederacea',
    family: 'Lipbloemenfamilie (Lamiaceae)',
    commonNames: ['Aardveil'],
    appearance: {
      flowerColor: 'paars',
      flowerShape: 'Paarsblauwe lipbloempjes met donkere vlekjes op de onderlip',
      leafShape: 'Rond tot niervormig, gekarteld, tegenoverstaand',
      growthForm: 'kruipend',
      maxHeightCm: 15,
      distinguishing: 'Kruipt over de grond en vormt dichte tapijten; blauwpaarse lipbloempjes; blad ruikt aromatisch bij kneuzen',
      lookAlikes: ['paarse-dovenetel'],
    },
    habitat: {
      places: ['gazon', 'border', 'vochtig', 'tegels'],
      soilTypes: ['klei', 'humus', 'voedselrijk'],
      activeMonths: [3, 4, 5, 6, 7, 8, 9, 10],
      bloomMonths: [4, 5, 6],
      sunPreference: 'halfschaduw',
    },
    removal: {
      rootType: 'oppervlakkig',
      reproducesVia: ['uitlopers', 'zaad'],
      removalMethod: 'Handmatig uittrekken of harken; kruipstengels volgen en volledig verwijderen',
      removalDifficulty: 'gemiddeld',
      urgency: 'gemiddeld',
      removalTip: 'Vormt dichte matten die ander laagblijvend spul verstikken; grondig verwijderen',
      prevention: 'Gazon niet te kort maaien; hoger gras verdringt hondsdraf',
    },
    edible: true,
    edibleNote: 'Jong blad in salades of soep; licht muntachtig van smaak; ook voor thee',
    interesting: 'Werd vroeger gebruikt om bier op smaak te brengen vóór de introductie van hop',
    nativeToNL: true,
  },
]
```

- [ ] **Step 2: Verify the file compiles**

```bash
cd groei/frontend && npx tsc --noEmit --strict src/data/weeds-dataset.ts
```
Expected: No errors.

- [ ] **Step 3: Commit**

```bash
git add groei/frontend/src/data/weeds-dataset.ts
git commit -m "feat: add border and vegetable garden weeds"
```

### Task 3: Add invasive spreaders and remaining weeds

**Files:**
- Modify: `groei/frontend/src/data/weeds-dataset.ts` — append ~16 entries before closing `];`

- [ ] **Step 1: Append invasive spreaders and remaining weeds**

Insert before the `];` at end of file:

```typescript
  // ── WOEKERAARS (invasive spreaders) ──────────────────────────────────────

  {
    id: 'haagwinde',
    dutchName: 'Haagwinde',
    latinName: 'Convolvulus sepium',
    family: 'Windefamilie (Convolvulaceae)',
    commonNames: ['Pispotjes', 'Windeklimmer'],
    appearance: {
      flowerColor: 'wit',
      flowerShape: 'Grote witte trechtervormige bloemen (5-7 cm)',
      leafShape: 'Pijlvormig, groot, heldergroen',
      growthForm: 'klimmend',
      maxHeightCm: 300,
      distinguishing: 'Grote zuiver witte trechterbloemen; rechtswindend; enorme ondergrondse wortelstokken',
      lookAlikes: ['akkerwinde'],
    },
    habitat: {
      places: ['border', 'moestuin', 'braakliggend', 'vochtig'],
      soilTypes: ['klei', 'humus', 'voedselrijk'],
      activeMonths: [5, 6, 7, 8, 9],
      bloomMonths: [7, 8, 9],
      sunPreference: 'halfschaduw',
    },
    removal: {
      rootType: 'wortelstokken',
      reproducesVia: ['wortelstokken', 'zaad'],
      removalMethod: 'Bovengronds herhaaldelijk uittrekken om wortelstokken uit te putten; niet schoffelen',
      removalDifficulty: 'moeilijk',
      urgency: 'hoog',
      removalTip: 'Wortelstokken kunnen meters ver lopen en brokstukken van 2 cm lopen opnieuw uit; uitputten duurt jaren',
      prevention: 'Planten in een korf plaatsen; niet in de compost gooien',
    },
    edible: false,
    edibleNote: null,
    interesting: 'Een van de hardnekkigste invasieve soorten in tuinen; kan planten volledig overwoekeren en verstikken',
    nativeToNL: true,
  },
  {
    id: 'akkerwinde',
    dutchName: 'Akkerwinde',
    latinName: 'Convolvulus arvensis',
    family: 'Windefamilie (Convolvulaceae)',
    commonNames: ['Kleine winde', 'Akkerklokje'],
    appearance: {
      flowerColor: 'roze',
      flowerShape: 'Roze-witte trechtervormige bloemen (2-3 cm)',
      leafShape: 'Pijlvormig, klein, dofgroen',
      growthForm: 'klimmend',
      maxHeightCm: 150,
      distinguishing: 'Kleinere bloemen dan haagwinde; roze gestreept; bloemen geuren naar amandel',
      lookAlikes: ['haagwinde'],
    },
    habitat: {
      places: ['moestuin', 'border', 'braakliggend', 'tegels'],
      soilTypes: ['klei', 'zand', 'voedselrijk'],
      activeMonths: [5, 6, 7, 8, 9],
      bloomMonths: [6, 7, 8],
      sunPreference: 'zon',
    },
    removal: {
      rootType: 'wortelstokken',
      reproducesVia: ['wortelstokken', 'zaad'],
      removalMethod: 'Herhaaldelijk uittrekken; elke 2 weken bovengronds verwijderen om uit te putten',
      removalDifficulty: 'moeilijk',
      urgency: 'hoog',
      removalTip: 'Wortelstokken tot 5 meter diep; alleen consequent bovengronds verwijderen werkt',
      prevention: 'Geen kale grond; dichte beplanting; zaadproductie voorkomen',
    },
    edible: false,
    edibleNote: null,
    interesting: 'Ondergrondse wortelstokken kunnen 5 meter diep reiken; een van de moeilijkst te bestrijden onkruiden',
    nativeToNL: true,
  },
  {
    id: 'akkerdistel',
    dutchName: 'Akkerdistel',
    latinName: 'Cirsium arvense',
    family: 'Composietenfamilie (Asteraceae)',
    commonNames: ['Distel', 'Boerenplaag'],
    appearance: {
      flowerColor: 'paars',
      flowerShape: 'Lila-paarse bloemhoofdjes in vertakte tuilen',
      leafShape: 'Langwerpig, stekelig getand, golvend',
      growthForm: 'staand',
      maxHeightCm: 120,
      distinguishing: 'Stekelige bladranden; lila-paarse bloemen; enorme ondergrondse uitlopers',
      lookAlikes: ['speerdistel'],
    },
    habitat: {
      places: ['moestuin', 'border', 'braakliggend'],
      soilTypes: ['klei', 'zand', 'voedselrijk'],
      activeMonths: [4, 5, 6, 7, 8, 9, 10],
      bloomMonths: [7, 8, 9],
      sunPreference: 'zon',
    },
    removal: {
      rootType: 'wortelstokken',
      reproducesVia: ['wortelstokken', 'wortelfragmenten', 'zaad'],
      removalMethod: 'Herhaaldelijk afsteken onder de grond; niet schoffelen (verspreidt fragmenten)',
      removalDifficulty: 'moeilijk',
      urgency: 'hoog',
      removalTip: 'Elk wortelfragment van 1 cm kan een nieuwe plant vormen; één plant kan 40.000 zaden produceren',
      prevention: 'Afdekken met zwart plastic voor een heel groeiseizoen; anders jarenlang consequent verwijderen',
    },
    edible: true,
    edibleNote: 'Jonge stengels schillen en rauw eten; bloemen voor siroop; wortels gekookt',
    interesting: 'Mannelijke en vrouwelijke bloemen groeien op aparte planten; zaadpluis kan kilometers ver dragen',
    nativeToNL: true,
  },
  {
    id: 'ridderzuring',
    dutchName: 'Ridderzuring',
    latinName: 'Rumex obtusifolius',
    family: 'Duizendknoopfamilie (Polygonaceae)',
    commonNames: ['Zurkel', 'Paardenzuring'],
    appearance: {
      flowerColor: 'groen',
      flowerShape: 'Groene bloempjes in hoge, dichte pluimen; later roodbruin',
      leafShape: 'Zeer groot, ovaal tot langwerpig, met hartvormige voet',
      growthForm: 'staand',
      maxHeightCm: 120,
      distinguishing: 'Enorme bladeren (tot 40 cm); hoge roodbruine zaadpluimen; dikke vlezige penwortel',
      lookAlikes: [],
    },
    habitat: {
      places: ['gazon', 'border', 'vochtig', 'braakliggend'],
      soilTypes: ['klei', 'humus', 'voedselrijk'],
      activeMonths: [4, 5, 6, 7, 8, 9, 10],
      bloomMonths: [6, 7, 8],
      sunPreference: 'halfschaduw',
    },
    removal: {
      rootType: 'penwortel',
      reproducesVia: ['zaad', 'wortelfragmenten'],
      removalMethod: 'Uitgraven met hele penwortel; diep steken want penwortel kan 1 meter+ reiken',
      removalDifficulty: 'moeilijk',
      urgency: 'hoog',
      removalTip: 'Verwijderen vóór zaadvorming; één plant produceert 60.000 zaden die 50 jaar kiemkrachtig blijven',
      prevention: 'Bekalken; zuring wijst op zure grond; dichte grasmat en niet te vaak maaien',
    },
    edible: true,
    edibleNote: 'Jong blad in kleine hoeveelheden in salades of gekookt; bevat oxaalzuur',
    interesting: 'Het blad bevat looizuur dat helpt tegen brandnetelprikken — groeit vaak in de buurt van brandnetels',
    nativeToNL: true,
  },
  {
    id: 'duizenknoop',
    dutchName: 'Japanse duizendknoop',
    latinName: 'Fallopia japonica',
    family: 'Duizendknoopfamilie (Polygonaceae)',
    commonNames: ['Bamboe (onjuist)'],
    appearance: {
      flowerColor: 'wit',
      flowerShape: 'Witte bloempjes in pluimen in de bladoksels',
      leafShape: 'Groot, breed ovaal, toegespitst, gaafrandig',
      growthForm: 'staand',
      maxHeightCm: 300,
      distinguishing: 'Bamboe-achtige holle stengels; zigzag groeiwijze; enorme polvorming',
      lookAlikes: [],
    },
    habitat: {
      places: ['border', 'braakliggend', 'vochtig'],
      soilTypes: ['klei', 'zand', 'humus'],
      activeMonths: [4, 5, 6, 7, 8, 9, 10],
      bloomMonths: [8, 9],
      sunPreference: 'halfschaduw',
    },
    removal: {
      rootType: 'wortelstokken',
      reproducesVia: ['wortelstokken', 'wortelfragmenten'],
      removalMethod: 'Uitgraven; NIET in compost; professionele bestrijding aanbevolen',
      removalDifficulty: 'moeilijk',
      urgency: 'hoog',
      removalTip: 'Een fragment van 0.7 gram kan een nieuwe plant vormen; meld grote haarden bij de gemeente',
      prevention: 'Professioneel laten verwijderen; worteldoek alleen is onvoldoende',
    },
    edible: true,
    edibleNote: 'Jonge scheuten (tot 20 cm) rauw of gekookt; smaakt naar rabarber met citroen',
    interesting: 'Staat in de top 100 van meest invasieve soorten wereldwijd; breekt door asfalt en funderingen heen',
    nativeToNL: false,
  },
  {
    id: 'speerdistel',
    dutchName: 'Speerdistel',
    latinName: 'Cirsium vulgare',
    family: 'Composietenfamilie (Asteraceae)',
    commonNames: ['Wegdistel'],
    appearance: {
      flowerColor: 'paars',
      flowerShape: 'Grote paarse bloemhoofdjes met stekelige omwindselblaadjes',
      leafShape: 'Langwerpig, diep ingesneden, zeer stekelig',
      growthForm: 'staand',
      maxHeightCm: 150,
      distinguishing: 'Zeer stekelig van top tot teen; grote paarse bloemen; tweejarig (eerst rozet, dan bloeistengel)',
      lookAlikes: ['akkerdistel'],
    },
    habitat: {
      places: ['braakliggend', 'border', 'moestuin'],
      soilTypes: ['klei', 'zand', 'voedselrijk'],
      activeMonths: [4, 5, 6, 7, 8, 9],
      bloomMonths: [7, 8, 9],
      sunPreference: 'zon',
    },
    removal: {
      rootType: 'penwortel',
      reproducesVia: ['zaad'],
      removalMethod: 'Uitsteken met onkruidsteker in rozetstadium; handschoenen vereist',
      removalDifficulty: 'gemiddeld',
      urgency: 'gemiddeld',
      removalTip: 'Verwijderen in het eerste jaar (rozetstadium) is veel makkelijker dan in het tweede jaar',
      prevention: 'In rozetstadium verwijderen vóór de bloeistengel zich ontwikkelt',
    },
    edible: true,
    edibleNote: 'Jonge bladeren (stekels verwijderen!) gekookt; bloembodem eetbaar als artisjok-achtig',
    interesting: 'Distelvinken zijn gespecialiseerd in het eten van distelzaden; de zaadpluizen worden gebruikt als nestmateriaal',
    nativeToNL: true,
  },
  {
    id: 'gewone-melkdistel',
    dutchName: 'Gewone melkdistel',
    latinName: 'Sonchus oleraceus',
    family: 'Composietenfamilie (Asteraceae)',
    commonNames: ['Hazenmelk'],
    appearance: {
      flowerColor: 'geel',
      flowerShape: 'Lichtgele bloemhoofdjes in losse tuilen',
      leafShape: 'Diep ingesneden, zacht, blauwgroen, met stengelomvattende spitse oortjes',
      growthForm: 'staand',
      maxHeightCm: 100,
      distinguishing: 'Zachte, niet-stekelige bladeren met wit melksap; bladeren omvatten de stengel met spitse slippen',
      lookAlikes: ['gekroesde-melkdistel'],
    },
    habitat: {
      places: ['moestuin', 'braakliggend', 'border'],
      soilTypes: ['klei', 'zand', 'voedselrijk'],
      activeMonths: [4, 5, 6, 7, 8, 9, 10],
      bloomMonths: [6, 7, 8, 9],
      sunPreference: 'zon',
    },
    removal: {
      rootType: 'penwortel',
      reproducesVia: ['zaad'],
      removalMethod: 'Uitsteken of schoffelen vóór bloei; jonge planten makkelijk te verwijderen',
      removalDifficulty: 'makkelijk',
      urgency: 'gemiddeld',
      removalTip: 'Zaait massaal uit als je hem laat bloeien; een plant produceert duizenden pluiszaden',
      prevention: 'Regelmatig schoffelen; mulch aanbrengen in moestuin',
    },
    edible: true,
    edibleNote: 'Jong blad in salades (licht bitter); gekookt als spinazie; konijnenvoer bij uitstek',
    interesting: 'Een van de meest algemene akkeronkruiden ter wereld; zaden blijven jaren kiemkrachtig',
    nativeToNL: true,
  },

  // ── OVERIGE (remaining common weeds) ─────────────────────────────────────

  {
    id: 'bijvoet',
    dutchName: 'Bijvoet',
    latinName: 'Artemisia vulgaris',
    family: 'Composietenfamilie (Asteraceae)',
    commonNames: ['Wilde alsem'],
    appearance: {
      flowerColor: 'bruin',
      flowerShape: 'Kleine roodbruine bloemhoofdjes in dichte pluimen',
      leafShape: 'Diep ingesneden, veervormig; bovenzijde donkergroen, onderzijde witviltig',
      growthForm: 'staand',
      maxHeightCm: 150,
      distinguishing: 'Witviltige onderzijde van bladeren; aromatische geur bij kneuzen; roodbruine stengels',
      lookAlikes: [],
    },
    habitat: {
      places: ['braakliggend', 'border', 'tegels'],
      soilTypes: ['klei', 'zand', 'voedselrijk'],
      activeMonths: [4, 5, 6, 7, 8, 9, 10],
      bloomMonths: [7, 8, 9],
      sunPreference: 'zon',
    },
    removal: {
      rootType: 'vezelig',
      reproducesVia: ['zaad', 'wortelstokken'],
      removalMethod: 'Uitsteken of uittrekken; wortelstokken verwijderen',
      removalDifficulty: 'gemiddeld',
      urgency: 'gemiddeld',
      removalTip: 'Kan flinke pollen vormen; verwijder hele plant inclusief wortelstokken',
      prevention: 'Kale grond vermijden; concurrentie van hogere planten beperkt bijvoet',
    },
    edible: true,
    edibleNote: 'Jong blad als kruid bij vette gerechten (eendenborst, gans); smaakt bitter-aromatisch',
    interesting: 'Traditioneel gebruikt in moxibustie (Chinese geneeskunde); één van de bitterste inheemse kruiden',
    nativeToNL: true,
  },
  {
    id: 'duizendblad',
    dutchName: 'Gewoon duizendblad',
    latinName: 'Achillea millefolium',
    family: 'Composietenfamilie (Asteraceae)',
    commonNames: ['Duizendblad', 'Wondkruid'],
    appearance: {
      flowerColor: 'wit',
      flowerShape: 'Platte witte schermen van kleine bloemhoofdjes',
      leafShape: 'Zeer fijn verdeeld, veervormig, varenachtig',
      growthForm: 'staand',
      maxHeightCm: 60,
      distinguishing: 'Fijn verdeelde varenachtige bladeren; platte witte bloemschermen; aromatisch',
      lookAlikes: [],
    },
    habitat: {
      places: ['gazon', 'border', 'braakliggend', 'tegels'],
      soilTypes: ['klei', 'zand', 'arm'],
      activeMonths: [3, 4, 5, 6, 7, 8, 9, 10],
      bloomMonths: [6, 7, 8, 9],
      sunPreference: 'zon',
    },
    removal: {
      rootType: 'wortelstokken',
      reproducesVia: ['wortelstokken', 'zaad'],
      removalMethod: 'Uitsteken met onkruidsteker; alle wortelstokken verwijderen',
      removalDifficulty: 'gemiddeld',
      urgency: 'laag',
      removalTip: 'In gazon verdwijnt duizendblad door regelmatig maaien; in border is het een mooie inheemse plant',
      prevention: 'Gazon regelmatig maaien en bemesten; concurrentie in borders',
    },
    edible: true,
    edibleNote: 'Jong blad en bloemen in salades of thee; bitter-aromatisch',
    interesting: 'Al sinds de prehistorie gebruikt als wondkruid; Achilles gebruikte het volgens de mythe om wonden te helen',
    nativeToNL: true,
  },
  {
    id: 'canadese-fijnstraal',
    dutchName: 'Canadese fijnstraal',
    latinName: 'Conyza canadensis',
    family: 'Composietenfamilie (Asteraceae)',
    commonNames: ['Canadese fijnstraal'],
    appearance: {
      flowerColor: 'wit',
      flowerShape: 'Kleine wit-gele bloemhoofdjes in lange pluimen',
      leafShape: 'Smal, lancetvormig, behaard',
      growthForm: 'staand',
      maxHeightCm: 120,
      distinguishing: 'Lange rechte stengel met vele kleine bloempjes; pluizige zaadhoofdjes; groeit overal in de stad',
      lookAlikes: [],
    },
    habitat: {
      places: ['tegels', 'braakliggend', 'border', 'moestuin'],
      soilTypes: ['zand', 'arm'],
      activeMonths: [5, 6, 7, 8, 9, 10],
      bloomMonths: [7, 8, 9, 10],
      sunPreference: 'zon',
    },
    removal: {
      rootType: 'vezelig',
      reproducesVia: ['zaad'],
      removalMethod: 'Handmatig uittrekken; heel makkelijk verwijderbaar',
      removalDifficulty: 'makkelijk',
      urgency: 'hoog',
      removalTip: 'Eén plant produceert tot 250.000 pluiszaden; verwijderen zodra je ze ziet',
      prevention: 'Voegen tussen tegels dicht houden; kale grond vermijden',
    },
    edible: false,
    edibleNote: null,
    interesting: 'Oorspronkelijk uit Noord-Amerika; een van de meest voorkomende stedelijke pioniersplanten in Nederland',
    nativeToNL: false,
  },
  {
    id: 'look-zonder-look',
    dutchName: 'Look-zonder-look',
    latinName: 'Alliaria petiolata',
    family: 'Kruisbloemenfamilie (Brassicaceae)',
    commonNames: ['Knoflookkruid'],
    appearance: {
      flowerColor: 'wit',
      flowerShape: 'Kleine witte bloempjes in eindstandige trossen',
      leafShape: 'Hartvormig tot rond, gekarteld, heldergroen; blad ruikt naar knoflook bij kneuzen',
      growthForm: 'staand',
      maxHeightCm: 100,
      distinguishing: 'Bladeren ruiken sterk naar knoflook bij kneuzen; witte bloemen met 4 kroonblaadjes',
      lookAlikes: [],
    },
    habitat: {
      places: ['border', 'vochtig', 'braakliggend'],
      soilTypes: ['klei', 'humus', 'voedselrijk'],
      activeMonths: [3, 4, 5, 6, 7],
      bloomMonths: [4, 5, 6],
      sunPreference: 'halfschaduw',
    },
    removal: {
      rootType: 'penwortel',
      reproducesVia: ['zaad'],
      removalMethod: 'Uittrekken vóór zaadvorming; tweejarig dus verwijder voor het tweede jaar',
      removalDifficulty: 'makkelijk',
      urgency: 'gemiddeld',
      removalTip: 'In het eerste jaar zit de plant als rozet dicht bij de grond; dan makkelijk te verwijderen',
      prevention: 'Verwijderen vóór de zaden rijpen; zaden blijven meerdere jaren kiemkrachtig',
    },
    edible: true,
    edibleNote: 'Bladeren als knoflookvervanger in salades, pesto of soep; zaden pittig als mosterdzaad',
    interesting: 'Waardplant voor het oranjetipje, een van de mooiste voorjaarsvlinders; de rupsen eten de zaaddozen',
    nativeToNL: true,
  },
  {
    id: 'fluitenkruid',
    dutchName: 'Fluitenkruid',
    latinName: 'Anthriscus sylvestris',
    family: 'Schermbloemenfamilie (Apiaceae)',
    commonNames: ['Fluitekruid'],
    appearance: {
      flowerColor: 'wit',
      flowerShape: 'Grote witte schermen van kleine bloempjes',
      leafShape: 'Drie- tot viervoudig geveerd, fijn, varenachtig',
      growthForm: 'staand',
      maxHeightCm: 120,
      distinguishing: 'Holle stengel (waar je op kunt fluiten); witte schermbloemen; bloeit massaal in bermen',
      lookAlikes: ['zevenblad'],
    },
    habitat: {
      places: ['border', 'braakliggend', 'vochtig', 'moestuin'],
      soilTypes: ['klei', 'humus', 'voedselrijk'],
      activeMonths: [3, 4, 5, 6, 7],
      bloomMonths: [4, 5, 6],
      sunPreference: 'halfschaduw',
    },
    removal: {
      rootType: 'penwortel',
      reproducesVia: ['zaad'],
      removalMethod: 'Uitsteken met onkruidsteker; penwortel volledig verwijderen',
      removalDifficulty: 'makkelijk',
      urgency: 'hoog',
      removalTip: 'Verwijderen vóór zaadvorming in juni; zaait zichzelf massaal uit',
      prevention: 'Niet laten uitzaaien; één plant kan honderden nakomelingen produceren',
    },
    edible: true,
    edibleNote: 'Jong blad en stengels voor salades of soep; bloemschermen voor decoratie; smaakt naar kervel',
    interesting: 'De holle stengels kunnen als fluitje worden gebruikt — vandaar de naam; een van de vroegste schermbloemen in het voorjaar',
    nativeToNL: true,
  },
  {
    id: 'jacobskruiskruid',
    dutchName: 'Jacobskruiskruid',
    latinName: 'Jacobaea vulgaris',
    family: 'Composietenfamilie (Asteraceae)',
    commonNames: ['St. Jacobskruid'],
    appearance: {
      flowerColor: 'geel',
      flowerShape: 'Heldere goudgele bloemhoofdjes in platte tuilen',
      leafShape: 'Diep ingesneden, donkergroen, met eindstandige grotere lob',
      growthForm: 'staand',
      maxHeightCm: 90,
      distinguishing: 'Felle goudgele bloemen in vlakke schermen; tweejarig; bladeren diep ingesneden',
      lookAlikes: [],
    },
    habitat: {
      places: ['braakliggend', 'gazon', 'border', 'tegels'],
      soilTypes: ['zand', 'arm'],
      activeMonths: [4, 5, 6, 7, 8, 9],
      bloomMonths: [7, 8, 9],
      sunPreference: 'zon',
    },
    removal: {
      rootType: 'vezelig',
      reproducesVia: ['zaad'],
      removalMethod: 'Uitsteken met onkruidsteker; handschoenen dragen (giftig)',
      removalDifficulty: 'makkelijk',
      urgency: 'hoog',
      removalTip: 'Verwijderen vóór zaadvorming; giftig voor paarden en vee — niet in hooi',
      prevention: 'Niet laten uitzaaien; op arme zandgrond kan het massaal opslaan',
    },
    edible: false,
    edibleNote: null,
    interesting: 'Bevat pyrrolizidine-alkaloïden die leverschade veroorzaken bij paarden en vee; de zebrarups (St. Jacobsvlinder) is resistent en eet alleen deze plant',
    nativeToNL: true,
  },
  {
    id: 'gewone-raket',
    dutchName: 'Gewone raket',
    latinName: 'Sisymbrium officinale',
    family: 'Kruisbloemenfamilie (Brassicaceae)',
    commonNames: ['Raketkruid'],
    appearance: {
      flowerColor: 'geel',
      flowerShape: 'Kleine lichtgele bloempjes in lange smalle trossen',
      leafShape: 'Diep ingesneden, met grote eindlob; onderste bladeren rozet',
      growthForm: 'staand',
      maxHeightCm: 60,
      distinguishing: 'Lange dunne zaaddozen die tegen de stengel aanliggen; rechtopgaande stijve groeiwijze',
      lookAlikes: [],
    },
    habitat: {
      places: ['tegels', 'braakliggend', 'moestuin'],
      soilTypes: ['zand', 'voedselrijk'],
      activeMonths: [5, 6, 7, 8, 9, 10],
      bloomMonths: [6, 7, 8],
      sunPreference: 'zon',
    },
    removal: {
      rootType: 'penwortel',
      reproducesVia: ['zaad'],
      removalMethod: 'Uittrekken of schoffelen; penwortel breekt soms af maar plant sterft meestal',
      removalDifficulty: 'makkelijk',
      urgency: 'gemiddeld',
      removalTip: 'Vooral in stedelijk gebied talrijk; makkelijk te verwijderen zolang ze niet hebben uitgezaaid',
      prevention: 'Voegen in bestrating dicht houden; regelmatig schoffelen',
    },
    edible: true,
    edibleNote: 'Jong blad en bloemen in salades; smaakt naar mosterd/raket; zaden als mosterdvervanger',
    interesting: 'De plant werd vroeger door straatzangers gebruikt om hun stem te smeren — vandaar de Franse naam "herbe aux chantres"',
    nativeToNL: true,
  },
  {
    id: 'grote-klaproos',
    dutchName: 'Grote klaproos',
    latinName: 'Papaver rhoeas',
    family: 'Papaverfamilie (Papaveraceae)',
    commonNames: ['Papaver', 'Kolbleem'],
    appearance: {
      flowerColor: 'rood',
      flowerShape: 'Grote helderrode bloemen met zwarte vlek aan de basis van de kroonbladen',
      leafShape: 'Veerspletig, behaard',
      growthForm: 'staand',
      maxHeightCm: 70,
      distinguishing: 'Grote knalrode bloemen; zwarte vlek in het hart; behaarde stengels en knoppen',
      lookAlikes: [],
    },
    habitat: {
      places: ['braakliggend', 'border', 'moestuin'],
      soilTypes: ['zand', 'arm', 'voedselrijk'],
      activeMonths: [4, 5, 6, 7],
      bloomMonths: [6, 7],
      sunPreference: 'zon',
    },
    removal: {
      rootType: 'penwortel',
      reproducesVia: ['zaad'],
      removalMethod: 'Handmatig uittrekken; penwortel is dun en breekt makkelijk',
      removalDifficulty: 'makkelijk',
      urgency: 'laag',
      removalTip: 'Eigenlijk geen echte onkruid; velen laten klaprozen bewust staan vanwege de schoonheid',
      prevention: 'Als je ze wilt weren: zaaddozen verwijderen vóór ze opengaan; zaden blijven tientallen jaren kiemkrachtig',
    },
    edible: false,
    edibleNote: null,
    interesting: 'Symbool van de Eerste Wereldoorlog; de zaden kunnen decennialang in de bodem sluimeren tot de grond verstoord wordt',
    nativeToNL: true,
  },
  {
    id: 'zwarte-nachtschade',
    dutchName: 'Zwarte nachtschade',
    latinName: 'Solanum nigrum',
    family: 'Nachtschadefamilie (Solanaceae)',
    commonNames: ['Nachtschade'],
    appearance: {
      flowerColor: 'wit',
      flowerShape: 'Kleine witte stervormige bloempjes met gele meeldraden',
      leafShape: 'Ovaal tot ruitvormig, gaafrandig of ondiep getand',
      growthForm: 'staand',
      maxHeightCm: 60,
      distinguishing: 'Zwarte glanzende besjes na de bloei; witte sterbloempjes met opvallende gele helmhokjes',
      lookAlikes: [],
    },
    habitat: {
      places: ['moestuin', 'braakliggend', 'border'],
      soilTypes: ['klei', 'zand', 'voedselrijk'],
      activeMonths: [6, 7, 8, 9, 10],
      bloomMonths: [7, 8, 9],
      sunPreference: 'zon',
    },
    removal: {
      rootType: 'vezelig',
      reproducesVia: ['zaad'],
      removalMethod: 'Handmatig uittrekken; ondiep wortelend; handschoenen aan (plant is giftig)',
      removalDifficulty: 'makkelijk',
      urgency: 'hoog',
      removalTip: 'Verwijder vóór de bessen rijpen (groen naar zwart); bessen zijn giftig — zeker bij kinderen',
      prevention: 'Regelmatig wieden in moestuin; zaad blijft jaren kiemkrachtig',
    },
    edible: false,
    edibleNote: null,
    interesting: 'Nauwe verwant van tomaat en aardappel; de onrijpe bessen bevatten solanine, een giftige alkaloïde',
    nativeToNL: true,
  },
  {
    id: 'scherpe-boterbloem',
    dutchName: 'Scherpe boterbloem',
    latinName: 'Ranunculus acris',
    family: 'Ranonkelfamilie (Ranunculaceae)',
    commonNames: ['Boterbloem'],
    appearance: {
      flowerColor: 'geel',
      flowerShape: 'Vijf glanzend gele kroonbladen, komvormig',
      leafShape: 'Handvormig diep ingesneden; stengelbladen smaller dan rozetbladen',
      growthForm: 'staand',
      maxHeightCm: 80,
      distinguishing: 'Geen uitlopers (in tegenstelling tot kruipende boterbloem); rechte stengels met bloemen op lange stelen',
      lookAlikes: ['kruipende-boterbloem'],
    },
    habitat: {
      places: ['gazon', 'border', 'vochtig'],
      soilTypes: ['klei', 'humus', 'voedselrijk'],
      activeMonths: [4, 5, 6, 7, 8, 9],
      bloomMonths: [5, 6, 7],
      sunPreference: 'halfschaduw',
    },
    removal: {
      rootType: 'vezelig',
      reproducesVia: ['zaad'],
      removalMethod: 'Uitsteken met onkruidsteker; vezelige wortelkluit meenemen',
      removalDifficulty: 'makkelijk',
      urgency: 'laag',
      removalTip: 'In vochtige weilanden massaal aanwezig; in tuin eenvoudig te verwijderen',
      prevention: 'Bodem verbeteren (drainage); niet te veel beregenen',
    },
    edible: false,
    edibleNote: null,
    interesting: 'De botanische naam acris betekent "scherp" — verwijst naar de scherpe, brandende smaak van het sap',
    nativeToNL: true,
  },
]
```

- [ ] **Step 2: Verify the file compiles**

```bash
cd groei/frontend && npx tsc --noEmit --strict src/data/weeds-dataset.ts
```
Expected: No errors.

- [ ] **Step 3: Commit**

```bash
git add groei/frontend/src/data/weeds-dataset.ts
git commit -m "feat: add invasive spreaders and remaining weeds (40 total)"
```

### Task 4: Final verification and cleanup

**Files:**
- Verify: `groei/frontend/src/data/weeds-dataset.ts`

- [ ] **Step 1: Verify the complete file compiles with no errors**

```bash
cd groei/frontend && npx tsc --noEmit --strict src/data/weeds-dataset.ts
```
Expected: No errors, no warnings.

- [ ] **Step 2: Check for duplicate IDs**

```bash
cd groei/frontend && grep -oP "id: '\K[^']+" src/data/weeds-dataset.ts | sort | uniq -d
```
Expected: No output (no duplicates).

- [ ] **Step 3: Count total weeds**

```bash
cd groei/frontend && grep -c "id: '" src/data/weeds-dataset.ts
```
Expected: 40 (or more, up to 50).

- [ ] **Step 4: Verify the full app still compiles**

```bash
cd groei/frontend && npx tsc --noEmit
```
Expected: No new errors (pre-existing errors in other files are out of scope).

- [ ] **Step 5: Commit any final fixes**

```bash
git add groei/frontend/src/data/weeds-dataset.ts
git commit -m "chore: verify weed dataset compiles and has no duplicates"
```
