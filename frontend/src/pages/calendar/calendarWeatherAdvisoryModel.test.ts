import { describe, expect, it } from 'vitest'
import type { CalendarEvent } from './calendarTypes'
import {
  buildCalendarPresentation,
  partitionCalendarWeather,
} from './calendarWeatherAdvisoryModel'

function event(overrides: Partial<CalendarEvent> = {}): CalendarEvent {
  return {
    id: 'heat-1',
    date: '2026-07-30',
    type: 'heat_protect',
    plant_id: 1,
    plant_name: 'Rose',
    plant_icon_variant: null,
    schedule_id: 10,
    map_id: 4,
    map_name: 'Back Garden',
    overdue: false,
    severity: 'warning',
    color: '#c97a4a',
    icon: null,
    grouped: false,
    group_count: null,
    group_member_schedule_ids: null,
    weather_triggered: true,
    weather_warning_id: 'weather:heat',
    acknowledged_at: null,
    reason_nl: 'Morgen 33°C',
    reason_en: '33°C tomorrow',
    action_nl: 'Geef schaduw',
    action_en: 'Provide shade',
    ...overrides,
  }
}

describe('buildCalendarPresentation', () => {
  it('groups equal heat guidance and deduplicates affected plants by location', () => {
    const duplicate = event({ id: 'heat-duplicate', schedule_id: 11 })
    const secondPlant = event({ id: 'heat-2', plant_id: 2, plant_name: 'Fern', schedule_id: 12 })
    const indoorPlant = event({
      id: 'heat-3', plant_id: 3, plant_name: 'Palm', schedule_id: 13,
      map_id: 8, map_name: 'Living Room',
    })
    const water = event({
      id: 'water-1', type: 'water', plant_id: 4, plant_name: 'Mint',
      schedule_id: 14, weather_triggered: false,
    })

    const presentation = buildCalendarPresentation([
      event(), duplicate, secondPlant, indoorPlant, water,
    ])

    expect(presentation.ordinaryEvents).toEqual([water])
    expect(presentation.weatherAdvisories).toHaveLength(1)
    expect(presentation.weatherAdvisories[0]).toMatchObject({
      type: 'heat_protect',
      date: '2026-07-30',
      affectedPlantCount: 3,
      warningId: 'weather:heat',
      acknowledgedAt: null,
    })
    expect(presentation.weatherAdvisories[0].locations.map(location => ({
      name: location.mapName,
      plantIds: location.plants.map(plant => plant.id),
    }))).toEqual([
      { name: 'Back Garden', plantIds: [2, 1] },
      { name: 'Living Room', plantIds: [3] },
    ])
  })

  it('keeps materially different guidance separate and partitions acknowledged advice', () => {
    const acknowledged = event({ acknowledged_at: '2026-07-29T08:00:00Z' })
    const differentReason = event({ id: 'heat-later', reason_en: '34°C tomorrow' })

    const presentation = buildCalendarPresentation([acknowledged, differentReason])
    const partition = partitionCalendarWeather(presentation.weatherAdvisories)

    expect(presentation.weatherAdvisories).toHaveLength(2)
    expect(partition.active).toHaveLength(1)
    expect(partition.seen).toHaveLength(1)
    expect(partition.seen[0].acknowledgedAt).toBe('2026-07-29T08:00:00Z')
  })

  it('preserves count-only location scope when grouped member metadata is missing', () => {
    const grouped = event({
      plant_id: null,
      plant_name: null,
      grouped: true,
      group_count: 7,
      group_member_schedule_ids: [1, 2, 3, 4, 5, 6, 7],
    })

    const advisory = buildCalendarPresentation([grouped]).weatherAdvisories[0]

    expect(advisory.affectedPlantCount).toBe(7)
    expect(advisory.locations[0]).toMatchObject({ affectedPlantCount: 7, plants: [] })
  })
})
