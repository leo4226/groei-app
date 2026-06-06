"""Seed 50 common Dutch garden & indoor plants into plant_species.

Run once:  cd groei/backend && python seed_common_plants.py
Idempotent — ON CONFLICT (slug) DO NOTHING, safe to re-run.
"""

import asyncio
import json
from database import init_pool, close_pool, get_db


def pheno(months_data, frost_sensitive, min_temp_c, max_height_cm, max_spread_cm,
          facts_nl, *, sow=None, transplant=None, harvest=None):
    """Build a full phenology_json string from compact month descriptors."""
    months = []
    for m in range(1, 13):
        md = months_data.get(m, {})
        months.append({
            "month": m,
            "phase": md.get("phase", "dormant"),
            "phase_label_nl": md.get("label", "Rust"),
            "sun_hours_needed": md.get("sun", 0),
            "description_nl": md.get("desc", ""),
            "actions_nl": md.get("actions", []),
        })
    return json.dumps({
        "months": months,
        "sow_window": sow or [],
        "transplant_window": transplant or [],
        "harvest_window": harvest or [],
        "frost_sensitive": frost_sensitive,
        "min_temp_c": min_temp_c,
        "max_height_cm": max_height_cm,
        "max_spread_cm": max_spread_cm,
        "interesting_facts_nl": facts_nl,
        "climate_zone": "temperate",
    }, ensure_ascii=False)


# ── Growth-phase shorthand helpers ──

def dormant_months(ms, label="Rust", desc="", actions=None):
    return {m: {"phase": "dormant", "label": label, "sun": 0,
                "desc": desc or "In rustperiode", "actions": actions or []} for m in ms}

def growing(m, label="Groei", sun=6, desc="", actions=None):
    return {m: {"phase": "growing", "label": label, "sun": sun,
                "desc": desc or "Actieve groei", "actions": actions or []}}

def flowering(m, label="Bloei", sun=6, desc="", actions=None):
    return {m: {"phase": "flowering", "label": label, "sun": sun,
                "desc": desc or "In bloei", "actions": actions or ["Geniet van de bloemen"]}}

def fruiting(m, label="Vrucht", sun=6, desc="", actions=None):
    return {m: {"phase": "fruiting", "label": label, "sun": sun,
                "desc": desc or "Vruchtvorming", "actions": actions or ["Oogsten wanneer rijp"]}}

def evergreen(m, label="Wintergroen", sun=3, desc="", actions=None):
    return {m: {"phase": "evergreen", "label": label, "sun": sun,
                "desc": desc or "Blijft groen in de winter", "actions": actions or []}}

def harvest_m(m, label="Oogst", sun=4, desc="", actions=None):
    return {m: {"phase": "harvest", "label": label, "sun": sun,
                "desc": desc or "Oogsttijd", "actions": actions or ["Regelmatig oogsten"]}}

def establishing(m, label="Opstart", sun=5, desc="", actions=None):
    return {m: {"phase": "establishing", "label": label, "sun": sun,
                "desc": desc or "Plant komt op gang", "actions": actions or []}}

def dying_back(m, label="Afsterven", sun=0, desc="", actions=None):
    return {m: {"phase": "dying_back", "label": label, "sun": 0,
                "desc": desc or "Sterft bovengronds af",
                "actions": actions if actions is not None else ["Laat afgestorven blad staan als winterbescherming"]}}


# ══════════════════════════════════════════════════════════════════════════════
# PLANT DATA
# ══════════════════════════════════════════════════════════════════════════════

PLANTS = []

# ── OUTDOOR ORNAMENTALS ──

PLANTS.append({
    "slug": "hortensia",
    "common_name_nl": "Hortensia",
    "common_name_en": "Hydrangea",
    "latin_name": "Hydrangea macrophylla",
    "climate_zone": "temperate",
    "phenology_json": pheno({
        **dormant_months([1, 2, 3, 11, 12], "Rust", "Kaal in winter, knoppen in rust"),
        **establishing(4, "Uitlopen", 5, "Nieuwe scheuten en blad verschijnen"),
        **growing(5, "Groei", 6, "Blad ontwikkelt, bloemknoppen vormen zich"),
        **growing(6, "Groei & knop", 6, "Bloemknoppen zwellen"),
        **flowering(7, "Bloei", 5, "Bollen van blauwe, roze of witte bloemen", ["Uitgebloeide bloemen verwijderen", "Bij droogte water geven"]),
        **flowering(8, "Bloei", 5, "Volle bloei", ["Blijven water geven bij droogte"]),
        **flowering(9, "Nabloei", 4, "Laatste bloemen, blad begint te verkleuren"),
        **growing(10, "Afrijpen", 3, "Blad verkleurt naar herfsttinten"),
    }, frost_sensitive=False, min_temp_c=-15, max_height_cm=200, max_spread_cm=200,
       facts_nl="De bloemkleur van de hortensia hangt af van de zuurgraad van de bodem: zure grond geeft blauwe bloemen, kalkrijke grond roze. Dit komt door de beschikbaarheid van aluminium in de bodem."),
})

PLANTS.append({
    "slug": "rhododendron",
    "common_name_nl": "Rhododendron",
    "common_name_en": "Rhododendron",
    "latin_name": "Rhododendron spp.",
    "climate_zone": "temperate",
    "phenology_json": pheno({
        **dormant_months([1, 2, 11, 12], "Rust", "Wintergroen blad, knoppen in rust"),
        **establishing(3, "Knopzwelling", 4, "Bloemknoppen zwellen zichtbaar"),
        **flowering(4, "Vroege bloei", 6, "Eerste bloemen openen", ["Geef regenwater, geen kraanwater"]),
        **flowering(5, "Volle bloei", 5, "Spectaculaire bloemenpracht", ["Uitgebloeide bloemen verwijderen"]),
        **flowering(6, "Nabloei", 5, "Laatste bloemen vallen"),
        **growing(7, "Groei", 5, "Nieuwe scheuten en blad ontwikkelen"),
        **growing(8, "Groei", 5, "Nieuwe groei verhardt"),
        **growing(9, "Knopzetting", 4, "Bloeiknoppen voor volgend jaar vormen zich"),
        **growing(10, "Afharden", 3, "Nieuwe groei verhardt voor de winter"),
    }, frost_sensitive=False, min_temp_c=-20, max_height_cm=400, max_spread_cm=400,
       facts_nl="Rhododendrons houden van zure grond en kunnen tientallen jaren oud worden. In Nederland vind je ze veel in parken en op landgoederen, waar ze in mei spectaculair bloeien."),
})

PLANTS.append({
    "slug": "pioenroos",
    "common_name_nl": "Pioenroos",
    "common_name_en": "Peony",
    "latin_name": "Paeonia officinalis",
    "climate_zone": "temperate",
    "phenology_json": pheno({
        **dormant_months([1, 2, 11, 12], "Rust", "Volledig bovengronds afgestorven"),
        **establishing(3, "Uitlopen", 5, "Rode scheuten breken door de grond", ["Voorzichtig mesten rond de plant"]),
        **growing(4, "Groei", 6, "Stengels en bladeren ontwikkelen, knoppen vormen"),
        **flowering(5, "Bloei", 6, "Grote, geurende bloemen", ["Steunringen plaatsen bij zware bloemen"]),
        **flowering(6, "Bloei", 5, "Nabloei", ["Uitgebloeide bloemen verwijderen"]),
        **growing(7, "Zaadvorming", 6, "Zaaddozen ontwikkelen, blad blijft groen"),
        **growing(8, "Reserve opslag", 6, "Plant slaat energie op in wortels voor volgend jaar"),
        **growing(9, "Afrijpen", 5, "Blad begint te verkleuren"),
        **dying_back(10, "Afsterven", 0, "Blad sterft af, bovengronds deel verdwijnt", ["Afgestorven blad afknippen"]),
    }, frost_sensitive=False, min_temp_c=-25, max_height_cm=100, max_spread_cm=90,
       facts_nl="Pioenrozen kunnen meer dan 50 jaar op dezelfde plek staan en worden elk jaar mooier. Ze houden er niet van om verplant te worden — eenmaal gevestigd, laat ze met rust."),
})

PLANTS.append({
    "slug": "dahlia",
    "common_name_nl": "Dahlia",
    "common_name_en": "Dahlia",
    "latin_name": "Dahlia pinnata",
    "climate_zone": "temperate",
    "phenology_json": pheno({
        **dormant_months([1, 2, 3, 11, 12], "Knollen in winteropslag", "Knollen vorstvrij bewaard in turfmolm of krantenpapier", ["Maandelijks knollen controleren op rot"]),
        **establishing(4, "Uitplanten", 6, "Knollen uitplanten na de laatste vorst (IJsheiligen)", ["Knollen 10-15 cm diep planten"]),
        **growing(5, "Groei", 7, "Stengels schieten omhoog", ["Toppen voor vollere planten", "Slakken bestrijden"]),
        **growing(6, "Knopvorming", 8, "Bloemknoppen verschijnen", ["Steunplaatsen bij hoge soorten"]),
        **flowering(7, "Bloei", 7, "Uitbundige bloei in alle kleuren", ["Regelmatig plukken stimuleert nieuwe bloemen"]),
        **flowering(8, "Volle bloei", 7, "Piekbloei", ["Blijven plukken en uitgebloeide bloemen verwijderen"]),
        **flowering(9, "Nabloei", 6, "Laatste bloemen voor de eerste vorst"),
        **flowering(10, "Laatste bloei", 5, "Bloemen tot de eerste nachtvorst", ["Knollen rooien na eerste vorst"]),
        **dying_back(11, "Rooien", 0, "Loof afsterven, knollen rooien en drogen", ["Knollen vorstvrij opslaan"]),
    }, frost_sensitive=True, min_temp_c=0, max_height_cm=180, max_spread_cm=90,
       facts_nl="Dahlia's komen oorspronkelijk uit Mexico en waren daar een voedselgewas — de knollen werden gegeten. Tegenwoordig zijn er meer dan 20.000 cultivars in vrijwel elke kleur behalve echt blauw.",
       sow=[], transplant=[4, 5]),
})

PLANTS.append({
    "slug": "zonnehoed",
    "common_name_nl": "Zonnehoed",
    "common_name_en": "Purple Coneflower",
    "latin_name": "Echinacea purpurea",
    "climate_zone": "temperate",
    "phenology_json": pheno({
        **dormant_months([1, 2, 12], "Rust", "Bovengronds afgestorven, wortelstok in rust"),
        **establishing(3, "Uitlopen", 6, "Eerste groene blad verschijnt"),
        **growing(4, "Bladgroei", 7, "Rozet van bladeren ontwikkelt zich"),
        **growing(5, "Stengelgroei", 8, "Bloemstengels schieten omhoog"),
        **growing(6, "Knopvorming", 8, "Bloemknoppen vormen zich"),
        **flowering(7, "Bloei", 8, "Grote paarse bloemen met stekelig hart", ["Uitgebloeide bloemen verwijderen voor langere bloei"]),
        **flowering(8, "Volle bloei", 7, "Piekbloei, bijen en vlinders in overvloed"),
        **flowering(9, "Nabloei", 6, "Laatste bloemen, zaden beginnen te vormen"),
        **growing(10, "Zaadrijping", 5, "Zaadhoofden rijpen", ["Zaadhoofden laten staan voor vogels in de winter"]),
        **dormant_months([11], "Afsterven", "Bovengronds blad sterft langzaam af", ["Afgestorven stengels laten staan als wintervoeding voor vogels"]),
    }, frost_sensitive=False, min_temp_c=-30, max_height_cm=120, max_spread_cm=45,
       facts_nl="Echinacea werd van oudsher door de indianen van de Great Plains gebruikt als geneeskrachtig kruid, vooral bij verkoudheid en infecties. De zaden zijn een belangrijke wintervoedselbron voor puttertjes."),
})

