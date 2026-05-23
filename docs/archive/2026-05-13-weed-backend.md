# Weed Backend Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Migrate the 40-weed frontend dataset into SQLite tables with API routes for catalog browsing and sighting logging.

**Architecture:** Two new DB tables (`weed_species`, `weed_sightings`) with JSON sub-object columns following the `phenology_json` pattern from `plant_species`. Two new routers (`weed_catalog.py`, `weed_sightings.py`) following the existing FastAPI + aiosqlite patterns. A seed script embeds a Python copy of the weed data (no TS parsing). No frontend changes.

**Tech Stack:** FastAPI + Pydantic + aiosqlite + SQLite

---

## File Map

| Action | File |
|---|---|
| Modify | `groei/backend/database/schema.py` |
| Modify | `groei/backend/models.py` |
| Create | `groei/backend/seed_weed_catalog.py` |
| Create | `groei/backend/routers/weed_catalog.py` |
| Create | `groei/backend/routers/weed_sightings.py` |
| Modify | `groei/backend/main.py` |

---

### Task 1: Add weed tables to schema.py

**Files:**
- Modify: `groei/backend/database/schema.py` (before the closing `"""`)

- [ ] **Step 1: Add CREATE TABLE statements**

Open `groei/backend/database/schema.py`. After the `plant_care_cache` block (line 153) and before the closing `"""`, insert:

```sql
        CREATE TABLE IF NOT EXISTS weed_species (
            id               INTEGER PRIMARY KEY AUTOINCREMENT,
            slug             TEXT UNIQUE NOT NULL,
            common_name_nl   TEXT NOT NULL,
            latin_name       TEXT NOT NULL,
            family           TEXT,
            common_names     TEXT,
            appearance_json  TEXT,
            habitat_json     TEXT,
            removal_json     TEXT,
            edible           BOOLEAN DEFAULT 0,
            edible_note      TEXT,
            interesting      TEXT,
            native_to_nl     BOOLEAN DEFAULT 1,
            created_at       DATETIME DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS weed_sightings (
            id          INTEGER PRIMARY KEY AUTOINCREMENT,
            weed_id     INTEGER NOT NULL REFERENCES weed_species(id),
            map_id      INTEGER NOT NULL REFERENCES maps(id),
            map_x       REAL NOT NULL,
            map_y       REAL NOT NULL,
            notes       TEXT,
            sighted_at  DATE NOT NULL DEFAULT (date('now')),
            created_at  DATETIME DEFAULT CURRENT_TIMESTAMP
        );
```

- [ ] **Step 2: Verify schema applies cleanly**

From `groei/`, restart the backend. It should start without errors, meaning the new tables were created.

```bash
cd groei && npm run dev:backend
```

Expected: backend starts normally, no SQL errors.

- [ ] **Step 3: Commit**

```bash
git add groei/backend/database/schema.py
git commit -m "feat: add weed_species and weed_sightings tables"
```

---

### Task 2: Add weed Pydantic models

**Files:**
- Modify: `groei/backend/models.py` (append at end of file)

- [ ] **Step 1: Add weed models**

Open `groei/backend/models.py`. Append at the end of the file:

```python
# ── Weeds ──

class WeedAppearanceOut(BaseModel):
    flower_color: str
    flower_shape: str
    leaf_shape: str
    growth_form: str
    max_height_cm: int
    distinguishing: str
    look_alikes: list[str] = []


class WeedHabitatOut(BaseModel):
    places: list[str] = []
    soil_types: list[str] = []
    active_months: list[int] = []
    bloom_months: list[int] = []
    sun_preference: str


class WeedRemovalOut(BaseModel):
    root_type: str
    reproduces_via: list[str] = []
    removal_method: str
    removal_difficulty: str
    urgency: str
    removal_tip: str
    prevention: str


class WeedSpeciesOut(BaseModel):
    id: int
    slug: str
    common_name_nl: str
    latin_name: str
    family: str | None = None
    common_names: list[str] = []
    appearance: WeedAppearanceOut | None = None
    habitat: WeedHabitatOut | None = None
    removal: WeedRemovalOut | None = None
    edible: bool = False
    edible_note: str | None = None
    interesting: str | None = None
    native_to_nl: bool = True


class WeedSpeciesListItem(BaseModel):
    id: int
    slug: str
    common_name_nl: str
    latin_name: str
    family: str | None = None
    flower_color: str | None = None
    places: list[str] = []


class WeedSightingCreate(BaseModel):
    weed_id: int
    map_id: int
    map_x: float
    map_y: float
    notes: str | None = None
    sighted_at: str | None = None  # date string


class WeedSightingOut(BaseModel):
    id: int
    weed_id: int
    weed_name: str | None = None
    weed_slug: str | None = None
    latin_name: str | None = None
    removal_difficulty: str | None = None
    map_id: int
    map_x: float
    map_y: float
    notes: str | None = None
    sighted_at: str
    created_at: str | None = None
```

- [ ] **Step 2: Verify models import**

```bash
cd groei/backend && python -c "from models import WeedSpeciesOut, WeedSpeciesListItem, WeedSightingCreate, WeedSightingOut; print('ok')"
```

Expected: `ok`

- [ ] **Step 3: Commit**

```bash
git add groei/backend/models.py
git commit -m "feat: add weed Pydantic models"
```

---

### Task 3: Create seed script for weed catalog

**Files:**
- Create: `groei/backend/seed_weed_catalog.py`

The seed script embeds a Python copy of the weed data derived from the frontend `weeds-dataset.ts`. Each weed's `appearance`, `habitat`, and `removal` sub-objects are serialized as JSON strings, matching the column types in `weed_species`.

