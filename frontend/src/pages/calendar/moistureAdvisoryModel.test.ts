import { describe, expect, it } from 'vitest'
import type { CalendarEvent } from './calendarTypes'
import { extractMoistureAdvisories } from './moistureAdvisoryModel'

const DATE = '2026-07-27'

function event(overrides: Partial<CalendarEvent> = {}): CalendarEvent {
  return {
    id: 'schedule:1:fertilize',
    date: DATE,
    type: 'fertilize',
    plant_id: 1,
    plant_name: 'Rose',
    plant_icon_variant: null,
    schedule_id: 1,
    map_id: 10,
    map_name: 'Back garden',
    overdue: false,
    severity: null,
    color: null,
    icon: null,
    grouped: false,
    group_count: null,
    group_member_schedule_ids: null,
    weather_triggered: false,
    ...overrides,
  }
}

function moistureEvent(
  id: string,
  mapId: number,
  mapName: string,
  reasonNl = 'Warme, droge dag verwacht.',
  reasonEn = 'Warm, dry day expected.',
): CalendarEvent {
  return event({
    id,
    type: 'moisture_check',
    plant_id: null,
    plant_name: null,
    schedule_id: null,
    map_id: mapId,
    map_name: mapName,
    grouped: true,
    group_count: 2,
    group_member_schedule_ids: [mapId * 10 + 1, mapId * 10 + 2],
    group_members: [
      {
        schedule_id: mapId * 10 + 1,
        plant_id: mapId * 10 + 1,
        plant_name: `${mapName} rose`,
        plant_icon_variant: null,
      },
      {
        schedule_id: mapId * 10 + 2,
        plant_id: mapId * 10 + 2,
        plant_name: `${mapName} fern`,
        plant_icon_variant: null,
      },
    ],
    weather_triggered: true,
    reason_nl: reasonNl,
    reason_en: reasonEn,
    action_nl: 'Voel de grond voordat je water geeft.',
    action_en: 'Feel the soil before watering.',
  })
}

describe('extractMoistureAdvisories', () => {
  it('groups equal date/reason moisture events while preserving ordinary care', () => {
    const ordinary = event()
    const back = moistureEvent('moisture:back', 10, 'Back garden')
    const front = moistureEvent('moisture:front', 20, 'Front garden')

    const result = extractMoistureAdvisories([ordinary, back, front])

    expect(result.ordinaryEvents).toEqual([ordinary])
    expect(result.advisories).toHaveLength(1)
    expect(result.advisories[0]).toMatchObject({
      date: DATE,
      reasonNl: 'Warme, droge dag verwacht.',
      reasonEn: 'Warm, dry day expected.',
      actionNl: 'Voel de grond voordat je water geeft.',
      actionEn: 'Feel the soil before watering.',
    })
    expect(result.advisories[0].mapEvents).toEqual([back, front])
  })

  it('uses date and reason as the grouping contract when recommendations vary', () => {
    const back = moistureEvent('moisture:back', 10, 'Back garden')
    const front = moistureEvent('moisture:front', 20, 'Front garden')
    front.action_nl = 'Een afwijkend kaartadvies dat de uitleg niet mag dupliceren.'
    front.action_en = 'A different map recommendation that must not duplicate the explanation.'

    const result = extractMoistureAdvisories([back, front])

    expect(result.advisories).toHaveLength(1)
    expect(result.advisories[0].actionNl).toBe('Voel de grond voordat je water geeft.')
    expect(result.advisories[0].mapEvents).toEqual([back, front])
  })

  it('keeps different reasons in separate advisory blocks without shortening copy', () => {
    const longReason = 'Een uitzonderlijk lange warme en droge periode verhoogt de verdamping bij planten in potten en ondiepe borders.'
    const first = moistureEvent('moisture:back', 10, 'Back garden')
    const second = moistureEvent('moisture:front', 20, 'Front garden', longReason, 'A long warm and dry period is expected.')

    const result = extractMoistureAdvisories([first, second])

    expect(result.advisories).toHaveLength(2)
    expect(result.advisories[1].reasonNl).toBe(longReason)
  })

  it('leaves completed and non-weather moisture checks in ordinary history', () => {
    const completed = moistureEvent('moisture:completed', 10, 'Back garden')
    completed.status = 'completed'
    const manual = moistureEvent('moisture:manual', 20, 'Front garden')
    manual.weather_triggered = false

    const result = extractMoistureAdvisories([completed, manual])

    expect(result.advisories).toEqual([])
    expect(result.ordinaryEvents).toEqual([completed, manual])
  })
})