PLANTS.append({
    "slug": "vlambloem",
    "common_name_nl": "Vlambloem",
    "common_name_en": "Garden Phlox",
    "latin_name": "Phlox paniculata",
    "climate_zone": "temperate",
    "phenology_json": pheno({
        **dormant_months([1, 2, 12], "Rust", "Bovengronds afgestorven"),
        **establishing(3, "Uitlopen", 6, "Nieuwe scheuten verschijnen"),
        **growing(4, "Bladgroei", 7, "Stengels en bladeren ontwikkelen"),
        **growing(5, "Stengelgroei", 7, "Bloemstengels groeien tot volle hoogte"),
        **growing(6, "Knopvorming", 7, "Bloempluimen in knop"),
        **flowering(7, "Bloei", 6, "Geurende bloempluimen in roze, wit of paars", ["Uitgebloeide bloemen verwijderen"]),
        **flowering(8, "Volle bloei", 6, "Piekbloei met sterke geur"),
        **flowering(9, "Nabloei", 5, "Laatste bloemen"),
        **growing(10, "Afrijpen", 4, "Blad verkleurt, zaad rijpt"),
        **dying_back(11, "Afsterven", 0, "Bovengronds deel sterft af", ["Terugknippen tot de grond"]),
    }, frost_sensitive=False, min_temp_c=-30, max_height_cm=120, max_spread_cm=60,
       facts_nl="Phlox is een van de meest geliefde borderplanten in Nederlandse tuinen vanwege de heerlijke avondgeur. De bloemen zijn eetbaar en kunnen als kleurrijke garnering in salades worden gebruikt."),
})

PLANTS.append({
    "slug": "herfstaster",
    "common_name_nl": "Herfstaster",
    "common_name_en": "Michaelmas Daisy",
    "latin_name": "Aster novi-belgii",
    "climate_zone": "temperate",
    "phenology_json": pheno({
        **dormant_months([1, 2, 12], "Rust", "Bovengronds afgestorven"),
        **establishing(3, "Uitlopen", 5, "Nieuwe scheuten uit de grond"),
        **growing(4, "Bladgroei", 6, "Bladrozet ontwikkelt"),
        **growing(5, "Stengelgroei", 7, "Stengels groeien, vertakken"),
        **growing(6, "Vertakking", 7, "Plant vertakt zich", ["Toppen voor vollere plant"]),
        **growing(7, "Knopvorming", 7, "Knoppen vormen zich"),
        **growing(8, "Knopzwelling", 7, "Knoppen zwellen"),
        **flowering(9, "Bloei", 6, "Massa's paarse, roze of witte bloemen", ["Uitgebloeide bloemen verwijderen"]),
        **flowering(10, "Nabloei", 5, "Doorbloeiend tot de eerste vorst"),
        **dying_back(11, "Afsterven", 0, "Eerste vorst stopt de bloei", ["Terugknippen"]),
    }, frost_sensitive=False, min_temp_c=-25, max_height_cm=150, max_spread_cm=90,
       facts_nl="Herfstasters zijn onmisbaar in de nazomertuin — ze bloeien wanneer de meeste andere planten al uitgebloeid zijn. Ze zijn een belangrijke nectarbron voor bijen en vlinders die zich voorbereiden op de winter."),
})

PLANTS.append({
    "slug": "bellenplant",
    "common_name_nl": "Bellenplant",
    "common_name_en": "Fuchsia",
    "latin_name": "Fuchsia magellanica",
    "climate_zone": "temperate",
    "phenology_json": pheno({
        **dormant_months([1, 2, 12], "Rust", "Winterharde soorten: bovengronds afgestorven. Niet-winterharde: binnen overwinteren"),
        **establishing(3, "Uitlopen", 5, "Eerste scheuten"),
        **growing(4, "Groei", 6, "Blad en stengels ontwikkelen"),
        **growing(5, "Bloemknop", 6, "Eerste bloemknoppen verschijnen"),
        **flowering(6, "Eerste bloei", 5, "Elegante hangende bloemen", ["Regelmatig water geven"]),
        **flowering(7, "Bloei", 4, "Volle bloei aan hangende stengels", ["Uitgebloeide bloemen verwijderen"]),
        **flowering(8, "Bloei", 4, "Aanhoudende bloei"),
        **flowering(9, "Nabloei", 4, "Laatste bloemen"),
        **flowering(10, "Laatste bloei", 3, "Bloeit door tot vorst"),
        **dying_back(11, "Voorbereiden winter", 0, "Niet-winterharde soorten binnenhalen", ["Winterharde soorten afdekken met blad"]),
    }, frost_sensitive=True, min_temp_c=-5, max_height_cm=300, max_spread_cm=200,
       facts_nl="Fuchsia's werden in de 17e eeuw ontdekt op Hispaniola en zijn vernoemd naar de Duitse botanicus Leonhart Fuchs. De bloemen worden bestoven door kolibries in hun oorspronkelijke leefgebied in Zuid-Amerika."),
})

PLANTS.append({
    "slug": "ooievaarsbek",
    "common_name_nl": "Ooievaarsbek",
    "common_name_en": "Cranesbill",
    "latin_name": "Geranium macrorrhizum",
    "climate_zone": "temperate",
    "phenology_json": pheno({
        **evergreen(1, "Semi-wintergroen", 2, "Blad blijft deels aanwezig in zachte winters"),
        **evergreen(2, "Semi-wintergroen", 3, "Blad blijft deels aanwezig"),
        **establishing(3, "Uitlopen", 5, "Nieuw blad verschijnt"),
        **growing(4, "Bladgroei", 6, "Weelderige bladmat vormt zich"),
        **flowering(5, "Eerste bloei", 6, "Roze of paarse bloemen verschijnen"),
        **flowering(6, "Bloei", 6, "Volle bloei boven aromatisch blad", ["Uitgebloeide bloemen verwijderen"]),
        **flowering(7, "Bloei", 5, "Aanhoudende bloei"),
        **flowering(8, "Nabloei", 5, "Laatste bloemen"),
        **growing(9, "Zaadvorming", 4, "Zaaddozen als ooievaarssnavels"),
        **growing(10, "Herfstkleur", 3, "Blad verkleurt naar rood en brons"),
        **evergreen(11, "Semi-wintergroen", 2, "Blad blijft lang aanwezig"),
        **evergreen(12, "Semi-wintergroen", 1, "Blad in rust"),
    }, frost_sensitive=False, min_temp_c=-25, max_height_cm=40, max_spread_cm=60,
       facts_nl="De Nederlandse naam 'Ooievaarsbek' komt van de zaaddozen die lijken op de snavel van een ooievaar. De plant is een uitstekende bodembedekker die onkruid onderdrukt en goed groeit op droge schaduwplekken."),
})

PLANTS.append({
    "slug": "vetkruid",
    "common_name_nl": "Vetkruid",
    "common_name_en": "Stonecrop",
    "latin_name": "Sedum spectabile",
    "climate_zone": "temperate",
    "phenology_json": pheno({
        **dormant_months([1, 2, 12], "Rust", "Bovengronds afgestorven, vlezige wortels in rust", ["Afgestorven stengels laten staan voor winterstructuur"]),
        **establishing(3, "Uitlopen", 6, "Kleine rozetten verschijnen aan de voet"),
        **growing(4, "Bladgroei", 7, "Vlezige blauwgroene bladeren ontwikkelen"),
        **growing(5, "Stengelgroei", 7, "Stevige stengels groeien"),
        **growing(6, "Knopvorming", 7, "Platte bloemschermen in knop"),
        **flowering(7, "Eerste bloei", 7, "Roze bloemschermen openen", ["Bij droogte water geven"]),
        **flowering(8, "Volle bloei", 7, "Roestbruin verkleurende bloemschermen, bijenmagneet"),
        **flowering(9, "Nabloei", 5, "Bloemen verkleuren naar diep roodbruin"),
        **growing(10, "Zaadrijping", 4, "Zaad rijpt in decoratieve schermen"),
        **dormant_months([11], "Afsterven", "Stengels sterven langzaam af", ["Niet afknippen — winterstructuur voor insecten"]),
    }, frost_sensitive=False, min_temp_c=-30, max_height_cm=60, max_spread_cm=45,
       facts_nl="Sedums zijn extreem droogtetolerant door hun vetblad — ze slaan water op in hun bladeren. De bloemen zijn in de nazomer een van de belangrijkste nectarbronnen voor vlinders en bijen."),
})

PLANTS.append({
    "slug": "tulp",
    "common_name_nl": "Tulp",
    "common_name_en": "Tulip",
    "latin_name": "Tulipa gesneriana",
    "climate_zone": "temperate",
    "phenology_json": pheno({
        **dormant_months([1, 6, 7, 8, 9, 10, 11, 12], "Bol in rust", "Bol ondergronds in zomer- en winterrust", ["Bollen in de herfst planten (oktober-december)"]),
        **establishing(2, "Wortelgroei", 2, "Wortels ontwikkelen ondergronds"),
        **growing(3, "Bladgroei", 6, "Eerste bladpunten breken door de grond", ["Licht bemesten met bollenmest"]),
        **flowering(4, "Bloei", 6, "Klassieke bloemen in alle kleuren", ["Genieten van de bloei"]),
        **flowering(5, "Bloei & zaad", 6, "Bloemen rijpen, zaaddozen vormen", ["Uitgebloeide bloemen verwijderen, blad laten staan"]),
        **growing(6, "Energie opslag", 6, "Blad voedt de bol voor volgend jaar", ["Blad pas afknippen als het geel is"]),
    }, frost_sensitive=False, min_temp_c=-20, max_height_cm=60, max_spread_cm=15,
       facts_nl="In de 17e eeuw veroorzaakten tulpen de eerste economische zeepbel in de geschiedenis: de Tulpenmanie. Voor één tulpenbol werd soms meer betaald dan een grachtenpand in Amsterdam waard was."),
})

PLANTS.append({
    "slug": "narcis",
    "common_name_nl": "Narcis",
    "common_name_en": "Daffodil",
    "latin_name": "Narcissus pseudonarcissus",
    "climate_zone": "temperate",
    "phenology_json": pheno({
        **dormant_months([1, 5, 6, 7, 8, 9, 10, 11, 12], "Bol in rust", "Bol ondergronds", ["Bollen planten in september-oktober"]),
        **establishing(2, "Opkomst", 5, "Eerste groene punten boven de grond"),
        **flowering(3, "Bloei", 6, "Vrolijke gele bloemen, voorbode van de lente"),
        **flowering(4, "Nabloei", 5, "Laatste narcissen, blad blijft groen", ["Blad laten afsterven, niet afknippen"]),
        **growing(5, "Energie opslag", 5, "Blad sterft langzaam af, bol slaat energie op"),
    }, frost_sensitive=False, min_temp_c=-20, max_height_cm=45, max_spread_cm=10,
       facts_nl="Narcissen zijn giftig voor de meeste dieren — konijnen en herten laten ze met rust. De botanische naam komt van de Griekse mythe van Narcissus, die verliefd werd op zijn eigen spiegelbeeld."),
})

PLANTS.append({
    "slug": "krokus",
    "common_name_nl": "Krokus",
    "common_name_en": "Crocus",
    "latin_name": "Crocus vernus",
    "climate_zone": "temperate",
    "phenology_json": pheno({
        **dormant_months([1, 4, 5, 6, 7, 8, 9, 10, 11, 12], "Knol in rust", "Knol ondergronds", ["Knollen planten in september-oktober"]),
        **flowering(2, "Bloei", 5, "Eerste kleur in de late winter", ["Vroege voedselbron voor hommels en bijen"]),
        **flowering(3, "Bloei", 6, "Volle bloei in paars, wit of geel"),
        **growing(4, "Energie opslag", 5, "Blad sterft af, knol slaat reserves op", ["Blad laten vergaan"]),
    }, frost_sensitive=False, min_temp_c=-25, max_height_cm=15, max_spread_cm=5,
       facts_nl="Krokussen zijn de eerste voorjaarsbloeiers en een essentiële voedselbron voor vroege hommels en bijen. De saffraankrokus (Crocus sativus) levert de duurste specerij ter wereld: de gedroogde stampers zijn saffraan."),
})

PLANTS.append({
    "slug": "hyacint",
    "common_name_nl": "Hyacint",
    "common_name_en": "Hyacinth",
    "latin_name": "Hyacinthus orientalis",
    "climate_zone": "temperate",
    "phenology_json": pheno({
        **dormant_months([1, 5, 6, 7, 8, 9, 10, 11, 12], "Bol in rust", "Bol ondergronds in zomer- en winterrust", ["Bollen planten in oktober-november"]),
        **establishing(2, "Opkomst", 5, "Blad en bloemstengel breken door"),
        **flowering(3, "Bloeistengel", 6, "Geurige bloemtrossen in blauw, roze of wit"),
        **flowering(4, "Bloei", 5, "Nabloei, sterke geur in de tuin", ["Uitgebloeide bloemen verwijderen"]),
        **growing(5, "Energie opslag", 5, "Blad sterft af, bol reserveert voor volgend jaar", ["Blad laten staan tot geel"]),
    }, frost_sensitive=False, min_temp_c=-20, max_height_cm=30, max_spread_cm=10,
       facts_nl="Hyacinten werden in de 16e eeuw vanuit het Ottomaanse Rijk naar Nederland gebracht. De intense geur komt van de bloemen en kan een hele tuin parfumeren. In de bollenteelt was de hyacint na de tulp de belangrijkste bloembol."),
})