- [ ] **Step 1: Create the seed script**

Create `groei/backend/seed_weed_catalog.py`:

```python
"""One-shot seed: reads weed catalog data and inserts into weed_species.

Run once: python seed_weed_catalog.py
Safe to re-run: INSERT OR IGNORE on slug prevents duplicates."""

import asyncio
import json
from database import get_db

WEEDS = [
    {
        "slug": "paardenbloem",
        "common_name_nl": "Paardenbloem",
        "latin_name": "Taraxacum officinale",
        "family": "Composietenfamilie (Asteraceae)",
        "common_names": ["Molssla", "Pisbloem", "Bedzeiker"],
        "appearance": {
            "flower_color": "geel",
            "flower_shape": "Hoofdje van vele lintbloemen, 2-5 cm breed",
            "leaf_shape": "Diep ingesneden, getande bladeren in rozet",
            "growth_form": "rozettend",
            "max_height_cm": 40,
            "distinguishing": "Heldere gele bloem op holle stengel, wit melksap bij breken",
            "look_alikes": ["Gewone biggenkruid", "Herfstpaardenbloem"]
        },
        "habitat": {
            "places": ["gazon", "braakliggend", "border"],
            "soil_types": ["alle", "voedselrijk"],
            "active_months": [3, 4, 5, 6, 7, 8, 9, 10],
            "bloom_months": [4, 5, 6, 9],
            "sun_preference": "all"
        },
        "removal": {
            "root_type": "penwortel",
            "reproduces_via": ["zaad", "wortel"],
            "removal_method": "Uitsteken met penwortelsteker, hele wortel verwijderen",
            "removal_difficulty": "gemiddeld",
            "urgency": "hoog",
            "removal_tip": "Verwijder voor zaadvorming. Elk bloemhoofdje maakt tot 200 zaden.",
            "prevention": "Dichte grasmat onderhouden, kale plekken doorzaaien"
        },
        "edible": True,
        "edible_note": "Jonge bladeren in salades, bloemen voor siroop of wijn, wortel voor koffie-achtige drank",
        "interesting": "De Nederlandse naam komt van 'paard' en 'bloem' — paarden eten ze graag. Eén plant kan tot 5000 zaden per jaar produceren.",
        "native_to_nl": True
    },
    {
        "slug": "brandnetel",
        "common_name_nl": "Grote brandnetel",
        "latin_name": "Urtica dioica",
        "family": "Brandnetelfamilie (Urticaceae)",
        "common_names": ["Netel", "Tingel", "Brandnetel"],
        "appearance": {
            "flower_color": "groen",
            "flower_shape": "Hangende trossen kleine groene bloemen",
            "leaf_shape": "Aan de voet hartvormig, getand, tegenoverstaand",
            "growth_form": "staand",
            "max_height_cm": 150,
            "distinguishing": "Brandharen op stengels en bladeren, vierkantige stengel",
            "look_alikes": ["Kleine brandnetel", "Dovenetel"]
        },
        "habitat": {
            "places": ["border", "moestuin", "braakliggend"],
            "soil_types": ["voedselrijk", "stikstofrijk"],
            "active_months": [3, 4, 5, 6, 7, 8, 9, 10],
            "bloom_months": [6, 7, 8, 9],
            "sun_preference": "halfschaduw"
        },
        "removal": {
            "root_type": "wortelstokken",
            "reproduces_via": ["wortelstokken", "zaad"],
            "removal_method": "Uitgraven met wortelstok, handschoenen dragen",
            "removal_difficulty": "moeilijk",
            "urgency": "hoog",
            "removal_tip": "Elk achtergebleven wortelstukje groeit uit tot nieuwe plant. Herhaald maaien verzwakt de plant.",
            "prevention": "Bodem bedekt houden, regelmatig schoffelen"
        },
        "edible": True,
        "edible_note": "Jonge toppen als spinazie koken, soep, thee. Verliest brandharen bij verhitting.",
        "interesting": "Brandnetels zijn een belangrijke waardplant voor veel vlindersoorten, waaronder dagpauwoog en kleine vos. De brandharen bevatten mierenzuur, histamine en serotonine.",
        "native_to_nl": True
    },
    {
        "slug": "klaver-wit",
        "common_name_nl": "Witte klaver",
        "latin_name": "Trifolium repens",
        "family": "Vlinderbloemfamilie (Fabaceae)",
        "common_names": ["Perzikbladklaver", "Witte klavers"],
        "appearance": {
            "flower_color": "wit",
            "flower_shape": "Bolvormig hoofdje van kleine witte vlinderbloemen, 1.5-2.5 cm",
            "leaf_shape": "Drietallig, eirond met lichte V-vormige tekening",
            "growth_form": "kruipend",
            "max_height_cm": 30,
            "distinguishing": "Kruipende stengels die wortelen op de knopen, witte bloemhoofdjes",
            "look_alikes": ["Rode klaver", "Basterdklaver"]
        },
        "habitat": {
            "places": ["gazon", "braakliggend"],
            "soil_types": ["alle"],
            "active_months": [4, 5, 6, 7, 8, 9, 10],
            "bloom_months": [5, 6, 7, 8, 9],
            "sun_preference": "all"
        },
        "removal": {
            "root_type": "oppervlakkig",
            "reproduces_via": ["zaad", "uitlopers"],
            "removal_method": "Handmatig uittrekken of steken, uitlopers volgen",
            "removal_difficulty": "gemiddeld",
            "urgency": "laag",
            "removal_tip": "Klaver bindt stikstof in de bodem — in kleine hoeveelheden juist gunstig voor het gazon.",
            "prevention": "Dichte grasmat, niet te kort maaien"
        },
        "edible": True,
        "edible_note": "Bloemen en bladeren in salades, bloemen voor thee. Rauw eten matigen vanwege mogelijk gasvorming.",
        "interesting": "Klaver leeft in symbiose met stikstofbindende bacteriën in wortelknolletjes. Vroeger werd klaver bewust in grasland gezaaid als natuurlijke bemesting.",
        "native_to_nl": True
    },
    {
        "slug": "vogelmuur",
        "common_name_nl": "Vogelmuur",
        "latin_name": "Stellaria media",
        "family": "Anjerfamilie (Caryophyllaceae)",
        "common_names": ["Muur", "Mier", "Sterrenmuur"],
        "appearance": {
            "flower_color": "wit",
            "flower_shape": "Kleine stervormige bloempjes, 4-8 mm, vijf diep ingesneden kroonbladen",
            "leaf_shape": "Klein, eirond, puntig, tegenoverstaand",
            "growth_form": "kruipend",
            "max_height_cm": 30,
            "distinguishing": "Eén rij haren op de stengel (wisselt per internodium van kant)",
            "look_alikes": ["Watermuur", "Grasmuur"]
        },
        "habitat": {
            "places": ["moestuin", "border", "braakliggend"],
            "soil_types": ["voedselrijk", "vochtig"],
            "active_months": [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12],
            "bloom_months": [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12],
            "sun_preference": "all"
        },
        "removal": {
            "root_type": "oppervlakkig",
            "reproduces_via": ["zaad"],
            "removal_method": "Handmatig wieden, makkelijk uit te trekken",
            "removal_difficulty": "makkelijk",
            "urgency": "gemiddeld",
            "removal_tip": "Eén plant kan tot 15000 zaden maken en bloeit het hele jaar door. Regelmatig wieden loont.",
            "prevention": "Bodem bedekt houden met mulch of bodembedekkers"
        },
        "edible": True,
        "edible_note": "Jonge scheuten en blaadjes in salades, smaakt zacht als veldsla. Rijk aan vitamine C.",
        "interesting": "Vogelmuur kan in milde winters het hele jaar bloeien. Het is een van de weinige planten die midden in de winter nog vers groen geeft. Kippen en andere vogels zijn er dol op — vandaar de naam.",
        "native_to_nl": True
    },
    {
        "slug": "straatgras",
        "common_name_nl": "Straatgras",
        "latin_name": "Poa annua",
        "family": "Grassenfamilie (Poaceae)",
        "common_names": ["Vogelgras", "Vroegeling"],
        "appearance": {
            "flower_color": "groen",
            "flower_shape": "Losse pluim, 2-7 cm, groene aartjes met wit vliesrandje",
            "leaf_shape": "Smal, lichtgroen, bootvormige top, iets gerimpeld",
            "growth_form": "polvormend",
            "max_height_cm": 30,
            "distinguishing": "Bloeit het hele jaar, kleine polletjes, blad heeft korte dwarsrimpels",
            "look_alikes": ["Veldbeemdgras", "Ruw beemdgras"]
        },
        "habitat": {
            "places": ["tegels", "gazon", "border"],
            "soil_types": ["alle", "verdicht"],
            "active_months": [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12],
            "bloom_months": [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12],
            "sun_preference": "all"
        },
        "removal": {
            "root_type": "vezelig",
            "reproduces_via": ["zaad"],
            "removal_method": "Schoffelen of uittrekken, zaadhoofden weghalen",
            "removal_difficulty": "makkelijk",
            "urgency": "hoog",
            "removal_tip": "Eén plantje kan binnen 6 weken zaad produceren. In voegen tussen tegels met kokend water bestrijden.",
            "prevention": "Voegen tussen tegels vullen met voegmortel of anti-worteldoek"
        },
        "edible": False,
        "edible_note": None,
        "interesting": "Straatgras is wereldwijd een van de meest verspreide plantensoorten — het groeit zelfs op Antarctica bij onderzoeksstations. Een enkele plant kan tot 2000 zaden per seizoen produceren.",
        "native_to_nl": True
    },
    {
        "slug": "kruipende-boterbloem",
        "common_name_nl": "Kruipende boterbloem",
        "latin_name": "Ranunculus repens",
        "family": "Ranonkelfamilie (Ranunculaceae)",
        "common_names": ["Boterbloem", "Kruipende ranonkel"],
        "appearance": {
            "flower_color": "geel",
            "flower_shape": "Vijf glanzende kroonbladen, 2-3 cm breed",
            "leaf_shape": "Drietallig met diep ingesneden, getande deelblaadjes",
            "growth_form": "kruipend",
            "max_height_cm": 50,
            "distinguishing": "Glanzende gele bloemen, kruipende bovengrondse uitlopers die wortelen",
            "look_alikes": ["Scherpe boterbloem", "Knolboterbloem"]
        },
        "habitat": {
            "places": ["gazon", "border", "vochtig"],
            "soil_types": ["vochtig", "klei"],
            "active_months": [4, 5, 6, 7, 8, 9],
            "bloom_months": [5, 6, 7, 8],
            "sun_preference": "halfschaduw"
        },
        "removal": {
            "root_type": "oppervlakkig",
            "reproduces_via": ["uitlopers", "zaad"],
            "removal_method": "Uitsteken met wortel en uitlopers, vork gebruiken",
            "removal_difficulty": "gemiddeld",
            "urgency": "gemiddeld",
            "removal_tip": "Volg alle uitlopers — elk losgeraakt stukje kan wortelen. In vochtige grond makkelijker te verwijderen.",
            "prevention": "Drainage verbeteren, te vochtige plekken aanpakken"
        },
        "edible": False,
        "edible_note": "Alle delen giftig — bevat ranunculine dat bij beschadiging omzet in blaren-trekkend protoanemonine",
        "interesting": "De bloemen lijken te glanzen door een speciale cellaag onder de opperhuid die licht reflecteert — dit helpt om insecten aan te trekken. De plant heeft deze eigenschap al minstens 30 miljoen jaar.",
        "native_to_nl": True
    },
    {
        "slug": "heermoes",
        "common_name_nl": "Heermoes",
        "latin_name": "Equisetum arvense",
        "family": "Paardenstaartfamilie (Equisetaceae)",
        "common_names": ["Paardenstaart", "Akkermoes", "Kattenstaart", "Unjer"],
        "appearance": {
            "flower_color": "groen",
            "flower_shape": "Geen bloemen — sporenaren (bruine kegelvormige aar) in voorjaar",
            "leaf_shape": "Gereduceerd tot tandjes rond de knopen, groene zijtakjes in kransen",
            "growth_form": "staand",
            "max_height_cm": 80,
            "distinguishing": "Lidmatig opgebouwde stengels, bruine sporenstengel in april, groene steriele stengels erna",
            "look_alikes": ["Moeraspaardenstaart", "Reuzenpaardenstaart"]
        },
        "habitat": {
            "places": ["border", "moestuin", "braakliggend"],
            "soil_types": ["voedselarm", "zand", "verdicht"],
            "active_months": [4, 5, 6, 7, 8, 9],
            "bloom_months": [],
            "sun_preference": "all"
        },
        "removal": {
            "root_type": "wortelstokken",
            "reproduces_via": ["wortelstokken", "sporen"],
            "removal_method": "Herhaald uittrekken over meerdere seizoenen, niet spitten (verspreidt wortelstokken)",
            "removal_difficulty": "moeilijk",
            "urgency": "hoog",
            "removal_tip": "Wortelstokken kunnen 2 meter diep zitten. Kalk toevoegen helpt. Nooit in de compost gooien.",
            "prevention": "Kalk strooien, drainage verbeteren, nooit grond met heermoeswortels verspreiden"
        },
        "edible": False,
        "edible_note": "Jonge sporenstengels waren historisch eetbaar maar niet aanbevolen wegens thiaminasegehalte",
        "interesting": "Heermoes is een levend fossiel — de familie bestaat al 300 miljoen jaar en was dominant in het Carboon. De plant bevat zoveel silica dat hij vroeger gebruikt werd om metalen voorwerpen te polijsten.",
        "native_to_nl": True
    },
    {
        "slug": "kleefkruid",
        "common_name_nl": "Kleefkruid",
        "latin_name": "Galium aparine",
        "family": "Sterbladigenfamilie (Rubiaceae)",
        "common_names": ["Kleefkruid", "Kattekruid", "Klit"],
        "appearance": {
            "flower_color": "wit",
            "flower_shape": "Kleine witte bloempjes, 1-2 mm, in okselstandige kluwens",
            "leaf_shape": "Lancetvormige blaadjes in kransen van 6-8, met stijve haartjes",
            "growth_form": "klimmend",
            "max_height_cm": 150,
            "distinguishing": "Haakvormige borsteltjes op stengel en blad maken de plant 'kleverig'",
            "look_alikes": ["Moeraswalstro", "Glad walstro"]
        },
        "habitat": {
            "places": ["border", "moestuin", "braakliggend"],
            "soil_types": ["voedselrijk", "vochtig"],
            "active_months": [3, 4, 5, 6, 7, 8, 9, 10],
            "bloom_months": [5, 6, 7, 8, 9],
            "sun_preference": "halfschaduw"
        },
        "removal": {
            "root_type": "oppervlakkig",
            "reproduces_via": ["zaad"],
            "removal_method": "Uittrekken voor zaadvorming, handschoenen aan — plakt aan alles",
            "removal_difficulty": "makkelijk",
            "urgency": "gemiddeld",
            "removal_tip": "Makkelijk te verwijderen zolang de zaadjes niet rijp zijn. De zaden blijven plakken aan kleding en gereedschap.",
            "prevention": "Bodem bedekt houden, vroeg in het seizoen wieden"
        },
        "edible": True,
        "edible_note": "Jonge toppen kunnen gekookt als groente (voor bloei), zaden kunnen geroosterd als koffievervanger",
        "interesting": "De zaadjes van kleefkruid waren de inspiratie voor klittenband. In de Middeleeuwen werd kleefkruid gebruikt als zeef voor melk (om haren en vuil uit te filteren).",
        "native_to_nl": True
    },
    {
        "slug": "ringelwikke",
        "common_name_nl": "Ringelwikke",
        "latin_name": "Vicia hirsuta",
        "family": "Vlinderbloemfamilie (Fabaceae)",
        "common_names": ["Kleine wikke", "Wilde wikke"],
        "appearance": {
            "flower_color": "wit",
            "flower_shape": "Kleine vlinderbloemen, 3-4 mm, 2-7 bijeen in trosjes",
            "leaf_shape": "Geveerd in 4-10 paar deelblaadjes met rank aan de top",
            "growth_form": "klimmend",
            "max_height_cm": 80,
            "distinguishing": "Zeer kleine bloemen, harige peulen met 2 zaadjes",
            "look_alikes": ["Vogelwikke", "Voederwikke"]
        },
        "habitat": {
            "places": ["border", "moestuin", "braakliggend"],
            "soil_types": ["zand", "voedselarm"],
            "active_months": [4, 5, 6, 7, 8, 9],
            "bloom_months": [5, 6, 7, 8],
            "sun_preference": "zon"
        },
        "removal": {
            "root_type": "vezelig",
            "reproduces_via": ["zaad"],
            "removal_method": "Uittrekken, makkelijk los van andere planten te halen",
            "removal_difficulty": "makkelijk",
            "urgency": "laag",
            "removal_tip": "Bindt stikstof — als hij niet over andere planten heen groeit is verwijderen optioneel.",
            "prevention": "Bodem niet teveel bemesten"
        },
        "edible": False,
        "edible_note": "Peulen en zaden zijn licht giftig bij grote hoeveelheden",
        "interesting": "De ringelwikke is een pioniersplant die snel kale grond bedekt. Net als andere vlinderbloemigen bindt hij stikstof uit de lucht via symbiotische bacteriën.",
        "native_to_nl": True
    },
    {
        "slug": "kruipende-boterbloem-scherpe",
        "common_name_nl": "Scherpe boterbloem",
        "latin_name": "Ranunculus acris",
        "family": "Ranonkelfamilie (Ranunculaceae)",
        "common_names": ["Boterbloem", "Weideboterbloem"],
        "appearance": {
            "flower_color": "geel",
            "flower_shape": "Vijf glanzende kroonbladen, 1.5-2.5 cm breed",
            "leaf_shape": "Diep handvormig ingesneden in 3-7 smalle slippen",
            "growth_form": "staand",
            "max_height_cm": 100,
            "distinguishing": "Geen uitlopers (in tegenstelling tot kruipende), ronde holle stengel",
            "look_alikes": ["Kruipende boterbloem", "Knolboterbloem"]
        },
        "habitat": {
            "places": ["gazon", "border", "braakliggend"],
            "soil_types": ["vochtig", "klei"],
            "active_months": [4, 5, 6, 7, 8, 9],
            "bloom_months": [5, 6, 7],
            "sun_preference": "zon"
        },
        "removal": {
            "root_type": "vezelig",
            "reproduces_via": ["zaad"],
            "removal_method": "Uitsteken met spade, hele plant verwijderen",
            "removal_difficulty": "gemiddeld",
            "urgency": "gemiddeld",
            "removal_tip": "In hooi gedroogd zijn boterbloemen niet giftig, maar vers zijn ze schadelijk voor vee.",
            "prevention": "Goede drainage, niet overbeweiden"
        },
        "edible": False,
        "edible_note": "Alle delen giftig — bevat ranunculine dat blaren op huid en slijmvliezen kan veroorzaken",
        "interesting": "De scherpe boterbloem kan tot wel 30 cm diep wortelen. Bij aanraking met beschadigde huid kan het sap blaren trekken — vee mijdt de plant instinctief in de wei.",
        "native_to_nl": True
    },
    {
        "slug": "herderstasje",
        "common_name_nl": "Herderstasje",
        "latin_name": "Capsella bursa-pastoris",
        "family": "Kruisbloemfamilie (Brassicaceae)",
        "common_names": ["Beursjeskruid", "Tasjeskruid"],
        "appearance": {
            "flower_color": "wit",
            "flower_shape": "Kleine witte kruisbloempjes, 2-3 mm, in trossen",
            "leaf_shape": "Rozet van veerspletige bladeren, stengelbladeren pijlvormig",
            "growth_form": "rozettend",
            "max_height_cm": 50,
            "distinguishing": "Hartvormige/driehoekige hauwtjes aan lange stelen — lijken op herderstasjes",
            "look_alikes": ["Kleine veldkers", "Gewone raket"]
        },
        "habitat": {
            "places": ["tegels", "border", "moestuin", "braakliggend"],
            "soil_types": ["alle"],
            "active_months": [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12],
            "bloom_months": [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12],
            "sun_preference": "all"
        },
        "removal": {
            "root_type": "penwortel",
            "reproduces_via": ["zaad"],
            "removal_method": "Uittrekken voor zaadvorming, ondiep schoffelen",
            "removal_difficulty": "makkelijk",
            "urgency": "hoog",
            "removal_tip": "Eén plant produceert tot 4000 zaden die tot 35 jaar kiemkrachtig blijven.",
            "prevention": "Regelmatig wieden, kale grond snel bedekt houden"
        },
        "edible": True,
        "edible_note": "Jonge rozetbladeren in salades, hauwtjes hebben peperige smaak. Bloemstengels in roerbak.",
        "interesting": "De zaden van herderstasje scheiden bij bevochtiging een kleverig laagje af — dit helpt de zaadjes om aan poten van vogels en schoenen van mensen te plakken. Dit mechanisme droeg bij aan de wereldwijde verspreiding.",
        "native_to_nl": True
    },
    {
        "slug": "ridderzuring",
        "common_name_nl": "Ridderzuring",
        "latin_name": "Rumex obtusifolius",
        "family": "Duizendknoopfamilie (Polygonaceae)",
        "common_names": ["Breedbladige zuring", "Paardenzuring", "Zure lap"],
        "appearance": {
            "flower_color": "groen",
            "flower_shape": "Groene tot roodbruine bloempluimen, onopvallend",
            "leaf_shape": "Groot, breed eirond, hartvormige voet, tot 30 cm lang",
            "growth_form": "staand",
            "max_height_cm": 120,
            "distinguishing": "Zeer grote bladeren, dikke penwortel, roodbruine zaadpluimen",
            "look_alikes": ["Kruizuring", "Veldzuring"]
        },
        "habitat": {
            "places": ["gazon", "border", "braakliggend"],
            "soil_types": ["voedselrijk", "vochtig"],
            "active_months": [4, 5, 6, 7, 8, 9, 10],
            "bloom_months": [6, 7, 8],
            "sun_preference": "all"
        },
        "removal": {
            "root_type": "penwortel",
            "reproduces_via": ["zaad", "wortel"],
            "removal_method": "Diep uitsteken met penwortelsteker, hele wortel weghalen",
            "removal_difficulty": "moeilijk",
            "urgency": "hoog",
            "removal_tip": "De penwortel kan 1 meter diep gaan en breekt makkelijk — elk achtergebleven stukje loopt opnieuw uit. Bij herhaald uittrekken put de plant uit.",
            "prevention": "Goede drainage, niet teveel bemesten, regelmatig maaien voor zaadvorming"
        },
        "edible": True,
        "edible_note": "Jonge bladeren in kleine hoeveelheden (bevat oxaalzuur), oude bladeren niet eten",
        "interesting": "Ridderzuring produceert tot 7000 zaden per plant, die tot 50 jaar kiemkrachtig blijven in de bodem. Het is een van de lastigste akkeronkruiden ter wereld.",
        "native_to_nl": True
    },
    # ── REMAINING 28 WEEDS OMITTED FOR BREVITY ──
    # Full 40-weed dataset will be in the actual file.
    # The pattern for each entry is identical to the 12 shown above.
]

async def seed():
    async with get_db() as db:
        for w in WEEDS:
            await db.execute("""
                INSERT OR IGNORE INTO weed_species
                    (slug, common_name_nl, latin_name, family, common_names,
                     appearance_json, habitat_json, removal_json,
                     edible, edible_note, interesting, native_to_nl)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """, (
                w["slug"], w["common_name_nl"], w["latin_name"],
                w["family"], json.dumps(w.get("common_names", [])),
                json.dumps(w.get("appearance")),
                json.dumps(w.get("habitat")),
                json.dumps(w.get("removal")),
                int(w.get("edible", False)), w.get("edible_note"),
                w.get("interesting"), int(w.get("native_to_nl", True)),
            ))
        await db.commit()
        print(f"Seeded {len(WEEDS)} weed species.")

if __name__ == "__main__":
    asyncio.run(seed())
```

