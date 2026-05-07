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
    interesting: 'Bloeit bijna het hele jaar door; bloempjes sluiten zich \'s avonds en bij regen',
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