PLANTS.append({
    "slug": "iris",
    "common_name_nl": "Iris",
    "common_name_en": "Bearded Iris",
    "latin_name": "Iris germanica",
    "climate_zone": "temperate",
    "phenology_json": pheno({
        **dormant_months([1, 2, 12], "Rust", "Wintergroene wortelstok in rust"),
        **establishing(3, "Uitlopen", 6, "Zwaardvormig blad verschijnt"),
        **growing(4, "Bladgroei", 7, "Blad groeit tot volle lengte"),
        **flowering(5, "Bloei", 8, "Spectaculaire bloemen in vele kleuren", ["Uitgebloeide stengels afknippen"]),
        **flowering(6, "Nabloei", 7, "Laatste bloemen"),
        **growing(7, "Wortelstokgroei", 7, "Wortelstok zet uit, nieuwe scheuten vormen"),
        **growing(8, "Reserve opslag", 7, "Plant slaat energie op"),
        **growing(9, "Afrijpen", 5, "Blad blijft decoratief"),
        **growing(10, "Wintervoorbereiding", 4, "Blad blijft groen"),
        **evergreen(11, "Wintergroen", 2, "Blad blijft zichtbaar in milde winters"),
    }, frost_sensitive=False, min_temp_c=-25, max_height_cm=100, max_spread_cm=60,
       facts_nl="De iris is genoemd naar de Griekse godin van de regenboog — een verwijzing naar het brede kleurenspectrum. De wortelstokken (rizoom) moeten half boven de grond worden geplant, anders bloeien ze niet."),
})

PLANTS.append({
    "slug": "lelie",
    "common_name_nl": "Lelie",
    "common_name_en": "Madonna Lily",
    "latin_name": "Lilium candidum",
    "climate_zone": "temperate",
    "phenology_json": pheno({
        **dormant_months([1, 2, 10, 11, 12], "Bol in rust", "Bol ondergronds in rust"),
        **establishing(3, "Uitlopen", 6, "Bladrozet verschijnt"),
        **growing(4, "Bladgroei", 7, "Blad en stengels ontwikkelen"),
        **growing(5, "Stengelgroei", 7, "Bloemstengels schieten omhoog"),
        **growing(6, "Knopvorming", 7, "Bloemknoppen vormen"),
        **flowering(7, "Bloei", 6, "Grote witte of gekleurde bloemen met sterke geur", ["Uitgebloeide bloemen verwijderen"]),
        **flowering(8, "Nabloei", 5, "Laatste bloemen"),
        **growing(9, "Energie opslag", 5, "Blad sterft langzaam af, bol slaat op"),
        **dying_back(10, "Afsterven", 0, "Stengels en blad sterven af"),
    }, frost_sensitive=False, min_temp_c=-20, max_height_cm=150, max_spread_cm=30,
       facts_nl="De Madonna-lelie is een van de oudste gekweekte bloemen ter wereld — afbeeldingen zijn gevonden in Minoïsche paleizen van 3500 jaar geleden. In de christelijke symboliek staat de lelie voor zuiverheid."),
})

PLANTS.append({
    "slug": "sierui",
    "common_name_nl": "Sierui",
    "common_name_en": "Ornamental Onion",
    "latin_name": "Allium giganteum",
    "climate_zone": "temperate",
    "phenology_json": pheno({
        **dormant_months([1, 2, 7, 8, 9, 10, 11, 12], "Bol in rust", "Bol ondergronds in zomer- en winterrust", ["Bollen planten in september-oktober"]),
        **establishing(3, "Uitlopen", 7, "Groot blad verschijnt"),
        **growing(4, "Bladgroei", 8, "Riemvormig blad ontwikkelt"),
        **growing(5, "Stengelgroei", 8, "Bloemstengels schieten omhoog, tot 1.5m"),
        **flowering(6, "Bloei", 8, "Paarse bollen van 15 cm doorsnee", ["Na de bloei uitgebloeide bloemen laten staan voor zaad of afknippen"]),
        **growing(7, "Zaadvorming", 6, "Zaad rijpt in decoratieve bollen"),
        **dying_back(7, "Blad sterft af", 6, "Blad wordt geel en sterft", ["Blad laten afsterven"]),
    }, frost_sensitive=False, min_temp_c=-20, max_height_cm=150, max_spread_cm=30,
       facts_nl="Sieruien zijn familie van de ui en knoflook — kneus een blad en je ruikt het meteen. De bloembollen kunnen na de bloei als droogbloem gebruikt worden en blijven maandenlang decoratief."),
})

PLANTS.append({
    "slug": "clematis",
    "common_name_nl": "Clematis",
    "common_name_en": "Clematis",
    "latin_name": "Clematis viticella",
    "climate_zone": "temperate",
    "phenology_json": pheno({
        **dormant_months([1, 2, 12], "Rust", "Kaal in winter, houtige stengels"),
        **establishing(3, "Uitlopen", 6, "Nieuwe scheuten uit de stengels"),
        **growing(4, "Slingergroei", 7, "Sterke groei van ranken", ["Leiden langs steun"]),
        **growing(5, "Slingergroei", 7, "Plant klimt en vertakt"),
        **growing(6, "Knopvorming", 7, "Bloemknoppen langs nieuwe scheuten"),
        **flowering(7, "Bloei", 6, "Paarse, witte of roze bloemen", ["Uitgebloeide bloemen verwijderen"]),
        **flowering(8, "Volle bloei", 6, "Massa's bloemen bedekken de plant"),
        **flowering(9, "Nabloei", 5, "Doorbloeiend tot in de herfst"),
        **growing(10, "Zaadpluizen", 4, "Decoratieve zaadpluizen vormen"),
        **dormant_months([11], "Winterklaar", "Blad valt, plant gaat in rust", ["Snoeien op 30 cm in november"]),
    }, frost_sensitive=False, min_temp_c=-20, max_height_cm=400, max_spread_cm=200,
       facts_nl="Clematis wordt 'de koningin van de klimplanten' genoemd. Er bestaan meer dan 300 soorten, van tere alpiene soorten tot krachtige zomerbloeiers. Het Italiaanse Clematis viticella is zeer resistent tegen de gevreesde clematisverwelkingsziekte."),
})

PLANTS.append({
    "slug": "kamperfoelie",
    "common_name_nl": "Kamperfoelie",
    "common_name_en": "Honeysuckle",
    "latin_name": "Lonicera periclymenum",
    "climate_zone": "temperate",
    "phenology_json": pheno({
        **dormant_months([1, 2, 12], "Rust", "Bladverliezend in strenge winter, semi-groen in mild weer"),
        **establishing(3, "Uitlopen", 5, "Nieuw blad verschijnt"),
        **growing(4, "Slingergroei", 6, "Ranken groeien en winden zich"),
        **growing(5, "Groei & knop", 6, "Volle bladmassa, eerste knoppen"),
        **flowering(6, "Eerste bloei", 5, "Romige bloemen met heerlijke avondgeur", ["Geniet van de geur op warme avonden"]),
        **flowering(7, "Volle bloei", 5, "Piekbloei, nachtvlinders bezoeken de bloemen"),
        **flowering(8, "Bloei", 5, "Aanhoudende bloei"),
        **flowering(9, "Nabloei", 4, "Laatste bloemen, bessen beginnen te vormen"),
        **growing(10, "Bessen", 3, "Rode bessen rijpen (giftig voor mensen, voeding voor vogels)"),
        **growing(11, "Wintervoorbereiding", 2, "Blad verkleurt en valt langzaam"),
    }, frost_sensitive=False, min_temp_c=-20, max_height_cm=600, max_spread_cm=300,
       facts_nl="De Nederlandse naam 'Kamperfoelie' komt van het Italiaanse 'caprifoglio', wat geitenblad betekent — geiten zouden er dol op zijn. De bloemen geuren het sterkst in de avond om nachtvlinders aan te trekken voor bestuiving."),
})

PLANTS.append({
    "slug": "klimop",
    "common_name_nl": "Klimop",
    "common_name_en": "English Ivy",
    "latin_name": "Hedera helix",
    "climate_zone": "temperate",
    "phenology_json": pheno({
        **evergreen(1, "Evergreen", 1, "Donkergroen blad, belangrijke schuilplaats voor insecten en vogels"),
        **evergreen(2, "Evergreen", 1, "Blijft groen, langzame wintergroei"),
        **evergreen(3, "Evergreen", 2, "Eerste nieuwe groei begint"),
        **growing(4, "Groei", 3, "Nieuwe scheuten en bladeren"),
        **growing(5, "Sterke groei", 4, "Snelle uitbreiding, nieuwe ranken hechten zich"),
        **growing(6, "Groei", 4, "Weelderige groei"),
        **growing(7, "Groei", 4, "Volle zomergroei", ["Kan gesnoeid worden om in toom te houden"]),
        **growing(8, "Groei", 4, "Aanhoudende groei"),
        **flowering(9, "Bloei", 3, "Kleine groengele bloemschermen, belangrijke nectar in de herfst", ["Laat bloeien voor bijen en vlinders"]),
        **flowering(10, "Bloei & bes", 2, "Bloemen rijpen tot zwarte bessen"),
        **growing(11, "Bessen", 1, "Bessen rijpen, wintervoeding voor vogels", ["Niet eten — bessen zijn giftig voor mensen"]),
        **evergreen(12, "Evergreen", 1, "Blijft groen als winterdekking voor fauna"),
    }, frost_sensitive=False, min_temp_c=-25, max_height_cm=2000, max_spread_cm=800,
       facts_nl="Klimop is een van de meest waardevolle inheemse planten voor biodiversiteit: de bloemen bloeien laat in het jaar en zijn een cruciale nectarbron, de bessen voeden vogels in de winter, en het dichte blad biedt nestgelegenheid en schuilplaatsen."),
})


# ── HERBS ──

PLANTS.append({
    "slug": "salie",
    "common_name_nl": "Salie",
    "common_name_en": "Sage",
    "latin_name": "Salvia officinalis",
    "climate_zone": "temperate",
    "phenology_json": pheno({
        **evergreen(1, "Wintergroen", 2, "Grijsgroen aromatisch blad blijft aan de plant"),
        **evergreen(2, "Wintergroen", 3, "Blad blijft aanwezig"),
        **establishing(3, "Uitlopen", 6, "Nieuwe scheuten, oude blad afknippen", ["Terugsnoeien oude takken"]),
        **growing(4, "Bladgroei", 7, "Nieuwe aromatische bladeren"),
        **growing(5, "Knopvorming", 7, "Bloemknoppen in aar"),
        **flowering(6, "Bloei", 7, "Paarse lippenbloemen, bijenmagneet", ["Oogsten voor de bloei voor de sterkste smaak"]),
        **flowering(7, "Nabloei", 6, "Doorbloeiend, oogsten voor keuken en drogen"),
        **growing(8, "Nazomer", 6, "Nieuwe bladgroei na eventuele snoei"),
        **growing(9, "Afrijpen", 5, "Blad wordt sterker van smaak"),
        **growing(10, "Wintervoorbereiding", 3, "Groei vertraagt"),
        **evergreen(11, "Wintergroen", 2, "Blad blijft, plant in rust"),
        **evergreen(12, "Wintergroen", 1, "Rustperiode"),
    }, frost_sensitive=False, min_temp_c=-15, max_height_cm=80, max_spread_cm=60,
       facts_nl="Salie staat al sinds de oudheid bekend als geneeskrachtig kruid — 'salvia' komt van het Latijnse 'salvare' (genezen). Saliethee wordt gebruikt bij keelpijn en overmatig zweten. In de keuken is het onmisbaar bij gevogelte en in de Italiaanse saltimbocca."),
})