Note: The plan document above shows 12 weeds. The actual seed file must contain all 40 weeds from the frontend dataset. Read the remaining 28 from `groei/frontend/src/data/weeds-dataset.ts` (the `LOCAL_WEEDS` array, lines 55–1508) and convert each to the Python dict format shown above.

- [ ] **Step 2: Run the seed script**

```bash
cd groei/backend && python seed_weed_catalog.py
```

Expected: `Seeded 40 weed species.`

- [ ] **Step 3: Verify with a quick SQLite query**

```bash
cd groei/backend && python -c "
import asyncio
from database import get_db
async def check():
    async with get_db() as db:
        cursor = await db.execute('SELECT COUNT(*) FROM weed_species')
        count = (await cursor.fetchone())[0]
        print(f'weed_species rows: {count}')
asyncio.run(check())
"
```

Expected: `weed_species rows: 40`

- [ ] **Step 4: Commit**

```bash
git add groei/backend/seed_weed_catalog.py
git commit -m "feat: add weed catalog seed script with 40 Dutch weeds"
```

---

### Task 4: Create weed catalog router

**Files:**
- Create: `groei/backend/routers/weed_catalog.py`

- [ ] **Step 1: Create the router file**

Create `groei/backend/routers/weed_catalog.py`:

```python
import json

from fastapi import APIRouter, Depends, Query, HTTPException
from database import db_dep
from models import WeedSpeciesOut, WeedSpeciesListItem, WeedAppearanceOut, WeedHabitatOut, WeedRemovalOut

router = APIRouter(tags=["weed-catalog"])


def _parse_json_subobjects(row: dict) -> dict:
    """Parse the three JSON sub-object columns from a DB row into Python dicts."""
    for col in ("appearance_json", "habitat_json", "removal_json"):
        val = row.get(col)
        try:
            row[col] = json.loads(val) if isinstance(val, str) else val
        except (json.JSONDecodeError, TypeError):
            row[col] = None
    return row


def _row_to_out(row: dict) -> WeedSpeciesOut:
    row = _parse_json_subobjects(row)
    return WeedSpeciesOut(
        id=row["id"],
        slug=row["slug"],
        common_name_nl=row["common_name_nl"],
        latin_name=row["latin_name"],
        family=row.get("family"),
        common_names=json.loads(row.get("common_names") or "[]"),
        appearance=WeedAppearanceOut(**row["appearance_json"]) if row.get("appearance_json") else None,
        habitat=WeedHabitatOut(**row["habitat_json"]) if row.get("habitat_json") else None,
        removal=WeedRemovalOut(**row["removal_json"]) if row.get("removal_json") else None,
        edible=bool(row.get("edible", False)),
        edible_note=row.get("edible_note"),
        interesting=row.get("interesting"),
        native_to_nl=bool(row.get("native_to_nl", True)),
    )


def _row_to_listitem(row: dict) -> WeedSpeciesListItem:
    appearance = None
    try:
        appearance = json.loads(row["appearance_json"]) if isinstance(row.get("appearance_json"), str) else row.get("appearance_json")
    except (json.JSONDecodeError, TypeError):
        pass

    habitat = None
    try:
        habitat = json.loads(row["habitat_json"]) if isinstance(row.get("habitat_json"), str) else row.get("habitat_json")
    except (json.JSONDecodeError, TypeError):
        pass

    return WeedSpeciesListItem(
        id=row["id"],
        slug=row["slug"],
        common_name_nl=row["common_name_nl"],
        latin_name=row["latin_name"],
        family=row.get("family"),
        flower_color=appearance.get("flower_color") if appearance else None,
        places=habitat.get("places", []) if habitat else [],
    )


@router.get("/weed-catalog", response_model=list[WeedSpeciesListItem])
async def list_weed_catalog(
    place: str | None = Query(None),
    bloom_month: int | None = Query(None),
    flower_color: str | None = Query(None),
    growth_form: str | None = Query(None),
    sun_preference: str | None = Query(None),
    search: str | None = Query(None),
    db=Depends(db_dep),
):
    cursor = await db.execute(
        "SELECT id, slug, common_name_nl, latin_name, family, appearance_json, habitat_json FROM weed_species ORDER BY common_name_nl"
    )
    rows = await cursor.fetchall()

    out: list[WeedSpeciesListItem] = []
    for row in rows:
        r = dict(row)
        item = _row_to_listitem(r)

        # Apply filters (post-query — dataset is small at 40 rows)
        if place and place not in item.places:
            continue
        if flower_color and item.flower_color != flower_color:
            continue
        if search and search.lower() not in item.common_name_nl.lower() and search.lower() not in item.latin_name.lower():
            continue

        # bloom_month, growth_form, sun_preference filters need full sub-objects
        if bloom_month or growth_form or sun_preference:
            hab = None
            try:
                hab_raw = row["habitat_json"]
                hab = json.loads(hab_raw) if isinstance(hab_raw, str) else hab_raw
            except (json.JSONDecodeError, TypeError):
                pass

            app = None
            try:
                app_raw = row["appearance_json"]
                app = json.loads(app_raw) if isinstance(app_raw, str) else app_raw
            except (json.JSONDecodeError, TypeError):
                pass

            if bloom_month and (not hab or bloom_month not in hab.get("bloom_months", [])):
                continue
            if growth_form and (not app or app.get("growth_form") != growth_form):
                continue
            if sun_preference and (not hab or hab.get("sun_preference") != sun_preference):
                continue

        out.append(item)
    return out


@router.get("/weed-catalog/{weed_id}", response_model=WeedSpeciesOut)
async def get_weed_detail(weed_id: int, db=Depends(db_dep)):
    cursor = await db.execute("SELECT * FROM weed_species WHERE id = ?", (weed_id,))
    row = await cursor.fetchone()
    if not row:
        raise HTTPException(status_code=404, detail="Weed not found")
    return _row_to_out(dict(row))
```

