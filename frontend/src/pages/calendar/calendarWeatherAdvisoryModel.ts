import type { CalendarEvent, EventTypeId } from './calendarTypes'

const INFORMATIONAL_WEATHER_TYPES = new Set<EventTypeId>([
  'frost_protect',
  'heat_protect',
])

export interface CalendarWeatherPlant {
  id: number
  name: string
}

export interface CalendarWeatherLocation {
  key: string
  mapId: number | null
  mapName: string | null
  affectedPlantCount: number
  plants: CalendarWeatherPlant[]
}

export interface CalendarWeatherAdvisory {
  key: string
  date: string
  type: 'frost_protect' | 'heat_protect' | 'water'
  severity: string | null
  warningId: string | null
  acknowledgedAt: string | null
  reasonNl: string | null
  reasonEn: string | null
  actionNl: string | null
  actionEn: string | null
  color: string | null
  icon: string | null
  affectedPlantCount: number
  locations: CalendarWeatherLocation[]
  sourceEvents: CalendarEvent[]
}

export interface CalendarPresentation {
  ordinaryEvents: CalendarEvent[]
  weatherAdvisories: CalendarWeatherAdvisory[]
}

interface MutableLocation {
  key: string
  mapId: number | null
  mapName: string | null
  fallbackCount: number
  plants: Map<number, CalendarWeatherPlant>
}

interface MutableAdvisory extends Omit<CalendarWeatherAdvisory, 'affectedPlantCount' | 'locations'> {
  locationsByKey: Map<string, MutableLocation>
}

export function isInformationalWeather(event: CalendarEvent): boolean {
  if (event.status === 'completed') return false
  if (INFORMATIONAL_WEATHER_TYPES.has(event.type)) return true
  // Heat-triggered extra watering moments (#785) render as informational
  // advisories: they explain WHY an extra watering moment exists and must not
  // offer completion (the underlying water schedule is the completable work).
  return (
    event.type === 'water'
    && event.weather_triggered === true
    && Boolean(event.reason_nl || event.reason_en)
  )
}

function advisoryKey(event: CalendarEvent): string {
  return JSON.stringify([
    event.date,
    event.type,
    event.reason_nl ?? '',
    event.reason_en ?? '',
    event.action_nl ?? '',
    event.action_en ?? '',
  ])
}

function addPlants(location: MutableLocation, event: CalendarEvent): void {
  const members = event.group_members?.length
    ? event.group_members.map(member => ({ id: member.plant_id, name: member.plant_name }))
    : event.plant_id !== null
      ? [{ id: event.plant_id, name: event.plant_name ?? '' }]
      : []

  members.forEach(plant => {
    const current = location.plants.get(plant.id)
    if (!current || (!current.name && plant.name)) location.plants.set(plant.id, plant)
  })
  location.fallbackCount = Math.max(
    location.fallbackCount,
    event.group_count ?? event.group_member_schedule_ids?.length ?? members.length,
  )
}

export function buildCalendarPresentation(events: CalendarEvent[]): CalendarPresentation {
  const ordinaryEvents: CalendarEvent[] = []
  const advisoriesByKey = new Map<string, MutableAdvisory>()

  events.forEach(event => {
    if (!isInformationalWeather(event)) {
      ordinaryEvents.push(event)
      return
    }

    const key = advisoryKey(event)
    let advisory = advisoriesByKey.get(key)
    if (!advisory) {
      advisory = {
        key,
        date: event.date,
        type: event.type as CalendarWeatherAdvisory['type'],
        severity: event.severity,
        warningId: event.weather_warning_id ?? null,
        acknowledgedAt: event.acknowledged_at ?? null,
        reasonNl: event.reason_nl ?? null,
        reasonEn: event.reason_en ?? null,
        actionNl: event.action_nl ?? null,
        actionEn: event.action_en ?? null,
        color: event.color,
        icon: event.icon,
        sourceEvents: [],
        locationsByKey: new Map(),
      }
      advisoriesByKey.set(key, advisory)
    }
    advisory.sourceEvents.push(event)
    advisory.acknowledgedAt ||= event.acknowledged_at ?? null
    advisory.warningId ||= event.weather_warning_id ?? null

    const locationKey = event.map_id !== null
      ? `map:${event.map_id}`
      : `name:${event.map_name ?? 'unknown'}`
    let location = advisory.locationsByKey.get(locationKey)
    if (!location) {
      location = {
        key: locationKey,
        mapId: event.map_id,
        mapName: event.map_name,
        fallbackCount: 0,
        plants: new Map(),
      }
      advisory.locationsByKey.set(locationKey, location)
    }
    addPlants(location, event)
  })

  const weatherAdvisories = [...advisoriesByKey.values()]
    .map(advisory => {
      const locations = [...advisory.locationsByKey.values()]
        .map(location => {
          const plants = [...location.plants.values()].sort((a, b) => (
            a.name.localeCompare(b.name) || a.id - b.id
          ))
          return {
            key: location.key,
            mapId: location.mapId,
            mapName: location.mapName,
            affectedPlantCount: Math.max(plants.length, location.fallbackCount),
            plants,
          }
        })
        .sort((a, b) => (
          (a.mapName ?? '').localeCompare(b.mapName ?? '')
          || (a.mapId ?? 0) - (b.mapId ?? 0)
        ))
      const { locationsByKey: _, ...base } = advisory
      return {
        ...base,
        locations,
        affectedPlantCount: locations.reduce((count, location) => count + location.affectedPlantCount, 0),
      }
    })
    .sort((a, b) => a.date.localeCompare(b.date) || a.type.localeCompare(b.type) || a.key.localeCompare(b.key))

  // Heat dedup: the #785 heat-triggered watering moment ("Extra water geven
  // vanwege hitte") is the actionable heat surface and supersedes the older
  // profile-driven heat_protect advisory. When both fire on the same date,
  // keep the heat-water advisory and drop heat_protect — otherwise users see
  // two heat cards saying essentially the same thing.
  const heatWaterDates = new Set(
    weatherAdvisories
      .filter(advisory => advisory.type === 'water')
      .map(advisory => advisory.date),
  )
  const deduped = heatWaterDates.size
    ? weatherAdvisories.filter(
        advisory => !(advisory.type === 'heat_protect' && heatWaterDates.has(advisory.date)),
      )
    : weatherAdvisories

  return { ordinaryEvents, weatherAdvisories: deduped }
}

export function partitionCalendarWeather(advisories: CalendarWeatherAdvisory[]) {
  return {
    active: advisories.filter(advisory => !advisory.acknowledgedAt),
    seen: advisories.filter(advisory => advisory.acknowledgedAt),
  }
}