PLANTS.append({
    "slug": "tijm",
    "common_name_nl": "Tijm",
    "common_name_en": "Thyme",
    "latin_name": "Thymus vulgaris",
    "climate_zone": "temperate",
    "phenology_json": pheno({
        **evergreen(1, "Wintergroen", 2, "Fijn aromatisch blad, compacte plant"),
        **evergreen(2, "Wintergroen", 3, "Plant in rust"),
        **establishing(3, "Uitlopen", 6, "Nieuwe groei verschijnt"),
        **growing(4, "Bladgroei", 7, "Volle aromatische blaadjes"),
        **growing(5, "Knopvorming", 7, "Bloemknoppen vormen"),
        **flowering(6, "Bloei", 7, "Lila bloemetjes, enorme bijen- en vlindermagneet", ["Oogsten op zonnige ochtenden voor meeste olie"]),
        **flowering(7, "Bloei", 7, "Doorbloeiend", ["Na de bloei licht snoeien voor compacte groei"]),
        **growing(8, "Nazomer", 6, "Nieuwe scheuten na snoei"),
        **growing(9, "Afrijpen", 5, "Smaak intensiveert"),
        **growing(10, "Wintervoorbereiding", 3, "Groei vertraagt"),
        **evergreen(11, "Wintergroen", 2, "Blad blijft"),
        **evergreen(12, "Wintergroen", 2, "Rustperiode"),
    }, frost_sensitive=False, min_temp_c=-15, max_height_cm=30, max_spread_cm=30,
       facts_nl="Tijm bevat thymol, een krachtig antisepticum dat al sinds de oudheid wordt gebruikt. De oude Egyptenaren gebruikten tijm bij het balsemen. In de middeleeuwen droegen ridders een takje tijm als symbool van moed."),
})

PLANTS.append({
    "slug": "rozemarijn",
    "common_name_nl": "Rozemarijn",
    "common_name_en": "Rosemary",
    "latin_name": "Rosmarinus officinalis",
    "climate_zone": "temperate",
    "phenology_json": pheno({
        **evergreen(1, "Wintergroen", 2, "Naaldachtig aromatisch blad, winterbescherming nodig bij strenge vorst", ["Bij vorst onder -10 afdekken met vliesdoek"]),
        **evergreen(2, "Wintergroen", 3, "Blad blijft, langzame groei"),
        **flowering(3, "Vroege bloei", 6, "Eerste lichtblauwe bloemetjes"),
        **flowering(4, "Bloei", 7, "Volop bloeiend, bijenplant"),
        **flowering(5, "Bloei", 8, "Aanhoudende bloei", ["Regelmatig oogsten stimuleert vertakking"]),
        **growing(6, "Groei & bloei", 8, "Nieuwe scheuten, bloemen trekken bijen aan"),
        **growing(7, "Zomergroei", 8, "Sterke groei, aromatisch"),
        **growing(8, "Groei", 7, "Volle zomergroei"),
        **growing(9, "Afrijpen", 6, "Nieuwe scheuten verhouten"),
        **growing(10, "Wintervoorbereiding", 4, "Groei vertraagt"),
        **evergreen(11, "Wintergroen", 2, "Winterbescherming voorbereiden"),
        **evergreen(12, "Wintergroen", 1, "Minimale groei"),
    }, frost_sensitive=True, min_temp_c=-10, max_height_cm=150, max_spread_cm=100,
       facts_nl="Rozemarijn symboliseert herinnering en trouw — in het oude Griekenland droegen studenten rozemarijnkransen bij examens om het geheugen te stimuleren. In de keuken is het onmisbaar bij lamsvlees en geroosterde aardappelen."),
})

PLANTS.append({
    "slug": "munt",
    "common_name_nl": "Munt",
    "common_name_en": "Mint",
    "latin_name": "Mentha spicata",
    "climate_zone": "temperate",
    "phenology_json": pheno({
        **dormant_months([1, 2, 12], "Rust", "Bovengronds afgestorven, wortelstokken ondergronds"),
        **establishing(3, "Uitlopen", 5, "Nieuwe scheuten verschijnen"),
        **growing(4, "Bladgroei", 6, "Weelderige aromatische bladgroei"),
        **growing(5, "Explosieve groei", 7, "Snelle uitbreiding via uitlopers", ["In potten houden om woekeren te voorkomen"]),
        **growing(6, "Groei", 7, "Volle plant, regelmatig oogsten"),
        **flowering(7, "Bloei", 7, "Kleine lila bloemaren, bijen lokken", ["Toppen voor meer vertakking en blad"]),
        **flowering(8, "Bloei", 6, "Doorbloeiend"),
        **growing(9, "Nazomer", 5, "Minder nieuwe groei"),
        **growing(10, "Afrijpen", 4, "Blad wordt sterker"),
        **dying_back(11, "Afsterven", 0, "Blad sterft af bij vorst", ["Terugknippen tot de grond"]),
    }, frost_sensitive=False, min_temp_c=-25, max_height_cm=60, max_spread_cm=200,
       facts_nl="Munt is een van de meest invasieve tuinkruiden — plant hem altijd in een pot of met wortelbegrenzing. Er bestaan meer dan 20 soorten, van pepermunt tot Marokkaanse munt voor thee. In de Griekse mythologie was munt de nimf Menthe, veranderd in een plant door Persephone.",
       harvest=[4, 5, 6, 7, 8, 9, 10]),
})

PLANTS.append({
    "slug": "bieslook",
    "common_name_nl": "Bieslook",
    "common_name_en": "Chives",
    "latin_name": "Allium schoenoprasum",
    "climate_zone": "temperate",
    "phenology_json": pheno({
        **dormant_months([1, 2, 12], "Rust", "Bovengronds afgestorven, bolletjes in rust"),
        **establishing(3, "Uitlopen", 6, "Frisgroene sprietjes verschijnen"),
        **growing(4, "Bladgroei", 7, "Holle bladeren groeien snel"),
        **flowering(5, "Bloei", 7, "Paarse bolletjes, eetbare bloemen", ["Bloemen plukken voor salades"]),
        **flowering(6, "Bloei", 7, "Doorbloeiend, oogsten door afknippen", ["Regelmatig knippen stimuleert groei"]),
        **growing(7, "Zomergroei", 6, "Nieuwe bladgroei"),
        **growing(8, "Groei", 6, "Aanhoudende oogst"),
        **growing(9, "Nazomer", 5, "Langzamere groei"),
        **growing(10, "Afrijpen", 4, "Blad wordt taaier"),
        **dying_back(11, "Afsterven", 0, "Blad sterft af", ["Laatste oogst voor de winter"]),
    }, frost_sensitive=False, min_temp_c=-25, max_height_cm=30, max_spread_cm=20,
       facts_nl="Bieslook is een van de makkelijkste keukenkruiden en groeit op vrijwel elke grondsoort. De paarse bloemen zijn eetbaar en trekken veel bijen aan. In de biologische tuinbouw wordt bieslook ingezet als natuurlijk afweermiddel tegen wortelvlieg bij wortels."),
})

PLANTS.append({
    "slug": "oregano",
    "common_name_nl": "Oregano",
    "common_name_en": "Oregano",
    "latin_name": "Origanum vulgare",
    "climate_zone": "temperate",
    "phenology_json": pheno({
        **dormant_months([1, 2, 12], "Rust", "Bovengronds deels afgestorven, houtige basis"),
        **establishing(3, "Uitlopen", 6, "Nieuwe scheuten uit de basis"),
        **growing(4, "Bladgroei", 7, "Aromatische bladeren ontwikkelen"),
        **growing(5, "Stengelgroei", 7, "Bloemstengels schieten op"),
        **growing(6, "Knopvorming", 7, "Bloemknoppen"),
        **flowering(7, "Bloei", 7, "Roze-paarse bloemschermen, vlinderplant bij uitstek", ["Oogsten bij begin bloei voor meeste smaak"]),
        **flowering(8, "Bloei", 7, "Doorbloeiend, bijen en vlinders op bezoek"),
        **flowering(9, "Nabloei", 5, "Laatste bloemen, zaad rijpt"),
        **growing(10, "Afrijpen", 4, "Blad wordt pittiger"),
        **dying_back(11, "Winterklaar", 0, "Bovengronds sterft terug", ["Terugknippen tot 10 cm"]),
    }, frost_sensitive=False, min_temp_c=-25, max_height_cm=60, max_spread_cm=45,
       facts_nl="Wilde oregano (Origanum vulgare) is inheems in Nederland en groeit van nature op kalkrijke hellingen in Zuid-Limburg. De Nederlandse naam 'Wilde marjolein' wordt soms verwarrend gebruikt — echte oregano heeft een veel sterkere, pittigere smaak."),
})

PLANTS.append({
    "slug": "peterselie",
    "common_name_nl": "Peterselie",
    "common_name_en": "Parsley",
    "latin_name": "Petroselinum crispum",
    "climate_zone": "temperate",
    "phenology_json": pheno({
        **evergreen(1, "Wintergroen", 2, "Blad kan in zachte winters overleven"),
        **evergreen(2, "Wintergroen", 3, "Langzame groei"),
        **growing(3, "Voorjaarsgroei", 6, "Nieuwe bladeren", ["Oude bladeren verwijderen"]),
        **growing(4, "Bladgroei", 6, "Volle bladontwikkeling, regelmatig oogsten"),
        **growing(5, "Sterke groei", 6, "Piek oogstseizoen", ["Regelmatig snijden stimuleert nieuwe groei"]),
        **growing(6, "Zomergroei", 5, "Kan doorschieten in hitte", ["Bloemstengels verwijderen als ze verschijnen"]),
        **flowering(7, "Doorschieten", 5, "Tweedejaars planten bloeien met schermbloemen"),
        **growing(8, "Zaadvorming", 5, "Zaad rijpt"),
        **growing(9, "Herfstgroei", 5, "Verse bladgroei in koeler weer"),
        **growing(10, "Laatste oogst", 4, "Oogsten voor de vorst"),
        **evergreen(11, "Wintergroen", 3, "Kan met bescherming overleven"),
        **evergreen(12, "Wintergroen", 2, "Minimale groei"),
    }, frost_sensitive=False, min_temp_c=-10, max_height_cm=30, max_spread_cm=20,
       facts_nl="Peterselie is een tweejarige plant — het eerste jaar vormt het blad, het tweede jaar bloeit het en sterft af. In de oudheid werd peterselie geassocieerd met de dood en werd het niet gegeten. Tegenwoordig is het het meest gebruikte keukenkruid in de Nederlandse keuken.",
       sow=[3, 4, 5], harvest=[4, 5, 6, 7, 8, 9, 10]),
})

PLANTS.append({
    "slug": "dille",
    "common_name_nl": "Dille",
    "common_name_en": "Dill",
    "latin_name": "Anethum graveolens",
    "climate_zone": "temperate",
    "phenology_json": pheno({
        **dormant_months([1, 2, 11, 12], "Rust", "Eenjarig — zaad overblijvend in de bodem"),
        **establishing(3, "Kieming", 6, "Zaad kiemt bij bodemtemperatuur boven 10C", ["Zaaien in maart onder glas of april buiten"]),
        **growing(4, "Bladgroei", 7, "Fijn, gevederd blad ontwikkelt", ["Uitdunnen op 15 cm"]),
        **growing(5, "Stengelgroei", 8, "Holle stengels schieten omhoog"),
        **flowering(6, "Bloei", 8, "Grote gele schermbloemen", ["Zaad oogsten voor keuken of volgend jaar"]),
        **flowering(7, "Bloei & zaad", 7, "Bloemen gaan over in zaad"),
        **growing(8, "Zaadrijping", 7, "Zaad droogt aan de plant", ["Zaad verzamelen in papieren zak"]),
        **growing(9, "Zelfuitzaai", 6, "Rijpe zaden vallen uit"),
        **dying_back(10, "Afsterven", 0, "Plant sterft af na zaadzetting"),
    }, frost_sensitive=True, min_temp_c=0, max_height_cm=100, max_spread_cm=30,
       facts_nl="Dille is een eenjarige plant die zichzelf makkelijk uitzaait — eenmaal in de tuin komt hij elk jaar terug. Het kruid is onmisbaar in de Scandinavische keuken (bij zalm) en bij ingelegde augurken. Dillezaad wordt ook gebruikt als specerij in brood en soepen.",
       sow=[3, 4, 5], harvest=[5, 6, 7, 8]),
})

