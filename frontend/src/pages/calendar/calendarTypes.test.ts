import { describe, expect, it } from 'vitest'
import { isActionable, type CalendarEvent, type EventTypeId } from './calendarTypes'

function event(type: EventTypeId): CalendarEvent {
  return {
    id: `schedule:1:${type}`,
    date: '2026-07-12',
    type,
    plant_id: 1,
    plant_name: 'Testplant',
    plant_icon_variant: null,
    schedule_id: 1,
    map_id: 1,
    map_name: 'Tuin',
    overdue: false,
    severity: null,
    color: null,
    icon: null,
    grouped: false,
    group_count: null,
    group_member_schedule_ids: null,
    weather_triggered: type === 'frost_protect' || type === 'heat_protect',
  }
}

describe('calendar care actions', () => {
  it('keeps canonical repot care actionable', () => {
    expect(isActionable(event('repot'), '2026-07-12')).toBe(true)
  })

  it.each(['frost_protect', 'heat_protect'] as const)(
    'renders %s as informative rather than destructive',
    (type) => {
      expect(isActionable(event(type), '2026-07-12')).toBe(false)
    },
  )
})
