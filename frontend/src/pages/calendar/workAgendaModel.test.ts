import { describe, expect, it } from 'vitest'
import type { CalendarEvent, EventTypeId } from './calendarTypes'
import { agendaPlantName, buildWorkAgenda } from './workAgendaModel'

function event(overrides: Partial<CalendarEvent> = {}): CalendarEvent {
  const type: EventTypeId = overrides.type ?? 'water'
  return {
    id: overrides.id ?? 'schedule:1:2026-07-12',
    date: overrides.date ?? '2026-07-12',
    type,
    status: overrides.status,
    plant_id: overrides.plant_id ?? 1,
    plant_name: overrides.plant_name ?? 'Test plant',
    plant_icon_variant: null,
    schedule_id: overrides.schedule_id ?? 1,
    map_id: overrides.map_id ?? 10,
    map_name: overrides.map_name ?? 'Back garden',
    overdue: overrides.overdue ?? false,
    severity: null,
    color: null,
    icon: null,
    grouped: overrides.grouped ?? false,
    group_count: overrides.group_count ?? null,
    group_member_schedule_ids: overrides.group_member_schedule_ids ?? null,
    weather_triggered: overrides.weather_triggered ?? false,
  }
}

describe('buildWorkAgenda', () => {
  it('keeps one outstanding item per recurring individual schedule', () => {
    const overdue = event({ id: 'schedule:1:today', overdue: true })
    const projected = event({ id: 'schedule:1:next', date: '2026-07-19' })

    expect(buildWorkAgenda([projected, overdue], '2026-07-12')).toEqual([overdue])
  })

  it('deduplicates grouped sessions within a map without merging different maps', () => {
    const backGardenFirst = event({
      id: 'group:water:10:first',
      grouped: true,
      plant_id: null,
      schedule_id: null,
      map_id: 10,
      date: '2026-07-13',
      group_member_schedule_ids: [1, 2],
    })
    const backGardenNext = event({
      ...backGardenFirst,
      id: 'group:water:10:next',
      date: '2026-07-20',
    })
    const frontGarden = event({
      ...backGardenFirst,
      id: 'group:water:20:first',
      map_id: 20,
      map_name: 'Front garden',
      date: '2026-07-14',
      group_member_schedule_ids: [3, 4],
    })

    expect(buildWorkAgenda(
      [backGardenNext, frontGarden, backGardenFirst],
      '2026-07-12',
    )).toEqual([backGardenFirst, frontGarden])
  })

  it('orders overdue work before today and upcoming work', () => {
    const future = event({ id: 'schedule:3', schedule_id: 3, date: '2026-07-13' })
    const today = event({ id: 'schedule:2', schedule_id: 2 })
    const overdue = event({ id: 'schedule:1', schedule_id: 1, overdue: true })

    expect(buildWorkAgenda([future, today, overdue], '2026-07-12')).toEqual([
      overdue,
      today,
      future,
    ])
  })

  it('excludes completed history from actionable work', () => {
    const scheduled = event({ id: 'schedule:1' })
    const completed = event({
      id: 'care-log:1',
      schedule_id: null,
      status: 'completed',
    })

    expect(buildWorkAgenda([completed, scheduled], '2026-07-12')).toEqual([scheduled])
  })

  it('does not leak Dutch species names into English', () => {
    const plant = event({
      plant_name: 'My fern',
      species_common_name_nl: 'Gewone varen',
      species_common_name_en: null,
    })

    expect(agendaPlantName(plant, 'en-GB')).toBe('My fern')
  })

  it('does not leak English species names into Dutch', () => {
    const plant = event({
      plant_name: 'Mijn varen',
      species_common_name_nl: null,
      species_common_name_en: 'Common fern',
    })

    expect(agendaPlantName(plant, 'nl-NL')).toBe('Mijn varen')
  })
})