PLANTS.append({
    "slug": "koriander",
    "common_name_nl": "Koriander",
    "common_name_en": "Coriander / Cilantro",
    "latin_name": "Coriandrum sativum",
    "climate_zone": "temperate",
    "phenology_json": pheno({
        **dormant_months([1, 2, 11, 12], "Rust", "Eenjarig — zaad overblijvend"),
        **establishing(3, "Kieming", 7, "Zaad kiemt in 2-3 weken", ["Binnen voorzaaien of buiten na IJsheiligen"]),
        **growing(4, "Bladgroei", 7, "Frisgroen blad voor bladkoriander", ["Regelmatig oogsten voor langere bladproductie"]),
        **growing(5, "Bladgroei", 7, "Piek bladproductie"),
        **flowering(6, "Doorschieten", 8, "Warme dagen triggeren bloei — witte schermbloemen"),
        **growing(7, "Zaadvorming", 8, "Groene zaadjes rijpen naar bruin", ["Zaad oogsten voor specerij (korianderzaad)"]),
        **growing(8, "Zaadrijping", 7, "Zaad droogt in"),
        **growing(9, "Zelfuitzaai", 6, "Zaad valt, nieuwe planten kiemen spontaan"),
        **dying_back(10, "Afsterven", 0, "Plant sterft af"),
    }, frost_sensitive=True, min_temp_c=2, max_height_cm=60, max_spread_cm=25,
       facts_nl="Koriander is een van de weinige kruiden waarvan zowel het blad (cilantro) als het zaad (koriander) wordt gebruikt. De smaak van het blad is omstreden — voor sommige mensen smaakt het naar zeep door een genetische variant die bepaalde aldehyden extra sterk laat proeven.",
       sow=[3, 4, 5], harvest=[5, 6, 7, 8, 9]),
})

PLANTS.append({
    "slug": "basilicum",
    "common_name_nl": "Basilicum",
    "common_name_en": "Basil",
    "latin_name": "Ocimum basilicum",
    "climate_zone": "temperate",
    "phenology_json": pheno({
        **dormant_months([1, 2, 3, 10, 11, 12], "Rust", "Eenjarig — overleeft geen vorst, alleen binnenshuis in winter", ["Jan-maart: binnen voorzaaien op warme vensterbank"]),
        **establishing(4, "Kieming", 6, "Zaad kiemt bij 20C in 1-2 weken", ["Zaaien onder glas of binnen"]),
        **growing(5, "Bladgroei", 7, "Eerste echte bladeren", ["Toppen voor bossige plant"]),
        **growing(6, "Sterke groei", 8, "Volle aromatische bladeren", ["Regelmatig toppen en oogsten — voorkomt bloei"]),
        **growing(7, "Piek zomer", 8, "Maximale bladproductie", ["Blijf bloeiende toppen verwijderen"]),
        **flowering(8, "Doorschieten", 7, "Witte bloemaren verschijnen", ["Bloemknoppen direct verwijderen voor betere smaak"]),
        **growing(9, "Nazomer", 6, "Laatste bladgroei, plant verzwakt"),
        **dying_back(10, "Afsterven", 0, "Sterft bij temperaturen onder 10C", ["Laatste oogst voor de kou"]),
    }, frost_sensitive=True, min_temp_c=5, max_height_cm=60, max_spread_cm=30,
       facts_nl="Basilicum komt oorspronkelijk uit India en is daar een heilige plant. In de Italiaanse keuken is Genovese basilicum het fundament van pesto. De plant is extreem vorstgevoelig — onder de 10C stopt de groei en bij 5C treedt koudeschade op.",
       sow=[3, 4, 5], harvest=[5, 6, 7, 8, 9]),
})


# ── VEGETABLES & FRUIT ──

PLANTS.append({
    "slug": "sla",
    "common_name_nl": "Sla",
    "common_name_en": "Lettuce",
    "latin_name": "Lactuca sativa",
    "climate_zone": "temperate",
    "phenology_json": pheno({
        **dormant_months([1, 11, 12], "Rust", "Winterrust, zaad in de bodem"),
        **establishing(2, "Vroege zaai", 4, "Binnen voorzaaien of onder glas", ["Feb: binnen voorzaaien op vensterbank"]),
        **growing(3, "Kieming", 5, "Buiten zaaien onder glas", ["Maart-april: zaaien in de volle grond"]),
        **growing(4, "Kropvorming", 6, "Bladeren ontwikkelen zich tot kroppen", ["Uitdunnen op 25 cm"]),
        **growing(5, "Oogst", 5, "Eerste kroppen oogstbaar", ["Oogsten in de ochtend voor knapperigste blad"]),
        **harvest_m(6, "Oogst", 4, "Doorlopend oogsten", ["Elke 2-3 weken nieuw zaaien voor continue oogst"]),
        **harvest_m(7, "Oogst", 4, "Zomersla, kans op doorschieten in hitte"),
        **harvest_m(8, "Oogst", 5, "Late zomersla, herfstrassen zaaien"),
        **harvest_m(9, "Oogst", 5, "Herfstsla oogsten, wintersla zaaien"),
        **growing(10, "Winterteelt", 4, "Winterharde rassen onder glas of in koude bak"),
    }, frost_sensitive=True, min_temp_c=-2, max_height_cm=25, max_spread_cm=25,
       facts_nl="Sla wordt al meer dan 4500 jaar geteeld — de oude Egyptenaren beeldden sla af op grafschilderingen. Nederland is een van de grootste sla-exporteurs ter wereld. Er bestaan honderden rassen, van botersla tot eikenbladsla en romaine.",
       sow=[2, 3, 4, 5, 6, 7, 8, 9], harvest=[5, 6, 7, 8, 9, 10]),
})

PLANTS.append({
    "slug": "courgette",
    "common_name_nl": "Courgette",
    "common_name_en": "Zucchini",
    "latin_name": "Cucurbita pepo",
    "climate_zone": "temperate",
    "phenology_json": pheno({
        **dormant_months([1, 2, 3, 10, 11, 12], "Rust", "Eenjarig — overleeft winter niet"),
        **establishing(4, "Zaaien", 6, "Binnen voorzaaien in potjes", ["Zaai in april binnen voor"]),
        **growing(5, "Uitplanten", 8, "Na IJsheiligen uitplanten op zonnige plek", ["Planten op 1 m2 per stuk"]),
        **growing(6, "Bladgroei", 8, "Grote bladeren ontwikkelen, eerste bloemen"),
        **growing(7, "Vruchtzetting", 8, "Mannelijke en vrouwelijke bloemen — courgettes vormen", ["Regelmatig oogsten bij 15-20 cm"]),
        **harvest_m(7, "Oogst", 8, "Eerste courgettes oogsten"),
        **harvest_m(8, "Piekoogst", 7, "Dagelijks oogsten nodig — groeien snel"),
        **harvest_m(9, "Laatste oogst", 5, "Productie neemt af", ["Laat geen reuzen aan de plant — dat remt nieuwe vruchten"]),
        **dying_back(10, "Afsterven", 0, "Plant sterft bij eerste vorst"),
    }, frost_sensitive=True, min_temp_c=5, max_height_cm=60, max_spread_cm=150,
       facts_nl="Courgettes groeien zo snel dat tuiniers in augustus vaak met een overschot zitten. De bloemen zijn ook eetbaar — gevuld met ricotta en gefrituurd zijn ze een Italiaanse delicatesse. Eén plant kan 15-20 courgettes produceren.",
       sow=[4, 5], transplant=[5, 6], harvest=[7, 8, 9]),
})

PLANTS.append({
    "slug": "paprika",
    "common_name_nl": "Paprika",
    "common_name_en": "Bell Pepper",
    "latin_name": "Capsicum annuum",
    "climate_zone": "temperate",
    "phenology_json": pheno({
        **dormant_months([1, 10, 11, 12], "Rust", "Eenjarig in NL — kan als vaste plant binnen overwinteren"),
        **establishing(2, "Vroeg zaaien", 4, "Binnen voorzaaien op warmtemat (22C)", ["Zaai onder groeilamp voor sterke planten"]),
        **establishing(3, "Opkweek", 5, "Zaailingen verspenen in potjes"),
        **growing(4, "Opkweek", 6, "Planten groeien binnen op"),
        **growing(5, "Uitplanten", 8, "Na IJsheiligen in kas of op zonnige plek buiten", ["Uitplanten op 40 cm afstand"]),
        **growing(6, "Bloei", 8, "Witte sterbloemen, eerste vruchtzetting"),
        **growing(7, "Vruchtgroei", 8, "Paprika's groeien van groen naar rood/geel"),
        **harvest_m(8, "Oogst", 7, "Rijpe paprika's oogsten", ["Oogst stimuleert nieuwe vruchten"]),
        **harvest_m(9, "Oogst", 6, "Laatste paprika's voor de kou"),
        **dying_back(10, "Opruimen", 0, "Plant opruimen of binnen laten overwinteren", ["Gezonde planten kunnen binnen overwinteren"]),
    }, frost_sensitive=True, min_temp_c=8, max_height_cm=90, max_spread_cm=60,
       facts_nl="Paprika's hebben veel warmte nodig en doen het in Nederland het beste in een kas of op een zeer beschutte zuidmuur. Groene paprika's zijn eigenlijk onrijpe rode paprika's — naarmate ze rijpen worden ze zoeter en stijgt het vitamine C-gehalte.",
       sow=[2, 3, 4], transplant=[5, 6], harvest=[7, 8, 9]),
})

PLANTS.append({
    "slug": "boerenkool",
    "common_name_nl": "Boerenkool",
    "common_name_en": "Kale",
    "latin_name": "Brassica oleracea var. sabellica",
    "climate_zone": "temperate",
    "phenology_json": pheno({
        **evergreen(1, "Winteroogst", 2, "Blad blijft oogstbaar in de winter, vorst maakt het zoeter", ["Na vorst oogsten voor de zoetste smaak"]),
        **evergreen(2, "Winteroogst", 3, "Doorlopend oogsten van onderste bladeren"),
        **evergreen(3, "Winteroogst", 5, "Laatste winteroogst voor plant begint te schieten"),
        **growing(4, "Doorschieten", 6, "Tweedejaars planten vormen bloemstengels (eetbare bloemknoppen)"),
        **flowering(5, "Bloei", 7, "Gele kruisbloemen, bijenplant"),
        **growing(6, "Zaadrijping", 6, "Hauwen met zaad ontwikkelen"),
        **growing(7, "Zaad oogsten", 6, "Zaad droogt in", ["Zaad verzamelen voor volgend jaar"]),
        **growing(8, "Nieuwe zaai", 5, "Jonge planten uit zaad van dit jaar", ["Zomerzaai voor winteroogst"]),
        **growing(9, "Jonge planten", 6, "Planten ontwikkelen zich"),
        **growing(10, "Plantengroei", 5, "Stevige planten voor de winter"),
        **growing(11, "Wintergroei", 2, "Langzame groei, vorst verdraagzaam"),
        **evergreen(12, "Winteroogst", 1, "Klaar voor winteroogst"),
    }, frost_sensitive=False, min_temp_c=-15, max_height_cm=90, max_spread_cm=60,
       facts_nl="Boerenkool is een oer-Hollands wintervoedsel en het hoofdingredient van stamppot boerenkool met worst. De plant wordt zoeter na vorst omdat de kou zetmeel omzet in suiker — een natuurlijk antivriesmechanisme van de plant.",
       sow=[5, 6, 7], harvest=[10, 11, 12, 1, 2, 3]),
})

PLANTS.append({
    "slug": "wortel",
    "common_name_nl": "Wortel",
    "common_name_en": "Carrot",
    "latin_name": "Daucus carota",
    "climate_zone": "temperate",
    "phenology_json": pheno({
        **dormant_months([1, 2, 11, 12], "Rust", "Tweejarig — wortel overwintert in de grond of in opslag"),
        **establishing(3, "Vroege zaai", 5, "Eerste zaai onder glas of tunnel", ["Zaaien op rijen, 2 cm diep"]),
        **establishing(4, "Kieming", 7, "Zaad kiemt langzaam in 2-3 weken", ["Grond vochtig houden tijdens kieming"]),
        **growing(5, "Loofgroei", 7, "Loof ontwikkelt, wortel begint te verdikken", ["Uitdunnen op 3-5 cm"]),
        **growing(6, "Wortelgroei", 7, "Wortels groeien in lengte en dikte"),
        **harvest_m(7, "Oogst", 7, "Zomerwortels oogsten", ["Oogsten wanneer de wortel de gewenste grootte heeft"]),
        **harvest_m(8, "Hoofdoogst", 6, "Hoofdseizoen wortels oogsten"),
        **harvest_m(9, "Oogst", 6, "Herfstwortels, bewaren voor de winter"),
        **harvest_m(10, "Laatste oogst", 4, "Winterwortels rooien", ["Inkuilen in zand voor winterbewaring"]),
    }, frost_sensitive=False, min_temp_c=-5, max_height_cm=40, max_spread_cm=10,
       facts_nl="Wilde wortels komen van nature voor in Nederland — de peen is wit, niet oranje. Oranje wortels zijn in de 17e eeuw in Nederland ontwikkeld als eerbetoon aan het Huis van Oranje. Wortels werden pas zoet genoeg om rauw te eten door veredeling in de 18e eeuw.",
       sow=[3, 4, 5, 6, 7], harvest=[6, 7, 8, 9, 10]),
})