- [ ] **Step 2: Verify imports and syntax**

```bash
cd groei/backend && python -c "from routers.weed_catalog import router; print('ok')"
```

Expected: `ok`

- [ ] **Step 3: Commit**

```bash
git add groei/backend/routers/weed_catalog.py
git commit -m "feat: add weed catalog router with list and detail endpoints"
```

---

### Task 5: Create weed sightings router

**Files:**
- Create: `groei/backend/routers/weed_sightings.py`

- [ ] **Step 1: Create the router file**

Create `groei/backend/routers/weed_sightings.py`:

```python
from fastapi import APIRouter, Depends, Query, HTTPException
from database import db_dep
from models import WeedSightingCreate, WeedSightingOut

router = APIRouter(tags=["weed-sightings"])


@router.get("/weed-sightings", response_model=list[WeedSightingOut])
async def list_sightings(
    map_id: int | None = Query(None),
    db=Depends(db_dep),
):
    if map_id is not None:
        cursor = await db.execute("""
            SELECT ws.id, ws.weed_id, wsp.common_name_nl as weed_name,
                   wsp.slug as weed_slug, wsp.latin_name,
                   json_extract(wsp.removal_json, '$.removal_difficulty') as removal_difficulty,
                   ws.map_id, ws.map_x, ws.map_y, ws.notes, ws.sighted_at, ws.created_at
            FROM weed_sightings ws
            JOIN weed_species wsp ON ws.weed_id = wsp.id
            WHERE ws.map_id = ?
            ORDER BY ws.created_at DESC
        """, (map_id,))
    else:
        cursor = await db.execute("""
            SELECT ws.id, ws.weed_id, wsp.common_name_nl as weed_name,
                   wsp.slug as weed_slug, wsp.latin_name,
                   json_extract(wsp.removal_json, '$.removal_difficulty') as removal_difficulty,
                   ws.map_id, ws.map_x, ws.map_y, ws.notes, ws.sighted_at, ws.created_at
            FROM weed_sightings ws
            JOIN weed_species wsp ON ws.weed_id = wsp.id
            ORDER BY ws.created_at DESC
        """)
    rows = await cursor.fetchall()
    return [
        WeedSightingOut(
            id=row["id"],
            weed_id=row["weed_id"],
            weed_name=row["weed_name"],
            weed_slug=row["weed_slug"],
            latin_name=row["latin_name"],
            removal_difficulty=row["removal_difficulty"],
            map_id=row["map_id"],
            map_x=row["map_x"],
            map_y=row["map_y"],
            notes=row.get("notes"),
            sighted_at=row["sighted_at"],
            created_at=row.get("created_at"),
        )
        for row in rows
    ]


@router.post("/weed-sightings", status_code=201, response_model=WeedSightingOut)
async def create_sighting(body: WeedSightingCreate, db=Depends(db_dep)):
    cursor = await db.execute(
        """INSERT INTO weed_sightings (weed_id, map_id, map_x, map_y, notes, sighted_at)
           VALUES (?, ?, ?, ?, ?, ?)""",
        (body.weed_id, body.map_id, body.map_x, body.map_y, body.notes, body.sighted_at),
    )
    await db.commit()
    sighting_id = cursor.lastrowid

    cursor = await db.execute("""
        SELECT ws.id, ws.weed_id, wsp.common_name_nl as weed_name,
               wsp.slug as weed_slug, wsp.latin_name,
               json_extract(wsp.removal_json, '$.removal_difficulty') as removal_difficulty,
               ws.map_id, ws.map_x, ws.map_y, ws.notes, ws.sighted_at, ws.created_at
        FROM weed_sightings ws
        JOIN weed_species wsp ON ws.weed_id = wsp.id
        WHERE ws.id = ?
    """, (sighting_id,))
    row = await cursor.fetchone()
    if not row:
        raise HTTPException(status_code=500, detail="Failed to retrieve created sighting")
    return WeedSightingOut(
        id=row["id"],
        weed_id=row["weed_id"],
        weed_name=row["weed_name"],
        weed_slug=row["weed_slug"],
        latin_name=row["latin_name"],
        removal_difficulty=row["removal_difficulty"],
        map_id=row["map_id"],
        map_x=row["map_x"],
        map_y=row["map_y"],
        notes=row.get("notes"),
        sighted_at=row["sighted_at"],
        created_at=row.get("created_at"),
    )


@router.delete("/weed-sightings/{sighting_id}", status_code=204)
async def delete_sighting(sighting_id: int, db=Depends(db_dep)):
    cursor = await db.execute("DELETE FROM weed_sightings WHERE id = ?", (sighting_id,))
    await db.commit()
    if cursor.rowcount == 0:
        raise HTTPException(status_code=404, detail="Sighting not found")
```

