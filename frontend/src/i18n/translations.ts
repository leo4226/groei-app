// Note: as of 2026-05-16, the new /calendar MonthView ships Dutch-only strings
// (matching the mockup at c:\Users\leon_\Downloads\Floreren Kalender.html).
// English translations are pending — see
// docs/plans/in-progress/2026-05-16-calendar-magazine-redesign.md section E4.
// The Phenology view (Agenda tab) and the rest of the app are already bilingual.

export type Translations = {
  locale: string

  nav: {
    home: string
    plants: string
    maps: string
    calendar: string
    settings: string
  }

  dashboard: {
    greeting: {
      night: string
      morning: string
      afternoon: string
      evening: string
    }
    sections: {
      myGardens: string
      today: string
      logbook: string
      weather: string
      didYouKnow: string
      careSignals: string
    }
    actions: {
      done: string
      skip: string
      manage: string
      view: string
      edit: string
      newGarden: string
      addGarden: string
      fullLog: string
      mapTypeIndoor: string
      mapTypeOutdoor: string
    }
    status: {
      collection: string
      onSchedule: string
      thirsty: string
      dry: string
    }
    almanac: {
      sunrise: string
      sunset: string
      temp: string
      nextCare: string
      onTrack: string
    }
    tasks: {
      overdue: string
      dueToday: string
      upcoming: string
      today: string
      calm: string
      noTasks: string
      waterFeed: string
      attention: string
      daysLate: (n: number) => string
      inDays: (n: number) => string
    }
    weather: {
      title: string
      humidity: string
      soil: string
      light: string
      rain: string
      tonight: string
      loading: string
      unavailable: string
    }
    comingSoon: string
    warnings: {
      allOnSchedule: string
      signalCount: (n: number) => string
      plantCount: (n: number) => string
      bucketNow: string
      bucketToday: string
      bucketThisWeek: string
    }
  }

  care: {
    water: string
    fertilize: string
    mist: string
    rotate: string
    repot_check: string
    prune: string
    protect_cold: string
    protect_heat: string
    frost_protect: string     // "Frost protect" / "Vorst-bescherming"
    heat_protect: string      // "Heat protect" / "Hitte-bescherming"
  }

  careTypes: {
    water: string
    fertilize: string
    mist: string
    rotate: string
    repot_check: string
    prune: string
    protect_cold: string
    protect_heat: string
    photo: string
  }

  plants: {
    categories: Record<string, string>
    types: Record<string, string>
    forms: Record<string, string>
  }

  maps: {
    title: string
    newMap: string
    mapNameLabel: string
    mapNamePlaceholder: string
    loading: string
    failedCreate: string
    failedDelete: string
    indoor: string
    outdoor: string
    // PageMasthead keys (issue #180)
    mastheadEyebrow: string
    mastheadTitle: string
    mastheadAccent: string
    mastheadLede: string
    // Stat label for masthead
    mastheadStatLabel: string
  }

  // ── Map settings page ───────────────────────────────────────────
  mapSettings: {
    pageTitle: string          // "Map settings"
    nameLabel: string          // "Name"
    namePlaceholder: string    // "Garden name..."
    typeLabel: string          // "Type"
    location: string           // "Location"
    latLabel: string           // "Latitude"
    lonLabel: string           // "Longitude"
    latPlaceholder: string     // "e.g. 52.3715"
    lonPlaceholder: string     // "e.g. 4.8499"
    useCurrentLocation: string // "Use current location"
    compassBearing: string     // "Compass bearing"
    compassHint: string        // "Point the needle..."
    dimensions: string         // "Dimensions"
    dimensionsHint: string     // "Edit dimensions via the layout editor"
    editLayout: string         // "Edit layout"
    dangerZone: string         // "Danger zone"
    deleteMap: string          // "Delete map"
    deleteConfirm: string      // "Are you sure?..."
    confirmDelete: string      // "Yes, delete"
    deleting: string           // "Deleting..."
    deleteFailed: string       // "Delete failed"
    backToMaps: string         // "Back to maps"
    locationUnavailable: string // "Location unavailable"
    saving: string             // "Saving..."
    saved: string              // "Saved"
    notFound: string           // "Map not found"
    outdoor: string            // "Garden"
    indoor: string             // "House"
    // PageMasthead keys (issue #180)
    mastheadTitle: string
    mastheadAccent: string
  }

  editor: {
    zones: Record<string, { name: string; description: string }>
    toolbar: {
      select: string
      draw: string
      placeDoor: string
      placeWindow: string
      undo: string
      delete: string
      preview: string
      edit: string
      shadowCaster: string
      back: string
    }
    save: {
      saved: string
      saving: string
      unsaved: string
    }
    mapType: {
      garden: string
      house: string
    }
    props: {
      zone: string
      door: string
      window: string
      label: string
      length: string
      width: string
      height: string
      widthCm: string
      hinge: string
      left: string
      right: string
      inward: string
      outward: string
      openingDirection: string
      wallThickness: string
      outerWall: string
      innerWall: string
      cornerCut: string
      corner: string
      scaleCalibrate: string
      scaleHint: string
      delete: string
      lightTree: string   // "Light tree" / "Lichte boom"
      rotation: string    // "Rotation" / "Rotatie"
      reset: string       // "Reset" / "Resetten"
      xM: string   // "X (m)"
      yM: string   // "Y (m)"
    }
    loading: string
    notFound: string
    legend: string
    legendLabels: Record<string, string>
    mode: string          // "Mode" / "Modus"
    legendZones: string   // "Zones" / "Zones"
    legendObjects: string // "Objects" / "Objecten"
    drawZones: string   // "Draw zones" / "Zones tekenen"
    legendShadows: string // "Shadows" / "Schaduwen"
    legendPlace: string   // "Place" / "Plaats"
    shadowObject: string  // "Shadow" / "Schaduw"  // { container: "Pot / Tray" / "Pot / Bak", hardscape: "Garden object" / "Tuinobject", utility: "Utility" / "Nutsvoorziening" }
    // Shadow caster properties panel
    shadowCasterBuilding: string   // "Gebouw" / "Building"
    shadowCasterTree: string       // "Boom" / "Tree"
    shadowCasterName: string       // "Naam" / "Name"
    rectPlaceholder: string        // "bijv. Buurman's huis" / "e.g. Neighbor's house"
    circlePlaceholder: string      // "bijv. Eik, Spar..." / "e.g. Oak, Pine..."
    shadowCasterPosition: string   // "Positie" / "Position"
    shadowCasterSide: string       // "Kant" / "Side"
    shadowCasterDistance: string   // "Afstand van tuin (m)" / "Distance from garden (m)"
    shadowCasterThickness: string   // "Dikte (m)" / "Thickness (m)"
    shadowCasterPosSize: string    // "Positie & grootte" / "Position & size"
    shadowCasterRadius: string     // "Straal (m)" / "Radius (m)"
    shadowDensity: string          // "Schaduwdichtheid" / "Shadow density"
    denseTree: string              // "Dichte boom" / "Dense tree"
    buildingWall: string           // "Gebouw / Muur" / "Building / Wall"
    top: string                    // "Boven" / "Top"
    bottom: string                 // "Onder" / "Bottom"
    tour: {
      skip: string
      next: string
      done: string
      goToSettings: string
      skipSettings: string
      outdoor: {
        step1: { title: string; body: string }
        step2: { title: string; body: string }
        step3: { title: string; body: string }
        step4: { title: string; body: string }
      }
      indoor: {
        step1: { title: string; body: string }
        step2: { title: string; body: string }
        step3: { title: string; body: string }
      }
    }
  }

  photoJournal: {
    addPhoto: string
    uploading: string
    empty: string
    deleteConfirm: string
    delete: string
    older: string
    newer: string
    compare: string
    compareOff: string
    reminderLabel: string
    reminderHint: string
    daysSuffix: string
    addCarePhoto: string
    careBadgeHint: string
    mismatchHint: string
  }

  settings: {
    title: string
    mastheadEyebrow: string
    mastheadTitle: string
    mastheadAccent: string
    mastheadLede: string
    display: string
    groupOutdoorWarnings: string
    groupOutdoorWarningsDesc: string
    digestTitle: string
    digestToggle: string
    digestToggleDesc: string
    digestTimeLabel: string
    digestTimeDesc: string
    digestLoadError: string
    digestSaveError: string
    pushToggle: string
    pushToggleDesc: string
    pushDenied: string
    pushUnsupported: string
    pushIosHint: string
    dataTitle: string
    dataDescription: string
    downloadData: string
    downloadCareLogCsv: string
    downloading: string
    downloadReady: string
    downloadError: string
    householdTitle: string
    householdName: string
    householdNamePlaceholder: string
    householdSaved: string
    memberEmail: string
    memberJoined: string
    whoIsGardening: string
    active: string
    locations: string
    addLocation: string
    locationNamePlaceholder: string
    editLocation: string
    deleteLocation: string
    save: string
    cancel: string
    confirmDeleteLocation: string
    locationHasPlants: string
    moveUp: string
    moveDown: string
    rename: string
    language: string
    languageNl: string
    languageEn: string
    profile: string
    profileName: string
    profileAvatar: string
    profileEmail: string
    profileSaved: string
    changePassword: string
    currentPassword: string
    newPassword: string
    passwordMinLength: string
    passwordError: string
    passwordChanged: string
    icons: {
      title: string
      noChanges: string
      stillMissing: string
      description: string
      syncButton: string
      syncing: string
      result: string
      linked: string
      noIconFor: string
      setManually: string
      upToDate: string
      gapsTitle: string
      gapsDescription: string
      loadGaps: string
      loadingGaps: string
    }
    removeConfirm: string // "Weet je zeker dat je" / "Are you sure you want to remove"
    removeError: string   // "Fout bij verwijderen" / "Error removing member"
    removeMember: string  // "Verwijderen" / "Remove"
    inviteTitle: string       // "Nodig iemand uit" / "Invite someone"
    inviteDescription: string // "Genereer een code..." / "Generate a code..."
    generateCode: string      // "Genereer uitnodigingscode" / "Generate invite code"
    generatingCode: string    // "Code genereren..." / "Generating code..."
    shareCode: string         // "Deel deze code..." / "Share this code..."
    newCode: string           // "Nieuwe code genereren" / "Generate new code"
    copyCode: string          // "Kopieer code" / "Copy code"
    assistantTitle: string    // "Assistent" / "Assistant"
    resetAssistant: string    // "Stekkie resetten" / "Reset Stekkie"
    resetAssistantDone: string // "Stekkie is gereset!" / "Stekkie has been reset!"
    about: string
    themeLabel: string
    themeLight: string
    themeDark: string
    themeSystem: string
    logout: string
  }

  // ── Sun / heatmap controls ──────────────────────────────────────
  sun: {
    live: string
    heatmap: string
    now: string
    sunHoursIn: string  // "~{hours}u direct sunlight in {month}"
    whatCanGrow: string  // "What can go here? →"
    aboveHorizon: string  // "{deg}° above horizon"
    belowHorizon: string  // "Below horizon"
    calculating: string  // "Calculating..."
    // Bucket labels (light quality heatmap)
    bucketFull: string
    bucketPart: string
    bucketBrightShade: string
    bucketDeepShade: string
    // Heatmap layer toggle
    layerSunHours: string
    layerSkyOpenness: string
    layerLightQuality: string
    // Sun category labels for GrowHereSheet
    sunCategoryFull: string    // "Full sun" / "Volle zon"
    sunCategoryPartial: string // "Partial sun" / "Half zon"
    sunCategoryShade: string   // "Shade" / "Schaduw"
  }

  // ── Grow-here sheet ─────────────────────────────────────────────
  growHere: {
    title: string  // "What can grow here?"
    sunLabel: string  // "~{hours}u direct sunlight"
    alreadyInGarden: string  // "Already in your garden"
    suggestions: string  // "Suggestions"
    aiSuggestions: string  // "AI Suggestions"
    add: string  // "+ Add"
    addLoading: string  // "..."
    aiError: string  // "Could not load AI suggestions."
    badgePerfect: string
    badgeAcceptable: string
    badgeGood: string
    hoursPerDay: string  // "{hours}h / day" / "{hours}u / dag"
    dbSuggestions: string        // "Passende planten"
    ecologyNative: string        // "🇳🇱 Inheems"
    ecologyPollinatorHigh: string // "🐝 Top bestuiver"
    ecologyPollinatorGood: string // "🐝 Goed voor bijen"
    ecologyFillsGap: string      // "Vult: {months}"
    sunFitPerfect: string        // "Ideaal licht"
    sunFitAcceptable: string     // "Geschikt licht"
    sunFitMarginal: string       // "Krap licht"
    sunFitTolerated: string      // "Verdraagt dit licht"
    noDbResults: string          // "Weinig data beschikbaar"
  }

  // ── Icon picker ─────────────────────────────────────────────────
  iconPicker: {
    title: string   // "Choose icon" / "Kies icoon"
    searchPlaceholder: string  // "Search icons..." / "Zoek iconen..."
    clear: string   // "Clear" / "Wissen"
    noResults: string  // "No icons found" / "Geen iconen gevonden"
  }

  // ── Spot Inspector sheet ────────────────────────────────────────
  spotInspector: {
    title: string  // "Spot inspection"
    loading: string  // "Loading..."
    suitable: string  // "Suitable"
    marginal: string  // "Marginal"
    noPlantsFound: string  // "No suitable plants found for this spot."
    sow: string  // "Sow:"
    plant: string  // "Plant:"
    harvest: string  // "Harvest:"
    frostSensitive: string  // "Frost-sensitive"
    deficitPerDay: string  // "~{hours}h/day deficit in growing season"
    sunPerMonth: string  // "Sun per month at this spot"
  }

  // ── Phenology / Agenda ──────────────────────────────────────────
  phenology: {
    title: string            // "Agenda" / "Agenda"
    actionRequired: (n: number) => string  // "{n} need(s) action" / "{n} vraagt om actie"
    growingActive: (n: number) => string   // "{n} growing actively" / "{n} groeit actief"
    dormant: (n: number) => string         // "{n} dormant" / "{n} in rust"
    noPlants: string         // "No plants with a care schedule" / "Geen planten met een verzorgingsschema"
    noData: string           // "No phenology data" / "Geen fenologie data"
    badgeSow: string         // "Sow" / "Zaaien"
    badgeTransplant: string  // "Transplant" / "Verplanten"
    badgeHarvest: string     // "Harvest" / "Oogsten"
  }

  // ── Plant Quick Sheet ───────────────────────────────────────────
  plantQuickSheet: {
    close: string
    moreInfo: string
    copy: string  // "Copy plant"
    duplicate: string
    edit: string  // "Edit plant"
    lock: string
    unlock: string
    remove: string
    delete: string  // "Delete plant"
    fixed: string  // "Fixed — cannot be moved"
    careWater: string
    careFertilize: string
    carePrune: string
    careRepot: string
    careMist: string
    careRotate: string
    careProtectCold: string
    careProtectHeat: string
    overdue: (n: number) => string
    today: string
    overN: (n: number) => string
    removeFrom: string
    plantedIn: string
    move: string
    moveOnMap: string
    moveToMap: string
    thisSpot: string
    goodFit: string
    partialFit: string
    insufficientFit: string
    water: string
    fertilize: string
    editPlant: string
  }

  // ── Plant picker sheet ──────────────────────────────────────────
  plantPicker: {
    close: string
    title: string
    subtitle: string
    searchPlaceholder: string
    addCustom: (name: string) => string
    typeName: string
    notInList: string
    noResults: string
    addAsNew: (name: string) => string
  }

  // ── Plant Detail page ──────────────────────────────────────────
  plantDetail: {
    mastheadEyebrow: string   // desktop masthead eyebrow, e.g. "Plant passport"
    statSchedules: string     // masthead stat label: nr of care schedules
    statSunHours: string      // masthead stat label: sun hours per day
    weatherAlerts: string
    copyPlant: string
    yearCalendar: string
    care: string
    overdue: string
    today: string
    xDays: string  // "Every {n} days"
    byPerson: string  // "by {name}"
    deleteSchedule: string
    deleteScheduleConfirm: string
    undo: string
    photoJournal: string
    careHistory: string
    skipped: string  // "skipped:"
    did: string  // "did:"
    archivePlant: string
    deleteConfirm: string
    edit: string  // "Edit"
    whatCanYouDo: string  // "What can you do now?"
    sunHoursLabel: string  // "Sun hours:"
    sunHoursUnit: string  // "h/day" / "u/dag"
    fitGood: string  // "✓ Good fit"
    fitPartial: string  // "~ Partial"
    fitInsufficient: string  // "⚠ Insufficient"
  }

  ecology: {
    title: string
    native: string
    nonNative: string
    invasive: string
    pollinatorTopTier: string
    pollinatorGood: string
    pollinatorMinor: string
    pollinatorNone: string
    floweringPrefix: string
    hostPrefix: string
    scoreLabel: string
    sourceLabel: string
    sourceLlmWarning: string
    enrichedAt: string
    failed: string
    loading: string
  }

  // ── Plant Care Detail page ─────────────────────────────────────
  plantCare: {
    light: string
    water: string
    floweringCalendar: string
    characteristics: string
    specifications: string
    treeInspection: string
    family: string
    // Fallback / status
    careGuide: string
    noInfo: string
    failedToLoad: string
    retry: string
    // Characteristics
    evergreen: string
    deciduous: string
    avgHeight: string
    flowers: string
    toxicity: string
    edible: string
    yes: string
    no: string
    // Specs
    stemDiameter: string
    height: string
    age: string
    // Water context
    precipitationYear: string
    amsterdamSuitable: string
    needsMoreRain: string
    tooWet: string
    // Rain chart
    rainfallAmsterdam: string
    total: string
    // Source
    dataVia: string
    // Lookup maps
    lightLabels: Record<string, string>
    rainBadges: Record<string, string>
  }

  // ── Add / Edit Plant ────────────────────────────────────────────
  addPlant: {
    title: string  // "Add plant 🌱"
    preview: string
    entry: {
      identify: string         // "Identify with photo"
      identifySubtitle: string // "Fastest — let AI recognise the species"
      pick: string             // "Pick from list"
      pickSubtitle: string     // "Browse our plant library"
      manual: string           // "Enter manually"
      manualSubtitle: string   // "I know what it is"
    }
    // ── Form header ──
    breadcrumb: string      // "Collection" / "Collectie"
    heading: string         // "Add" / "Toevoegen"
    subheading: string      // "Fit a new plant into its best spot."
    basic: string           // "BASIC"
    details: string         // "DETAILS"
    // ── § I · Identity ──
    secIdentity: string     // "§ I · Identity"
    secIdentityTitle: string // "Give her a name."
    labelNickname: string   // "Nickname"
    labelNicknameDesc: string
    labelSpecies: string
    labelSpeciesDesc: string
    labelForm: string
    labelFormDesc: string
    labelPhase: string
    labelPhaseDesc: string
    labelAcquired: string
    labelAcquiredDesc: string
    placeholderNickname: string
    placeholderSpecies: string
    placeholderSpeciesLatin: string
    placeholderAcquiredAt: string
    // ── § II · Placement ──
    secPlacement: string
    secPlacementTitle: string
    secPlacementSubtitle: string
    labelZone: string
    labelZoneDesc: string
    labelLight: string
    labelLightDesc: string
    labelPot: string
    labelPotDesc: string
    labelPotDiameter: string
    labelPotHeight: string
    labelDrainage: string
    labelDrainageYes: string
    labelSubstrate: string
    labelSubstrateDesc: string
    substrateHelp: string
    // Light tiles
    lightDark: string
    lightDarkSub: string
    lightShade: string
    lightShadeSub: string
    lightIndirect: string
    lightIndirectSub: string
    lightBright: string
    lightBrightSub: string
    lightFullSun: string
    lightFullSunSub: string
    // Pot material tiles
    potTerracotta: string
    potTerracottaSub: string
    potPlastic: string
    potPlasticSub: string
    potCeramic: string
    potCeramicSub: string
    potBasket: string
    potBasketSub: string
    // ── § III · Care ──
    secCare: string
    secCareTitle: string
    secCareSubtitle: string
    labelWatering: string
    labelWateringDesc: string
    labelVolume: string
    labelVolumeDesc: string
    volumeUnit: string
    labelFeeding: string
    labelFeedingDesc: string
    labelPruneType: string
    labelPruneTypeDesc: string
    labelPruneFreq: string
    labelPruneFreqDesc: string
    // Watering presets
    presetSeldom: string
    presetWeekly: string
    presetBiweekly: string
    presetDaily: string
    // Feeding tiles
    feedWeekly: string
    feedWeeklySub: string
    feedMonthly: string
    feedMonthlySub: string
    feedSeasonal: string
    feedSeasonalSub: string
    feedOptional: string
    feedOptionalSub: string
    // Pruning type tiles
    pruneNone: string
    pruneNoneSub: string
    pruneLight: string
    pruneLightSub: string
    pruneModerate: string
    pruneModerateSub: string
    pruneHeavy: string
    pruneHeavySub: string
    // Pruning frequency tiles
    pruneNever: string
    pruneNeverSub: string
    pruneW: string       // "Weekly"
    pruneWSub: string
    pruneM: string       // "Monthly"
    pruneMSub: string
    pruneS: string       // "Seasonal"
    pruneSSub: string
    // ── § IV · Album ──
    secAlbum: string
    secAlbumTitle: string
    secAlbumSubtitle: string
    labelIcon: string
    labelIconDesc: string
    labelSown: string
    labelSownDesc: string
    labelNotes: string
    labelNotesDesc: string
    // ── Form options ──
    formPot: string
    formPotSub: string
    formGround: string
    formGroundSub: string
    formSeedling: string
    formSeedlingSub: string
    formTree: string
    formTreeSub: string
    // ── Phase labels ──
    phaseSeed: string
    phaseSprout: string
    phaseSeedling: string
    phaseYoung: string
    phaseEstablished: string
    // ── Zone picker ──
    zonePlants: (n: number) => string
    zoneAdvice: (species: string) => string
    // ── Substrate options ──
    substrateOptions: string[]
    // ── Action bar ──
    cancel: string
    submitting: string
  }

  // ── Plant identification flow ───────────────────────────────────
  identify: {
    camera: {
      title: string     // "Take a photo"
      capture: string   // "Capture"
      cancel: string    // "Cancel"
      noAccess: string  // "No camera access"
    }
    identifying: string  // "Identifying..."
    newPhoto: string     // "📷 Take new photo"
    enriching: string    // "Looking up..."
    results: {
      title: string       // "Possible matches"
      confidence: string  // "confidence"
      poweredBy: string   // "powered by Pl@ntNet"
      choose: string      // "Pick this one"
    }
    lowConfidence: string  // DEPRECATED, kept until confidence.low rollout completes
    plantnetConfirm: string  // confirm dialog text shown when user clicks the PlantNet fallback button
    confidence: {
      medium: string       // "Fairly confident" / "Redelijk zeker"
      low: string          // "Not sure — pick one manually or try a better photo"
    }
    noMatch: {
      title: string           // "No match found"
      body: string            // "Try a different photo or add the plant manually."
      bodyDetailed: string    // "No identification. Try another photo (focus closer on a leaf or flower)."
      retry: string           // "Try again"
      manualFallback: string  // "Enter manually"
    }
    errorOffline: string  // "Identification needs an internet connection"
    errorService: string  // "Could not reach the identification service"
    errorQuota: string    // "Identification temporarily unavailable (daily limit)"
    privacy: {
      notice: string  // "Photos are sent to Pl@ntNet for identification."
      ack: string     // "OK, got it"
    }
    card: {
      title: string     // "Photo identification"
      subtitle: string  // "Take a photo to identify a plant"
    }
    ecologyTitle: string         // "Wat je net vond"
    ecologyFillsGap: string      // "Vult je tuinkalender in {months}"
    ecologyContinue: string      // "Doorgaan met toevoegen"
  }

  editPlant: {
    title: string            // "Edit plant"
    addPhoto: string         // "Add photo"
    plantPhoto: string       // "Plant photo"
    tapToChangePhoto: string // "Tap to change photo"
    previewAlt: string       // "Preview"
    nameLabel: string        // "Name *"
    speciesLabel: string     // "Botanical name"
    speciesPlaceholder: string // "Monstera deliciosa"
    iconLabel: string        // "Icon"
    sunRequirementLabel: string // "Sun requirement"
    locationLabel: string    // "Location"
    garden: string           // "Garden"
    house: string            // "House"
    mapComingSoon: string    // "Map coming soon"
    potSizeLabel: string     // "Pot size (cm)"
    potSizePlaceholder: string // "15"
    acquiredLabel: string    // "Acquired"
    lastRepottedLabel: string // "Last repotted"
    notesLabel: string       // "Notes"
    notesPlaceholder: string // "Likes indirect light, water from below..."
    saving: string           // "Saving..."
    databasePrefill: string  // "Filled from plant database — adjust where needed"
    careScheduleTitle: string // "Care schedule"
    careScheduleDesc: string  // "How often does this plant need care?"
    everyLabel: string        // "every"
    daysLabel: string         // "days"
    submitting: string        // "Adding..."
    // Sun requirement profile labels
    sunFull: string          // "Full sun"
    sunPartial: string       // "Partial sun"
    sunShade: string         // "Shade"
    // Growth phases (Groeifasen)
    growthPhaseLabel: string  // "Growth phase"
    sownDateLabel: string     // "Sown date"
    phaseSeed: string         // "Seed"
    phaseSprout: string       // "Sprout"
    phaseSeedling: string     // "Seedling"
    phaseYoung: string        // "Young plant"
    phaseEstablished: string  // "Established"
  }

  // ── Calendar page ───────────────────────────────────────────────
  calendar: {
    title: string  // "Calendar"
    gardenYear: string  // "Garden Year"
    subtitle: string  // "Everything your garden asks for - and everything it promises - ordered by day."
    week: string
    month: string
    agenda: string
    thisMonth: string  // "This month"
    previousMonth: string
    nextMonth: string
    tasks: string  // "tasks"
    taskSingular: string  // "task"
    bloom: string  // "Bloom"
    open: string  // "Open"
    filter: string
    heading: string  // "Calendar"
    filterDescAll: string      // "alle planten" / "all plants"
    filterDescGarden: string    // "buitenplanten" / "outdoor plants"
    filterDescHouse: string     // "kamerplanten" / "indoor plants"
    upcoming: string  // "Upcoming"
    upcomingSubtitle: string  // "The coming days - sorted by date."
    upcomingTitlePrefix: string  // "What" / "Wat " — text before the italic word
    upcomingTitleEm: string     // "'s coming" / "komt" — the italic word
    silence: string  // "— silence —"
    moonPhase: string  // "Moon phase"
    agendaSelectedDay: string  // "Agenda — selected day"
    noTasksRest: string  // "No tasks — rest."
    freeDay: string  // "Free day"
    gardenManagesItself: string  // "The garden takes care of itself today."
    today: string  // "today"
    overdueLabel: string  // "Overdue"
    editLabel: string  // "Edit"
    // Moon short labels (used in day cells)
    newMoon: string  // "new"
    fullMoon: string  // "full"
    quarterMoon: string  // "quarter"
    more: (n: number) => string  // "+ {n} more"
    // Moon phase long labels
    moonNew: string
    moonWaxingCrescent: string
    moonFirstQuarter: string
    moonWaxingGibbous: string
    moonFull: string
    moonWaningGibbous: string
    moonLastQuarter: string
    moonWaningCrescent: string
    // Month labels (short)
    monthsShort: [string, string, string, string, string, string, string, string, string, string, string, string]
    // Day letters (header)
    dayLetters: [string, string, string, string, string, string, string]
    // Month labels (long)
    monthsLong: [string, string, string, string, string, string, string, string, string, string, string, string]
  }

  // ── Add Object sheet ────────────────────────────────────────────
  addObject: {
    title: string  // "Add object"
    containers: string
    hardscape: string  // "Hardscape & Utility"
    name: string
    namePlaceholder: string  // "e.g. Front deck pot"
    label: string
    shape: string
    shapeRound: string
    shapeSquare: string
    shapeRect: string
    round: string
    square: string
    rect: string
    dimensions: string  // "Dimensions (cm)"
    diameter: string
    width: string
    depth: string
    material: string
    color: string
    addToMap: string
    adding: string  // "Adding..."
    addPlant: string
    hidePlantPicker: string
    assignPlant: string
    noStandalonePlants: string
    plantsInside: (n: number) => string
    remove: string
    edit: string
    editObject: string
    removeObject: string
    saving: string
    save: string
    cancel: string
    archive: (name: string) => string
  }

  // ── Utility / event-type labels (used across calendar + care) ───
  utility: {
    eventWater: string
    eventFertilize: string
    eventPrune: string
    eventRepot: string
    eventMist: string
    eventColdProtection: string
    eventHeatProtection: string
    eventBloom: string
    eventSow: string
    eventHarvest: string
    eventScan: string
    eventRain: string
    eventRotate: string
    eventDust: string
    eventPestCheck: string
  }

  // ── Plants page (list view) ──────────────────────────────
  plantsPage: {
    title: string           // "Planten Icons."
    subtitle: string        // "Een botanische gids voor je plantencollectie — binnen en buiten."
    subtitleEst: string     // "Mijn Tuin · Est. 2026"
    countPlants: string     // "Planten" (plural label next to count)
    countCategories: string // "Categorieën" (plural label next to count)
    searchPlaceholder: string // "Zoek op naam of soort…"
    addButton: string       // "+ Toevoegen"
    filterButton: string    // "Filters"
    filterLocation: string  // "Locatie"
    filterType: string      // "Type"
    filterForm: string      // "Vorm"
    filterAll: string       // "Alle"
    filterHouse: string     // "🏠 Huis"
    filterGarden: string    // "🌿 Tuin"
    alertBanner: string     // "⚠️ Planten met weeralerts"
    alertShowAll: string    // "Alles tonen"
    found: (n: number) => string      // "Gevonden: {n}"
    showAll: (n: number) => string    // "Toon alle {n} planten"
    sectionSearchResults: string      // "§ Zoekresultaten"
    sectionGarden: string             // "§ De Tuin"
    sectionHouse: string              // "§ Huis"
    sectionCollection: string         // "§ De Collectie"
    emptySearch: string               // "Niets gevonden in deze hoek van de tuin."
    emptyNoPlants: string             // "Nog geen planten in deze collectie."
    emptySearchHint: string           // "Probeer een andere zoekopdracht"
    emptyNoPlantsHint: string         // "Voeg je eerste plant toe via + Toevoegen"
  }

  // ── Map page (garden/indoor view) ────────────────────────
  mapPage: {
    notFound: string          // "Map not found"
    mapSettings: string       // "Kaart instellingen" (settings button tooltip)
    labelShow: string         // "Toon namen"
    labelHide: string         // "Verberg namen"
    water: string             // "Bewater" (garden watering button)
    fertilize: string         // "Bemest" (garden fertilize button)
    sun: string               // "Zon"
    inspect: string           // "Inspecteer"
    pot: string               // "Pot"
    plant: string             // "Plant"
    saveLabel: string         // "Opslaan"
    clearLabel: string        // "Wis"
    lastWatered: (date: string) => string   // "Laatst bewaterd: {date}"
    recordWatering: string                  // "Registreer tuin bewatering"
    lastFertilized: (date: string) => string // "Laatst bemest: {date}"
    recordFertilizing: string               // "Registreer tuin bemesting"
    gardenActionClose: string               // "Close" / "Sluiten"
    gardenActionScope: string               // "This applies to all plants on this map at once."
    gardenActionDateLabel: string           // "Date" / "Datum"
    gardenWaterButton: string               // "Water all plants"
    gardenWaterDelete: string               // "Delete watering"
    gardenFertilizeButton: string           // "Fertilize all plants"
    gardenFertilizeDelete: string           // "Delete fertilizing"
    addPot: string                          // "Pot toevoegen"
    more: string                             // "Meer" / "More" (mobile overflow menu button)
    options: string                          // "Opties" / "Options" (mobile menu trigger)
    deleted: (label: string) => string      // "Verwijderd: {label}"
    undo: string                            // "Ongedaan maken"
    soilDefaultName: string                 // "Grond"
    switchMap: string                       // "Wisselen…" / "Switch map…"
    mapSettingsLabel: string               // "Instellingen…" / "Settings…"
    sheetAttentionCount: (n: number) => string  // "3 planten hebben aandacht"
    sheetAllGood: string                         // "Alles op schema"
    unplacedTitle: string                        // "Nog te plaatsen" — unplaced tray header
    unplacedCount: (n: number) => string         // "{n} niet geplaatst"
    spotInspectorHint: string
    moveMode: string
    moveModeDone: string
    moveModeHint: string
    moveOnePlantHint: string
  }

  garden: {
    biodiversity: {
      title: string             // "Biodiversiteit" / "Biodiversity"
      loading: string           // "Laden..."
      failed: string            // "Kon niet laden"
      emptyGarden: string       // "Voeg planten toe om biodiversiteit bij te houden"
      speciesCount: (n: number) => string  // "5 soorten"
      nativeCount: (n: number) => string   // "3 inheems"
      invasiveCount: (n: number) => string // "1 invasief"
      pollinatorMonths: string  // "Bloeimaanden voor bestuivers"
      componentPollinator: string // "Bestuivers"
      componentNative: string     // "Inheems"
      componentDiversity: string  // "Diversiteit"
    }
    suggestions: {
      title: string        // "Verbeter je tuin"
      gapLabel: string     // "Maanden zonder bestuivers: {months}"
      noData: string       // "Voeg planten toe om aanbevelingen te zien"
      sunFull: string      // "☀️ Volle zon"
      sunPartial: string   // "⛅ Halfschaduw"
      sunShade: string     // "🌿 Schaduw"
      nativeBadge: string  // "Inheems 🇳🇱" / "Native 🇳🇱"
    }
  }

  // ── Map legend ──────────────────────────────────────────────────
  mapLegend: {
    attentionNeeded: string  // "Attention needed" / "Aandacht nodig"
    allGood: string          // "All good" / "Alles goed"
  }

  // ── Onboarding checklist ────────────────────────────────────────
  onboarding: {
    title: string        // "Welkom bij Floreren!"
    stepLabel: (current: number, total: number) => string  // "Stap 1 van 2"
    createMap: {
      label: string     // "Maak je eerste tuin"
      cta: string       // "Tuin aanmaken"
    }
    addPlant: {
      label: string     // "Voeg je eerste plant toe"
      cta: string       // "Plant toevoegen"
    }
    dismiss: string     // "Sluiten" / "Dismiss"
    completed: string   // "✅ Klaar! Je hebt alle stappen voltooid"
  }

  weeds: {
    identifyCard: {
      title: string
      subtitle: string
    }
    privacy: {
      notice: string
      ack: string
    }
    identifying: string
    noMatch: {
      retry: string
      dismiss: string
    }
    knownWeed: string
    notAWeed: string
    logSighting: string
    sightingSheet: {
      title: string
      pickMap: string
      pinInstruction: string
      confirm: string
      cancel: string
      saved: string
    }
    errorService: string
  }

  help: {
    title: string
    close: string
    dismiss: string
    tips: {
      dashboard: string
      plants: string
      maps: string
      calendar: string
      settings: string
      editor: string
      plantDetail: string
      addPlant: string
    }
    chat: {
      inputPlaceholder: string
      send: string
      thinking: string
      error: string
      unavailable: string
      empty: string
      example: string
      bugReport: string
      bugReportHeader: string
      submit: string
      submitting: string
      submitted: string
      submitError: string
    }
  }

  log: {
    title: string
    empty: string
    loadMore: string
  }

  common: {
    loading: string
    notFound: string
    save: string
    cancel: string
    delete: string
    back: string
    error: string
    saving: string       // "Saving..." / "Opslaan..."
    saved: string        // "Saved" / "Opgeslagen"
    deleting: string     // "Deleting..." / "Verwijderen..."
    all: string          // "Alles" / "All"
    garden: string       // "Tuin" / "Garden"
    house: string        // "Huis" / "House"
    envGround: string    // "Ground" / "Grond"
    envPotted: string    // "Potted" / "Pot"
    envIndoor: string    // "Indoor" / "Binnen"
  }

  discovery: {
    // Entry point (Plants page button)
    identifyWild: string       // "Identificeer in het wild"
    identifyWildSubtitle: string  // "Fotografeer een plant buiten en leer er meer over"
    // DiscoveryCard page
    funFact: string            // "Wist je dat..."
    funFactLoading: string     // "Weetje laden..."
    funFactError: string       // "Kon geen weetje laden"
    ecology: string            // "Ecologie"
    nativeNl: string           // "Inheems in NL"
    invasiveNl: string         // "Invasief in NL"
    pollinatorHigh: string     // "Top bestuiversplant"
    pollinatorGood: string     // "Goed voor bijen"
    pollinatorLow: string      // "Enige waarde voor bestuivers"
    floweringMonths: string    // "Bloeiperiode"
    gardenFit: string          // "Tuinadvies"
    gardenFitLoading: string   // "Tuinadvies laden..."
    gardenFitNone: string      // "Geen tuinen gevonden"
    fitPerfect: string         // "Ideaal licht"
    fitAcceptable: string      // "Geschikt licht"
    fitMarginal: string        // "Krap licht"
    fitTolerated: string       // "Past overal"
    fitNone: string            // "Waarschijnlijk te donker"
    fitUnknown: string         // "Licht onbekend"
    saveToJournal: string      // "Opslaan in veldboek"
    savedToJournal: string     // "Opgeslagen!"
    addToGarden: string        // "Toevoegen aan tuin"
    // Journal tab (Plants page)
    journalTab: string         // "Veldboek"
    myPlantsTab: string        // "Mijn planten"
    journalEmpty: string       // "Nog geen veldwaarnemingen"
    journalEmptyHint: string   // "Fotografeer planten buiten met de camera-knop"
    journalDeleteConfirm: string  // "Waarneming verwijderen?"
    discovered: string         // "Gevonden"
  }

  game: {
    // Setup
    newGame: string
    setupTitle: string
    setupSubtitle: string
    selectMin: string
    selectMax: string
    createGame: string
    creating: string
    noPhotosWarning: string
    // Waiting room (host)
    joinCode: string
    copyLink: string
    linkCopied: string
    waitingForPlayers: string
    playersJoined: string
    startGame: string
    cancelGame: string
    minPlayersHint: string
    // Waiting room (player)
    enterCode: string
    joinButton: string
    invalidCode: string
    gameAlreadyStarted: string
    waitingForHost: string
    youAreIn: string
    otherPlayers: string
    // Round
    roundTitle: string
    findThisPlant: string
    hint: string
    scanButton: string
    scanning: string
    correctScan: string
    wrongScan: string
    waitingForNextRound: string
    noPhotoAvailable: string
    roundOf: string
    // Round result
    roundResult: string
    correct: string
    tooSlow: string
    pointsEarned: string
    totalScore: string
    nextRoundSoon: string
    // Host round view
    answered: string
    waitingForAnswers: string
    nextRound: string
    endGame: string
    plantHint: string
    // Leaderboard
    gameOver: string
    finalLeaderboard: string
    yourPosition: string
    playAgain: string
    backToMap: string
    shareResults: string
    newGame2: string
    roundBreakdown: string
    hostedBy: string
    place1: string
    place2: string
    place3: string
    // Clue mode
    clueModePhoto: string
    clueModeName: string
    clueModeSectionLabel: string
  }
}