PLANTS.append({
    "slug": "prei",
    "common_name_nl": "Prei",
    "common_name_en": "Leek",
    "latin_name": "Allium ampeloprasum",
    "climate_zone": "temperate",
    "phenology_json": pheno({
        **evergreen(1, "Winteroogst", 1, "Winterprei oogstbaar", ["Oogsten voor vorst als de grond dichtvriest"]),
        **evergreen(2, "Winteroogst", 2, "Winterprei doorlopend oogsten"),
        **establishing(3, "Zaai", 5, "Zomerprei zaaien onder glas"),
        **growing(4, "Jonge plant", 6, "Zaailingen groeien, uitplanten in mei"),
        **growing(5, "Uitplanten", 7, "Planten op 15 cm, aanaarden voor lange witte schacht"),
        **growing(6, "Groei", 7, "Prei groeit in dikte en lengte"),
        **growing(7, "Groei", 7, "Volle zomergroei"),
        **harvest_m(7, "Zomerprei", 7, "Eerste zomerprei oogsten"),
        **harvest_m(8, "Oogst", 6, "Zomer- en herfstprei oogsten"),
        **harvest_m(9, "Herfstprei", 5, "Herfstprei oogsten"),
        **harvest_m(10, "Winterprei", 3, "Winterprei staat klaar, kan tot maart in de grond blijven"),
        **evergreen(11, "Winterprei", 1, "Winterharde prei in de grond"),
    }, frost_sensitive=False, min_temp_c=-10, max_height_cm=60, max_spread_cm=15,
       facts_nl="Prei is een van de oudste gecultiveerde groenten en werd al door de oude Egyptenaren gegeten. Keizer Nero at zoveel prei dat hij de bijnaam 'Porrophagus' (prei-eter) kreeg — hij geloofde dat prei zijn stem verbeterde om toespraken te houden.",
       sow=[3, 4], transplant=[5, 6], harvest=[7, 8, 9, 10, 11, 12, 1]),
})

PLANTS.append({
    "slug": "aardappel",
    "common_name_nl": "Aardappel",
    "common_name_en": "Potato",
    "latin_name": "Solanum tuberosum",
    "climate_zone": "temperate",
    "phenology_json": pheno({
        **dormant_months([1, 2, 11, 12], "Rust", "Pootgoed in koele, donkere opslag", ["Pootaardappelen in het licht laten kiemen vanaf februari"]),
        **establishing(3, "Voorkiemen", 3, "Pootgoed kiemt in het licht", ["Pootgoed in eierdozen in het licht"]),
        **establishing(4, "Poten", 6, "Eerste vroege rassen poten", ["Poten als de grond warm genoeg is"]),
        **growing(5, "Opkomst", 7, "Loof komt boven, aanaarden tegen vorst", ["Aanaarden voor hogere opbrengst"]),
        **growing(6, "Loofgroei & knolzetting", 8, "Bloei en ondergrondse knolvorming"),
        **growing(7, "Knolgroei", 7, "Aardappels groeien onder de grond"),
        **harvest_m(7, "Vroege oogst", 6, "Eerste vroege aardappels rooien"),
        **harvest_m(8, "Hoofdoogst", 6, "Middelvroege en late rassen oogsten"),
        **harvest_m(9, "Late oogst", 5, "Laatste aardappels rooien", ["Loof afknippen 2 weken voor oogst voor steviger schil"]),
        **dying_back(10, "Loof afsterven", 0, "Loof sterft af, oogst afronden"),
    }, frost_sensitive=True, min_temp_c=-1, max_height_cm=80, max_spread_cm=45,
       facts_nl="De aardappel kwam in de 16e eeuw vanuit Zuid-Amerika naar Europa en werd aanvankelijk als oneetbaar gezien — men probeerde de giftige bessen te eten in plaats van de knollen. Nederland is nu een van de grootste aardappelexporteurs ter wereld en produceert jaarlijks ruim 6 miljard kilo.",
       sow=[], transplant=[4, 5], harvest=[7, 8, 9, 10]),
})

PLANTS.append({
    "slug": "komkommer",
    "common_name_nl": "Komkommer",
    "common_name_en": "Cucumber",
    "latin_name": "Cucumis sativus",
    "climate_zone": "temperate",
    "phenology_json": pheno({
        **dormant_months([1, 2, 3, 10, 11, 12], "Rust", "Eenjarig in NL klimaat"),
        **establishing(4, "Zaaien binnen", 5, "Binnen voorzaaien in potjes bij 22C", ["Zaai in april binnen"]),
        **growing(5, "Uitplanten", 8, "Na IJsheiligen in kas of op beschutte plek", ["Klimsteun plaatsen"]),
        **growing(6, "Groei & bloei", 8, "Ranken groeien, gele bloemen"),
        **growing(7, "Vruchtgroei", 8, "Komkommers groeien snel", ["Regelmatig water geven, niet op blad"]),
        **harvest_m(7, "Oogst", 7, "Eerste komkommers oogsten bij 20-30 cm"),
        **harvest_m(8, "Piekoogst", 7, "Dagelijks oogsten voor beste kwaliteit"),
        **harvest_m(9, "Naoogst", 5, "Productie neemt af in koeler weer"),
        **dying_back(10, "Einde seizoen", 0, "Plant sterft af bij lagere temperaturen"),
    }, frost_sensitive=True, min_temp_c=10, max_height_cm=250, max_spread_cm=45,
       facts_nl="Komkommers bestaan voor 96% uit water. In Nederland worden ze bijna altijd in kassen geteeld — de Nederlandse komkommerteelt is een van de meest geavanceerde ter wereld. Een komkommerplant kan onder ideale omstandigheden 25-30 vruchten produceren.",
       sow=[4], transplant=[5, 6], harvest=[7, 8, 9]),
})


# ── INDOOR PLANTS ──

PLANTS.append({
    "slug": "lepelplant",
    "common_name_nl": "Lepelplant",
    "common_name_en": "Peace Lily",
    "latin_name": "Spathiphyllum wallisii",
    "climate_zone": "tropical",
    "phenology_json": pheno({
        **evergreen(1, "Bloeirust", 2, "Minder bloei in de winter, blad blijft glanzend groen"),
        **evergreen(2, "Langzame groei", 3, "Nauwelijks groei, niet bemesten"),
        **growing(3, "Voorjaarsgroei", 4, "Nieuwe bladeren verschijnen", ["Verpotten indien nodig"]),
        **growing(4, "Bladgroei", 4, "Actieve groei van blad"),
        **growing(5, "Bloei-opbouw", 5, "Bloemstengels beginnen te vormen"),
        **flowering(6, "Bloei", 4, "Witte bloemen (eigenlijk schutbladeren)", ["Regelmatig benevelen voor luchtvochtigheid"]),
        **flowering(7, "Volle bloei", 4, "Meerdere witte bloemen tegelijk"),
        **flowering(8, "Bloei", 3, "Aanhoudende bloei bij goede verzorging"),
        **growing(9, "Nazomer", 3, "Bloei neemt af, bladgroei gaat door"),
        **growing(10, "Wintervoorbereiding", 2, "Minder water, geen mest"),
        **evergreen(11, "Winterrust", 1, "Minimale watergift, geen bemesting"),
        **evergreen(12, "Winterrust", 1, "Blad glanzend houden, stof afnemen"),
    }, frost_sensitive=True, min_temp_c=12, max_height_cm=80, max_spread_cm=60,
       facts_nl="De Lepelplant is een van de beste luchtzuiverende kamerplanten — NASA-onderzoek toonde aan dat hij benzeen, formaldehyde en trichloorethyleen uit de lucht filtert. De 'bloem' is eigenlijk een wit schutblad dat een bloeikolf omhult."),
})

PLANTS.append({
    "slug": "gatenplant",
    "common_name_nl": "Gatenplant",
    "common_name_en": "Swiss Cheese Plant",
    "latin_name": "Monstera deliciosa",
    "climate_zone": "tropical",
    "phenology_json": pheno({
        **evergreen(1, "Winterrust", 2, "Langzame groei, blad blijft groen en glanzend"),
        **evergreen(2, "Minimale groei", 3, "Niet bemesten, minder water"),
        **growing(3, "Voorjaarsgroei", 4, "Eerste nieuwe blad ontrolt"),
        **growing(4, "Actieve groei", 5, "Grote nieuwe bladeren met gaten", ["Mosstok plaatsen voor klimsteun"]),
        **growing(5, "Snelle groei", 6, "Bladeren kunnen 50 cm breed worden"),
        **growing(6, "Zomergroei", 5, "Actieve groei, wekelijks water", ["Regelmatig benevelen"]),
        **growing(7, "Zomergroei", 5, "Piek groeiseizoen, luchtwortels ontwikkelen"),
        **growing(8, "Groei", 4, "Aanhoudende groei"),
        **growing(9, "Nazomer", 3, "Groei vertraagt licht"),
        **growing(10, "Wintervoorbereiding", 2, "Minder water geven"),
        **evergreen(11, "Winterrust", 1, "Minimale verzorging"),
        **evergreen(12, "Winterrust", 1, "Blad stofvrij houden voor optimale fotosynthese"),
    }, frost_sensitive=True, min_temp_c=12, max_height_cm=400, max_spread_cm=200,
       facts_nl="In de tropen groeit de Monstera als klimplant tegen bomen omhoog en kan hij 20 meter hoog worden. De gaten in het blad (fenestratie) helpen de plant om wind te weerstaan in zijn natuurlijke habitat. De vrucht is eetbaar en smaakt naar een mix van banaan en ananas."),
})

PLANTS.append({
    "slug": "vrouwentongen",
    "common_name_nl": "Vrouwentongen",
    "common_name_en": "Snake Plant",
    "latin_name": "Sansevieria trifasciata",
    "climate_zone": "tropical",
    "phenology_json": pheno({
        **evergreen(1, "Winterrust", 1, "Bijna geen groei, zeer weinig water nodig"),
        **evergreen(2, "Winterrust", 1, "Geen water of bemesting nodig"),
        **growing(3, "Eerste groei", 2, "Nieuwe scheuten kunnen verschijnen"),
        **growing(4, "Groei", 3, "Langzame gestage groei"),
        **growing(5, "Lentegroei", 4, "Actief groeiseizoen begint"),
        **growing(6, "Zomergroei", 4, "Nieuwe bladeren ontwikkelen", ["Eens per maand licht water geven"]),
        **growing(7, "Zomergroei", 3, "Actieve groei, warmte-minnend"),
        **flowering(8, "Mogelijk bloei", 3, "Kan bloeien met geurige groenwitte bloemen bij stress"),
        **growing(9, "Nazomer", 2, "Groei neemt langzaam af"),
        **growing(10, "Wintervoorbereiding", 1, "Water drastisch minderen"),
        **evergreen(11, "Winterrust", 1, "Geen water — rotgevoelig in kou"),
        **evergreen(12, "Winterrust", 1, "Absoluut droog houden in de winter"),
    }, frost_sensitive=True, min_temp_c=10, max_height_cm=120, max_spread_cm=60,
       facts_nl="Vrouwentongen zijn vrijwel onverwoestbaar en een van de beste planten voor beginners. Ze zetten 's nachts CO2 om in zuurstof (CAM-fotosynthese), waardoor ze ideaal zijn voor in de slaapkamer. Overwatering is de enige manier om deze plant dood te krijgen."),
})