- [ ] **Step 2: Verify imports and syntax**

```bash
cd groei/backend && python -c "from routers.weed_sightings import router; print('ok')"
```

Expected: `ok`

- [ ] **Step 3: Commit**

```bash
git add groei/backend/routers/weed_sightings.py
git commit -m "feat: add weed sightings router with CRUD endpoints"
```

---

### Task 6: Mount routers in main.py

**Files:**
- Modify: `groei/backend/main.py`

- [ ] **Step 1: Import and mount the routers**

Open `groei/backend/main.py`. Find the import block (lines 15–16) and add the weed router imports:

```python
from routers import users, locations, plants, objects, care, dashboard, maps, ground_zones
from routers import plant_care, species, spots, icons
from routers import admin, alerts
from routers import weed_catalog, weed_sightings    # <-- add this line
```

Then find the `app.include_router` block (after line 63, after the `alerts.router` line) and add:

```python
app.include_router(weed_catalog.router, prefix="/api")
app.include_router(weed_sightings.router, prefix="/api")
```

- [ ] **Step 2: Restart backend and verify routes appear**

Restart the backend, then check that the routes are registered:

```bash
curl -s http://localhost:8000/openapi.json | python -c "import sys,json; d=json.load(sys.stdin); paths=[p for p in d['paths'] if 'weed' in p]; print('\n'.join(paths))"
```

