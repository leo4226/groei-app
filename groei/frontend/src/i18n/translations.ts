export type Translations = {
  locale: string

  nav: {
    home: string
    plants: string
    calendar: string
    settings: string
    add: string
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
    }
    actions: {
      done: string
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
      attention: string
      daysLate: (n: number) => string
      inDays: (n: number) => string
    }
    weather: {
      title: string
      humidity: string
      soil: string
      light: string
      loading: string
    }
    comingSoon: string
  }

  care: {
    water: string
    fertilize: string
    mist: string
    rotate: string
    repot_check: string
    prune: string
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
    }
    loading: string
    notFound: string
    legend: string
  }

  settings: {
    title: string
    whoIsGardening: string
    active: string
    locations: string
    language: string
    languageNl: string
    languageEn: string
    icons: {
      title: string
      description: string
      syncButton: string
      syncing: string
      result: string
      totalIcons: (n: number) => string
      newIcons: (n: number) => string
      linked: string
      noIconFor: string
      setManually: string
      upToDate: string
      gapsTitle: string
      gapsDescription: string
      loadGaps: string
      loadingGaps: string
    }
  }

  common: {
    loading: string
    notFound: string
    save: string
    cancel: string
    delete: string
    back: string
    error: string
  }
}