PLANTS.append({
    "slug": "pannenkoekenplant",
    "common_name_nl": "Pannenkoekenplant",
    "common_name_en": "Chinese Money Plant",
    "latin_name": "Pilea peperomioides",
    "climate_zone": "temperate",
    "phenology_json": pheno({
        **evergreen(1, "Winterrust", 2, "Langzame groei, blad blijft rond en frisgroen"),
        **evergreen(2, "Minimale groei", 3, "Weinig water"),
        **growing(3, "Ontwaken", 5, "Eerste nieuwe bladeren verschijnen"),
        **growing(4, "Lentegroei", 6, "Nieuwe bladeren ontvouwen als pannenkoeken"),
        **growing(5, "Actieve groei", 6, "Snelle groei, stekjes (pups) verschijnen", ["Stekjes uitgraven en oppotten als cadeau"]),
        **growing(6, "Zomergroei", 5, "Volle groei, regelmatig draaien voor symmetrische vorm"),
        **growing(7, "Zomergroei", 5, "Piek groeiseizoen"),
        **growing(8, "Groei", 4, "Aanhoudende groei"),
        **growing(9, "Nazomer", 4, "Groei vertraagt, stekjesproductie neemt af"),
        **growing(10, "Wintervoorbereiding", 2, "Minder water, geen mest"),
        **evergreen(11, "Winterrust", 1, "Minimale verzorging"),
        **evergreen(12, "Winterrust", 1, "Blad behoudt zijn ronde vorm"),
    }, frost_sensitive=True, min_temp_c=10, max_height_cm=40, max_spread_cm=30,
       facts_nl="De Pannenkoekenplant was vrijwel onbekend tot de jaren 1970, toen een Noorse missionaris hem vanuit China meebracht naar Scandinavie. Van daaruit verspreidde de plant zich via stekjes door heel Europa — een van de eerste 'social media planten' avant la lettre."),
})

PLANTS.append({
    "slug": "drakenklimop",
    "common_name_nl": "Drakenklimop",
    "common_name_en": "Golden Pothos",
    "latin_name": "Epipremnum aureum",
    "climate_zone": "tropical",
    "phenology_json": pheno({
        **evergreen(1, "Winterrust", 1, "Hangende stengels, bijna geen groei", ["Zeer weinig water, alleen als blad slap hangt"]),
        **evergreen(2, "Winterrust", 1, "Geen bemesting, spaarzaam water"),
        **growing(3, "Eerste groei", 3, "Nieuwe bladpunten verschijnen"),
        **growing(4, "Lentegroei", 5, "Groei komt op gang"),
        **growing(5, "Slingergroei", 5, "Stengels verlengen, nieuwe bladeren ontvouwen", ["Stengels leiden of laten hangen"]),
        **growing(6, "Snelle groei", 5, "Kan 30 cm per maand groeien"),
        **growing(7, "Piek zomer", 5, "Maximale groeisnelheid", ["Regelmatig stekken voor nieuwe planten"]),
        **growing(8, "Zomergroei", 4, "Aanhoudende groei"),
        **growing(9, "Nazomer", 3, "Groei vertraagt"),
        **growing(10, "Wintervoorbereiding", 2, "Minder water en geen voeding"),
        **evergreen(11, "Winterrust", 1, "Minimaal water"),
        **evergreen(12, "Winterrust", 1, "Bijna droog houden"),
    }, frost_sensitive=True, min_temp_c=10, max_height_cm=1000, max_spread_cm=200,
       facts_nl="Drakenklimop is een van de makkelijkste kamerplanten en groeit zelfs in water. In de tropen kan hij boomstammen beklimmen en bladeren ontwikkelen van meer dan 50 cm. De plant staat bekend om zijn luchtzuiverende eigenschappen en verwijdert formaldehyde uit de lucht."),
})

PLANTS.append({
    "slug": "rubberplant",
    "common_name_nl": "Rubberplant",
    "common_name_en": "Rubber Plant",
    "latin_name": "Ficus elastica",
    "climate_zone": "tropical",
    "phenology_json": pheno({
        **evergreen(1, "Winterrust", 2, "Grote glanzende bladeren, geen groei"),
        **evergreen(2, "Winterrust", 3, "Zeer weinig water"),
        **growing(3, "Ontwaken", 5, "Eerste nieuw blad, herkenbaar aan rode bladschede"),
        **growing(4, "Lentegroei", 6, "Nieuwe bladeren ontrollen", ["Blad afnemen met vochtige doek"]),
        **growing(5, "Actieve groei", 6, "Maandelijks nieuw blad aan de top"),
        **growing(6, "Zomergroei", 5, "Actieve groei, warmte-minnend"),
        **growing(7, "Piek zomer", 5, "Snelste groei van het jaar"),
        **growing(8, "Groei", 4, "Aanhoudende groei bij warmte"),
        **growing(9, "Nazomer", 3, "Groei vertraagt"),
        **growing(10, "Wintervoorbereiding", 2, "Laatste blad van het seizoen kan verschijnen"),
        **evergreen(11, "Winterrust", 1, "Niet bemesten, water minderen"),
        **evergreen(12, "Winterrust", 1, "Minimale verzorging"),
    }, frost_sensitive=True, min_temp_c=12, max_height_cm=300, max_spread_cm=100,
       facts_nl="De Rubberplant werd oorspronkelijk gekweekt voor de latexproductie, maar is hiervoor vervangen door de Braziliaanse rubberboom. Als kamerplant kan hij met goede verzorging het plafond bereiken. Het witte melksap is licht giftig en kan huidirritatie geven."),
})

PLANTS.append({
    "slug": "orchidee",
    "common_name_nl": "Orchidee",
    "common_name_en": "Moth Orchid",
    "latin_name": "Phalaenopsis",
    "climate_zone": "tropical",
    "phenology_json": pheno({
        **flowering(1, "Bloei", 2, "Bloemen kunnen maanden bloeien", ["Uitgebloeide bloemen laten vallen, stengel niet afknippen"]),
        **flowering(2, "Bloei", 2, "Nabloei, tak kan opnieuw uitlopen"),
        **flowering(3, "Bloei", 3, "Kan nog in bloei staan", ["Na uitbloei: stengel terugsnoeien boven tweede oog"]),
        **growing(4, "Bladgroei", 3, "Nieuwe bladeren van binnenuit"),
        **growing(5, "Lentegroei", 4, "Wortels en blad ontwikkelen", ["Eens per 2 weken dompelen in water"]),
        **growing(6, "Bloemstengel", 4, "Nieuwe bloemtak kan verschijnen"),
        **growing(7, "Knopvorming", 4, "Bloemknoppen langs de stengel"),
        **growing(8, "Knopzwelling", 4, "Knoppen zwellen, bijna open"),
        **flowering(9, "Eerste bloei", 3, "Eerste bloemen van het seizoen openen"),
        **flowering(10, "Bloei", 2, "Volop in bloei — bloemen gaan maanden mee"),
        **flowering(11, "Bloei", 2, "In bloei bij goede verzorging"),
        **flowering(12, "Bloei", 2, "Winterbloeier — kleur in huis tijdens donkere dagen"),
    }, frost_sensitive=True, min_temp_c=15, max_height_cm=60, max_spread_cm=30,
       facts_nl="Phalaenopsis-orchideeen zijn de populairste kamerplanten van Nederland. In de natuur groeien ze op bomen (epifytisch) en halen ze vocht uit de lucht via hun luchtwortels. Met goede verzorging kan een orchidee maandenlang bloeien en jaren meegaan."),
})

PLANTS.append({
    "slug": "flamingoplant",
    "common_name_nl": "Flamingoplant",
    "common_name_en": "Flamingo Flower",
    "latin_name": "Anthurium andraeanum",
    "climate_zone": "tropical",
    "phenology_json": pheno({
        **flowering(1, "Bloei", 2, "Rode, roze of witte schutbladeren, bloeit het hele jaar door mogelijk"),
        **flowering(2, "Bloei", 2, "Kan in bloei staan"),
        **growing(3, "Voorjaarsgroei", 3, "Nieuw blad en bloemstengels verschijnen"),
        **flowering(4, "Bloei", 3, "Nieuwe bloemen openen", ["Hoge luchtvochtigheid aanhouden"]),
        **flowering(5, "Bloei", 3, "Meerdere bloemen tegelijk"),
        **flowering(6, "Bloei", 3, "Zomerbloei op zijn mooist"),
        **flowering(7, "Bloei", 3, "Aanhoudende bloei bij warmte"),
        **flowering(8, "Bloei", 3, "Doorbloeiend"),
        **growing(9, "Nazomer", 2, "Nieuwe bladgroei, bloei kan doorgaan"),
        **growing(10, "Groei", 2, "Minder bloemen in kortere dagen"),
        **evergreen(11, "Winterrust", 1, "Minder water, geen mest"),
        **flowering(12, "Bloei", 1, "Kan winter doorbloeien bij optimale omstandigheden"),
    }, frost_sensitive=True, min_temp_c=15, max_height_cm=60, max_spread_cm=40,
       facts_nl="De 'bloem' van de Anthurium is eigenlijk een gekleurd schutblad met een bloeikolf erop. De plant komt oorspronkelijk uit de regenwouden van Colombia en houdt van warmte en een hoge luchtvochtigheid. Anthuriums staan in de top 5 van meest verkochte kamerplanten in Nederland."),
})

PLANTS.append({
    "slug": "krulvaren",
    "common_name_nl": "Krulvaren",
    "common_name_en": "Boston Fern",
    "latin_name": "Nephrolepis exaltata",
    "climate_zone": "tropical",
    "phenology_json": pheno({
        **evergreen(1, "Winterrust", 2, "Langzame groei, bladeren kunnen bruine punten krijgen in droge lucht"),
        **evergreen(2, "Winterrust", 2, "Regelmatig benevelen voor luchtvochtigheid"),
        **growing(3, "Ontwaken", 3, "Eerste nieuwe krullen (fiddleheads) verschijnen"),
        **growing(4, "Lentegroei", 4, "Nieuwe bladeren ontrollen zich"),
        **growing(5, "Actieve groei", 4, "Verse lichtgroene bladgroei"),
        **growing(6, "Zomergroei", 4, "Weelderige bladmassa ontwikkelt", ["Wekelijks benevelen, niet laten uitdrogen"]),
        **growing(7, "Piek groei", 4, "Volle, hangende bladeren"),
        **growing(8, "Zomergroei", 4, "Aanhoudende groei bij warmte en vocht"),
        **growing(9, "Nazomer", 3, "Groei vertraagt"),
        **growing(10, "Wintervoorbereiding", 2, "Minder water, blijven benevelen"),
        **evergreen(11, "Winterrust", 1, "Langzame groei, uitkijken voor bruine bladpunten"),
        **evergreen(12, "Winterrust", 1, "Regelmatig benevelen in droge CV-lucht"),
    }, frost_sensitive=True, min_temp_c=10, max_height_cm=90, max_spread_cm=120,
       facts_nl="Varens behoren tot de oudste planten op aarde en bestaan al meer dan 360 miljoen jaar — ruim voor de dinosauriers. De Krulvaren is een van de beste planten voor het verhogen van de luchtvochtigheid in huis en filtert schadelijke stoffen uit de lucht."),
})

PLANTS.append({
    "slug": "graslelie",
    "common_name_nl": "Graslelie",
    "common_name_en": "Spider Plant",
    "latin_name": "Chlorophytum comosum",
    "climate_zone": "temperate",
    "phenology_json": pheno({
        **evergreen(1, "Winterrust", 2, "Bonte bladeren blijven decoratief"),
        **evergreen(2, "Winterrust", 2, "Minimale verzorging"),
        **growing(3, "Ontwaken", 4, "Nieuwe bladgroei vanuit het hart"),
        **growing(4, "Lentegroei", 6, "Frisgroen-wit gestreept blad ontwikkelt"),
        **growing(5, "Bloemstengels", 6, "Lange uitlopers met witte bloemetjes", ["Uitlopers geven stekjes (kindles)"]),
        **growing(6, "Stekjes", 6, "Kindles aan uitlopers ontwikkelen wortels", ["Stekjes afknippen en oppotten"]),
        **growing(7, "Zomergroei", 5, "Volle plant, vele uitlopers"),
        **growing(8, "Zomergroei", 5, "Piek stekjesproductie"),
        **growing(9, "Nazomer", 4, "Aanhoudende groei"),
        **growing(10, "Wintervoorbereiding", 2, "Stekjesproductie stopt"),
        **evergreen(11, "Winterrust", 1, "Minder water"),
        **evergreen(12, "Winterrust", 1, "Kan wat flets worden in te donkere standplaats"),
    }, frost_sensitive=True, min_temp_c=5, max_height_cm=30, max_spread_cm=50,
       facts_nl="De Graslelie is een van de weinige planten die zowel huisdier-veilig als luchtzuiverend is. De plant slaat water op in zijn dikke wortels en kan daardoor periodes van droogte overleven. De bijnaam 'spider plant' komt van de uitlopers die als spinnen aan draden lijken te hangen."),
})