Expected output:
```
/api/weed-catalog
/api/weed-catalog/{weed_id}
/api/weed-sightings
/api/weed-sightings/{sighting_id}
```

- [ ] **Step 3: Smoke test the catalog endpoint**

```bash
curl -s http://localhost:8000/api/weed-catalog | python -c "import sys,json; d=json.load(sys.stdin); print(f'{len(d)} weeds loaded')"
```

Expected: `40 weeds loaded`

- [ ] **Step 4: Commit**

```bash
git add groei/backend/main.py
git commit -m "feat: mount weed catalog and sightings routers"
```

---

## Self-Review

**Spec coverage check:**
- ✅ `weed_species` table — Task 1
- ✅ `weed_sightings` table — Task 1
- ✅ Pydantic models (`WeedSpeciesOut`, `WeedSpeciesListItem`, `WeedSightingCreate`, `WeedSightingOut`) — Task 2
- ✅ `GET /api/weed-catalog` with filters — Task 4
- ✅ `GET /api/weed-catalog/{id}` — Task 4
- ✅ `GET /api/weed-sightings` with `?map_id=` — Task 5
- ✅ `POST /api/weed-sightings` — Task 5
- ✅ `DELETE /api/weed-sightings/{id}` — Task 5
- ✅ Seed script from dataset — Task 3
- ✅ Router mounts in main.py — Task 6

**Placeholder scan:** The seed script shows 12 weeds with a placeholder note for the remaining 28. This is intentional — the full 40-weed data will be converted from the TS file during Task 3 execution. No TBDs or TODOs in the implementation code.

**Type consistency:**
- `WeedSpeciesOut` uses `WeedAppearanceOut`, `WeedHabitatOut`, `WeedRemovalOut` — all defined in Task 2
- `WeedSpeciesListItem` fields match the catalog list query in Task 4
- `WeedSightingCreate` fields match the POST body in Task 5
- `WeedSightingOut` fields match the joined query in Task 5
- Router paths are consistent: `/weed-catalog` and `/weed-sightings` match across Tasks 4, 5, and 6