PLANTS.append({
    "slug": "aloe-vera",
    "common_name_nl": "Aloe vera",
    "common_name_en": "Aloe Vera",
    "latin_name": "Aloe vera",
    "climate_zone": "arid",
    "phenology_json": pheno({
        **evergreen(1, "Winterrust", 2, "Vlezige bladeren, bijna geen water", ["Alleen water als blad rimpelig wordt"]),
        **evergreen(2, "Winterrust", 2, "Zeer spaarzaam water"),
        **growing(3, "Eerste groei", 5, "Nieuwe bladeren vanuit het hart"),
        **growing(4, "Lentegroei", 7, "Actieve groei op warme, zonnige plek"),
        **growing(5, "Actieve groei", 8, "Snelle bladgroei in de volle zon"),
        **growing(6, "Zomergroei", 8, "Nieuwe rozetten (pups) kunnen verschijnen", ["Pups uitgraven en apart oppotten"]),
        **growing(7, "Zomergroei", 8, "Maximale groei in warmte en zon"),
        **flowering(8, "Mogelijk bloei", 7, "Lange bloemstengel met gele/oranje bloemen bij volwassen planten"),
        **growing(9, "Nazomer", 6, "Groei vertraagt"),
        **growing(10, "Wintervoorbereiding", 3, "Minder water, naar binnen halen als het koud wordt"),
        **evergreen(11, "Winterrust", 1, "Koel en droog houden"),
        **evergreen(12, "Winterrust", 1, "Absoluut droog — rot bij teveel water in de winter"),
    }, frost_sensitive=True, min_temp_c=5, max_height_cm=90, max_spread_cm=60,
       facts_nl="Aloe vera wordt al meer dan 5000 jaar gebruikt als medicinale plant — de gel in het blad werkt verkoelend bij brandwonden en huidirritaties. De oude Egyptenaren noemden het de 'plant van de onsterfelijkheid' en beeldden het af op grafschilderingen van farao's."),
})

PLANTS.append({
    "slug": "zamioculcas",
    "common_name_nl": "Zamioculcas",
    "common_name_en": "ZZ Plant",
    "latin_name": "Zamioculcas zamiifolia",
    "climate_zone": "tropical",
    "phenology_json": pheno({
        **evergreen(1, "Winterrust", 1, "Glanzend donkergroen blad, geen water nodig"),
        **evergreen(2, "Winterrust", 1, "Volledig in rust — geen water geven"),
        **growing(3, "Eerste teken", 2, "Nieuwe scheuten kunnen ondergronds starten"),
        **growing(4, "Uitlopen", 3, "Lichtgroene nieuwe stengels breken door", ["Nieuwe stengels worden langzaam donkergroen"]),
        **growing(5, "Lentegroei", 3, "Langzame, gestage groei"),
        **growing(6, "Zomergroei", 4, "Actief groeiseizoen, nieuwe stengels"),
        **growing(7, "Zomergroei", 3, "Piek groei bij warmte"),
        **growing(8, "Groei", 3, "Aanhoudende langzame groei"),
        **growing(9, "Nazomer", 2, "Groei vertraagt"),
        **growing(10, "Laatste groei", 2, "Eventuele laatste nieuwe scheuten"),
        **evergreen(11, "Winterrust", 1, "Volledig stoppen met water tot het voorjaar"),
        **evergreen(12, "Winterrust", 1, "De meest onderhoudsvrije kamerplant"),
    }, frost_sensitive=True, min_temp_c=12, max_height_cm=90, max_spread_cm=60,
       facts_nl="De Zamioculcas wordt ook wel de 'ZZ plant' genoemd en staat bekend als vrijwel onverwoestbaar — hij overleeft maanden zonder water en groeit zelfs in bijna volledige duisternis. De dikke wortelstokken (rhizomen) slaan water op, waardoor de plant extreme droogte kan overleven."),
})


# ══════════════════════════════════════════════════════════════════════════════
# MAIN
# ══════════════════════════════════════════════════════════════════════════════

# Species-level care thresholds (shared across all plants of this species).
# drought_mm_per_week, waterlog_mm_per_week, min_temp_c, max_temp_c,
# bring_inside_below_c (null = fully hardy), fertilise_months, fertilise_tip
_THRESHOLDS = {
    "Hortensia": (10, 30, -15, 30, None, [4,5,6,7], 'Hortensiamest voor blauwe of roze bloemen, geen kalk'),
    "Rhododendron": (12, 25, -20, 30, None, [4,5,6], 'Rododendronmest, zure grond essentieel, geen kalk'),
    "Pioenroos": (8, 25, -25, 32, None, [3,4,5], 'Kaliumrijke mest in voorjaar, niet te diep planten'),
    "Dahlia": (10, 30, 0, 35, None, [5,6,7,8], 'Wekelijks kaliumrijke mest tijdens bloeiperiode'),
    "Zonnehoed": (5, 25, -30, 35, None, [4,5,6], 'Weinig mest, te rijke grond geeft slappe stengels'),
    "Vlambloem": (10, 25, -30, 32, None, [4,5,6], 'Compost en organische mest in voorjaar voor rijke bloei'),
    "Herfstaster": (8, 25, -25, 32, None, [4,5,6], 'Compost in voorjaar, kalium in juni voor rijke bloei'),
    "Bellenplant": (10, 25, -5, 30, 0, [5,6,7,8], 'Wekelijks vloeibare mest tijdens de bloei'),
    "Ooievaarsbek": (5, 25, -25, 30, None, [4,5], 'Compost in voorjaar, stelt weinig eisen'),
    "Vetkruid": (3, 30, -30, 38, None, [4], 'Niet bemesten, vetplant heeft arme droge grond nodig'),
    "Tulp": (5, 15, -20, 28, None, [3,4], 'Bollenmest bij planten in oktober-november'),
    "Narcis": (5, 20, -20, 28, None, [3,4], 'Bollenmest direct na de bloei, blad laten afsterven'),
    "Krokus": (5, 15, -25, 28, None, [3], 'Bollenmest direct na de bloei'),
    "Hyacint": (5, 20, -20, 28, None, [3,4], 'Bollenmest bij het planten in de herfst'),
    "Iris": (5, 20, -25, 35, None, [3,4,5], 'Weinig mest nodig, kaliumarm, teveel geeft blad zonder bloemen'),
    "Lelie": (8, 20, -20, 30, None, [4,5,6], 'Kaliumrijke mest bij opkomst, niet op de bol strooien'),
    "Sierui": (5, 20, -20, 30, None, [4,5], 'Bollenmest direct na de bloei voor volgend jaar'),
    "Clematis": (10, 25, -20, 32, None, [4,5,6,7], 'Organische mest in voorjaar, kaliumrijk in juni voor bloei'),
    "Kamperfoelie": (8, 25, -20, 33, None, [4,5,6], 'Compost in voorjaar volstaat, teveel mest geeft blad zonder bloemen'),
    "Klimop": (5, 35, -25, 33, None, [4,5], 'Nauwelijks bemesting nodig, groeit op alle grondsoorten'),
    "Salie": (3, 25, -15, 35, None, [4,5], 'Spaarzaam bemesten, teveel stikstof vermindert het aroma'),
    "Tijm": (3, 20, -15, 35, None, [4,5], 'Geen mest, mediterrane plant heeft arme grond nodig'),
    "Rozemarijn": (3, 20, -10, 38, -5, [4,5,6], 'Mediterrane mest, spaarzaam, arme grond geeft meer aroma'),
    "Munt": (8, 30, -25, 32, None, [5,6,7], 'Weinig mest nodig, woekert sowieso, compost in voorjaar'),
    "Bieslook": (5, 30, -25, 35, None, [4,5,6], 'Weinig mest nodig, beetje compost in voorjaar'),
    "Oregano": (3, 25, -25, 35, None, [4,5], 'Geen mest, arme grond geeft pittigere smaak'),
    "Peterselie": (8, 25, -10, 30, None, [5,6,7], 'Stikstofarme mest, teveel stikstof vermindert smaak'),
    "Dille": (5, 20, 0, 32, None, [5,6], 'Weinig mest, teveel stikstof vermindert het aroma'),
    "Koriander": (5, 20, 2, 32, None, [5,6], 'Weinig mest, rijke grond geeft minder aromatisch blad'),
    "Basilicum": (10, 25, 5, 35, 10, [5,6,7,8], 'Vloeibare kruidenmest om de 2 weken, niet teveel stikstof'),
    "Sla": (15, 30, -2, 28, None, [5,6], 'Stikstofrijke grond, niet op arme grond telen'),
    "Courgette": (15, 30, 5, 35, None, [5,6,7,8], 'Compostrijke grond, wekelijks vloeibare mest tijdens oogst'),
    "Paprika": (15, 25, 8, 35, None, [5,6,7,8], 'Kaliumrijke mest wekelijks tijdens vruchtgroei'),
    "Boerenkool": (10, 35, -15, 30, None, [4,5,6], 'Stikstofrijke mest bij aanplant, niet bemesten na augustus'),
    "Wortel": (10, 25, -5, 30, None, [4,5], 'Kaliumrijke mest, teveel stikstof geeft vertakte wortels'),
    "Prei": (10, 35, -10, 30, None, [5,6,7], 'Stikstofrijke mest bij aanplant en in de zomer'),
    "Aardappel": (15, 40, -1, 30, None, [4,5], 'Organische mest voor poten, niet teveel stikstof'),
    "Komkommer": (20, 30, 10, 35, None, [6,7,8], 'Wekelijks vloeibare mest tijdens vruchtgroei'),
    "Lepelplant": (10, 20, 12, 32, 15, [4,5,6,7,8], 'Vloeibare bloeiplantenmest elke 2 weken in lente en zomer'),
    "Gatenplant": (8, 20, 12, 35, 12, [4,5,6,7,8], 'Groeneplantenmest elke 2 weken in lente en zomer'),
    "Vrouwentongen": (2, 10, 10, 40, 12, [5,6,7], 'Cactussenmest eenmaal per maand, alleen in de zomer'),
    "Pannenkoekenplant": (5, 20, 10, 30, 12, [4,5,6,7,8], 'Kamerplantenmest elke 2 weken in groeiseizoen'),
    "Drakenklimop": (3, 20, 10, 38, 12, [4,5,6,7,8], 'Vloeibare plantenmest elke 2 weken in groeiseizoen'),
    "Rubberplant": (5, 20, 12, 35, 12, [4,5,6,7,8], 'Groeneplantenmest elke 2 weken, blad afnemen tegen stof'),
    "Orchidee": (3, 10, 15, 32, 15, [4,5,6,7,8], 'Orchideeenmest eenmaal per maand, niet op droge wortels'),
    "Flamingoplant": (10, 20, 15, 35, 15, [4,5,6,7,8], 'Orchideeenmest elke 2 weken, hoge luchtvochtigheid'),
    "Krulvaren": (15, 25, 10, 30, 10, [4,5,6,7], 'Varenmest elke 2 weken, niet op droge kluit bemesten'),
    "Graslelie": (5, 25, 5, 35, 5, [4,5,6,7], 'Spaarzaam bemesten, teveel mest geeft bruine bladpunten'),
    "Aloe vera": (2, 15, 5, 40, 10, [5,6,7], 'Cactussenmest eenmaal per maand in de zomer'),
    "Zamioculcas": (3, 15, 12, 38, 12, [5,6,7], 'Spaarzaam bemesten, eenmaal per maand in de zomer'),
}


def _make_thresholds(data):
    return json.dumps({
        "drought_mm_per_week": data[0],
        "waterlog_mm_per_week": data[1],
        "min_temp_c": data[2],
        "max_temp_c": data[3],
        "bring_inside_below_c": data[4],
        "fertilise_months": data[5],
        "fertilise_tip": data[6],
    }, ensure_ascii=False)


async def main():
    await init_pool()
    try:
        async with get_db() as db:
            inserted = 0
            for p in PLANTS:
                thresholds = _make_thresholds(_THRESHOLDS[p["common_name_nl"]]) if p["common_name_nl"] in _THRESHOLDS else None
                cursor = await db.execute(
                    """INSERT INTO plant_species
                       (slug, common_name_nl, common_name_en, latin_name, phenology_json, climate_zone, care_thresholds)
                       VALUES ($1, $2, $3, $4, $5, $6, $7)
                       ON CONFLICT (slug) DO NOTHING""",
                    (p["slug"], p["common_name_nl"], p["common_name_en"],
                     p["latin_name"], p["phenology_json"], p["climate_zone"], thresholds),
                )
                if cursor.rowcount > 0:
                    inserted += 1
            await db.commit()

        print(f"Seeded {inserted} new species "
              f"({len(PLANTS) - inserted} already existed, "
              f"total {len(PLANTS)} processed)")
    finally:
        await close_pool()


if __name__ == "__main__":
    asyncio.run(main())
